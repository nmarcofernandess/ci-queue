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

type Anchor =
  | { kind: "live"; startedNs: bigint }
  | { kind: "discontinuous" }
  | { kind: "clock-invalid" }

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
        // Restored running lost its in-memory anchor — never invent continuity.
        this.#anchors.set(node.id, { kind: "discontinuous" })
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

    if (event.status === "pending") {
      // Retreat invalidates any live interval; a later running starts fresh.
      this.#anchors.delete(event.id)
      delete node.durationMs
      delete node.durationSource
      delete node.durationUnavailableReason
      return node
    }

    if (event.status === "running") {
      const existing = this.#anchors.get(event.id)

      // Discontinuous / clock-invalid stay sticky across repeated running.
      if (existing?.kind === "discontinuous" || existing?.kind === "clock-invalid") {
        delete node.durationSource
        if (typeof event.durationMs === "number") {
          node.durationMs = event.durationMs
          node.durationSource = "emitter"
          delete node.durationUnavailableReason
        } else {
          delete node.durationMs
          if (existing.kind === "clock-invalid") {
            node.durationUnavailableReason = "clock-invalid"
          } else {
            delete node.durationUnavailableReason
          }
        }
        return node
      }

      if (!existing || isNewAttempt) {
        try {
          this.#anchors.set(event.id, {
            kind: "live",
            startedNs: this.#clock.monotonicNowNs(),
          })
        } catch {
          this.#anchors.set(event.id, { kind: "clock-invalid" })
          delete node.durationMs
          delete node.durationSource
          node.durationUnavailableReason = "clock-invalid"
          return node
        }
      }

      // Preserve explicit emitter snapshot on running; do not invent a live timer.
      if (typeof event.durationMs === "number") {
        node.durationMs = event.durationMs
        node.durationSource = "emitter"
        delete node.durationUnavailableReason
      } else {
        delete node.durationMs
        delete node.durationSource
        delete node.durationUnavailableReason
      }
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
      } else {
        delete node.durationMs
        delete node.durationSource
      }
      if (previous.durationUnavailableReason) {
        node.durationUnavailableReason = previous.durationUnavailableReason
      }
      return node
    }

    const anchor = this.#anchors.get(event.id)
    this.#anchors.delete(event.id)

    if (!anchor) {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "missing-start"
      return node
    }

    if (anchor.kind === "discontinuous") {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "collector-restarted"
      return node
    }

    if (anchor.kind === "clock-invalid") {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "clock-invalid"
      return node
    }

    let nowNs: bigint
    try {
      nowNs = this.#clock.monotonicNowNs()
    } catch {
      delete node.durationMs
      delete node.durationSource
      node.durationUnavailableReason = "clock-invalid"
      return node
    }

    const measured = nsToMs(nowNs - anchor.startedNs)
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
      const anchor = this.#anchors.get(node.id)
      this.#anchors.delete(node.id)
      if (anchor?.kind === "discontinuous") {
        next.durationUnavailableReason = "collector-restarted"
      } else if (anchor?.kind === "clock-invalid") {
        next.durationUnavailableReason = "clock-invalid"
      } else {
        next.durationUnavailableReason = "missing-end"
      }
      return next
    })
  }
}

export type { ProgressDurationSource, ProgressDurationUnavailableReason }
