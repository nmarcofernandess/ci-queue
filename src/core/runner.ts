import { spawn, spawnSync } from "node:child_process"
import { existsSync, readdirSync, renameSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

import { prepareJobRuntime, RuntimeError, discardRuntimeDirectory, type RuntimeSession } from "./runtime.js"
import { RUNTIME_CAPABILITY } from "../contracts/runtime.js"

import { initialExecutionDeadline, captureExecutionDeadline, validateQueuedDeadline } from "./deadline.js"
import { ProgressCollector, removeProgressSnapshot } from "./progress.js"
import { observeTestProducer, observeWorkerIdentity, probeProcessGroupIdentity, probeWorkerIdentity, readProcessObservation, terminateVerifiedProcessGroup } from "./process.js"
import { preparePendingFinalization, runFinalization, type RecoveryActivation } from "./finalization.js"
import {
  decideSpendAbort,
  observeRemoteBase,
  resolveRemoteBase,
  STALE_BASE_FAILURE_REASON,
} from "./spend-abort.js"
import {
  appendLog,
  assertNoSymlinkPaths,
  atomicWriteJson,
  claimPath,
  ensureQueueDirs,
  findJobById,
  finalizationPath,
  historyPath,
  jobPath,
  queuePaths,
  readHistoryJob,
  readFinalization,
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
import { isTerminalStatus, TICKET_SCHEMA_VERSION, normalizeFinalization, finalizationDigest, canonicalJson, TERMINAL_FINALIZATION_CAPABILITY, NO_ARTIFACT_SNAPSHOTS_CAPABILITY } from "../contracts/schema.js"

export type ParsedTicket = { ticket: QueueTicket; argv: string[]; flags: TicketFlags }
export type TicketRejection = { rejectReason: string }
export type ClaimResult = QueueTicket | undefined
export type CancelResult =
  | { kind: "missing" }
  | { kind: "terminal"; job: QueueTicket }
  | { kind: "queued"; job: QueueTicket }
  | { kind: "running"; job: QueueTicket; signalled: boolean; reason: string }

export type RunJobHooks = {
  recoveryActivation?: RecoveryActivation
  onJob?: (job: QueueTicket | undefined) => void
  onChildPid?: (pid: number | undefined, identity?: ProcessGroupIdentity) => void
  interruptedReason?: () => string | undefined
  spendAbort?: {
    observe?: typeof observeRemoteBase
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>
    nowMs?: () => number
  }
}

/** Versioned child-process environment contract. */
export const JOB_ENV_CAPABILITY = "job-env-v1" as const

const SECRET_ASSIGNMENT_PATTERN =
  /\b(token|secret|password|authorization|api[_-]?key)\b\s*([:=])\s*([^\r\n]+)/gi
const SECRET_FLAG_PATTERN =
  /((?:--?)(?:token|secret|password|authorization|api[_-]?key)(?:\s+|=))(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s\r\n]+)/gi
const SECRET_JSON_PATTERN =
  /((?:"|')(?:token|secret|password|authorization|api[_-]?key)(?:"|')\s*:\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,}\]\r\n]+)/gi

/**
 * Logs are an on-disk boundary, so redact before writing rather than only when
 * the dashboard happens to read them. The patterns intentionally keep the
 * key/flag visible: an operator can still understand which credential failed.
 */
export function redactLogText(value: string): string {
  return value
    .replace(SECRET_JSON_PATTERN, '$1"[REDACTED]"')
    .replace(
      SECRET_ASSIGNMENT_PATTERN,
      (_match, name: string, separator: string) => `${name}${separator}[REDACTED]`
    )
    .replace(SECRET_FLAG_PATTERN, "$1[REDACTED]")
}

function appendRedactedLog(path: string, text: string): void {
  if (!text) return
  appendLog(path, redactLogText(text))
}

/**
 * Holds an unfinished line so a credential split over stdout/stderr chunks
 * cannot be written before its value is recognized and masked.
 */
export class LogRedactor {
  #pending = ""

  push(chunk: string): string {
    this.#pending += chunk
    const boundary = Math.max(
      this.#pending.lastIndexOf("\n"),
      this.#pending.lastIndexOf("\r")
    )
    if (boundary === -1) return ""
    const complete = this.#pending.slice(0, boundary + 1)
    this.#pending = this.#pending.slice(boundary + 1)
    return redactLogText(complete)
  }

  flush(): string {
    const complete = this.#pending
    this.#pending = ""
    return redactLogText(complete)
  }
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
  if (raw.finalization !== undefined || raw.finalizationDigest !== undefined) {
    if (raw.schemaVersion !== 4) return { rejectReason: "finalization exige ticket v4" }
    try {
      const spec = normalizeFinalization(raw.finalization)
      if (!spec || raw.finalizationDigest !== finalizationDigest(spec)) return { rejectReason: "finalizationDigest inválido" }
    } catch (error) {
      return { rejectReason: error instanceof Error ? error.message : String(error) }
    }
  }
  if (raw.producerIdentity !== undefined) {
    const owner = raw.producerIdentity
    if (!owner || owner.schemaVersion !== 1 || typeof owner.hostname !== "string" || !owner.hostname
      || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.startedAt !== "string" || !owner.startedAt
      || !Array.isArray(owner.capabilities) || owner.capabilities.some(item => typeof item !== "string")
      || ![TERMINAL_FINALIZATION_CAPABILITY, NO_ARTIFACT_SNAPSHOTS_CAPABILITY].every(item => owner.capabilities.includes(item))
      || (raw.workerPid !== undefined && raw.workerPid !== owner.pid)) return { rejectReason: "producerIdentity inválida/divergente" }
  }
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
  const statusShort = git(cwd, ["status", "--short"])
  if (statusShort === undefined) return undefined
  const baseSha = baseRef ? git(cwd, ["rev-parse", baseRef]) : undefined
  return { branch, headSha, baseSha: baseSha ?? "", statusShort }
}

function fetchConfiguredBase(cwd: string, reference: string): void {
  const [candidateRemote, ...branchParts] = reference.split("/")
  const remote = branchParts.length ? candidateRemote : "origin"
  const branch = branchParts.length ? branchParts.join("/") : reference
  const fetched = spawnSync("git", ["fetch", "--quiet", remote, branch], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  })
  if (fetched.status !== 0) {
    throw new Error(`não foi possível atualizar base ${reference}`)
  }
}

function assertBaseIsAncestor(cwd: string, baseSha: string, headSha: string): void {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", baseSha, headSha],
    { cwd, encoding: "utf8", timeout: 10_000 }
  )
  if (result.status === 0) return
  if (result.status === 1) {
    throw new Error(
      `base ${baseSha} não é ancestral de HEAD ${headSha}; atualize a branch antes de ocupar a fila`
    )
  }
  throw new Error("não foi possível provar ancestralidade Git")
}

function assertPreflight(ticket: QueueTicket, flags: TicketFlags): GitInfo | undefined {
  if (!existsSync(ticket.cwd)) throw new Error(`cwd inexistente: ${ticket.cwd}`)
  if (!flags.requireCleanTree && !flags.pinHeadSha && !flags.requireGitStability && !flags.fetchBase) return readGitInfo(ticket.cwd, ticket.baseRef)
  if (flags.fetchBase) {
    fetchConfiguredBase(ticket.cwd, flags.fetchBase)
  }
  const info = readGitInfo(ticket.cwd, flags.fetchBase ?? ticket.baseRef)
  if (!info) throw new Error("preflight git indisponível")
  if (flags.pinHeadSha && info.headSha !== ticket.headSha) throw new Error(`HEAD mudou antes da execução (${info.headSha})`)
  if (flags.requireCleanTree && info.statusShort) throw new Error("árvore de trabalho não está limpa")
  if (flags.fetchBase && !info.baseSha) throw new Error(`base ${flags.fetchBase} não encontrada após fetch`)
  if (flags.fetchBase) assertBaseIsAncestor(ticket.cwd, info.baseSha, info.headSha)
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

const GIT_INFO_FIELDS = ["branch", "headSha", "baseSha", "statusShort"] as const

function changedGitInfoFields(
  before: GitInfo | undefined,
  after: GitInfo | undefined
): string[] {
  if (!before || !after) {
    return [...GIT_INFO_FIELDS]
  }
  return GIT_INFO_FIELDS.filter((field) => before[field] !== after[field])
}

function verifyGitStability(
  ticket: QueueTicket,
  flags: TicketFlags
): { postflight?: GitInfo; failureReason?: string } {
  if (!flags.requireGitStability) {
    return {}
  }

  const postflight = readGitInfo(ticket.cwd, flags.fetchBase ?? ticket.baseRef)
  const changed = changedGitInfoFields(ticket.preflight, postflight)
  if (!postflight) {
    return {
      failureReason: `${ticket.preset} invalidado: não foi possível ler o estado Git pós-job`,
    }
  }
  if (changed.length) {
    return {
      postflight,
      failureReason: `${ticket.preset} invalidado: estado Git mudou durante o job (${changed.join(", ")})`,
    }
  }
  return { postflight }
}

function publishArtifactNode(collector: ProgressCollector, artifactStatus: "running" | "passed" | "failed" | "skipped"): void {
  collector.ingest(`${"@@ci-queue-progress"}\t1\tnode\tartifacts\t-\tartifact\t${artifactStatus}\t-\tArtefatos`)
}

/** Attach finalized progress. Never deletes the sidecar — that happens only after authoritative history. */
function withFinalProgress(
  root: string,
  ticket: QueueTicket,
  collector?: ProgressCollector,
  options: { publishSkippedArtifacts?: boolean } = {},
): QueueTicket {
  const active = collector ?? new ProgressCollector(root, ticket.id)
  if (options.publishSkippedArtifacts) {
    // No Queue snapshot: terminal without running → honest missing-start, never 0 ms.
    publishArtifactNode(active, "skipped")
  }
  const progress = active.finalize()
  return { ...ticket, progress, ...(progress.runVariant ? { runVariant: progress.runVariant } : {}) }
}

function finalProgress(
  root: string,
  ticket: QueueTicket,
  collector?: ProgressCollector,
): QueueTicket {
  return withFinalProgress(root, ticket, collector, { publishSkippedArtifacts: true })
}

export type CloseTicketResult = { ticket: QueueTicket; authoritative: boolean }

/**
 * Persist a terminal ticket under the job lock.
 * `authoritative` is true only when history exists on disk afterwards — never inferred from candidate/status/id.
 */
export async function closeRunningTicket(root: string, candidate: QueueTicket): Promise<CloseTicketResult> {
  const terminal = await withTicketLock(root, candidate.id, () => {
    const existing = readHistoryJob(root, candidate.id)
    if (existing) {
      if (readRunningJob(root)?.id === candidate.id) removeFile(queuePaths(root).running)
      removeFile(claimPath(root, candidate.id))
      removeFile(jobPath(root, candidate.id))
      return existing
    }
    const running = readRunningJob(root)
    if (running && running.id !== candidate.id) throw new Error("outro ticket mantém a reserva do runner")
    const merged = running?.id === candidate.id && running.cancelRequestedAt && !candidate.cancelRequestedAt
      ? { ...candidate, cancelRequestedAt: running.cancelRequestedAt }
      : candidate
    // Keep the completed candidate in the existing reservation across a crash
    // between pending and history, so recovery preserves its original verdict.
    atomicWriteJson(queuePaths(root).running, merged)
    preparePendingFinalization(root, merged)
    atomicWriteJson(historyPath(root, candidate.id), merged)
    if (readRunningJob(root)?.id === candidate.id) removeFile(queuePaths(root).running)
    // A crash may leave the short-lived claim beside running.json. Once a
    // terminal record is authoritative, that claim can only relaunch work.
    removeFile(claimPath(root, candidate.id))
    removeFile(jobPath(root, candidate.id))
    return merged
  })
  if (terminal === undefined) {
    return { ticket: candidate, authoritative: false }
  }
  const persisted = readHistoryJob(root, candidate.id)
  return { ticket: terminal, authoritative: Boolean(persisted) }
}

async function closeAndMaybeDropSidecar(root: string, candidate: QueueTicket, runtimeDirectory?: string, activation?: RecoveryActivation): Promise<QueueTicket> {
  const { ticket, authoritative } = await closeRunningTicket(root, candidate)
  if (authoritative) {
    const producer = observeTestProducer(ticket)
    if (producer.state !== "dead") {
      atomicWriteJson(queuePaths(root).running, { ...ticket, cleanupBlockedReason: producer.reason })
      appendRedactedLog(ticket.logPath, `[finalization] ${producer.reason}; reserva preservada\n`)
      if (ticket.finalization) await runFinalization(root, ticket, activation)
      return ticket
    }
    removeProgressSnapshot(root, ticket.id)
    const directory = runtimeDirectory ?? (ticket.runtime?.evidencePath ? dirname(ticket.runtime.evidencePath) : undefined)
    if (directory) {
      const path = resolve(directory)
      if (dirname(path) !== resolve(root, "runtime") || !/^job-[A-Za-z0-9]+$/.test(basename(path))) throw new Error("runtime do teste fora da raiz reservada")
      assertNoSymlinkPaths([root, join(root, "runtime"), directory])
      discardRuntimeDirectory(directory)
    }
    if (ticket.finalization) await runFinalization(root, ticket, activation)
  }
  return ticket
}

export async function claimQueuedTicket(root: string, id: string, workerPid = process.pid): Promise<ClaimResult> {
  return await withTicketLock(root, id, () => {
    if (readHistoryJob(root, id)) {
      removeFile(jobPath(root, id))
      removeFile(claimPath(root, id))
      return undefined
    }
    if (readRunningJob(root)) return undefined
    const queuedPath = jobPath(root, id)
    const queued = readJsonFile<QueueTicket>(queuedPath)
    if (!queued || queued.status !== "queued") return undefined
    const producerIdentity = queued.schemaVersion === 4 ? probeWorkerIdentity() : undefined
    if (queued.schemaVersion === 4 && (workerPid !== process.pid || !producerIdentity)) {
      throw new Error("claim exige identidade nativa verificável do próprio worker")
    }
    const claim = claimPath(root, id)
    try { renameSync(queuedPath, claim) } catch { return undefined }
    const running: QueueTicket = { ...queued, status: "running", startedAt: new Date().toISOString(), workerPid, ...(producerIdentity ? { producerIdentity } : {}) }
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
    appendRedactedLog(terminal.logPath, `[${new Date().toISOString()}] ${terminal.failureReason}\n`)
    return terminal
  })
}

export async function cancelQueuedOrRunningTicket(root: string, id: string): Promise<CancelResult> {
  const result = await withTicketLock(root, id, async () => {
    const found = findJobById(root, id)
    if (!found) return { kind: "missing" } as const
    if (found.location === "history") {
      const finalization = readFinalization(root, id)
      if (finalization && !finalization.finishedAt) {
        atomicWriteJson(finalizationPath(root, id), { ...finalization, cancelRequestedAt: finalization.cancelRequestedAt ?? new Date().toISOString() })
        appendRedactedLog(found.ticket.logPath, `[finalization] cancelamento registrado; operação permanece sob seu prazo\n`)
      }
      return { kind: "terminal", job: found.ticket } as const
    }
    if (found.location === "queued") {
      const terminal: QueueTicket = { ...found.ticket, status: "cancelled", cancelledAt: new Date().toISOString(), finishedAt: new Date().toISOString(), exitCode: null }
      // Cancellation cannot overwrite another job's global running slot.
      // Its existing per-ticket claim is the crash-safe terminal candidate.
      atomicWriteJson(claimPath(root, id), terminal)
      preparePendingFinalization(root, terminal)
      removeFile(found.path)
      atomicWriteJson(historyPath(root, id), terminal)
      removeFile(claimPath(root, id))
      appendRedactedLog(terminal.logPath, `[${new Date().toISOString()}] cancelado antes de iniciar\n`)
      return { kind: "queued", job: terminal } as const
    }
    const requested: QueueTicket = { ...found.ticket, cancelRequestedAt: found.ticket.cancelRequestedAt ?? new Date().toISOString() }
    atomicWriteJson(queuePaths(root).running, requested)
    const signal = await terminateVerifiedProcessGroup(requested.processGroupIdentity)
    appendRedactedLog(requested.logPath, `[${new Date().toISOString()}] cancelamento solicitado: ${signal.reason}\n`)
    return { kind: "running", job: requested, signalled: signal.terminated, reason: signal.reason } as const
  })
  return result ?? { kind: "missing" }
}

export async function reconcileInterruptedJob(root: string, activation?: RecoveryActivation): Promise<{ state: "none" | "active" | "reconciled" | "blocked"; job?: QueueTicket }> {
  const running = readRunningJob(root)
  if (!running) return { state: "none" }
  if (isTerminalStatus(running.status)) {
    const terminal = await closeAndMaybeDropSidecar(root, running, undefined, activation)
    const reserved = readRunningJob(root)
    return reserved?.id === terminal.id && reserved.cleanupBlockedReason
      ? { state: "blocked", job: reserved }
      : { state: "reconciled", job: terminal }
  }
  if (running.workerPid && running.workerPid !== process.pid) {
    try { process.kill(running.workerPid, 0); return { state: "active", job: running } } catch { /* dead owner */ }
  }
  const termination = await terminateVerifiedProcessGroup(running.processGroupIdentity)
  if (!termination.terminated) {
    const blocked = { ...running, cleanupBlockedReason: `recuperação interrompida: ${termination.reason}` }
    atomicWriteJson(queuePaths(root).running, blocked)
    appendRedactedLog(blocked.logPath, `[${new Date().toISOString()}] ${blocked.cleanupBlockedReason}\n`)
    return { state: "blocked", job: blocked }
  }
  const collector = new ProgressCollector(root, running.id)
  const withProgress = withFinalProgress(root, {
    ...running,
    status: "interrupted",
    finishedAt: new Date().toISOString(),
    exitCode: null,
    failureReason: "worker interrompido; processo filho encerrado durante a recuperação",
  }, collector, { publishSkippedArtifacts: true })
  const terminal = await closeAndMaybeDropSidecar(root, withProgress, undefined, activation)
  return { state: "reconciled", job: terminal }
}

/** Terminal cancellation claims are never restored as executable queue jobs. */
export async function reconcileTerminalClaims(root: string, activation?: RecoveryActivation): Promise<string[]> {
  const reconciled: string[] = []
  for (const name of readdirSync(queuePaths(root).claims)) {
    if (!name.endsWith(".json")) continue
    const candidate = readJsonFile<QueueTicket>(join(queuePaths(root).claims, name))
    if (!candidate || `${candidate.id}.json` !== name || !isTerminalStatus(candidate.status)) continue
    const terminal = await closeAndMaybeDropSidecar(root, candidate, undefined, activation)
    reconciled.push(terminal.id)
  }
  return reconciled
}

export function buildJobEnv(root: string, ticket: QueueTicket): NodeJS.ProcessEnv {
  const headSha = ticket.headSha || ticket.preflight?.headSha || ""
  const baseSha = ticket.preflight?.baseSha ?? ""
  // Old tickets remain neutral; only persisted recipe metadata enables
  // DietFlow's emitters.
  const progressEnabled = ticket.flags?.progressEnabled === true
  return {
    ...process.env,
    CI_QUEUE_JOB_ENV_VERSION: "1",
    CI_QUEUE_JOB_ID: ticket.id,
    CI_QUEUE_PROJECT_ID: ticket.projectId ?? "",
    CI_QUEUE_STATE_DIR: root,
    CI_QUEUE_PRESET: ticket.preset,
    CI_QUEUE_RUN_VARIANT: ticket.runVariant ?? "",
    CI_QUEUE_WORKER_IDENTITY: JSON.stringify(ticket.producerIdentity ?? probeWorkerIdentity() ?? null),
    CI_QUEUE_FINALIZATION_INPUT: "",
    // v1 compatibility aliases remain necessary while existing project
    // recipes/proofs migrate to the product-named environment.
    DIETFLOW_CI_QUEUE_DIR: root,
    DIETFLOW_CI_QUEUE_JOB_ID: ticket.id,
    DIETFLOW_CI_QUEUE_HEAD_SHA: headSha,
    DIETFLOW_CI_BASE_SHA: baseSha,
    LOCAL_CI_QUEUE_DIR: root,
    LOCAL_CI_JOB_ID: ticket.id,
    LOCAL_CI_PRESET: ticket.preset,
    // Do not inherit a caller's value: only persisted recipe metadata can
    // enable DietFlow's emitters.
    LOCAL_CI_PROGRESS_ENABLED: progressEnabled ? "1" : "",
    LOCAL_CI_HEAD_SHA: headSha,
    LOCAL_CI_BASE_SHA: baseSha,
  }
}

const SPEND_ABORT_INTERVAL_MS = 15_000
const SPEND_ABORT_BACKOFF_MS = [30_000, 60_000, 120_000] as const
const SPEND_ABORT_OBSERVE_TIMEOUT_MS = 10_000

export type SpendAbortObserver = { stop(): Promise<void> }

export function startSpendAbortObserver(input: {
  ticket: QueueTicket
  observe: typeof observeRemoteBase
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  onStale: (remoteSha: string) => Promise<void>
  nowMs: () => number
}): SpendAbortObserver {
  const controller = new AbortController()
  const loop = runSpendAbortLoop(input, controller.signal)
  return {
    async stop() {
      controller.abort()
      await loop
      deleteObservedRef(input.ticket.cwd, input.ticket.id)
    },
  }
}

async function runSpendAbortLoop(
  input: {
    ticket: QueueTicket
    observe: typeof observeRemoteBase
    sleep: (ms: number, signal: AbortSignal) => Promise<void>
    onStale: (remoteSha: string) => Promise<void>
    nowMs: () => number
  },
  signal: AbortSignal,
): Promise<void> {
  let consecutiveErrors = 0
  let first = true
  while (!signal.aborted) {
    input.nowMs()
    if (!first) {
      const waitMs = consecutiveErrors === 0
        ? SPEND_ABORT_INTERVAL_MS
        : SPEND_ABORT_BACKOFF_MS[Math.min(consecutiveErrors, SPEND_ABORT_BACKOFF_MS.length) - 1]
      await input.sleep(waitMs, signal)
      if (signal.aborted) break
    }
    first = false
    try {
      const fetchBase = input.ticket.flags?.fetchBase
      if (!fetchBase) {
        consecutiveErrors += 1
        continue
      }
      const base = resolveRemoteBase(fetchBase, listGitRemotes(input.ticket.cwd))
      const observation = await input.observe({
        cwd: input.ticket.cwd,
        base,
        headSha: input.ticket.headSha,
        ticketId: input.ticket.id,
        signal,
        timeoutMs: SPEND_ABORT_OBSERVE_TIMEOUT_MS,
      })
      if (signal.aborted) break
      const decision = decideSpendAbort({
        abortOnStaleBase: input.ticket.flags?.abortOnStaleBase === true,
        remoteBaseSha: observation.kind === "known" ? observation.sha : null,
        isRemoteAncestorOfHead: observation.kind === "known" ? observation.isAncestor : null,
      })
      if (observation.kind === "known") consecutiveErrors = 0
      else consecutiveErrors += 1
      if (decision.action === "abort") {
        await input.onStale(decision.remoteSha)
        break
      }
    } catch {
      consecutiveErrors += 1
    }
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function listGitRemotes(cwd: string): string[] {
  const result = spawnSync("git", ["remote"], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  })
  if (result.status !== 0) throw new Error("não foi possível listar remotes")
  return String(result.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function deleteObservedRef(cwd: string, ticketId: string): void {
  spawnSync("git", ["update-ref", "-d", `refs/ci-queue/observed/${ticketId}`], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  })
}

export async function runJob(root: string, parsed: ParsedTicket, hooks: RunJobHooks = {}): Promise<QueueTicket> {
  ensureQueueDirs(root)
  let ticket = parsed.ticket
  // One collector for the whole job, including early exits (E3 / R01).
  const collector = new ProgressCollector(root, ticket.id)
  let preflight: GitInfo | undefined
  let runtime: RuntimeSession
  try {
    if (ticket.schemaVersion === 4) {
      const actual = probeWorkerIdentity()
      const reserved = readRunningJob(root)
      if (!actual || !ticket.producerIdentity || ticket.workerPid !== process.pid
        || observeWorkerIdentity(ticket.producerIdentity).state !== "alive"
        || canonicalJson(ticket.producerIdentity) !== canonicalJson(actual)
        || reserved?.id !== ticket.id || canonicalJson(reserved.producerIdentity) !== canonicalJson(actual)) {
        throw new Error("produtor v4 exige claim nativo persistido antes do lançamento")
      }
    }
    preflight = assertPreflight(ticket, parsed.flags)
    ticket = { ...ticket, preflight }
  } catch (error) {
    const failed = finalProgress(root, { ...ticket, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: error instanceof Error ? error.message : String(error) }, collector)
    return closeAndMaybeDropSidecar(root, failed, undefined, hooks.recoveryActivation)
  }

  try {
    runtime = prepareJobRuntime(root, ticket, parsed.argv, buildJobEnv(root, ticket))
    ticket = { ...ticket, runtime: runtime.receipt }
  } catch (error) {
    if (error instanceof RuntimeError) {
      ticket = { ...ticket, runtime: { capability: RUNTIME_CAPABILITY, coverage: "unconfigured", state: "rejected", observations: [], failureCode: error.code } }
      appendRedactedLog(ticket.logPath, `[${new Date().toISOString()}] ${error.message}\n`)
    }
    const failed = finalProgress(root, { ...ticket, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: error instanceof Error ? error.message : String(error) }, collector)
    return closeAndMaybeDropSidecar(root, failed, undefined, hooks.recoveryActivation)
  }

  try {
    ticket = mergeRunning(root, ticket)
  } catch (error) {
    discardRuntimeDirectory(runtime.directory)
    throw new Error(`não foi possível reservar running.json: ${error instanceof Error ? error.message : String(error)}`)
  }
  hooks.onJob?.(ticket)
  appendRedactedLog(ticket.logPath, `[${new Date().toISOString()}] running ${ticket.id} ${ticket.command}\n`)

  let child: ReturnType<typeof spawn>
  try {
    child = spawn(runtime.argv[0], runtime.argv.slice(1), { cwd: ticket.cwd, env: runtime.env, detached: true, stdio: ["ignore", "pipe", "pipe"] })
  } catch (error) {
    ticket = { ...ticket, runtime: runtime.finish() }
    const failed = finalProgress(root, { ...ticket, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: `spawn falhou: ${error instanceof Error ? error.message : String(error)}` }, collector)
    return closeAndMaybeDropSidecar(root, failed, runtime.directory, hooks.recoveryActivation)
  }

  if (runtime.receipt.node) appendRedactedLog(ticket.logPath, `[runtime] ${runtime.receipt.node.executable} v${runtime.receipt.node.version}; coverage=${runtime.receipt.coverage}\n`)

  const logRedactor = new LogRedactor()
  const stdoutProgress = collector.decoder()
  const stderrProgress = collector.decoder()
  const onStdout = (chunk: Buffer) => {
    appendRedactedLog(ticket.logPath, logRedactor.push(chunk.toString("utf8")))
    stdoutProgress.push(chunk)
  }
  const onStderr = (chunk: Buffer) => {
    appendRedactedLog(ticket.logPath, logRedactor.push(chunk.toString("utf8")))
    stderrProgress.push(chunk)
  }
  child.stdout?.on("data", onStdout)
  child.stderr?.on("data", onStderr)

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
  let childClosed = false
  let staleAborted = false
  let deadlineTimer: NodeJS.Timeout | undefined
  if (ticket.executionDeadline?.state === "armed") {
    const deadline = ticket.executionDeadline
    deadlineTimer = setTimeout(() => {
      if (childClosed || staleAborted) return
      const current = readRunningJob(root)
      if (!current || current.id !== ticket.id) return
      timedOut = true
      const expired = { ...current, executionDeadline: { state: "expired" as const, timeoutMs: deadline.timeoutMs, armedAt: deadline.armedAt, expiresAt: deadline.expiresAt, expiredAt: new Date().toISOString() } }
      try {
        atomicWriteJson(queuePaths(root).running, expired)
        void terminateVerifiedProcessGroup(expired.processGroupIdentity)
      } catch (error) {
        timedOut = false
        appendRedactedLog(ticket.logPath, `[${new Date().toISOString()}] deadline não persistido: ${error instanceof Error ? error.message : String(error)}\n`)
      }
    }, deadline.timeoutMs)
    deadlineTimer.unref?.()
  }

  const observer = parsed.flags.abortOnStaleBase === true && parsed.flags.fetchBase
    ? startSpendAbortObserver({
      ticket,
      observe: hooks.spendAbort?.observe ?? observeRemoteBase,
      sleep: hooks.spendAbort?.sleep ?? abortableSleep,
      nowMs: hooks.spendAbort?.nowMs ?? Date.now,
      onStale: async (_remoteSha) => {
        if (childClosed) return
        const current = readRunningJob(root)
        if (!current || current.id !== ticket.id) return
        if (current.cancelRequestedAt) return
        if (current.executionDeadline?.state === "expired") return
        if (!current.processGroupIdentity) return
        staleAborted = true
        await terminateVerifiedProcessGroup(current.processGroupIdentity)
      },
    })
    : undefined

  const exit = await childExit(child)
  childClosed = true
  if (deadlineTimer) clearTimeout(deadlineTimer)
  if (observer) await observer.stop()
  stdoutProgress.flush()
  stderrProgress.flush()
  appendRedactedLog(ticket.logPath, logRedactor.flush())
  const latest = readRunningJob(root)
  const interrupted = Boolean(hooks.interruptedReason?.())
  const cancelRequested = Boolean(latest?.id === ticket.id && latest.cancelRequestedAt)
  let status = terminalStatus(exit.code, cancelRequested, interrupted, timedOut)
  let exitCode: number | null =
    status === "cancelled" || status === "interrupted" ? null : exit.code
  let failureReason =
    status === "failed"
      ? timedOut
        ? "prazo de execução excedido"
        : `processo terminou com código ${exit.code}`
      : undefined
  if (staleAborted && !cancelRequested && !interrupted && !timedOut) {
    status = "failed"
    exitCode = 1
    failureReason = STALE_BASE_FAILURE_REASON
  }
  const runtimeReceipt = runtime.finish()
  ticket = { ...ticket, runtime: runtimeReceipt }
  if (runtimeReceipt.state === "rejected") {
    const runtimeFailure = runtimeReceipt.failureCode ?? "RUNTIME_REJECTED"
    appendRedactedLog(ticket.logPath, `[runtime] ${runtimeFailure}\n`)
    if (status !== "cancelled" && status !== "interrupted") {
      status = "failed"
      exitCode = 78
      if (!staleAborted) failureReason = runtimeFailure
    }
  }
  let postflight: GitInfo | undefined
  if (status === "passed") {
    const stability = verifyGitStability(ticket, parsed.flags)
    postflight = stability.postflight
    if (stability.failureReason) {
      status = "failed"
      exitCode = 1
      failureReason = stability.failureReason
    }
  }
  const deadline = latest?.id === ticket.id ? latest.executionDeadline : ticket.executionDeadline
  const completedDeadline = deadline?.state === "armed"
    ? { state: "completed" as const, timeoutMs: deadline.timeoutMs, armedAt: deadline.armedAt, expiresAt: deadline.expiresAt }
    : deadline
  const observation = readProcessObservation(identity, { capture: "end", cwd: ticket.cwd, jobId: ticket.id, exitedBeforeObservation: true })
  const candidate = withFinalProgress(root, {
    ...ticket,
    ...(latest?.cancelRequestedAt ? { cancelRequestedAt: latest.cancelRequestedAt } : {}),
    status,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(ticket.startedAt ?? ticket.createdAt),
    exitCode,
    ...(failureReason ? { failureReason } : {}),
    ...(completedDeadline ? { executionDeadline: completedDeadline } : {}),
    ...(postflight ? { postflight } : {}),
    processObservations: [...(ticket.processObservations ?? []), observation],
  }, collector, { publishSkippedArtifacts: true })
  hooks.onChildPid?.(undefined)
  hooks.onJob?.(undefined)
  return closeAndMaybeDropSidecar(root, candidate, runtime.directory, hooks.recoveryActivation)
}
