import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ProgressCollector, writeProgressSnapshot } from "../../src/core/progress.js"
import { ensureQueueDirs } from "../../src/core/state.js"
import type { ProgressNode } from "../../src/contracts/schema.js"

type ExpectedNode = {
  id: string
  status?: string
  durationMs?: number
  durationSource?: string
  durationUnavailableReason?: string
  absent?: string[]
}

type FixtureEvent =
  | { op: "ingest"; atMs: number; fields: string[] }
  | { op: "finalize"; atMs: number }
  | { op: "recreate"; atMs: number }

type FixtureCase = {
  id: string
  events: FixtureEvent[]
  expectedNodes: ExpectedNode[]
  initialNodes?: ProgressNode[]
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/timing-cases.json"), "utf8"),
) as { cases: FixtureCase[] }

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function runCase(c: FixtureCase) {
  const root = mkdtempSync(join(tmpdir(), `ci-queue-fixture-${c.id}-`))
  roots.push(root)
  ensureQueueDirs(root)
  let ms = 0
  const clock = {
    monotonicNowNs: () => BigInt(ms) * 1_000_000n,
    wallNowIso: () => "2026-09-17T00:00:00.000Z",
  }
  if (c.initialNodes?.length) {
    writeProgressSnapshot(root, c.id, {
      schema: 1,
      updatedAt: "2026-09-17T00:00:00.000Z",
      nodes: c.initialNodes,
    })
  }
  let collector = new ProgressCollector(root, c.id, { clock })
  for (const event of c.events) {
    ms = event.atMs
    if (event.op === "ingest") {
      collector.ingest(event.fields.join("\t"))
    } else if (event.op === "finalize") {
      collector.finalize()
    } else if (event.op === "recreate") {
      collector = new ProgressCollector(root, c.id, { clock })
    }
  }
  const nodes = Object.fromEntries(collector.snapshot().nodes.map((n) => [n.id, n]))
  for (const expected of c.expectedNodes) {
    const node = nodes[expected.id]
    expect(node, `${c.id}:${expected.id} missing`).toBeTruthy()
    if (expected.status !== undefined) expect(node.status, c.id).toBe(expected.status)
    if (expected.durationMs !== undefined) expect(node.durationMs, c.id).toBe(expected.durationMs)
    if (expected.durationSource !== undefined) {
      expect(node.durationSource, c.id).toBe(expected.durationSource)
    }
    if (expected.durationUnavailableReason !== undefined) {
      expect(node.durationUnavailableReason, c.id).toBe(expected.durationUnavailableReason)
    }
    for (const key of expected.absent ?? []) {
      expect(node, `${c.id}:${expected.id}.${key} should be absent`).not.toHaveProperty(key)
    }
  }
}

describe("original timing-cases.json (22)", () => {
  for (const c of fixture.cases) {
    it(c.id, () => runCase(c))
  }
})
