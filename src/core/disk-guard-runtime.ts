import type { ResourceEvent, ResourceEventKind } from "../contracts/schema.js"
import {
  appendDiskGuardLog,
  DISK_GUARD_POLICY,
  DiskGuardMonitor,
  formatBytes,
  readDiskGuardMode,
  readFreeBytes,
  writeDiskGuardStatus,
  type DiskGuardMode,
  type DiskGuardPolicy,
  type DiskSample,
} from "./disk-guard.js"
import { appendResourceEvent, pauseEligibility, pauseRunningJob, resumeRunningJob } from "./pause.js"
import { listJobProcessTree } from "./process.js"
import { readProgressSnapshot } from "./progress.js"
import { readRunningJob } from "./state.js"

export type DiskGuardHooks = {
  readFreeBytes?: (root: string) => number | undefined
  policy?: DiskGuardPolicy
  nowMs?: () => number
  sleep?: (ms: number) => Promise<void>
}

function defaultSleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }

/**
 * One monitor per worker drain. The queue never starts work into a full disk
 * and never resumes into it; observation mode records the same decisions
 * without acting on them.
 */
export class WorkerDiskGuard {
  readonly monitor: DiskGuardMonitor
  #claimHoldNoted = false

  constructor(readonly root: string, readonly hooks: DiskGuardHooks = {}) {
    this.monitor = new DiskGuardMonitor(hooks.policy ?? DISK_GUARD_POLICY)
  }

  get policy(): DiskGuardPolicy { return this.monitor.policy }
  mode(): DiskGuardMode { return readDiskGuardMode(this.root) }
  now(): number { return (this.hooks.nowMs ?? Date.now)() }
  sleep(ms: number): Promise<void> { return (this.hooks.sleep ?? defaultSleep)(ms) }

  sample(mode = this.mode()): DiskSample | undefined {
    if (mode === "off") return undefined
    const freeBytes = (this.hooks.readFreeBytes ?? readFreeBytes)(this.root)
    if (freeBytes === undefined) {
      writeDiskGuardStatus(this.root, mode, this.monitor, undefined)
      return undefined
    }
    const sample = this.monitor.sample(freeBytes, this.now())
    writeDiskGuardStatus(this.root, mode, this.monitor, freeBytes)
    if (sample.change === "hold") appendDiskGuardLog(this.root, `${mode}: disco abaixo de ${formatBytes(this.policy.holdBelowBytes)} por ${this.policy.holdAfterMs / 1000} s (${formatBytes(freeBytes)} livres)`)
    if (sample.change === "release") appendDiskGuardLog(this.root, `${mode}: disco acima de ${formatBytes(this.policy.resumeAboveBytes)} por ${this.policy.resumeAfterMs / 1000} s (${formatBytes(freeBytes)} livres)`)
    return sample
  }

  /** Enforce mode waits while the disk is critical or held; queued jobs stay queued. */
  async waitBeforeClaim(isInterrupted: () => boolean): Promise<void> {
    for (;;) {
      if (isInterrupted()) return
      const mode = this.mode()
      const sample = this.sample(mode)
      if (!sample) return
      if (mode === "observe") {
        if (sample.holding && !this.#claimHoldNoted) appendDiskGuardLog(this.root, "observação: a fila teria retido o próximo job")
        this.#claimHoldNoted = sample.holding
        return
      }
      if (!sample.holding && sample.level !== "critical") {
        if (this.#claimHoldNoted) appendDiskGuardLog(this.root, "enforce: fila liberada")
        this.#claimHoldNoted = false
        return
      }
      if (sample.holding && !this.#claimHoldNoted) {
        appendDiskGuardLog(this.root, "enforce: fila retida; os jobs continuam enfileirados")
        this.#claimHoldNoted = true
      }
      await this.sleep(this.policy.sampleEveryMs)
    }
  }

  /** Samples while a job runs. Returns a stop function that waits for an in-flight tick. */
  watchJob(jobId: string): () => Promise<void> {
    let busy = false
    let stopped = false
    let pausedByGuard = false
    const noted = { low: false, critical: false, notEligible: false, wouldPause: false }
    const tick = async () => {
      if (busy || stopped) return
      busy = true
      try {
        const mode = this.mode()
        const sample = this.sample(mode)
        if (!sample || mode === "off") return
        const event = (kind: ResourceEventKind, detail?: string): Promise<boolean> => appendResourceEvent(this.root, jobId, {
          at: new Date(this.now()).toISOString(), kind, mode, freeBytes: sample.freeBytes, ...(detail ? { detail } : {}),
        } satisfies ResourceEvent)
        if (sample.level === "low" && !noted.low) noted.low = await event("disk-low", `abaixo de ${formatBytes(this.policy.warnBelowBytes)}`)
        if (sample.level === "critical" && !noted.critical) noted.critical = await event("disk-critical", `abaixo de ${formatBytes(this.policy.holdBelowBytes)}`)
        if (sample.holding) {
          const running = readRunningJob(this.root)
          if (!running || running.id !== jobId || !running.processGroupIdentity || running.pause?.state === "paused") return
          const last = running.pause?.windows.at(-1)
          const holdingSince = this.monitor.holdingSince ?? this.now()
          // A person resumed this job during the current episode: the guard does not undo it.
          if (last?.source === "auto" && last.resumedBy === "manual" && last.resumedAt && Date.parse(last.resumedAt) >= holdingSince) return
          if (mode === "enforce") {
            const result = await pauseRunningJob(this.root, jobId, {
              reason: `disco abaixo de ${formatBytes(this.policy.holdBelowBytes)}`,
              source: "auto",
              event: { mode, freeBytes: sample.freeBytes },
            })
            if (result.kind === "paused") {
              pausedByGuard = true
              noted.notEligible = false
              appendDiskGuardLog(this.root, `enforce: job ${jobId} pausado`)
            } else if (result.kind === "refused" && !noted.notEligible) {
              noted.notEligible = await event("not-eligible", result.reason)
              appendDiskGuardLog(this.root, `enforce: job ${jobId} segue com alerta (${result.reason})`)
            }
            return
          }
          const eligibility = pauseEligibility(running, readProgressSnapshot(this.root, jobId),
            running.processGroupIdentity ? listJobProcessTree(running.processGroupIdentity) : undefined)
          if (eligibility.eligible && !noted.wouldPause) {
            noted.wouldPause = await event("would-pause")
            appendDiskGuardLog(this.root, `observação: o job ${jobId} teria sido pausado`)
          } else if (!eligibility.eligible && !noted.notEligible) {
            noted.notEligible = await event("not-eligible", eligibility.reason)
          }
          return
        }
        if (sample.change === "release") {
          await event("disk-recovered")
          if (mode === "enforce" && pausedByGuard) {
            const result = await resumeRunningJob(this.root, jobId, { source: "auto", event: { mode, freeBytes: sample.freeBytes } })
            if (result.kind === "resumed" || result.kind === "not-paused") pausedByGuard = false
          }
          if (mode === "observe" && noted.wouldPause) await event("would-resume")
          noted.critical = false; noted.notEligible = false; noted.wouldPause = false
        }
      } catch (error) {
        appendDiskGuardLog(this.root, `amostra falhou: ${error instanceof Error ? error.message : String(error)}`)
      } finally { busy = false }
    }
    const timer = setInterval(() => { void tick() }, this.policy.sampleEveryMs)
    timer.unref?.()
    void tick()
    return async () => {
      stopped = true
      clearInterval(timer)
      while (busy) await defaultSleep(10)
    }
  }
}
