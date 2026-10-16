import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs"
import { hostname } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

import { FINALIZATION_JSON_MAX_BYTES, finalizationDigest, isTerminalStatus, normalizeFinalization, normalizeFinalizationResult, type FinalizationRecord, type FinalizationResult, type ProcessGroupIdentity, type QueueTicket } from "../contracts/schema.js"
import { observeProcessGroup, observeTestProducer, observeWorkerIdentity, probeProcessGroupIdentity, probeWorkerIdentity, terminateVerifiedProcessGroup } from "./process.js"
import { buildJobEnv, LogRedactor, redactLogText } from "./runner.js"
import { discardRuntimeDirectory, prepareJobRuntime, type RuntimeSession } from "./runtime.js"
import { acquireDirectoryLock, appendLog, atomicWriteJson, finalizationPath, historyPath, listHistoryJobs, queuePaths, readBoundedFile, readFinalization, readRunningJob, serializedJson, withTicketLock } from "./state.js"

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const smallError = (error: unknown) => redactLogText(error instanceof Error ? error.message : String(error)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").slice(0, 2_048)
const log = (ticket: QueueTicket, text: string) => appendLog(ticket.logPath, `[finalization] ${redactLogText(text)}\n`)

function hasSupportedFinalization(ticket: QueueTicket): boolean {
  try {
    const spec = normalizeFinalization(ticket.finalization)
    return ticket.schemaVersion === 4 && Boolean(spec && finalizationDigest(spec) === ticket.finalizationDigest)
  } catch { return false }
}

function blockingTestProducer(root: string, terminal?: QueueTicket): { id: string; reason: string } | undefined {
  const running = readRunningJob(root)
  const candidates = terminal ? [terminal, ...(running && running.id !== terminal.id ? [running] : [])] : running ? [running] : []
  for (const ticket of candidates) {
    const producer = observeTestProducer(ticket)
    if (producer.state !== "dead") return { id: ticket.id, reason: `${producer.reason} (${ticket.id})` }
  }
  return undefined
}

function transientPath(root: string, id: string, kind: "input" | "result"): string {
  const path = finalizationPath(root, id).replace(/\.json$/, `.${kind}.json`)
  try { if (lstatSync(path).isSymbolicLink()) throw new Error(`symlink recusado na finalização: ${path}`) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  return path
}

/** Called under the ticket lock, before publishing authoritative history. */
export function preparePendingFinalization(root: string, ticket: QueueTicket): FinalizationRecord | undefined {
  if (!ticket.finalization) return undefined
  const spec = normalizeFinalization(ticket.finalization)!
  if (finalizationDigest(spec) !== ticket.finalizationDigest) throw new Error("finalizationDigest inválido")
  const path = finalizationPath(root, ticket.id)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const existing = readFinalization(root, ticket.id)
  if (existing) return existing
  if (existsSync(path)) throw new Error("registro de finalização ilegível; reserva preservada")
  const pending: FinalizationRecord = { schemaVersion: 1, ticketId: ticket.id, ticketDigest: digest(serializedJson(ticket)), finalizationDigest: ticket.finalizationDigest!, phase: "pending", attempt: 0 }
  atomicWriteJson(path, pending)
  return pending
}

function readResult(root: string, ticket: QueueTicket): FinalizationResult {
  const path = transientPath(root, ticket.id, "result")
  let bytes: Buffer
  try {
    bytes = readBoundedFile(path, FINALIZATION_JSON_MAX_BYTES)
  } catch (error) { throw new Error(`resultado da finalização ausente/inválido: ${error instanceof RangeError ? "resultado excede 64 KiB" : smallError(error)}`) }
  let raw: unknown
  try { raw = JSON.parse(bytes.toString("utf8")) } catch { throw new Error("resultado da finalização não é JSON válido") }
  const value = normalizeFinalizationResult(raw)
  for (const item of value.outputs) {
    const target = resolve(ticket.cwd, item.path)
    const localPath = relative(ticket.cwd, target)
    if (!localPath || localPath === ".." || localPath.startsWith("../")) throw new Error("resultado outputs path inválido")
    for (let part = target; part !== resolve(ticket.cwd); part = dirname(part)) {
      try { if (lstatSync(part).isSymbolicLink()) throw new Error("resultado outputs path contém symlink") }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
  }
  return { ...value, ...(value.error ? { error: smallError(value.error) } : {}) }
}

async function save(root: string, record: FinalizationRecord): Promise<FinalizationRecord> {
  const written = await withTicketLock(root, record.ticketId, () => {
    const previous = readFinalization(root, record.ticketId)
    const next = { ...record, ...(previous?.cancelRequestedAt ? { cancelRequestedAt: previous.cancelRequestedAt } : {}) }
    atomicWriteJson(finalizationPath(root, record.ticketId), next)
    return next
  })
  if (!written) throw new Error("não foi possível reservar o registro de finalização")
  return written
}

function removeTransient(root: string, id: string, kind: "input" | "result"): void {
  try { unlinkSync(transientPath(root, id, kind)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}

async function complete(root: string, ticket: QueueTicket, record: FinalizationRecord, failureReason?: string): Promise<FinalizationRecord> {
  for (const kind of ["input", "result"] as const) {
    try { removeTransient(root, ticket.id, kind) }
    catch (error) { failureReason ??= smallError(error) }
  }
  const result = await save(root, { ...record, phase: failureReason ? "failed" : "passed", finishedAt: new Date().toISOString(), ...(failureReason ? { failureReason } : {}) })
  log(ticket, `${result.phase}${result.failureReason ? `: ${result.failureReason}` : ""}`)
  return result
}

/** Executes only against the real, immutable terminal source, never a caller's verdict. */
export async function runFinalization(root: string, ticket: QueueTicket): Promise<FinalizationRecord> {
  const sourcePath = historyPath(root, ticket.id)
  if (lstatSync(sourcePath).isSymbolicLink()) throw new Error("history symlink recusado")
  const sourceBytes = readFileSync(sourcePath)
  const terminal = JSON.parse(sourceBytes.toString("utf8")) as QueueTicket
  const spec = normalizeFinalization(terminal.finalization)
  if (!isTerminalStatus(terminal.status) || terminal.id !== ticket.id || !spec || !hasSupportedFinalization(terminal) || terminal.finalizationDigest !== ticket.finalizationDigest) throw new Error("finalização exige terminal autêntico e contrato correspondente")
  let record = readFinalization(root, ticket.id) ?? preparePendingFinalization(root, terminal)!
  if (record.ticketId !== terminal.id || record.finalizationDigest !== terminal.finalizationDigest) throw new Error("registro/contrato de finalização divergente; reserva preservada")
  const lock = acquireDirectoryLock(join(queuePaths(root).jobLocks, `${ticket.id}.finalization`))
  if (!lock) return record
  let runtime: RuntimeSession | undefined
  let preserveRuntime = false
  try {
    record = readFinalization(root, ticket.id)!
    if (record.attempt > 0 && record.ticketDigest !== digest(sourceBytes)) {
      const group = record.processGroupIdentity ? observeProcessGroup(record.processGroupIdentity) : undefined
      const uncertain = !record.finishedAt && group?.state !== "dead"
      return await save(root, { ...record, phase: uncertain ? "interrupted" : "failed", ...(!uncertain ? { finishedAt: new Date().toISOString() } : {}), failureReason: "ticket digest divergiu após início da finalização; execução recusada" })
    }
    if (record.phase === "passed" || record.phase === "failed") return record
    const producer = blockingTestProducer(root, terminal)
    if (producer) return await save(root, { ...record, phase: "interrupted", finishedAt: undefined, failureReason: producer.reason })
    if (record.attempt > 0) {
      const owner = observeWorkerIdentity(record.supervisorIdentity)
      if (owner.state === "uncertain" || (owner.state === "alive" && record.supervisorIdentity?.pid !== process.pid)) {
        return await save(root, { ...record, phase: "interrupted", failureReason: owner.reason })
      }
      let group = observeProcessGroup(record.processGroupIdentity)
      if (group.state === "alive" && record.startedAt && Date.now() - Date.parse(record.startedAt) >= spec.timeoutMs) {
        await terminateVerifiedProcessGroup(record.processGroupIdentity)
        group = observeProcessGroup(record.processGroupIdentity)
      }
      if (group.state !== "dead") return await save(root, { ...record, phase: "interrupted", failureReason: group.reason })
    }
    // No old producer remains. The consumer re-enters its own idempotent
    // publication journal; Queue never republishes files or reruns the test.
    record = { schemaVersion: 1, ticketId: record.ticketId, ticketDigest: digest(sourceBytes), finalizationDigest: record.finalizationDigest, phase: "pending", attempt: record.attempt, ...(record.cancelRequestedAt ? { cancelRequestedAt: record.cancelRequestedAt } : {}) }
    const supervisor = probeWorkerIdentity()
    if (!supervisor) return await save(root, { ...record, phase: "interrupted", failureReason: "identidade do supervisor indisponível; reserva preservada" })
    let inputPath: string
    try {
      inputPath = transientPath(root, ticket.id, "input")
      const resultPath = transientPath(root, ticket.id, "result")
      removeTransient(root, ticket.id, "result")
      atomicWriteJson(inputPath, { schemaVersion: 1, ticketPath: sourcePath, ticketDigest: record.ticketDigest, finalizationDigest: record.finalizationDigest, contract: spec.contract, resultPath, workerIdentity: supervisor })
    } catch (error) { return await complete(root, terminal, record, smallError(error)) }
    record = await save(root, { ...record, phase: "running", attempt: record.attempt + 1, startedAt: new Date().toISOString(), supervisorIdentity: supervisor })
    log(terminal, `running attempt=${record.attempt}`)
    let failureReason: string | undefined
    let code: number | null = null
    let spawned = false
    let childPid: number | undefined
    let identity: ProcessGroupIdentity | undefined
    try {
      runtime = prepareJobRuntime(root, terminal, spec.argv, { ...buildJobEnv(root, terminal), CI_QUEUE_FINALIZATION_INPUT: inputPath, CI_QUEUE_WORKER_IDENTITY: JSON.stringify(supervisor) })
      if (terminal.runtime && (runtime.receipt.registrySha256 !== terminal.runtime.registrySha256 || runtime.receipt.node?.sha256 !== terminal.runtime.node?.sha256)) throw new Error("runtime do job mudou antes da finalização")
      const child = spawn(runtime.argv[0], runtime.argv.slice(1), { cwd: terminal.cwd, env: runtime.env, detached: true, stdio: ["ignore", "pipe", "pipe"] })
      const redactor = new LogRedactor()
      child.stdout?.on("data", (chunk: Buffer) => appendLog(terminal.logPath, redactor.push(chunk.toString("utf8"))))
      child.stderr?.on("data", (chunk: Buffer) => appendLog(terminal.logPath, redactor.push(chunk.toString("utf8"))))
      const closed = new Promise<void>(resolveClose => {
        child.once("error", error => { failureReason = `spawn da finalização falhou: ${smallError(error)}` })
        child.once("close", exitCode => { code = exitCode; resolveClose() })
      })
      spawned = Boolean(child.pid)
      childPid = child.pid
      identity = child.pid ? probeProcessGroupIdentity(child.pid) : undefined
      record = await save(root, { ...record, ...(identity ? { processGroupIdentity: identity } : {}) })
      let timer: NodeJS.Timeout | undefined
      const timedOut = await Promise.race([closed.then(() => false), new Promise<boolean>(resolveTimeout => { timer = setTimeout(() => resolveTimeout(true), spec.timeoutMs) })])
      if (timer) clearTimeout(timer)
      if (timedOut) {
        failureReason = "prazo de finalização excedido"
        const termination = await terminateVerifiedProcessGroup(identity)
        if (!termination.terminated) failureReason += `; ${termination.reason}`
      }
      const group = spawned ? observeProcessGroup(identity ?? { hostname: hostname(), leaderPid: child.pid!, pgid: child.pid!, startedAt: "" }) : { state: "dead" as const }
      if (group.state !== "dead") {
        preserveRuntime = true
        return await save(root, { ...record, phase: "interrupted", failureReason: `${failureReason ?? "grupo da finalização não encerrou"}; ${"reason" in group ? group.reason : "ownership incerto"}` })
      }
      appendLog(terminal.logPath, redactor.flush())
      if (digest(readFileSync(sourcePath)) !== record.ticketDigest) failureReason = "ticket digest mudou durante a finalização"
      if (!failureReason && code !== 0) failureReason = `finalização terminou com código ${code}`
      if (!failureReason && runtime.finish().state === "rejected") failureReason = "runtime da finalização rejeitado"
      let result: FinalizationResult | undefined
      try {
        result = readResult(root, terminal)
        if (result.error || result.cleanup === "uncertain") failureReason ??= result.error ?? "cleanup da finalização incerto"
      } catch (error) { failureReason ??= smallError(error) }
      record = { ...record, exitCode: code, ...(result ? { result } : {}) }
    } catch (error) {
      failureReason = smallError(error)
      if (spawned) {
        if (identity) await terminateVerifiedProcessGroup(identity)
        const group = observeProcessGroup(identity ?? { hostname: hostname(), leaderPid: childPid!, pgid: childPid!, startedAt: "" })
        if (group.state !== "dead") {
          preserveRuntime = true
          return await save(root, { ...record, phase: "interrupted", failureReason: `${failureReason}; ${group.reason}` })
        }
      }
    }
    return await complete(root, terminal, record, failureReason)
  } finally {
    if (!preserveRuntime) discardRuntimeDirectory(runtime?.directory)
    lock.release()
  }
}

export async function reconcileFinalizations(root: string): Promise<{ blocked: string[]; reconciled: string[] }> {
  const report = { blocked: [] as string[], reconciled: [] as string[] }
  const producer = blockingTestProducer(root)
  if (producer) return { ...report, blocked: [producer.id] }
  // Rejected future/malformed protocol fields confer no execution authority.
  // Their original rejection remains in history/log, without holding new jobs.
  const tickets = listHistoryJobs(root).filter(hasSupportedFinalization)
  const ids = new Set(tickets.map(ticket => ticket.id))
  const directory = dirname(finalizationPath(root, "reconciliation"))
  if (existsSync(directory)) for (const name of readdirSync(directory)) {
    if (name.endsWith(".json") && !name.endsWith(".input.json") && !name.endsWith(".result.json")) ids.add(name.slice(0, -5))
  }
  for (const id of ids) {
    const ticket = tickets.find(item => item.id === id)
    try {
      if (!ticket) {
        const pending = readFinalization(root, id)
        if (pending) await save(root, { ...pending, phase: "interrupted", failureReason: "terminal autêntico ausente; finalização não executada" })
        report.blocked.push(id)
        continue
      }
      const before = readFinalization(root, id)
      const result = await runFinalization(root, ticket)
      if (!result.finishedAt) report.blocked.push(ticket.id)
      else if (!before?.finishedAt || result.phase !== before.phase) report.reconciled.push(ticket.id)
    } catch (error) {
      if (ticket) log(ticket, smallError(error))
      report.blocked.push(id)
    }
  }
  return report
}
