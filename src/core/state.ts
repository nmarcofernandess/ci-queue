import { randomBytes } from "node:crypto"
import {
  existsSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"

import { FINALIZATION_JSON_MAX_BYTES, type FinalizationRecord, type QueueTicket } from "../contracts/schema.js"

export type QueuePaths = ReturnType<typeof queuePaths>

export function compatibilityStateRoot(home = homedir()): string {
  return join(home, ".local", "state", "local-ci", "queue")
}

export function productStateRoot(home = homedir()): string {
  return join(home, ".local", "state", "ci-queue")
}

/**
 * The first external release must see the already-installed local-ci state.
 * A new machine gets the product-named root; an existing machine keeps its
 * records and, crucially, the old runner lock until a later atomic migration.
 */
export function resolveStateRoot(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  if (explicit ?? env.CI_QUEUE_STATE_DIR) {
    return explicit ?? env.CI_QUEUE_STATE_DIR!
  }
  const compatibilityRoot = compatibilityStateRoot(home)
  return existsSync(compatibilityRoot)
    ? compatibilityRoot
    : productStateRoot(home)
}

export function queuePaths(root: string): {
  root: string
  jobs: string
  claims: string
  jobsRejected: string
  history: string
  logs: string
  artifacts: string
  progress: string
  state: string
  locks: string
  jobLocks: string
  running: string
  workerPid: string
  workerIdentity: string
  runnerLock: string
} {
  return {
    root,
    jobs: join(root, "jobs"),
    claims: join(root, "claims"),
    jobsRejected: join(root, "jobs-rejected"),
    history: join(root, "history"),
    logs: join(root, "logs"),
    artifacts: join(root, "artifacts"),
    progress: join(root, "progress"),
    state: join(root, "state"),
    locks: join(root, "locks"),
    jobLocks: join(root, "locks", "jobs"),
    running: join(root, "running.json"),
    workerPid: join(root, "state", "worker.pid"),
    workerIdentity: join(root, "state", "worker.json"),
    runnerLock: join(root, "locks", "runner.lock"),
  }
}

export function ensureQueueDirs(root: string): QueuePaths {
  const paths = queuePaths(root)
  for (const path of [paths.root, paths.jobs, paths.claims, paths.jobsRejected, paths.history, paths.logs, paths.artifacts, paths.progress, paths.state, paths.locks, paths.jobLocks]) {
    mkdirSync(path, { recursive: true })
  }
  return paths
}

export function readJsonFile<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    return undefined
  }
}

/** Atomic publication prevents a worker from ever observing partial JSON. */
export function atomicWriteJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  writeFileSync(temporary, serializedJson(value), { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, path)
}

/** Both the pending digest and atomic publisher seal these exact bytes. */
export function serializedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function rejectSymlinks(paths: string[]): void {
  for (const path of paths) {
    try { if (lstatSync(path).isSymbolicLink()) throw new Error(`symlink recusado no state: ${path}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
}

/** Bounded, no-follow reads for the supervisor's small protocol files. */
export function readBoundedFile(path: string, maxBytes: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error("arquivo não é regular")
    if (stat.size > maxBytes) throw new RangeError("arquivo excede limite de bytes")
    const bytes = Buffer.alloc(maxBytes + 1)
    let offset = 0
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null)
      if (!count) break
      offset += count
    }
    if (offset > maxBytes) throw new RangeError("arquivo excede limite de bytes")
    return bytes.subarray(0, offset)
  } finally { closeSync(fd) }
}

/** Reject a symlink at every Queue-owned component before reads or writes. */
export function finalizationPath(root: string, id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error("id de finalização inválido")
  const directory = join(queuePaths(root).state, "finalization")
  const file = join(directory, `${id}.json`)
  rejectSymlinks([root, queuePaths(root).state, directory, file])
  return file
}

export function readFinalization(root: string, id: string): FinalizationRecord | undefined {
  const path = finalizationPath(root, id)
  try {
    const record = JSON.parse(readBoundedFile(path, 2 * FINALIZATION_JSON_MAX_BYTES).toString("utf8")) as FinalizationRecord
    return record?.schemaVersion === 1 && record.ticketId === id && /^[a-f0-9]{64}$/.test(record.ticketDigest) && /^[a-f0-9]{64}$/.test(record.finalizationDigest) && ["pending", "running", "passed", "failed", "interrupted"].includes(record.phase) && Number.isSafeInteger(record.attempt) && record.attempt >= 0 ? record : undefined
  } catch { return undefined }
}

export function removeFile(path: string): void {
  try { unlinkSync(path) } catch { /* absent is already the desired state */ }
}

export function appendLog(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, text, { encoding: "utf8", flag: "a", mode: 0o600 })
}

export function jobPath(root: string, id: string): string {
  return join(queuePaths(root).jobs, `${id}.json`)
}

export function claimPath(root: string, id: string): string {
  return join(queuePaths(root).claims, `${id}.json`)
}

export function historyPath(root: string, id: string): string {
  const path = join(queuePaths(root).history, `${id}.json`)
  rejectSymlinks([root, queuePaths(root).history, path])
  return path
}

export function progressPath(root: string, id: string): string {
  return join(queuePaths(root).progress, `${id}.json`)
}

export function stageTicketWrite(root: string, ticket: QueueTicket): void {
  ensureQueueDirs(root)
  atomicWriteJson(jobPath(root, ticket.id), ticket)
}

export function readRunningJob(root: string): QueueTicket | undefined {
  return readJsonFile<QueueTicket>(queuePaths(root).running)
}

export function readHistoryJob(root: string, id: string): QueueTicket | undefined {
  const ticket = readJsonFile<QueueTicket>(historyPath(root, id))
  return ticket ? attributeLegacy(root, ticket) : undefined
}

function ticketFiles(path: string): string[] {
  try {
    return readdirSync(path).filter((name) => name.endsWith(".json")).sort()
  } catch {
    return []
  }
}

function readTickets(path: string): QueueTicket[] {
  return ticketFiles(path)
    .map((name) => readJsonFile<QueueTicket>(join(path, name)))
    .filter((ticket): ticket is QueueTicket => Boolean(ticket))
}

export function listQueuedJobs(root: string): QueueTicket[] {
  return readTickets(queuePaths(root).jobs).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

/** Explicit migration ledger; never infer ownership from a checkout name. */
type LegacyLedger = { schemaVersion: number; assignments: Record<string, { projectId: string; evidence: string; headSha?: string }> }
export function attributeLegacy(root: string, ticket: QueueTicket, ledger = readJsonFile<LegacyLedger>(join(root, "state", "legacy-projects.json"))): QueueTicket {
  if (ticket.projectId) return ticket
  const entry = ledger?.schemaVersion === 1 ? ledger.assignments?.[ticket.id] : undefined
  return entry && (!entry.headSha || entry.headSha === ticket.headSha) && typeof entry.projectId === "string" && entry.projectId && typeof entry.evidence === "string" && entry.evidence
    ? { ...ticket, projectId: entry.projectId }
    : ticket
}

export function listHistoryJobs(root: string, projectId?: string): QueueTicket[] {
  rejectSymlinks([root, queuePaths(root).history])
  const ledger = readJsonFile<LegacyLedger>(join(root, "state", "legacy-projects.json")) ?? { schemaVersion: 1, assignments: {} }
  return readTickets(queuePaths(root).history)
    .map((ticket) => attributeLegacy(root, ticket, ledger))
    .filter((ticket) => !projectId || ticket.projectId === projectId)
    .sort((left, right) => (right.finishedAt ?? right.createdAt).localeCompare(left.finishedAt ?? left.createdAt))
}

export type FoundTicket = { ticket: QueueTicket; location: "queued" | "running" | "history"; path: string }

export function findJobById(root: string, id: string): FoundTicket | undefined {
  const queued = readJsonFile<QueueTicket>(jobPath(root, id))
  if (queued) return { ticket: queued, location: "queued", path: jobPath(root, id) }
  const running = readRunningJob(root)
  if (running?.id === id) return { ticket: running, location: "running", path: queuePaths(root).running }
  const history = readHistoryJob(root, id)
  if (history) return { ticket: history, location: "history", path: historyPath(root, id) }
  return undefined
}

export function generateJobId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)
  return `${stamp}-${randomBytes(4).toString("hex")}`
}

export function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(arg) ? arg : JSON.stringify(arg)
}

export function isPidAlive(pid: unknown): pid is number {
  if (!Number.isSafeInteger(pid) || (pid as number) <= 0) return false
  try {
    process.kill(pid as number, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

export type LockHandle = { release(): void; ownerPath: string }

function lockOwnerPath(lockPath: string): string {
  return join(lockPath, "owner.json")
}

/**
 * Directory locks are portable, atomically claimed and carry a PID owner.
 * A dead owner is reclaimed; an unreadable live owner stays conservative.
 */
export function acquireDirectoryLock(lockPath: string): LockHandle | undefined {
  try {
    mkdirSync(lockPath, { recursive: false, mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    const owner = readJsonFile<{ pid?: unknown }>(lockOwnerPath(lockPath))
    if (owner && isPidAlive(owner.pid)) return undefined
    // The mkdir owner is published immediately after directory creation. Do
    // not steal that small window from a concurrent writer; only an old,
    // ownerless directory is safe to recover.
    if (!owner) {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs < 5 * 60_000) return undefined
      } catch { return undefined }
    }
    try { rmSync(lockPath, { recursive: true, force: true }) } catch { return undefined }
    try { mkdirSync(lockPath, { recursive: false, mode: 0o700 }) } catch { return undefined }
  }
  const ownerPath = lockOwnerPath(lockPath)
  atomicWriteJson(ownerPath, { pid: process.pid, createdAt: new Date().toISOString(), cwd: process.cwd() })
  let released = false
  return {
    ownerPath,
    release() {
      if (released) return
      released = true
      const owner = readJsonFile<{ pid?: unknown }>(ownerPath)
      if (owner?.pid === process.pid) rmSync(lockPath, { recursive: true, force: true })
    },
  }
}

export function acquireRunnerLock(root: string): LockHandle | undefined {
  return acquireDirectoryLock(queuePaths(root).runnerLock)
}

export async function withTicketLock<T>(root: string, id: string, action: () => Promise<T> | T): Promise<T | undefined> {
  ensureQueueDirs(root)
  const path = join(queuePaths(root).jobLocks, `${basename(id)}.state`)
  // Cancellation and child close can arrive at nearly the same instant. A
  // short bounded wait preserves the terminal transition instead of treating a
  // legitimate state lock as an absent ticket.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lock = acquireDirectoryLock(path)
    if (lock) {
      try { return await action() } finally { lock.release() }
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return undefined
}

export function recoverClaims(root: string): void {
  const paths = ensureQueueDirs(root)
  if (readRunningJob(root)) return
  for (const name of ticketFiles(paths.claims)) {
    const id = name.slice(0, -".json".length)
    if (readHistoryJob(root, id)) {
      removeFile(join(paths.claims, name))
      continue
    }
    try { renameSync(join(paths.claims, name), join(paths.jobs, name)) } catch { /* a concurrent recovery decides */ }
  }
}
