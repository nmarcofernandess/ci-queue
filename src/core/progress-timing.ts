import type {
  ProgressDurationSource,
  ProgressDurationUnavailableReason,
  ProgressNode,
  ProgressStatus,
} from "../contracts/schema.js"

export interface ProgressClock {
  monotonicNowNs(): bigint
  wallNowIso(): string
}

export type ProgressNodeUpdate = Pick<
  ProgressNode,
  "id" | "parentId" | "kind" | "label" | "status" | "durationMs"
>

const TERMINAL: ReadonlySet<ProgressStatus> = new Set(["passed", "failed", "skipped"])

export function systemProgressClock(): ProgressClock {
  return {
    monotonicNowNs: () => process.hrtime.bigint(),
    wallNowIso: () => new Date().toISOString(),
  }
}

function nsToMs(deltaNs: bigint): number | undefined {
  if (deltaNs < 0n) return undefined
  const ms = deltaNs / 1_000_000n
  if (ms > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
  return Number(ms)
}

type Anchor = {
  startedNs: bigint
  discontinuous: boolean
}

/**
 * Owns only duration metadata. Status/hierarchy/retryCount stay in the reducer.
 * One tracker instance per ProgressCollector/job.
 */
export class ProgressTimingTracker {
  #clock: ProgressClock
  #anchors = new Map<string, Anchor>()
  #finalized = false

  constructor(clock: ProgressClock, restoredNodes: readonly ProgressNode[] = []) {
    this.#clock = clock
    for (const node of restoredNodes) {
      if (node.status === "running") {
        // Restored running nodes lost their in-memory anchor — do not invent
        // one from updatedAt. A later failed→running may start a fresh attempt.
        this.#anchors.set(node.id, { startedNs: 0n, discontinuous: true })
      }
    }
  }

  apply(
    previous: ProgressNode | undefined,
    event: ProgressNodeUpdate,
    structuralNode: ProgressNode,
  ): ProgressNode {
    if (this.#finalized) return structuralNode

    const node: ProgressNode = { ...structuralNode }
    const isNewAttempt = previous?.status === "failed" && event.status === "running"

    if (isNewAttempt) {
      this.#anchors.delete(event.id)
      delete node.durationMs
      delete node.durationSource
      delete node.durationUnavailableReason
    }

    if (event.status === "running") {
      const existing = this.#anchors.get(event.id)
      if (!existing || existing.discontinuous || isNewAttempt) {
        try {
          this.#anchors.set(event.id, {
            startedNs: this.#clock.monotonicNowNs(),
            discontinuous: false,
          })
        } catch {
          this.#anchors.set(event.id, { startedNs: 0n, discontinuous: true })
          node.durationUnavailableReason = "clock-invalid"
        }
      }
      // Running never publishes a live timer number.
      delete node.durationMs
      delete node.durationSource
      return node
    }

    if (!TERMINAL.has(event.status)) {
      return node
    }

    // Terminal with explicit emitter duration (including 0).
    if (typeof event.durationMs === "number") {
      node.durationMs = event.durationMs
      node.durationSource = "emitter"
      delete node.durationUnavailableReason
      this.#anchors.delete(event.id)
      return node
    }

    // Duplicate terminal without a new duration: keep first result.
    if (
      previous &&
      TERMINAL.has(previous.status) &&
      previous.status === event.status &&
      (typeof previous.durationMs === "number" || previous.durationUnavailableReason)
    ) {
      if (typeof previous.durationMs === "number") {
        node.durationMs = previous.durationMs
        if (previous.durationSource) node.durationSource = previous.durationSource
      }
      if (previous.durationUnavailableReason) {
        node.durationUnavailableReason = previous.durationUnavailableReason
      }
      return node
    }

    const anchor = this.#anchors.get(event.id)
    if (!anchor || anchor.discontinuous) {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = anchor?.discontinuous
        ? "collector-restarted"
        : "missing-start"
      this.#anchors.delete(event.id)
      return node
    }

    let nowNs: bigint
    try {
      nowNs = this.#clock.monotonicNowNs()
    } catch {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "clock-invalid"
      this.#anchors.delete(event.id)
      return node
    }

    const measured = nsToMs(nowNs - anchor.startedNs)
    this.#anchors.delete(event.id)
    if (measured === undefined) {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "clock-invalid"
      return node
    }
    node.durationMs = measured
    node.durationSource = "collector"
    delete node.durationUnavailableReason
    return node
  }

  finalize(nodes: readonly ProgressNode[]): ProgressNode[] {
    this.#finalized = true
    return nodes.map((node) => {
      if (node.status !== "running") return node
      const next: ProgressNode = { ...node }
      delete next.durationMs
      delete next.durationSource
      next.durationUnavailableReason =
        this.#anchors.get(node.id)?.discontinuous
          ? "collector-restarted"
          : "open-at-finalize"
      this.#anchors.delete(node.id)
      return next
    })
  }
}

export type { ProgressDurationSource, ProgressDurationUnavailableReason }
