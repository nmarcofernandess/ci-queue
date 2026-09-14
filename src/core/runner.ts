import { spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs"
import { basename, isAbsolute, join, relative, resolve } from "node:path"

import { initialExecutionDeadline, captureExecutionDeadline, validateQueuedDeadline } from "./deadline.js"
import { ProgressCollector, attachProgressToTicket, removeProgressSnapshot } from "./progress.js"
import { probeProcessGroupIdentity, readProcessObservation, terminateVerifiedProcessGroup } from "./process.js"
import {
  appendLog,
  atomicWriteJson,
  claimPath,
  ensureQueueDirs,
  findJobById,
  historyPath,
  jobPath,
  queuePaths,
  readHistoryJob,
  readJsonFile,
  readRunningJob,
  removeFile,
  withTicketLock,
} from "./state.js"
import type {
  GitInfo,
  JobStatus,
  ProcessGroupIdentity,
  QueueTicket,
  TerminalStatus,
  TicketFlags,
} from "../contracts/schema.js"
import { isTerminalStatus, TICKET_SCHEMA_VERSION } from "../contracts/schema.js"

export type ParsedTicket = { ticket: QueueTicket; argv: string[]; flags: TicketFlags }
export type TicketRejection = { rejectReason: string }
export type ClaimResult = QueueTicket | undefined
export type CancelResult =
  | { kind: "missing" }
  | { kind: "terminal"; job: QueueTicket }
  | { kind: "queued"; job: QueueTicket }
  | { kind: "running"; job: QueueTicket; signalled: boolean; reason: string }

export type RunJobHooks = {
  onJob?: (job: QueueTicket | undefined) => void
  onChildPid?: (pid: number | undefined, identity?: ProcessGroupIdentity) => void
  interruptedReason?: () => string | undefined
}

function safeArgvFromLegacy(command: string): string[] | undefined {
  if (!command || /['"`\\]/.test(command)) return undefined
  const argv = command.trim().split(/\s+/).filter(Boolean)
  return argv.length ? argv : undefined
}

export function parseTicket(raw: QueueTicket): ParsedTicket | TicketRejection {
  if (!raw || typeof raw !== "object" || !raw.id || !raw.cwd || !raw.logPath || !raw.preset) return { rejectReason: "ticket sem campos obrigatórios" }
  if (raw.schemaVersion !== undefined && (!Number.isSafeInteger(raw.schemaVersion) || raw.schemaVersion < 1)) return { rejectReason: "schemaVersion inválido" }
  if ((raw.schemaVersion ?? 1) > TICKET_SCHEMA_VERSION) return { rejectReason: `ticket schemaVersion ${raw.schemaVersion} é mais novo que o worker` }
  const deadlineError = validateQueuedDeadline(raw)
  if (deadlineError) return { rejectReason: deadlineError }
  if (Array.isArray(raw.argv) && raw.argv.length > 0 && raw.argv.every((item) => typeof item === "string" && item)) return { ticket: raw, argv: raw.argv, flags: raw.flags ?? {} }
  const legacy = safeArgvFromLegacy(raw.command)
  if (legacy) return { ticket: raw, argv: legacy, flags: raw.flags ?? {} }
  return { rejectReason: "ticket sem argv válido" }
}

export function validateTicketAdmission(ticket: QueueTicket): void {
  if (ticket.status !== "queued") throw new Error("somente tickets queued podem ser admitidos")
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ticket.id)) throw new Error("id de ticket inválido")
  if (!isAbsolute(ticket.cwd)) throw new Error("cwd do ticket precisa ser absoluto")
  if (!ticket.projectId) throw new Error("projectId é obrigatório em tickets novos")
  const parsed = parseTicket(ticket)
  if ("rejectReason" in parsed) throw new Error(parsed.rejectReason)
}

function git(cwd: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10_000, env: { ...process.env, LC_ALL: "C", LANG: "C" } })
  return result.status === 0 ? String(result.stdout).trim() : undefined
}

export function readGitInfo(cwd: string, baseRef?: string): GitInfo | undefined {
  const headSha = git(cwd, ["rev-parse", "HEAD"])
  if (!headSha) return undefined
  const branch = git(cwd, ["branch", "--show-current"]) || "HEAD-detached"
  const statusShort = git(cwd, ["status", "--short"]) ?? ""
  const baseSha = baseRef ? git(cwd, ["rev-parse", baseRef]) : undefined
  return { branch, headSha, baseSha: baseSha ?? "", statusShort }
}

function assertPreflight(ticket: QueueTicket, flags: TicketFlags): GitInfo | undefined {
  if (!existsSync(ticket.cwd)) throw new Error(`cwd inexistente: ${ticket.cwd}`)
  if (!flags.requireCleanTree && !flags.pinHeadSha && !flags.requireGitStability && !flags.fetchBase) return readGitInfo(ticket.cwd, ticket.baseRef)
  if (flags.fetchBase) {
    const fetched = spawnSync("git", ["fetch", "--quiet", "origin", flags.fetchBase], { cwd: ticket.cwd, encoding: "utf8", timeout: 30_000 })
    if (fetched.status !== 0) throw new Error(`não foi possível atualizar base ${flags.fetchBase}`)
  }
  const info = readGitInfo(ticket.cwd, flags.fetchBase ?? ticket.baseRef)
  if (!info) throw new Error("preflight git indisponível")
  if (flags.pinHeadSha && info.headSha !== ticket.headSha) throw new Error(`HEAD mudou antes da execução (${info.headSha})`)
  if (flags.requireCleanTree && info.statusShort) throw new Error("árvore de trabalho não está limpa")
  if (flags.fetchBase && !info.baseSha) throw new Error(`base ${flags.fetchBase} não encontrada após fetch`)
  return info
}

function childExit(child: ReturnType<typeof spawn>): Promise<{ code: number; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    let done = false
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (done) return
      done = true
      resolve({ code: code ?? (signal ? 1 : 0), signal })
    }
    child.once("error", () => finish(1, null))
    child.once("close", finish)
  })
}

function mergeRunning(root: string, candidate: QueueTicket): QueueTicket {
  const current = readRunningJob(root)
  const merged: QueueTicket = current?.id === candidate.id
    ? { ...candidate, ...(current.cancelRequestedAt ? { cancelRequestedAt: current.cancelRequestedAt } : {}), ...(current.cancelledAt ? { cancelledAt: current.cancelledAt } : {}) }
    : candidate
  atomicWriteJson(queuePaths(root).running, merged)
  return merged
}

function terminalStatus(exitCode: number, cancelRequested: boolean, interrupted: boolean, timedOut: boolean): TerminalStatus {
  if (cancelRequested) return "cancelled"
  if (interrupted) return "interrupted"
  if (timedOut || exitCode !== 0) return "failed"
  return "passed"
}

function relativeArtifact(path: string): boolean {
  return !isAbsolute(path) && !path.split(/[\\/]/).includes("..")
}

function copyArtifacts(root: string, ticket: QueueTicket): string | undefined {
  if (!ticket.artifacts?.length) return undefined
  const target = join(queuePaths(root).artifacts, ticket.id)
  let copied = false
  for (const entry of ticket.artifacts) {
    if (!relativeArtifact(entry)) {
      appendLog(ticket.logPath, `[${new Date().toISOString()}] artifact ignorado (fora do projeto): ${entry}\n`)
      continue
    }
    const source = resolve(ticket.cwd, entry)
    if (!source.startsWith(`${resolve(ticket.cwd)}/`) || !existsSync(source)) continue
    const destination = join(target, entry)
    mkdirSync(join(destination, ".."), { recursive: true })
    cpSync(source, destination, { recursive: true, dereference: false, force: true })
    copied = true
  }
  return copied ? target : undefined
}

function finalProgress(root: string, ticket: QueueTicket, artifactStatus: "passed" | "failed" | "skipped"): QueueTicket {
  const collector = new ProgressCollector(root, ticket.id)
  collector.ingest(`${"@@ci-queue-progress"}\t1\tnode\tartifacts\t-\tartifact\t${artifactStatus}\t-\tArtefatos`)
  const enriched = attachProgressToTicket(root, ticket)
  removeProgressSnapshot(root, ticket.id)
  return enriched
}

export async function closeRunningTicket(root: string, candidate: QueueTicket): Promise<QueueTicket> {
  const terminal = await withTicketLock(root, candidate.id, () => {
    const existing = readHistoryJob(root, candidate.id)
    if (existing) return existing
    const running = readRunningJob(root)
    const merged = running?.id === candidate.id && running.cancelRequestedAt && !candidate.cancelRequestedAt
      ? { ...candidate, cancelRequestedAt: running.cancelRequestedAt }
      : candidate
    atomicWriteJson(historyPath(root, candidate.id), merged)
    if (running?.id === candidate.id) removeFile(queuePaths(root).running)
    return merged
  })
  return terminal ?? candidate
}

export async function claimQueuedTicket(root: string, id: string, workerPid = process.pid): Promise<ClaimResult> {
  return await withTicketLock(root, id, () => {
    if (readRunningJob(root)) return undefined
    const queuedPath = jobPath(root, id)
    const queued = readJsonFile<QueueTicket>(queuedPath)
    if (!queued || queued.status !== "queued") return undefined
    const claim = claimPath(root, id)
    try { renameSync(queuedPath, claim) } catch { return undefined }
    const running: QueueTicket = { ...queued, status: "running", startedAt: new Date().toISOString(), workerPid }
    try {
      atomicWriteJson(queuePaths(root).running, running)
      removeFile(claim)
      return running
    } catch (error) {
      try { renameSync(claim, queuedPath) } catch { /* recovery will preserve the claim */ }
      throw error
    }
  })
}

export async function rejectQueuedTicket(root: string, id: string, reason: string): Promise<QueueTicket | undefined> {
  return await withTicketLock(root, id, () => {
    const path = jobPath(root, id)
    const queued = readJsonFile<QueueTicket>(path)
    if (!queued) return undefined
    const rejectedPath = join(queuePaths(root).jobsRejected, `${id}.json`)
    try { renameSync(path, rejectedPath) } catch { return undefined }
    const terminal: QueueTicket = { ...queued, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: `ticket rejeitado: ${reason}` }
    atomicWriteJson(historyPath(root, id), terminal)
    appendLog(terminal.logPath, `[${new Date().toISOString()}] ${terminal.failureReason}\n`)
    return terminal
  })
}

export async function cancelQueuedOrRunningTicket(root: string, id: string): Promise<CancelResult> {
  const result = await withTicketLock(root, id, async () => {
    const found = findJobById(root, id)
    if (!found) return { kind: "missing" } as const
    if (found.location === "history") return { kind: "terminal", job: found.ticket } as const
    if (found.location === "queued") {
      const terminal: QueueTicket = { ...found.ticket, status: "cancelled", cancelledAt: new Date().toISOString(), finishedAt: new Date().toISOString(), exitCode: null }
      removeFile(found.path)
      atomicWriteJson(historyPath(root, id), terminal)
      appendLog(terminal.logPath, `[${new Date().toISOString()}] cancelado antes de iniciar\n`)
      return { kind: "queued", job: terminal } as const
    }
    const requested: QueueTicket = { ...found.ticket, cancelRequestedAt: found.ticket.cancelRequestedAt ?? new Date().toISOString() }
    atomicWriteJson(queuePaths(root).running, requested)
    const signal = await terminateVerifiedProcessGroup(requested.processGroupIdentity)
    appendLog(requested.logPath, `[${new Date().toISOString()}] cancelamento solicitado: ${signal.reason}\n`)
    return { kind: "running", job: requested, signalled: signal.terminated, reason: signal.reason } as const
  })
  return result ?? { kind: "missing" }
}

export async function reconcileInterruptedJob(root: string): Promise<{ state: "none" | "active" | "reconciled" | "blocked"; job?: QueueTicket }> {
  const running = readRunningJob(root)
  if (!running) return { state: "none" }
  if (running.workerPid && running.workerPid !== process.pid) {
    try { process.kill(running.workerPid, 0); return { state: "active", job: running } } catch { /* dead owner */ }
  }
  const termination = await terminateVerifiedProcessGroup(running.processGroupIdentity)
  if (!termination.terminated) {
    const blocked = { ...running, cleanupBlockedReason: `recuperação interrompida: ${termination.reason}` }
    atomicWriteJson(queuePaths(root).running, blocked)
    appendLog(blocked.logPath, `[${new Date().toISOString()}] ${blocked.cleanupBlockedReason}\n`)
    return { state: "blocked", job: blocked }
  }
  const terminal = await closeRunningTicket(root, {
    ...running,
    status: "interrupted",
    finishedAt: new Date().toISOString(),
    exitCode: null,
    failureReason: "worker interrompido; processo filho encerrado durante a recuperação",
  })
  return { state: "reconciled", job: terminal }
}

export function buildJobEnv(root: string, ticket: QueueTicket): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CI_QUEUE_JOB_ID: ticket.id,
    CI_QUEUE_PROJECT_ID: ticket.projectId ?? "",
    CI_QUEUE_STATE_DIR: root,
    CI_QUEUE_PRESET: ticket.preset,
  }
}

export async function runJob(root: string, parsed: ParsedTicket, hooks: RunJobHooks = {}): Promise<QueueTicket> {
  ensureQueueDirs(root)
  let ticket = parsed.ticket
  let preflight: GitInfo | undefined
  try {
    preflight = assertPreflight(ticket, parsed.flags)
  } catch (error) {
    const failed = finalProgress(root, { ...ticket, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: error instanceof Error ? error.message : String(error) }, "skipped")
    return closeRunningTicket(root, failed)
  }

  try {
    ticket = mergeRunning(root, { ...ticket, preflight })
  } catch (error) {
    throw new Error(`não foi possível reservar running.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  hooks.onJob?.(ticket)
  appendLog(ticket.logPath, `[${new Date().toISOString()}] running ${ticket.id} ${ticket.command}\n`)

  let child: ReturnType<typeof spawn>
  try {
    child = spawn(parsed.argv[0], parsed.argv.slice(1), { cwd: ticket.cwd, env: buildJobEnv(root, ticket), detached: true, stdio: ["ignore", "pipe", "pipe"] })
  } catch (error) {
    const failed = finalProgress(root, { ...ticket, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: `spawn falhou: ${error instanceof Error ? error.message : String(error)}` }, "skipped")
    return closeRunningTicket(root, failed)
  }

  const collector = new ProgressCollector(root, ticket.id)
  const output = (chunk: Buffer) => {
    const text = chunk.toString("utf8")
    appendLog(ticket.logPath, text)
    decoder.push(text)
  }
  const decoder = collector.decoder()
  child.stdout?.on("data", output)
  child.stderr?.on("data", output)

  const identity = child.pid ? probeProcessGroupIdentity(child.pid) : undefined
  const started = mergeRunning(root, {
    ...ticket,
    childPid: child.pid,
    ...(identity ? { processGroupIdentity: identity } : {}),
    executionDeadline: captureExecutionDeadline(parsed.flags.executionTimeoutMs, identity),
    processObservations: [readProcessObservation(identity, { capture: "start", cwd: ticket.cwd, jobId: ticket.id })],
  })
  ticket = started
  hooks.onJob?.(ticket); hooks.onChildPid?.(child.pid, identity)

  let timedOut = false
  let deadlineTimer: NodeJS.Timeout | undefined
  if (ticket.executionDeadline?.state === "armed") {
    const deadline = ticket.executionDeadline
    deadlineTimer = setTimeout(() => {
      const current = readRunningJob(root)
      if (!current || current.id !== ticket.id) return
      timedOut = true
      const expired = { ...current, executionDeadline: { state: "expired" as const, timeoutMs: deadline.timeoutMs, armedAt: deadline.armedAt, expiresAt: deadline.expiresAt, expiredAt: new Date().toISOString() } }
      try {
        atomicWriteJson(queuePaths(root).running, expired)
        void terminateVerifiedProcessGroup(expired.processGroupIdentity)
      } catch (error) {
        timedOut = false
        appendLog(ticket.logPath, `[${new Date().toISOString()}] deadline não persistido: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }, deadline.timeoutMs)
    deadlineTimer.unref?.()
  }

  const exit = await childExit(child)
  if (deadlineTimer) clearTimeout(deadlineTimer)
  decoder.flush()
  const latest = readRunningJob(root)
  const interrupted = Boolean(hooks.interruptedReason?.())
  const cancelRequested = Boolean(latest?.id === ticket.id && latest.cancelRequestedAt)
  const status = terminalStatus(exit.code, cancelRequested, interrupted, timedOut)
  const deadline = latest?.id === ticket.id ? latest.executionDeadline : ticket.executionDeadline
  const completedDeadline = deadline?.state === "armed"
    ? { state: "completed" as const, timeoutMs: deadline.timeoutMs, armedAt: deadline.armedAt, expiresAt: deadline.expiresAt }
    : deadline
  const observation = readProcessObservation(identity, { capture: "end", cwd: ticket.cwd, jobId: ticket.id, exitedBeforeObservation: true })
  let artifactsPath: string | undefined
  let artifactStatus: "passed" | "failed" | "skipped" = "skipped"
  if (status === "passed") {
    try {
      artifactsPath = copyArtifacts(root, ticket)
      artifactStatus = artifactsPath ? "passed" : "skipped"
    } catch (error) {
      artifactStatus = "failed"
      appendLog(ticket.logPath, `[${new Date().toISOString()}] cópia de artefatos falhou: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  const terminal = finalProgress(root, {
    ...ticket,
    ...(latest?.cancelRequestedAt ? { cancelRequestedAt: latest.cancelRequestedAt } : {}),
    status,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(ticket.startedAt ?? ticket.createdAt),
    exitCode: status === "cancelled" || status === "interrupted" ? null : exit.code,
    ...(status === "failed" ? { failureReason: timedOut ? "prazo de execução excedido" : `processo terminou com código ${exit.code}` } : {}),
    ...(artifactsPath ? { artifactsPath } : {}),
    ...(completedDeadline ? { executionDeadline: completedDeadline } : {}),
    processObservations: [...(ticket.processObservations ?? []), observation],
  }, artifactStatus)
  hooks.onChildPid?.(undefined)
  hooks.onJob?.(undefined)
  return closeRunningTicket(root, terminal)
}
