import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs"
import { hostname } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

import { FINALIZATION_JSON_MAX_BYTES, finalizationDigest, isTerminalStatus, normalizeFinalization, normalizeFinalizationResult, type FinalizationRecord, type FinalizationResult, type ProcessGroupIdentity, type QueueTicket } from "../contracts/schema.js"
import { observeProcessGroup, observeTestProducer, observeWorkerIdentity, probeProcessGroupIdentity, probeWorkerIdentity, terminateVerifiedProcessGroup } from "./process.js"
import { buildJobEnv, LogRedactor, redactLogText } from "./runner.js"
import { discardRuntimeDirectory, prepareJobRuntime, type RuntimeSession } from "./runtime.js"
import { acquireDirectoryLock, appendLog, atomicWriteJson, finalizationPath, historyPath, listHistoryJobs, queuePaths, readBoundedFile, readFinalization, serializedJson, withTicketLock } from "./state.js"

const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const smallError = (error: unknown) => redactLogText(error instanceof Error ? error.message : String(error)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").slice(0, 2_048)
const log = (ticket: QueueTicket, text: string) => appendLog(ticket.logPath, `[finalization] ${redactLogText(text)}\n`)

function hasSupportedFinalization(ticket: QueueTicket): boolean {
  try {
    const spec = normalizeFinalization(ticket.finalization)
    return ticket.schemaVersion === 4 && Boolean(spec && finalizationDigest(spec) === ticket.finalizationDigest)
  } catch { return false }
}

function blockingTestProducer(ticket: QueueTicket): { id: string; reason: string } | undefined {
  const producer = observeTestProducer(ticket)
  return producer.state !== "dead" ? { id: ticket.id, reason: `${producer.reason} (${ticket.id})` } : undefined
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
  const value = normalizeFinalizationResult(raw, ticket.finalization?.schemaVersion)
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
  const result = await save(root, { ...record, phase: failureReason ? "failed" : "passed", finishedAt: new Date().toISOString(), failureReason })
  log(ticket, `${result.phase}${result.failureReason ? `: ${result.failureReason}` : ""}`)
  return result
}

/** Executes only against the real, immutable terminal source, never a caller's verdict. */
export async function runFinalization(root: string, ticket: QueueTicket, activation?: RecoveryActivation): Promise<FinalizationRecord> {
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
      return await save(root, { ...record, phase: uncertain ? "interrupted" : "failed", ...(!uncertain ? { finishedAt: new Date().toISOString() } : {}), recovery: "none", failureReason: "ticket digest divergiu após início da finalização; execução recusada" })
    }
    if (record.phase === "passed" || record.phase === "failed" && (record.recovery ?? "none") === "none" || activation?.attempted.has(ticket.id)) return record
    const producer = blockingTestProducer(terminal)
    if (producer) return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", finishedAt: undefined, failureReason: producer.reason })
    if (record.attempt > 0 && !record.finishedAt) {
      const owner = observeWorkerIdentity(record.supervisorIdentity)
      if (owner.state === "uncertain" || (owner.state === "alive" && record.supervisorIdentity?.pid !== process.pid)) {
        return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", failureReason: owner.reason })
      }
      let group = observeProcessGroup(record.processGroupIdentity)
      if (group.state === "alive" && record.startedAt && Date.now() - Date.parse(record.startedAt) >= spec.timeoutMs) {
        await terminateVerifiedProcessGroup(record.processGroupIdentity)
        group = observeProcessGroup(record.processGroupIdentity)
      }
      if (group.state !== "dead") return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", failureReason: group.reason })
      if (spec.schemaVersion === 2) {
        // A dead supervisor may leave either an authentic result or no result.
        // Malformed bytes are never interpreted as an interrupted publication.
        let result: FinalizationResult | undefined
        let recovery: FinalizationRecord["recovery"] = "none"
        let failureReason: string | undefined
        try {
          runtime = prepareJobRuntime(root, terminal, spec.argv, buildJobEnv(root, terminal))
          if (terminal.runtime && (runtime.receipt.registrySha256 !== terminal.runtime.registrySha256 || runtime.receipt.node?.sha256 !== terminal.runtime.node?.sha256)
            || runtime.finish().state === "rejected") throw new Error("runtime do job mudou antes da recuperação")
          if (existsSync(transientPath(root, ticket.id, "result"))) {
            result = readResult(root, terminal)
            recovery = result.recovery ?? "none"
            if (result.error || recovery !== "none") failureReason = result.error ?? "cleanup da finalização requer recuperação"
          } else { recovery = "retryable"; failureReason = "finalizador interrompido sem resultado; grupo encerrado" }
        } catch (error) { failureReason = smallError(error) }
        finally { discardRuntimeDirectory(runtime?.directory); runtime = undefined }
        record = await complete(root, terminal, { ...record, recovery, ...(result ? { result, exitCode: result.error || recovery !== "none" ? 1 : 0 } : {}) }, failureReason)
        if (record.phase === "passed") return record
      }
    }
    if (record.phase === "failed" && (spec.schemaVersion !== 2 || !["retryable", "blocked-ownership"].includes(record.recovery ?? "none"))) return record
    if (record.result) {
      try {
        const result = normalizeFinalizationResult(record.result, spec.schemaVersion)
        if ((result.recovery ?? "none") !== (record.recovery ?? "none")) throw new Error("classificação do record diverge do resultado")
      } catch (error) { return await save(root, { ...record, phase: "failed", recovery: "none", failureReason: smallError(error) }) }
    }
    if (record.attempt > 0 && spec.schemaVersion === 2) {
      if (!activation || activation.trigger.kind === "initial-only") return record
      if (activation.trigger.kind === "queued-work") {
        if (record.lastQueuedRecoveryTicketId === activation.trigger.ticketId) return record
        record = await save(root, { ...record, lastQueuedRecoveryTicketId: activation.trigger.ticketId })
      }
    }
    activation?.attempted.add(ticket.id)
    // No old producer remains. The consumer re-enters its own idempotent
    // publication journal; Queue never republishes files or reruns the test.
    record = { schemaVersion: 1, ticketId: record.ticketId, ticketDigest: digest(sourceBytes), finalizationDigest: record.finalizationDigest, phase: "pending", recovery: "none", attempt: record.attempt, ...(record.lastQueuedRecoveryTicketId ? { lastQueuedRecoveryTicketId: record.lastQueuedRecoveryTicketId } : {}), ...(record.cancelRequestedAt ? { cancelRequestedAt: record.cancelRequestedAt } : {}) }
    const supervisor = probeWorkerIdentity()
    if (!supervisor) return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", failureReason: "identidade do supervisor indisponível; reserva preservada" })
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
    let signal: NodeJS.Signals | null = null
    try {
      runtime = prepareJobRuntime(root, terminal, spec.argv, { ...buildJobEnv(root, terminal), CI_QUEUE_FINALIZATION_INPUT: inputPath, CI_QUEUE_WORKER_IDENTITY: JSON.stringify(supervisor) })
      if (terminal.runtime && (runtime.receipt.registrySha256 !== terminal.runtime.registrySha256 || runtime.receipt.node?.sha256 !== terminal.runtime.node?.sha256)) throw new Error("runtime do job mudou antes da finalização")
      const child = spawn(runtime.argv[0], runtime.argv.slice(1), { cwd: terminal.cwd, env: runtime.env, detached: true, stdio: ["ignore", "pipe", "pipe"] })
      const redactor = new LogRedactor()
      child.stdout?.on("data", (chunk: Buffer) => appendLog(terminal.logPath, redactor.push(chunk.toString("utf8"))))
      child.stderr?.on("data", (chunk: Buffer) => appendLog(terminal.logPath, redactor.push(chunk.toString("utf8"))))
      const closed = new Promise<void>(resolveClose => {
        child.once("error", error => { failureReason = `spawn da finalização falhou: ${smallError(error)}` })
        child.once("close", (exitCode, exitSignal) => { signal = exitSignal; code = exitCode; resolveClose() })
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
        return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", failureReason: `${failureReason ?? "grupo da finalização não encerrou"}; ${"reason" in group ? group.reason : "ownership incerto"}` })
      }
      appendLog(terminal.logPath, redactor.flush())
      const validSource = digest(readFileSync(sourcePath)) === record.ticketDigest
      const validRuntime = runtime.finish().state !== "rejected"
      if (!validSource) failureReason = "ticket digest mudou durante a finalização"
      if (!validRuntime) failureReason = "runtime da finalização rejeitado"
      if (!failureReason && code !== 0) failureReason = `finalização terminou com código ${code}`
      let result: FinalizationResult | undefined
      try {
        result = readResult(root, terminal)
        if (result.error || (result.recovery ?? "none") !== "none") failureReason ??= result.error ?? "cleanup da finalização requer recuperação"
      } catch (error) { failureReason ??= smallError(error) }
      const missingInterruptedResult = !existsSync(transientPath(root, ticket.id, "result")) && (timedOut || signal !== null)
      const recovery = spec.schemaVersion === 2 && validSource && validRuntime
        ? result?.recovery ?? (missingInterruptedResult ? "retryable" : "none") : "none"
      record = { ...record, exitCode: code, recovery, ...(result ? { result } : {}) }
    } catch (error) {
      failureReason = smallError(error)
      if (spawned) {
        if (identity) await terminateVerifiedProcessGroup(identity)
        const group = observeProcessGroup(identity ?? { hostname: hostname(), leaderPid: childPid!, pgid: childPid!, startedAt: "" })
        if (group.state !== "dead") {
          preserveRuntime = true
          return await save(root, { ...record, phase: "interrupted", recovery: "blocked-ownership", failureReason: `${failureReason}; ${group.reason}` })
        }
      }
    }
    return await complete(root, terminal, record, failureReason)
  } finally {
    if (!preserveRuntime) discardRuntimeDirectory(runtime?.directory)
    lock.release()
  }
}

export type RecoverySummary = { blocked: string[]; pending: string[]; failed: { id: string; error: string }[]; reconciled: string[] }
export type RecoveryActivation = {
  trigger: { kind: "queued-work"; ticketId: string } | { kind: "explicit"; activationId: string } | { kind: "initial-only" }
  executionIds: readonly string[]
  attempted: Set<string>
}
export function finalizationExecutionIds(root: string): string[] {
  const ids = new Set(listHistoryJobs(root).filter(hasSupportedFinalization).map(ticket => ticket.id))
  const directory = dirname(finalizationPath(root, "reconciliation"))
  if (existsSync(directory)) for (const name of readdirSync(directory)) {
    if (name.endsWith(".json") && !name.endsWith(".input.json") && !name.endsWith(".result.json")) ids.add(name.slice(0, -5))
  }
  return [...ids]
}
function finalizerOwnershipBlocked(record: FinalizationRecord | undefined, allowCurrentSupervisor = false): boolean {
  if (!record || record.attempt === 0 || record.finishedAt) return false
  const hook = observeProcessGroup(record.processGroupIdentity)
  const owner = observeWorkerIdentity(record.supervisorIdentity)
  return hook.state !== "dead" || owner.state === "uncertain"
    || owner.state === "alive" && !(allowCurrentSupervisor && record.supervisorIdentity?.pid === process.pid)
}

export async function reconcileFinalizations(root: string, activation: RecoveryActivation = { trigger: { kind: "initial-only" }, executionIds: finalizationExecutionIds(root), attempted: new Set() }): Promise<RecoverySummary> {
  const report: RecoverySummary = { blocked: [], pending: [], failed: [], reconciled: [] }
  const tickets = listHistoryJobs(root).filter(hasSupportedFinalization)
  for (const id of activation.executionIds) {
    const ticket = tickets.find(item => item.id === id)
    try {
      const before = readFinalization(root, id)
      if (!ticket) {
        // Missing source forbids replay of this ID; it does not reserve the runner.
        const blocked = !before && existsSync(finalizationPath(root, id)) || finalizerOwnershipBlocked(before)
        if (blocked) report.blocked.push(id)
        else report.failed.push({ id, error: "fonte terminal ausente/inválida ou contrato de finalização não suportado" })
        continue
      }
      const result = await runFinalization(root, ticket, activation)
      if (result.phase === "passed") { if (before?.phase !== "passed") report.reconciled.push(id); continue }
      const terminalFailure = result.phase === "failed" && (result.recovery ?? "none") === "none"
      const test = terminalFailure ? undefined : blockingTestProducer(ticket)
      if (test || finalizerOwnershipBlocked(result, true) || result.recovery === "blocked-ownership") report.blocked.push(id)
      else if (terminalFailure) report.failed.push({ id, error: result.result?.error ?? result.failureReason ?? "finalização falhou" })
      else report.pending.push(id)
    } catch (error) {
      if (ticket) log(ticket, smallError(error))
      const record = readFinalization(root, id)
      if (!record && existsSync(finalizationPath(root, id)) || ticket && blockingTestProducer(ticket) || finalizerOwnershipBlocked(record) || record?.recovery === "blocked-ownership") report.blocked.push(id)
      else if (record?.recovery === "retryable") report.pending.push(id)
      else report.failed.push({ id, error: smallError(error) })
    }
  }
  return report
}
