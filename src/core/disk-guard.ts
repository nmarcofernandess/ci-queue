import { appendFileSync, statfsSync } from "node:fs"
import { join } from "node:path"

import { atomicWriteJson, ensureQueueDirs, readJsonFile } from "./state.js"

const GiB = 1024 ** 3

/**
 * Free space of the state volume is the one signal: on macOS swap lives in the
 * same APFS container, so the floor protects both the job and the system.
 * Below the hold floor for 20 s the queue starts nothing and pauses only
 * eligible work; it releases above a higher floor held for 60 s.
 */
export const DISK_GUARD_POLICY = {
  warnBelowBytes: 10 * GiB,
  holdBelowBytes: 2 * GiB,
  holdAfterMs: 20_000,
  resumeAboveBytes: 4 * GiB,
  resumeAfterMs: 60_000,
  sampleEveryMs: 5_000,
} as const

export type DiskGuardPolicy = { [K in keyof typeof DISK_GUARD_POLICY]: number }

export const DISK_GUARD_MODES = ["observe", "enforce", "off"] as const
export type DiskGuardMode = (typeof DISK_GUARD_MODES)[number]
export type DiskLevel = "ok" | "low" | "critical"

export type DiskGuardStatus = {
  schemaVersion: 1
  mode: DiskGuardMode
  freeBytes: number | null
  level: DiskLevel | "unknown"
  holding: boolean
  holdingSince?: string
  updatedAt: string
  policy: DiskGuardPolicy
}

export function diskGuardSettingsPath(root: string): string { return join(ensureQueueDirs(root).state, "disk-guard.json") }
export function diskGuardStatusPath(root: string): string { return join(ensureQueueDirs(root).state, "disk-guard-status.json") }
export function diskGuardLogPath(root: string): string { return join(ensureQueueDirs(root).state, "disk-guard.log") }

/** Observation is the default until the operator switches to enforce. */
export function readDiskGuardMode(root: string): DiskGuardMode {
  const value = readJsonFile<{ mode?: unknown }>(diskGuardSettingsPath(root))
  return typeof value?.mode === "string" && (DISK_GUARD_MODES as readonly string[]).includes(value.mode) ? value.mode as DiskGuardMode : "observe"
}

export function writeDiskGuardMode(root: string, mode: DiskGuardMode): void {
  atomicWriteJson(diskGuardSettingsPath(root), { schemaVersion: 1, mode, updatedAt: new Date().toISOString() })
}

export function readDiskGuardStatus(root: string): DiskGuardStatus | undefined {
  const value = readJsonFile<DiskGuardStatus>(diskGuardStatusPath(root))
  return value?.schemaVersion === 1 ? value : undefined
}

export function readFreeBytes(path: string): number | undefined {
  try {
    const stats = statfsSync(path)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch { return undefined }
}

export function appendDiskGuardLog(root: string, line: string): void {
  try { appendFileSync(diskGuardLogPath(root), `[${new Date().toISOString()}] ${line}\n`, { encoding: "utf8", mode: 0o600 }) } catch { /* the guard never fails a job for its own log */ }
}

export type DiskSample = { freeBytes: number; level: DiskLevel; holding: boolean; change?: "hold" | "release" }

/** Hysteresis only on time and two floors; between them a hold stays as it is. */
export class DiskGuardMonitor {
  holding = false
  holdingSince?: number
  #belowSince?: number
  #aboveSince?: number

  constructor(readonly policy: DiskGuardPolicy = DISK_GUARD_POLICY) {}

  level(freeBytes: number): DiskLevel {
    if (freeBytes < this.policy.holdBelowBytes) return "critical"
    if (freeBytes < this.policy.warnBelowBytes) return "low"
    return "ok"
  }

  sample(freeBytes: number, nowMs: number): DiskSample {
    let change: DiskSample["change"]
    if (freeBytes < this.policy.holdBelowBytes) this.#belowSince ??= nowMs
    else this.#belowSince = undefined
    if (freeBytes > this.policy.resumeAboveBytes) this.#aboveSince ??= nowMs
    else this.#aboveSince = undefined
    if (!this.holding && this.#belowSince !== undefined && nowMs - this.#belowSince >= this.policy.holdAfterMs) {
      this.holding = true; this.holdingSince = nowMs; change = "hold"
    } else if (this.holding && this.#aboveSince !== undefined && nowMs - this.#aboveSince >= this.policy.resumeAfterMs) {
      this.holding = false; this.holdingSince = undefined; change = "release"
    }
    return { freeBytes, level: this.level(freeBytes), holding: this.holding, ...(change ? { change } : {}) }
  }
}

export function writeDiskGuardStatus(root: string, mode: DiskGuardMode, monitor: DiskGuardMonitor, freeBytes: number | undefined): void {
  const status: DiskGuardStatus = {
    schemaVersion: 1,
    mode,
    freeBytes: freeBytes ?? null,
    level: freeBytes === undefined ? "unknown" : monitor.level(freeBytes),
    holding: monitor.holding,
    ...(monitor.holdingSince !== undefined ? { holdingSince: new Date(monitor.holdingSince).toISOString() } : {}),
    updatedAt: new Date().toISOString(),
    policy: monitor.policy,
  }
  try { atomicWriteJson(diskGuardStatusPath(root), status) } catch { /* a full disk may refuse even this; the guard keeps deciding in memory */ }
}

export function formatBytes(value: number): string {
  return `${(value / GiB).toFixed(1)} GiB`
}
