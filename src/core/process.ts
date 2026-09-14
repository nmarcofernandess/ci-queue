import { spawnSync } from "node:child_process"

import type { ProcessGroupIdentity, ProcessObservation, ProcessObservationItem } from "../contracts/schema.js"

const C_ENV = { ...process.env, LC_ALL: "C", LANG: "C" }

export function probeProcessGroupIdentity(leaderPid: number): ProcessGroupIdentity | undefined {
  if (!Number.isSafeInteger(leaderPid) || leaderPid <= 0 || (process.platform !== "darwin" && process.platform !== "linux")) return undefined
  const result = spawnSync("ps", ["-o", "pid=,pgid=,lstart=", "-p", String(leaderPid)], { encoding: "utf8", timeout: 2_000, env: C_ENV })
  if (result.status !== 0) return undefined
  const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(String(result.stdout).trim())
  if (!match) return undefined
  const pid = Number(match[1]); const pgid = Number(match[2]); const startedAt = match[3]
  return Number.isSafeInteger(pid) && Number.isSafeInteger(pgid) && pid === leaderPid && pgid === leaderPid && startedAt
    ? { leaderPid: pid, pgid, startedAt }
    : undefined
}

export function identityIsCurrent(identity: ProcessGroupIdentity | undefined): boolean {
  if (!identity) return false
  const current = probeProcessGroupIdentity(identity.leaderPid)
  return Boolean(current && current.pgid === identity.pgid && current.startedAt === identity.startedAt)
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)) }

export type ProcessGroupTermination = { terminated: boolean; reason: string }

/** Signals only a group whose original leader and birth time still match. */
export async function terminateVerifiedProcessGroup(
  identity: ProcessGroupIdentity | undefined,
  graceMs = 600,
): Promise<ProcessGroupTermination> {
  if (!identity) return { terminated: false, reason: "identidade do grupo ausente" }
  if (!identityIsCurrent(identity)) return { terminated: true, reason: "grupo já não está vivo" }
  try { process.kill(-identity.pgid, "SIGTERM") } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { terminated: true, reason: "grupo já não está vivo" }
    return { terminated: false, reason: `SIGTERM recusado: ${(error as Error).message}` }
  }
  await sleep(graceMs)
  if (!identityIsCurrent(identity)) return { terminated: true, reason: "grupo encerrou com SIGTERM" }
  try { process.kill(-identity.pgid, "SIGKILL") } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return { terminated: true, reason: "grupo encerrou antes de SIGKILL" }
    return { terminated: false, reason: `SIGKILL recusado: ${(error as Error).message}` }
  }
  await sleep(80)
  return identityIsCurrent(identity)
    ? { terminated: false, reason: "grupo sobreviveu a SIGKILL" }
    : { terminated: true, reason: "grupo encerrou com SIGKILL" }
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
