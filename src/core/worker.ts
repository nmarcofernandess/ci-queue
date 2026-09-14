import { readFileSync, readdirSync, renameSync, statSync } from "node:fs"
import { join } from "node:path"

import { parseTicket, claimQueuedTicket, reconcileInterruptedJob, rejectQueuedTicket, runJob } from "./runner.js"
import { terminateVerifiedProcessGroup } from "./process.js"
import {
  acquireRunnerLock,
  appendLog,
  atomicWriteJson,
  ensureQueueDirs,
  historyPath,
  listQueuedJobs,
  queuePaths,
  readRunningJob,
  recoverClaims,
  removeFile,
} from "./state.js"
import type { QueueTicket } from "../contracts/schema.js"

export const STALE_TMP_MAX_AGE_MS = 5 * 60_000

export type WorkerReport = {
  processed: string[]
  rejected: string[]
  reconciliation: "none" | "active" | "reconciled" | "blocked"
  busy: boolean
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

/** Drains one state root and exits. The installer may invoke it on demand. */
export async function runWorker(root: string): Promise<WorkerReport> {
  ensureQueueDirs(root)
  const lock = acquireRunnerLock(root)
  if (!lock) return { processed: [], rejected: [], reconciliation: "active", busy: true }
  const paths = queuePaths(root)
  const report: WorkerReport = { processed: [], rejected: [], reconciliation: "none", busy: false }
  let current: QueueTicket | undefined
  let interrupted = false
  const handleSignal = () => {
    interrupted = true
    if (current?.processGroupIdentity) void terminateVerifiedProcessGroup(current.processGroupIdentity)
  }
  process.once("SIGINT", handleSignal)
  process.once("SIGTERM", handleSignal)
  try {
    atomicWriteJson(paths.workerPid, { pid: process.pid, startedAt: new Date().toISOString() })
    recoverClaims(root)
    const reconciliation = await reconcileInterruptedJob(root)
    report.reconciliation = reconciliation.state
    if (reconciliation.state === "active" || reconciliation.state === "blocked") return report
    report.rejected.push(...await sweepInvalidTickets(root))
    for (;;) {
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
    }
    return report
  } finally {
    process.removeListener("SIGINT", handleSignal)
    process.removeListener("SIGTERM", handleSignal)
    removeFile(paths.workerPid)
    lock.release()
  }
}
