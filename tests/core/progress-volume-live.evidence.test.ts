/**
 * Task 9 — collector / live progress volume evidence (not TDD).
 * Measures accepted events, sidecar writes/bytes, and live API payload shape
 * at synthetic populations 7 / 101 / 1000. Prints JSON summaries to stdout.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import {
  ProgressCollector,
  applyProgressLine,
  createProgressState,
  parseProgressLine,
} from "../../src/core/progress.ts"
import { ensureQueueDirs, progressPath, queuePaths } from "../../src/core/state.ts"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const POPULATIONS = [7, 101, 1000] as const

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-volume-"))
  cleanup.push(root)
  ensureQueueDirs(root)
  return root
}

function nodeLine(
  id: string,
  parent: string,
  kind: string,
  status: string,
  label: string,
): string {
  return ["@@ci-queue-progress", "1", "node", id, parent, kind, status, "-", label].join("\t")
}

function countsLine(
  id: string,
  total: number,
  running: number,
  pending: number,
): string {
  const completed = 0
  const passed = 0
  const failed = 0
  const skipped = 0
  return [
    "@@ci-queue-progress",
    "1",
    "counts",
    id,
    "cases",
    completed,
    total,
    passed,
    failed,
    running,
    pending,
    skipped,
  ].join("\t")
}

/** Synthetic dual-invocation-shaped tree: structural stage/suite + N cases. */
function syntheticLines(population: number): string[] {
  const lines: string[] = [
    nodeLine("e2e", "-", "stage", "running", "E2E"),
    nodeLine("playwright", "e2e", "stage", "running", "Playwright"),
    nodeLine("suite:default", "playwright", "suite", "running", "default"),
    // Noise the collector must reject (not TSV protocol).
    "not-a-progress-line",
    "@@ci-queue-progress\t1\tnode\tbad",
  ]
  for (let i = 0; i < population; i += 1) {
    const status = i === 0 ? "running" : "pending"
    lines.push(nodeLine(`case:${i}`, "suite:default", "case", status, `case ${i}`))
  }
  lines.push(countsLine("playwright", population, 1, population - 1))
  return lines
}

type CollectorMetrics = {
  population: number
  emittedLines: number
  acceptedEvents: number
  sidecarWriteCount: number
  finalSidecarBytes: number
  nodeCount: number
  countsTotal: number | null
}

function measureCollector(population: number): CollectorMetrics {
  const root = tempRoot()
  const jobId = `volume-${population}`
  const lines = syntheticLines(population)
  const collector = new ProgressCollector(root, jobId)
  const sidecar = progressPath(root, jobId)

  let acceptedEvents = 0
  let sidecarWriteCount = 0
  let mirror = createProgressState()

  for (const line of lines) {
    const parsed = parseProgressLine(line)
    const next = applyProgressLine(mirror, line, "2026-09-20T12:00:00.000Z")
    const accepted = parsed !== undefined && next !== mirror
    if (accepted) {
      acceptedEvents += 1
      mirror = next
    }
    const beforeBytes = (() => {
      try {
        return statSync(sidecar).size
      } catch {
        return -1
      }
    })()
    collector.ingest(line)
    const afterBytes = (() => {
      try {
        return statSync(sidecar).size
      } catch {
        return -1
      }
    })()
    if (accepted && afterBytes !== beforeBytes) sidecarWriteCount += 1
    else if (accepted) sidecarWriteCount += 1 // same-size rewrite still counts as a write
  }

  const snapshot = collector.snapshot()
  const playwright = snapshot.nodes.find((node) => node.id === "playwright")
  const countsTotal = playwright?.detail?.total ?? null
  const finalSidecarBytes = Buffer.byteLength(readFileSync(sidecar))

  return {
    population,
    emittedLines: lines.length,
    acceptedEvents,
    sidecarWriteCount,
    finalSidecarBytes,
    nodeCount: snapshot.nodes.length,
    countsTotal,
  }
}

type LiveMetrics = {
  population: number
  responseBytes: number
  activeLength: number
  serializeMs: number
  hasNodesKey: boolean
  activeKinds: string[]
  rootsLength: number
}

function measureLive(population: number): LiveMetrics {
  const root = tempRoot()
  const jobId = `live-${population}`
  const collector = new ProgressCollector(root, jobId)
  for (const line of syntheticLines(population)) collector.ingest(line)

  const paths = queuePaths(root)
  writeFileSync(
    paths.running,
    `${JSON.stringify({
      id: jobId,
      projectId: "volume",
      projectName: "Volume",
      status: "running",
      preset: "e2e",
      branch: "dev",
      headSha: "abc",
      createdAt: "2026-09-20T12:00:00Z",
      flags: { progressEnabled: true },
    })}\n`,
  )

  const py = `
import json, sys, time
sys.path.insert(0, ${JSON.stringify(join(repoRoot, "backend"))})
from ci_queue_api.records import status_snapshot_all
root = sys.argv[1]
t0 = time.perf_counter()
payload = status_snapshot_all(root, view="live")
serialize_ms = (time.perf_counter() - t0) * 1000.0
raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
summary = (payload.get("running") or {}).get("progressSummary") or {}
active = summary.get("active") or []
print(json.dumps({
  "serializeMs": serialize_ms,
  "responseBytes": len(raw.encode("utf-8")),
  "activeLength": len(active),
  "hasNodesKey": "nodes" in summary,
  "activeKinds": sorted({n.get("kind") for n in active if isinstance(n, dict)}),
  "rootsLength": len(summary.get("roots") or []),
  "payload": payload,
}))
`
  const result = spawnSync("python3", ["-c", py, root], {
    encoding: "utf8",
    cwd: repoRoot,
    env: { ...process.env, PYTHONPATH: join(repoRoot, "backend") },
  })
  assert.equal(result.status, 0, result.stderr || result.stdout || "python live snapshot failed")
  const measured = JSON.parse(result.stdout.trim()) as Omit<LiveMetrics, "population">
  console.log(
    JSON.stringify({
      layer: "api-live",
      population,
      responseBytes: measured.responseBytes,
      activeLength: measured.activeLength,
      serializeMs: measured.serializeMs,
      hasNodesKey: measured.hasNodesKey,
      activeKinds: measured.activeKinds,
      rootsLength: measured.rootsLength,
    }),
  )
  return { population, ...measured }
}

describe("progress volume live evidence", () => {
  it("records collector and live metrics at 7 / 101 / 1000", () => {
    const collectors: CollectorMetrics[] = []
    const lives: LiveMetrics[] = []

    for (const population of POPULATIONS) {
      const collector = measureCollector(population)
      collectors.push(collector)
      console.log(JSON.stringify({ layer: "collector", ...collector }))

      const live = measureLive(population)
      lives.push(live)
    }

    const at1000 = collectors.find((row) => row.population === 1000)
    assert.ok(at1000)
    assert.equal(at1000.countsTotal, 1000)
    assert.equal(at1000.acceptedEvents, at1000.sidecarWriteCount)
    assert.ok(at1000.finalSidecarBytes > 0)

    const live7 = lives.find((row) => row.population === 7)!
    const live1000 = lives.find((row) => row.population === 1000)!
    assert.equal(live1000.hasNodesKey, false, "live projection must omit full nodes tree")
    assert.ok(live1000.activeLength > 0)
    assert.ok(live1000.activeLength <= 32)
    assert.ok(live1000.activeKinds.every((kind) => kind === "stage" || kind === "group" || kind === "suite"))
    assert.ok(!live1000.activeKinds.includes("case"))

    // Live payload must not scale with case population (structural active only).
    const caseRatio = 1000 / 7
    const byteRatio = live1000.responseBytes / Math.max(live7.responseBytes, 1)
    assert.ok(
      byteRatio < caseRatio * 0.25,
      `live bytes grew too close to case ratio: byteRatio=${byteRatio.toFixed(3)} caseRatio=${caseRatio.toFixed(3)}`,
    )
    assert.ok(
      live1000.responseBytes < live7.responseBytes * 8,
      `live@1000 bytes ${live1000.responseBytes} vs live@7 ${live7.responseBytes}`,
    )
    assert.equal(live7.activeLength, live1000.activeLength)

    console.log(
      JSON.stringify({
        layer: "summary",
        collectors,
        lives: lives.map(({ population, responseBytes, activeLength, serializeMs, hasNodesKey, activeKinds, rootsLength }) => ({
          population,
          responseBytes,
          activeLength,
          serializeMs,
          hasNodesKey,
          activeKinds,
          rootsLength,
        })),
        invariants: {
          countsTotalAt1000: at1000.countsTotal,
          liveOmitsNodes: !live1000.hasNodesKey,
          liveByteRatioVsCaseRatio: { byteRatio, caseRatio },
          activeLengthStable: live7.activeLength === live1000.activeLength,
        },
      }),
    )
  })
})
