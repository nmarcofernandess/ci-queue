import type { ExecutionDeadline, ExecutionPause, JobProgress, PauseSource, QueueTicket, ResourceEvent } from "../contracts/schema.js"
import { RESOURCE_EVENTS_MAX } from "../contracts/schema.js"
import { readProgressSnapshot } from "./progress.js"
import { freezeJobProcessTree, identityIsCurrent, listJobProcessTree, thawJobProcessTree, type TreeProcess } from "./process.js"
import { appendLog, atomicWriteJson, queuePaths, readRunningJob, withTicketLock } from "./state.js"

/** A failure this close to the end of a pause window may come from timers that fired late. */
export const PAUSE_INTERFERENCE_WINDOW_MS = 120_000

export type PauseEligibility = { eligible: true } | { eligible: false; reason: string }

/** Running nodes with no running child: the work actually executing now. */
export function runningLeafLabels(progress: JobProgress | undefined): string[] {
  if (!progress) return []
  const running = progress.nodes.filter(node => node.status === "running")
  const parents = new Set(running.map(node => node.parentId).filter((id): id is string => Boolean(id)))
  return running.filter(node => !parents.has(node.id)).map(node => node.label)
}

/**
 * The recipe names the steps without wall clocks; the queue pauses only while
 * every running leaf is one of them and no git process holds a ref or a lock.
 */
export function pauseEligibility(ticket: QueueTicket, progress: JobProgress | undefined, tree: TreeProcess[] | undefined): PauseEligibility {
  const safe = ticket.flags?.pauseSafeNodes
  if (!safe?.length) return { eligible: false, reason: "a receita não declara etapas seguras para pausa" }
  const leaves = runningLeafLabels(progress)
  if (!leaves.length) return { eligible: false, reason: "nenhuma etapa em execução no progresso" }
  const unsafe = leaves.filter(label => !safe.includes(label))
  if (unsafe.length) return { eligible: false, reason: `etapa em execução não é segura para pausa: ${unsafe.join(", ")}` }
  if (!tree) return { eligible: false, reason: "árvore de processos indisponível" }
  if (tree.some(isGit)) return { eligible: false, reason: GIT_RUNNING }
  return { eligible: true }
}

const GIT_RUNNING = "git em execução; tente de novo em alguns segundos"
const isGit = (row: TreeProcess) => row.command === "git" || row.command.startsWith("git-")

export type PauseResult =
  | { kind: "missing" | "not-running"; reason: string }
  | { kind: "paused" | "already-paused"; job: QueueTicket; reason: string }
  | { kind: "refused"; job: QueueTicket; reason: string }

export type ResumeResult =
  | { kind: "missing" | "not-running"; reason: string }
  | { kind: "resumed" | "not-paused"; job: QueueTicket; reason: string }
  | { kind: "refused"; job: QueueTicket; reason: string }

function emptyPause(): ExecutionPause {
  return { schemaVersion: 1, state: "running", windows: [], pausedMsTotal: 0, frozen: [] }
}

function shiftDeadline(deadline: ExecutionDeadline | undefined, windowMs: number): ExecutionDeadline | undefined {
  if (deadline?.state !== "armed") return deadline
  return { ...deadline, expiresAt: new Date(Date.parse(deadline.expiresAt) + windowMs).toISOString() }
}

function withEvent(job: QueueTicket, event: ResourceEvent): QueueTicket {
  return { ...job, resourceEvents: [...(job.resourceEvents ?? []), event].slice(-RESOURCE_EVENTS_MAX) }
}

function stamp(): string { return new Date().toISOString() }

export async function pauseRunningJob(
  root: string,
  id: string,
  input: { reason: string; source: PauseSource; event?: Omit<ResourceEvent, "at" | "kind"> },
): Promise<PauseResult> {
  const result = await withTicketLock(root, id, async (): Promise<PauseResult> => {
    const running = readRunningJob(root)
    if (!running || running.id !== id) return { kind: running ? "not-running" : "missing", reason: "o job não está em execução" }
    if (running.pause?.state === "paused") return { kind: "already-paused", job: running, reason: "o job já está pausado" }
    if (running.cancelRequestedAt) return { kind: "refused", job: running, reason: "cancelamento em andamento" }
    if (running.executionDeadline?.state === "expired") return { kind: "refused", job: running, reason: "prazo de execução já vencido" }
    if (!running.processGroupIdentity || !identityIsCurrent(running.processGroupIdentity)) {
      return { kind: "refused", job: running, reason: "grupo do processo sem identidade verificável" }
    }
    const eligibility = pauseEligibility(running, readProgressSnapshot(root, id), listJobProcessTree(running.processGroupIdentity))
    if (!eligibility.eligible) return { kind: "refused", job: running, reason: eligibility.reason }
    const freeze = await freezeJobProcessTree(running.processGroupIdentity)
    if (!freeze.frozen) return { kind: "refused", job: running, reason: freeze.reason }
    // A git started between the check and SIGSTOP would hold its lock for the whole pause.
    if (listJobProcessTree(running.processGroupIdentity)?.some(isGit) !== false) {
      await thawJobProcessTree(running.processGroupIdentity, freeze.outside)
      return { kind: "refused", job: running, reason: GIT_RUNNING }
    }
    const pause = running.pause ?? emptyPause()
    const pausedAt = stamp()
    let next: QueueTicket = {
      ...running,
      pause: { ...pause, state: "paused", frozen: freeze.outside, windows: [...pause.windows, { pausedAt, source: input.source, reason: input.reason }] },
    }
    if (input.source === "auto" && input.event) next = withEvent(next, { ...input.event, at: pausedAt, kind: "paused", detail: input.reason })
    atomicWriteJson(queuePaths(root).running, next)
    appendLog(running.logPath, `[${pausedAt}] pausa (${input.source}): ${input.reason}\n`)
    return { kind: "paused", job: next, reason: freeze.reason }
  })
  return result ?? { kind: "missing", reason: "estado do ticket indisponível" }
}

export async function resumeRunningJob(
  root: string,
  id: string,
  input: { source: PauseSource; event?: Omit<ResourceEvent, "at" | "kind"> },
): Promise<ResumeResult> {
  const result = await withTicketLock(root, id, async (): Promise<ResumeResult> => {
    const running = readRunningJob(root)
    if (!running || running.id !== id) return { kind: running ? "not-running" : "missing", reason: "o job não está em execução" }
    const pause = running.pause
    const open = pause?.state === "paused" ? pause.windows.at(-1) : undefined
    if (!pause || !open || open.resumedAt) return { kind: "not-paused", job: running, reason: "o job não está pausado" }
    // A manual pause leaves only by command: the guard never lifts it.
    if (input.source === "auto" && open.source === "manual") return { kind: "refused", job: running, reason: "pausa manual só sai por comando" }
    await thawJobProcessTree(running.processGroupIdentity, pause.frozen)
    const resumedAt = stamp()
    const windowMs = Math.max(0, Date.parse(resumedAt) - Date.parse(open.pausedAt))
    let next: QueueTicket = {
      ...running,
      executionDeadline: shiftDeadline(running.executionDeadline, windowMs),
      pause: {
        ...pause,
        state: "running",
        frozen: [],
        pausedMsTotal: pause.pausedMsTotal + windowMs,
        windows: [...pause.windows.slice(0, -1), { ...open, resumedAt, resumedBy: input.source }],
      },
    }
    if (input.source === "auto" && input.event) next = withEvent(next, { ...input.event, at: resumedAt, kind: "resumed" })
    atomicWriteJson(queuePaths(root).running, next)
    appendLog(running.logPath, `[${resumedAt}] retomada (${input.source}) após ${Math.round(windowMs / 1000)} s\n`)
    return { kind: "resumed", job: next, reason: `retomado após ${windowMs} ms` }
  })
  return result ?? { kind: "missing", reason: "estado do ticket indisponível" }
}

/**
 * Records a guard observation on the running ticket; a different running job is left untouched.
 * Before the group identity is published the runner still rewrites the reservation without the
 * ticket lock, so an event written then could erase that identity; it waits for the next sample.
 */
export async function appendResourceEvent(root: string, id: string, event: ResourceEvent): Promise<boolean> {
  const written = await withTicketLock(root, id, () => {
    const running = readRunningJob(root)
    if (!running || running.id !== id || !running.processGroupIdentity) return false
    atomicWriteJson(queuePaths(root).running, withEvent(running, event))
    return true
  })
  return written === true
}

/** Wall time of the closed windows; an open window ends at `nowMs`. */
export function pausedMs(pause: ExecutionPause | undefined, nowMs = Date.now()): number {
  if (!pause) return 0
  const open = pause.state === "paused" ? pause.windows.at(-1) : undefined
  return pause.pausedMsTotal + (open && !open.resumedAt ? Math.max(0, nowMs - Date.parse(open.pausedAt)) : 0)
}

/** A failure inside a window or shortly after it is annotated, never hidden or excused. */
export function pauseInterference(pause: ExecutionPause | undefined, failedAtMs: number): boolean {
  if (!pause?.windows.length) return false
  return pause.windows.some(window => {
    const end = window.resumedAt ? Date.parse(window.resumedAt) : failedAtMs
    return failedAtMs >= Date.parse(window.pausedAt) && failedAtMs - end <= PAUSE_INTERFERENCE_WINDOW_MS
  })
}
