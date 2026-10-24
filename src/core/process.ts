import { spawnSync, type ChildProcess } from "node:child_process"
import { hostname } from "node:os"

import { NO_ARTIFACT_SNAPSHOTS_CAPABILITY, RECOVERABLE_FINALIZATION_CAPABILITY, TERMINAL_FINALIZATION_CAPABILITY, type WorkerIdentity, type ProcessGroupIdentity, type ProcessObservation, type ProcessObservationItem, type QueueTicket } from "../contracts/schema.js"

const C_ENV = { ...process.env, LC_ALL: "C", LANG: "C" }

// A descendant that inherited stdout/stderr can hold the pipes open after the
// child exits, inside or outside its group. The child is settled by its exit;
// the pipes only get a bounded drain, so no supervisor waits on a process
// whose lifetime it cannot confirm or end.
export const STDIO_DRAIN_AFTER_EXIT_MS = 2_000

/** `code` is the verdict-ready exit; `exitCode` keeps the raw value (null after a signal or spawn error). */
export type ChildExit = { code: number; exitCode: number | null; signal: NodeJS.Signals | null; stdio: "closed" | "held" }

export function childExit(child: ChildProcess): Promise<ChildExit> {
  return new Promise((resolve) => {
    let done = false
    let drain: NodeJS.Timeout | undefined
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null, stdio: ChildExit["stdio"], code = exitCode ?? (signal ? 1 : 0)) => {
      if (done) return
      done = true
      if (drain) clearTimeout(drain)
      resolve({ code, exitCode, signal, stdio })
    }
    child.once("error", () => finish(null, null, "closed", 1))
    child.once("close", (exitCode, signal) => finish(exitCode, signal, "closed"))
    child.once("exit", (exitCode, signal) => {
      drain = setTimeout(() => {
        finish(exitCode, signal, "held")
        child.stdout?.destroy()
        child.stderr?.destroy()
      }, STDIO_DRAIN_AFTER_EXIT_MS)
    })
  })
}

export function probeProcessGroupIdentity(leaderPid: number): ProcessGroupIdentity | undefined {
  if (!Number.isSafeInteger(leaderPid) || leaderPid <= 0 || (process.platform !== "darwin" && process.platform !== "linux")) return undefined
  const result = spawnSync("ps", ["-o", "pid=,pgid=,lstart=", "-p", String(leaderPid)], { encoding: "utf8", timeout: 2_000, env: C_ENV })
  if (result.status !== 0) return undefined
  const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(String(result.stdout).trim())
  if (!match) return undefined
  const pid = Number(match[1]); const pgid = Number(match[2]); const startedAt = match[3]
  return Number.isSafeInteger(pid) && Number.isSafeInteger(pgid) && pid === leaderPid && pgid === leaderPid && startedAt
    ? { hostname: hostname(), leaderPid: pid, pgid, startedAt }
    : undefined
}

export function identityIsCurrent(identity: ProcessGroupIdentity | undefined): boolean {
  if (!identity) return false
  if (identity.hostname && identity.hostname !== hostname()) return false
  const current = probeProcessGroupIdentity(identity.leaderPid)
  return Boolean(current && current.pgid === identity.pgid && current.startedAt === identity.startedAt)
}

export function probeWorkerIdentity(pid = process.pid): WorkerIdentity | undefined {
  const result = spawnSync("ps", ["-o", "pid=,lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 2_000, env: C_ENV })
  const match = result.status === 0 ? /^\s*(\d+)\s+(.+?)\s*$/.exec(String(result.stdout).trim()) : null
  return match && Number(match[1]) === pid
    ? { schemaVersion: 1, hostname: hostname(), pid, startedAt: match[2], capabilities: [TERMINAL_FINALIZATION_CAPABILITY, NO_ARTIFACT_SNAPSHOTS_CAPABILITY, RECOVERABLE_FINALIZATION_CAPABILITY] }
    : undefined
}

export function observeWorkerIdentity(identity: WorkerIdentity | undefined): ProcessGroupState {
  if (!identity || identity.schemaVersion !== 1 || identity.hostname !== hostname() || !Number.isSafeInteger(identity.pid) || identity.pid <= 0 || !identity.startedAt) return { state: "uncertain", reason: "host/identidade do supervisor incerto" }
  const actual = probeWorkerIdentity(identity.pid)
  if (actual) return actual.startedAt === identity.startedAt
    ? { state: "alive", reason: "supervisor próprio ainda vivo" }
    : { state: "uncertain", reason: "PID do supervisor reutilizado" }
  try { process.kill(identity.pid, 0) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { state: "dead", reason: "supervisor comprovadamente encerrado" }
  }
  return { state: "uncertain", reason: "sonda do supervisor indisponível" }
}

export type ProcessGroupState = { state: "alive" | "dead" | "uncertain"; reason: string }

/** Claims/preflight are not processes; a started test needs its whole group gone. */
export function observeTestProducer(ticket: QueueTicket): ProcessGroupState {
  if (ticket.childPid === undefined && !ticket.processGroupIdentity) return { state: "dead", reason: "processo de teste não iniciado" }
  const version = ticket.schemaVersion === undefined ? 1 : ticket.schemaVersion
  const legacy = (version === 1 || version === 2 || version === 3) && ticket.finalization === undefined && ticket.finalizationDigest === undefined
  // Historical test recovery already accepts local birth/group proof without
  // a hostname. This does not confer the same authority on new finalizations.
  const identity = ticket.processGroupIdentity
  const group = observeProcessGroup(legacy && identity ? localLegacyGroupIdentity(identity) : identity)
  return { ...group, reason: `produtor do teste: ${group.reason}` }
}

function localLegacyGroupIdentity(identity: ProcessGroupIdentity): ProcessGroupIdentity {
  return identity.hostname === undefined ? { ...identity, hostname: hostname() } : identity
}

/** A missing leader alone cannot prove that its detached descendants exited. */
export function observeProcessGroup(identity: ProcessGroupIdentity | undefined): ProcessGroupState {
  if (!identity || identity.hostname !== hostname()) return { state: "uncertain", reason: "host/identidade do grupo incerto" }
  const result = spawnSync("ps", ["-axo", "pid=,pgid=,lstart="], { encoding: "utf8", timeout: 2_000, env: C_ENV })
  if (result.status !== 0) return { state: "uncertain", reason: "sonda ps indisponível" }
  const rows = String(result.stdout).split("\n").map(line => /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)).filter((row): row is RegExpExecArray => Boolean(row))
  const leader = rows.find(row => Number(row[1]) === identity.leaderPid)
  if (leader && (Number(leader[2]) !== identity.pgid || leader[3] !== identity.startedAt)) return { state: "uncertain", reason: "PID reutilizado ou grupo divergente" }
  const members = rows.filter(row => Number(row[2]) === identity.pgid)
  if (!members.length && !leader) return { state: "dead", reason: "grupo comprovadamente encerrado" }
  if (!leader) return { state: "uncertain", reason: "descendentes sem líder verificável" }
  return { state: "alive", reason: "grupo próprio ainda vivo" }
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)) }

export type ProcessGroupTermination = { terminated: boolean; reason: string }

/** Signals only a group whose original leader and birth time still match. */
export async function terminateVerifiedProcessGroup(
  identity: ProcessGroupIdentity | undefined,
  graceMs = 600,
): Promise<ProcessGroupTermination> {
  if (!identity) return { terminated: false, reason: "identidade do grupo ausente" }
  // Legacy test tickets had no hostname. They still require the original
  // local birth/group match; new finalization recovery is stricter at entry.
  const localIdentity = localLegacyGroupIdentity(identity)
  const before = observeProcessGroup(localIdentity)
  if (before.state === "dead") return { terminated: true, reason: before.reason }
  if (before.state !== "alive") return { terminated: false, reason: before.reason }
  try { process.kill(-identity.pgid, "SIGTERM") } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { terminated: true, reason: "grupo já não está vivo" }
    return { terminated: false, reason: `SIGTERM recusado: ${(error as Error).message}` }
  }
  await sleep(graceMs)
  const afterTerm = observeProcessGroup(localIdentity)
  if (afterTerm.state === "dead") return { terminated: true, reason: "grupo encerrou com SIGTERM" }
  if (afterTerm.state !== "alive") return { terminated: false, reason: afterTerm.reason }
  try { process.kill(-identity.pgid, "SIGKILL") } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { terminated: true, reason: "grupo encerrou antes de SIGKILL" }
    return { terminated: false, reason: `SIGKILL recusado: ${(error as Error).message}` }
  }
  await sleep(80)
  const afterKill = observeProcessGroup(localIdentity)
  return afterKill.state === "dead"
    ? { terminated: true, reason: "grupo encerrou com SIGKILL" }
    : { terminated: false, reason: afterKill.reason }
}

export function readProcessObservation(
  identity: ProcessGroupIdentity | undefined,
  options: { capture?: "start" | "end"; cwd?: string; jobId?: string; exitedBeforeObservation?: boolean } = {},
): ProcessObservation {
  const base = { schemaVersion: 1 as const, observedAt: new Date().toISOString(), source: "host" as const, ...(options.capture ? { capture: options.capture } : {}), ...(options.cwd ? { cwd: options.cwd } : {}), ...(options.jobId ? { jobId: options.jobId } : {}) }
  const unavailable = (reason: string): ProcessObservation => ({ ...base, coverage: "unavailable", association: "unknown", items: [], reason })
  if (options.exitedBeforeObservation) return unavailable("process-exited-before-observation")
  if (!identity) return unavailable("identidade temporal do grupo indisponível")
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,rss=,command="], { encoding: "utf8", timeout: 3_000, maxBuffer: 16 * 1024 * 1024, env: C_ENV })
  if (result.status !== 0) return unavailable("sonda ps indisponível")
  const items: ProcessObservationItem[] = []
  for (const line of String(result.stdout).split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)
    if (!match || Number(match[3]) !== identity.pgid) continue
    items.push({ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), rssBytes: Number(match[4]) * 1024, command: match[5].trim().split(/\s+/, 1)[0].split("/").pop() || "processo", startedAt: identity.startedAt, ...(options.cwd ? { cwd: options.cwd } : {}), source: "host" })
  }
  return { ...base, coverage: "complete", association: "exact", items }
}
