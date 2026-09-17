import { StringDecoder } from "node:string_decoder"
import type {
  JobProgress,
  ProgressCountKind,
  ProgressCounts,
  ProgressNode,
  ProgressNodeKind,
  ProgressStatus,
} from "../contracts/schema.js"
import {
  ProgressTimingTracker,
  systemProgressClock,
  type ProgressClock,
  type ProgressNodeUpdate,
} from "./progress-timing.js"
import { atomicWriteJson, progressPath, readJsonFile, removeFile } from "./state.js"

/** Stable stdout protocol. Consumers can emit it without importing CI Queue. */
export const PROGRESS_PREFIX = "@@ci-queue-progress"
const LEGACY_PROGRESS_PREFIX = "@@local-ci-progress"

const VALID_ID = /^[A-Za-z0-9_.:-]+$/
const STATUSES = new Set<ProgressStatus>(["pending", "running", "passed", "failed", "skipped"])
const NODE_KINDS = new Set<ProgressNodeKind>(["stage", "group", "gate", "suite", "case", "artifact"])
const COUNT_KINDS = new Set<ProgressCountKind>(["gates", "suites", "cases", "artifacts", "items"])

type NodeEvent = ProgressNodeUpdate & { type: "node" }
type CountsEvent = ProgressCounts & { type: "counts"; id: string }
type ProgressEvent = NodeEvent | CountsEvent

export function createProgressState(updatedAt: string | null = null): JobProgress {
  return { schema: 1, updatedAt, nodes: [] }
}

function nonNegative(value: unknown): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(String(value))) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function validCounts(value: ProgressCounts): boolean {
  return value.completed <= value.total &&
    value.passed + value.failed + value.skipped === value.completed &&
    value.completed + value.running + value.pending === value.total
}

export function parseProgressLine(line: unknown): ProgressEvent | undefined {
  if (typeof line !== "string") return undefined
  const parts = line.split("\t")
  if ((parts[0] !== PROGRESS_PREFIX && parts[0] !== LEGACY_PROGRESS_PREFIX) || parts[1] !== "1") return undefined
  if (parts[2] === "node" && parts.length === 9) {
    const [, , , id, parent, rawKind, rawStatus, duration, label] = parts
    const durationMs = duration === "-" || duration === "" ? undefined : nonNegative(duration)
    if (!VALID_ID.test(id) || (parent !== "-" && !VALID_ID.test(parent)) || !NODE_KINDS.has(rawKind as ProgressNodeKind) ||
      !STATUSES.has(rawStatus as ProgressStatus) || !label || /[\r\n\t]/.test(label) || (duration !== "-" && duration !== "" && durationMs === undefined)) return undefined
    return { type: "node", id, parentId: parent === "-" ? null : parent, kind: rawKind as ProgressNodeKind, status: rawStatus as ProgressStatus, label, ...(durationMs === undefined ? {} : { durationMs }) }
  }
  if (parts[2] === "counts" && parts.length === 12) {
    const [, , , id, rawKind, ...values] = parts
    const parsed = values.map(nonNegative)
    if (!VALID_ID.test(id) || !COUNT_KINDS.has(rawKind as ProgressCountKind) || parsed.some((item) => item === undefined)) return undefined
    const [completed, total, passed, failed, running, pending, skipped] = parsed as number[]
    const event: CountsEvent = { type: "counts", id, kind: rawKind as ProgressCountKind, completed, total, passed, failed, running, pending, skipped }
    return validCounts(event) ? event : undefined
  }
  return undefined
}

/** Structural reducer — duration metadata is applied by ProgressTimingTracker when present. */
export function applyProgressLine(
  state: JobProgress,
  line: unknown,
  now = new Date().toISOString(),
  timing?: ProgressTimingTracker,
): JobProgress {
  const event = parseProgressLine(line)
  if (!event) return state
  if (event.type === "node") {
    const index = state.nodes.findIndex((node) => node.id === event.id)
    const previous = state.nodes[index]
    const structural: ProgressNode = { ...previous, ...event }
    // Repeated running markers are observations, not additional attempts.
    if (previous?.status === "failed" && event.status === "running") {
      structural.retryCount = (previous.retryCount ?? 0) + 1
      delete structural.durationMs
      delete structural.durationSource
      delete structural.durationUnavailableReason
    }
    delete (structural as { type?: string }).type
    const node = timing
      ? timing.apply(previous, event, structural)
      : structural
    const nodes = [...state.nodes]
    if (index === -1) nodes.push(node)
    else nodes[index] = node
    return { ...state, updatedAt: now, nodes }
  }
  const index = state.nodes.findIndex((node) => node.id === event.id)
  if (index === -1) return state
  const nodes = [...state.nodes]
  nodes[index] = { ...nodes[index], detail: { kind: event.kind, completed: event.completed, total: event.total, passed: event.passed, failed: event.failed, running: event.running, pending: event.pending, skipped: event.skipped } }
  return { ...state, updatedAt: now, nodes }
}

export function isJobProgress(value: unknown): value is JobProgress {
  if (!value || typeof value !== "object") return false
  const state = value as JobProgress
  return state.schema === 1 && (state.updatedAt === null || typeof state.updatedAt === "string") && Array.isArray(state.nodes)
}

export function readProgressSnapshot(root: string, id: string): JobProgress | undefined {
  const value = readJsonFile<unknown>(progressPath(root, id))
  return isJobProgress(value) ? value : undefined
}

export function writeProgressSnapshot(root: string, id: string, value: JobProgress): void {
  atomicWriteJson(progressPath(root, id), value)
}

export function removeProgressSnapshot(root: string, id: string): void {
  try { removeFile(progressPath(root, id)) } catch { /* observability cannot change a verdict */ }
}

export function attachProgressToTicket<T extends { id: string }>(root: string, ticket: T): T {
  const progress = readProgressSnapshot(root, ticket.id)
  return progress ? { ...ticket, progress } : ticket
}

export class ProgressLineDecoder {
  #buffer = ""
  #decoder = new StringDecoder("utf8")
  constructor(private readonly onLine: (line: string) => void) {}
  push(chunk: unknown): void {
    const text = Buffer.isBuffer(chunk)
      ? this.#decoder.write(chunk)
      : typeof chunk === "string"
        ? chunk
        : this.#decoder.write(Buffer.from(String(chunk)))
    this.#buffer += text
    const lines = this.#buffer.split(/\r?\n/)
    this.#buffer = lines.pop() ?? ""
    for (const line of lines) this.onLine(line)
  }
  flush(): void {
    this.#buffer += this.#decoder.end()
    if (this.#buffer) this.onLine(this.#buffer)
    this.#buffer = ""
  }
}

function cloneProgressNode(node: ProgressNode): ProgressNode {
  return {
    ...node,
    ...(node.detail ? { detail: { ...node.detail } } : {}),
  }
}

export class ProgressCollector {
  private state: JobProgress
  private readonly timing: ProgressTimingTracker
  private readonly clock: ProgressClock
  private finalized = false

  constructor(
    private readonly root: string,
    private readonly id: string,
    options?: { clock?: ProgressClock },
  ) {
    this.clock = options?.clock ?? systemProgressClock()
    this.state = readProgressSnapshot(root, id) ?? createProgressState()
    this.timing = new ProgressTimingTracker(this.clock, this.state.nodes)
  }

  ingest(line: string): void {
    if (this.finalized) return
    const next = applyProgressLine(this.state, line, this.clock.wallNowIso(), this.timing)
    if (next === this.state) return
    this.state = next
    try { writeProgressSnapshot(this.root, this.id, this.state) } catch { /* non-fatal */ }
  }

  decoder(): ProgressLineDecoder {
    return new ProgressLineDecoder((line) => this.ingest(line))
  }

  snapshot(): JobProgress {
    return {
      schema: this.state.schema,
      updatedAt: this.state.updatedAt,
      nodes: this.state.nodes.map(cloneProgressNode),
    }
  }

  /** Idempotent. Open intervals become honest absences; further ingest is ignored. */
  finalize(): JobProgress {
    if (!this.finalized) {
      this.finalized = true
      const nodes = this.timing.finalize(this.state.nodes)
      this.state = {
        ...this.state,
        updatedAt: this.clock.wallNowIso(),
        nodes,
      }
      try { writeProgressSnapshot(this.root, this.id, this.state) } catch { /* non-fatal */ }
    }
    return this.snapshot()
  }
}
