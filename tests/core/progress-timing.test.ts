import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ProgressCollector } from "../../src/core/progress.js"
import { ensureQueueDirs } from "../../src/core/state.js"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-timing-"))
  roots.push(root)
  ensureQueueDirs(root)
  return root
}

function line(id: string, status: string, duration = "-", label = "N"): string {
  return ["@@ci-queue-progress", "1", "node", id, "-", "gate", status, duration, label].join("\t")
}

describe("progress timing", () => {
  it("mede running-terminal sem reiniciar em running repetido", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "timing-1", { clock })
    const emit = (status: string, duration = "-") => collector.ingest(line("g1", status, duration, "Verificação"))
    ms = 100
    emit("running")
    ms = 900
    emit("running")
    ms = 1600
    emit("passed")
    expect(collector.snapshot().nodes[0]).toMatchObject({
      id: "g1",
      durationMs: 1500,
      durationSource: "collector",
    })
    ms = 9000
    emit("passed")
    expect(collector.snapshot().nodes[0].durationMs).toBe(1500)
  })

  it("preserves explicit emitter zero and marks collector observation", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "timing-2", { clock })
    collector.ingest(line("z", "passed", "0", "Zero"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationMs: 0,
      durationSource: "emitter",
    })
  })

  it("records missing-start when terminal arrives without running", () => {
    const collector = new ProgressCollector(tempRoot(), "timing-3", {
      clock: {
        monotonicNowNs: () => 0n,
        wallNowIso: () => "2026-09-17T00:00:00.000Z",
      },
    })
    collector.ingest(line("x", "failed", "-", "Sem início"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationUnavailableReason: "missing-start",
    })
    expect(collector.snapshot().nodes[0].durationMs).toBeUndefined()
  })

  it("finalize turns open running into missing-end", () => {
    let ms = 0
    const collector = new ProgressCollector(tempRoot(), "timing-4", {
      clock: {
        monotonicNowNs: () => BigInt(ms) * 1_000_000n,
        wallNowIso: () => "2026-09-17T00:00:00.000Z",
      },
    })
    ms = 10
    collector.ingest(line("open", "running", "-", "Aberto"))
    const finalized = collector.finalize()
    expect(finalized.nodes[0]).toMatchObject({
      status: "running",
      durationUnavailableReason: "missing-end",
    })
    collector.ingest(line("open", "passed", "-", "Aberto"))
    expect(collector.snapshot().nodes[0].status).toBe("running")
  })

  it("restart-loses-anchor stays discontinuous across repeated running", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const root = tempRoot()
    const first = new ProgressCollector(root, "restart-1", { clock })
    ms = 100
    first.ingest(line("g1", "running", "-", "Gate"))
    // Sidecar already has running; a new collector restores discontinuous anchors.
    const second = new ProgressCollector(root, "restart-1", { clock })
    ms = 700
    second.ingest(line("g1", "running", "-", "Gate"))
    ms = 1300
    second.ingest(line("g1", "passed", "-", "Gate"))
    const node = second.snapshot().nodes[0]
    expect(node.durationMs).toBeUndefined()
    expect(node.durationUnavailableReason).toBe("collector-restarted")
  })

  it("pending clears anchor so later running starts a fresh interval", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "pending-1", { clock })
    ms = 0
    collector.ingest(line("g1", "running"))
    ms = 100
    collector.ingest(line("g1", "pending"))
    ms = 5000
    collector.ingest(line("g1", "running"))
    ms = 6000
    collector.ingest(line("g1", "passed"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationMs: 1000,
      durationSource: "collector",
    })
  })

  it("preserves explicit emitter duration on running without inheriting it as terminal", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "partial-1", { clock })
    ms = 0
    collector.ingest(line("g1", "running", "70"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationMs: 70,
      durationSource: "emitter",
    })
    ms = 500
    collector.ingest(line("g1", "passed", "-"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationMs: 500,
      durationSource: "collector",
    })
  })

  it("keeps clock-invalid distinct from collector-restarted", () => {
    const clock = {
      monotonicNowNs: () => {
        throw new Error("clock down")
      },
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "clock-1", { clock })
    collector.ingest(line("g1", "running"))
    expect(collector.snapshot().nodes[0].durationUnavailableReason).toBe("clock-invalid")
    collector.ingest(line("g1", "passed", "-"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationUnavailableReason: "clock-invalid",
    })
    expect(collector.snapshot().nodes[0].durationMs).toBeUndefined()
  })

  it("snapshot deep-clones detail so callers cannot mutate internal state", () => {
    const collector = new ProgressCollector(tempRoot(), "clone-1", {
      clock: {
        monotonicNowNs: () => 0n,
        wallNowIso: () => "2026-09-17T00:00:00.000Z",
      },
    })
    collector.ingest(["@@ci-queue-progress", "1", "detail", "g1", "gates", "1", "1", "1", "0", "0", "0", "0"].join("\t"))
    collector.ingest(line("g1", "passed", "10", "Gate"))
    const snap = collector.snapshot()
    const detail = snap.nodes[0].detail as { total?: number } | undefined
    if (detail && typeof detail.total === "number") {
      detail.total = 999
    }
    const again = collector.snapshot()
    const detail2 = again.nodes[0].detail as { total?: number } | undefined
    if (detail2) expect(detail2.total).not.toBe(999)
  })

  it("keeps stdout and stderr decoders independent", () => {
    const collector = new ProgressCollector(tempRoot(), "timing-streams", {
      clock: {
        monotonicNowNs: () => 0n,
        wallNowIso: () => "2026-09-17T00:00:00.000Z",
      },
    })
    const stdout = collector.decoder()
    const stderr = collector.decoder()
    const half = Buffer.from("@@ci-queue-progress\t1\tnode\ts1\t-\tstage\tpassed\t-\tVerifica", "utf8")
    const labelStart = Buffer.from(
      ["@@ci-queue-progress", "1", "node", "u1", "-", "gate", "passed", "12", "Verifica"].join("\t"),
      "utf8",
    )
    const labelRest = Buffer.from("ção\n", "utf8")
    stdout.push(half)
    stderr.push(["@@ci-queue-progress", "1", "node", "s2", "-", "stage", "passed", "5", "Err"].join("\t") + "\n")
    stdout.push(Buffer.concat([Buffer.from("ção\n", "utf8")]))
    stdout.push(labelStart)
    stdout.push(labelRest)
    stdout.flush()
    stderr.flush()
    const ids = collector.snapshot().nodes.map((n) => n.id).sort()
    expect(ids).toEqual(["s1", "s2", "u1"])
  })
})
