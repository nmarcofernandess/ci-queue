import { readFileSync, readdirSync, renameSync, statSync } from "node:fs"
import { join } from "node:path"

import { parseTicket, claimQueuedTicket, reconcileInterruptedJob, reconcileTerminalClaims, rejectQueuedTicket, runJob } from "./runner.js"
import { observeWorkerIdentity, probeWorkerIdentity, terminateVerifiedProcessGroup } from "./process.js"
import { reconcileFinalizations } from "./finalization.js"
import {
  acquireRunnerLock,
  appendLog,
  assertWorkerStatePaths,
  atomicWriteJson,
  ensureQueueDirs,
  historyPath,
  listQueuedJobs,
  isPidAlive,
  queuePaths,
  readRunningJob,
  readBoundedFile,
  readFinalization,
  readWorkerOwnership,
  recoverClaims,
  removeFile,
} from "./state.js"
import type { QueueTicket, WorkerIdentity } from "../contracts/schema.js"

export const STALE_TMP_MAX_AGE_MS = 5 * 60_000

export type WorkerReport = {
  processed: string[]
  rejected: string[]
  reconciliation: "none" | "active" | "reconciled" | "blocked"
  busy: boolean
  blockingReason?: string
}

function fileAge(path: string): number | undefined {
  try { return Date.now() - statSync(path).mtimeMs } catch { return undefined }
}

function rawTicket(path: string): QueueTicket | undefined {
  try { return JSON.parse(readFileSync(path, "utf8")) as QueueTicket } catch { return undefined }
}

/**
 * The watched jobs directory must drain: malformed files move outside it.
 * A fresh .tmp may still belong to an old producer and is left alone briefly.
 */
export async function sweepInvalidTickets(root: string): Promise<string[]> {
  const paths = ensureQueueDirs(root)
  const rejected: string[] = []
  for (const name of readdirSync(paths.jobs)) {
    const path = join(paths.jobs, name)
    if (!name.endsWith(".json")) {
      const age = fileAge(path)
      if (age !== undefined && age < STALE_TMP_MAX_AGE_MS) continue
      try { renameSync(path, join(paths.jobsRejected, name)); rejected.push(name) } catch { /* concurrent writer wins */ }
      continue
    }
    const raw = rawTicket(path)
    const parsed = raw ? parseTicket(raw) : { rejectReason: "ticket não parseia como JSON" }
    if (!("rejectReason" in parsed)) continue
    if (!raw?.id) {
      try { renameSync(path, join(paths.jobsRejected, name)); rejected.push(name) } catch { /* next worker retries */ }
      continue
    }
    const terminal = await rejectQueuedTicket(root, raw.id, parsed.rejectReason)
    if (terminal) rejected.push(raw.id)
  }
  return rejected
}

/** Only recognized atomic writes with a dead producer can be quarantined. */
export function recoverProgressTemporaries(root: string): string[] {
  const paths = ensureQueueDirs(root)
  const recovered: string[] = []
  if (readRunningJob(root)) return recovered
  for (const name of readdirSync(paths.progress)) {
    const match = /^(.+\.json)\.(\d+)\.([a-f0-9]{12})\.tmp$/.exec(name)
    if (!match || isPidAlive(Number(match[2]))) continue
    const path = join(paths.progress, name)
    const age = fileAge(path)
    if (age === undefined || age < STALE_TMP_MAX_AGE_MS) continue
    try {
      renameSync(path, join(paths.jobsRejected, `progress-${name}`))
      recovered.push(name)
    } catch { /* Another recovery may already have preserved it. */ }
  }
  return recovered
}

/** Drains one state root and exits. The installer may invoke it on demand. */
export async function runWorker(root: string): Promise<WorkerReport> {
  ensureQueueDirs(root)
  const lock = acquireRunnerLock(root)
  if (!lock) return { processed: [], rejected: [], reconciliation: "active", busy: true }
  const paths = queuePaths(root)
  const report: WorkerReport = { processed: [], rejected: [], reconciliation: "none", busy: false }
  let current: QueueTicket | undefined
  let identity: WorkerIdentity | undefined
  let publishedWorkerPid = false
  let interrupted = false
  const handleSignal = () => {
    interrupted = true
    if (current?.processGroupIdentity) void terminateVerifiedProcessGroup(current.processGroupIdentity)
  }
  process.once("SIGINT", handleSignal)
  process.once("SIGTERM", handleSignal)
  try {
    // Keep the legacy decimal form while old consumers may still inspect the
    // shared lock during the one-time external cutover.
    const ownership = readWorkerOwnership(root)
    if (ownership.state === "invalid") {
      report.reconciliation = "blocked"; report.busy = true; report.blockingReason = ownership.reason
      return report
    }
    const previousIdentity = ownership.state === "valid" ? ownership.identity : undefined
    identity = probeWorkerIdentity()
    if (previousIdentity && (!identity || previousIdentity.pid !== identity.pid || previousIdentity.startedAt !== identity.startedAt || previousIdentity.hostname !== identity.hostname)) {
      const previous = observeWorkerIdentity(previousIdentity)
      if (previous.state !== "dead") {
        report.reconciliation = previous.state === "alive" ? "active" : "blocked"; report.busy = true; report.blockingReason = previous.reason
        return report
      }
    }
    assertWorkerStatePaths(root)
    atomicWriteJson(paths.workerPid, process.pid)
    publishedWorkerPid = true
    if (identity) atomicWriteJson(paths.workerIdentity, identity)
    const reconciliation = await reconcileInterruptedJob(root)
    report.reconciliation = reconciliation.state
    if (reconciliation.state === "active" || reconciliation.state === "blocked") {
      report.blockingReason = reconciliation.job?.cleanupBlockedReason
      return report
    }
    if ((await reconcileTerminalClaims(root)).length) report.reconciliation = "reconciled"
    recoverProgressTemporaries(root)
    recoverClaims(root)
    report.rejected.push(...await sweepInvalidTickets(root))
    for (;;) {
      const currentOwnership = readWorkerOwnership(root)
      if (currentOwnership.state === "invalid") {
        report.reconciliation = "blocked"; report.blockingReason = currentOwnership.reason
        break
      }
      if (currentOwnership.state === "valid" && (!identity || currentOwnership.identity.pid !== identity.pid || currentOwnership.identity.hostname !== identity.hostname || currentOwnership.identity.startedAt !== identity.startedAt)) {
        report.reconciliation = "blocked"; report.blockingReason = "identidade do worker substituída durante a drenagem"
        break
      }
      // A queued cancellation can publish a terminal while the previous test
      // is active. Drain that work before another claim, including empty exit.
      if ((await reconcileTerminalClaims(root)).length) report.reconciliation = "reconciled"
      const finalizations = await reconcileFinalizations(root)
      if (finalizations.blocked.length) { report.reconciliation = "blocked"; break }
      if (finalizations.reconciled.length) report.reconciliation = "reconciled"
      if (interrupted) break
      if (readRunningJob(root)) break
      const candidate = listQueuedJobs(root)[0]
      if (!candidate) break
      const claimed = await claimQueuedTicket(root, candidate.id, process.pid)
      if (!claimed) continue
      const parsed = parseTicket(claimed)
      if ("rejectReason" in parsed) {
        // Claim already left the watch directory. Write terminal directly so no
        // malformed item can hold the worker in a launch loop.
        const terminal: QueueTicket = { ...claimed, status: "failed", finishedAt: new Date().toISOString(), exitCode: 1, failureReason: `ticket rejeitado: ${parsed.rejectReason}` }
        appendLog(terminal.logPath, `[${new Date().toISOString()}] ${terminal.failureReason}\n`)
        const running = readRunningJob(root)
        if (running?.id === terminal.id) {
          atomicWriteJson(historyPath(root, terminal.id), terminal)
          removeFile(paths.running)
        }
        report.rejected.push(terminal.id)
        continue
      }
      const terminal = await runJob(root, parsed, {
        onJob: (job) => { current = job },
        interruptedReason: () => interrupted ? "worker interrompido por sinal" : undefined,
      })
      report.processed.push(terminal.id)
      const reserved = readRunningJob(root)
      if (reserved?.cleanupBlockedReason) {
        report.reconciliation = "blocked"; report.blockingReason = reserved.cleanupBlockedReason
        break
      }
      const finalization = readFinalization(root, terminal.id)
      if (finalization && !finalization.finishedAt) { report.reconciliation = "blocked"; break }
    }
    return report
  } finally {
    process.removeListener("SIGINT", handleSignal)
    process.removeListener("SIGTERM", handleSignal)
    try {
      const ownership = readWorkerOwnership(root)
      if (ownership.state === "invalid") {
        report.reconciliation = "blocked"; report.blockingReason = ownership.reason
      } else {
        const owner = ownership.state === "valid" ? ownership.identity : undefined
        const ownsIdentity = identity && owner?.pid === identity.pid && owner.hostname === identity.hostname && owner.startedAt === identity.startedAt
        let legacyPid: unknown
        try { legacyPid = JSON.parse(readBoundedFile(paths.workerPid, 32).toString("utf8")) } catch { /* never remove an unreadable/replaced legacy owner */ }
        assertWorkerStatePaths(root)
        if (publishedWorkerPid && legacyPid === process.pid && (!owner || ownsIdentity)) removeFile(paths.workerPid)
        if (ownsIdentity) removeFile(paths.workerIdentity)
      }
    } finally { lock.release() }
  }
}
