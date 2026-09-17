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

describe("progress timing", () => {
  it("mede running-terminal sem reiniciar em running repetido", () => {
    let ms = 0
    const clock = {
      monotonicNowNs: () => BigInt(ms) * 1_000_000n,
      wallNowIso: () => "2026-09-17T00:00:00.000Z",
    }
    const collector = new ProgressCollector(tempRoot(), "timing-1", { clock })
    const emit = (status: string, duration = "-") =>
      collector.ingest(
        ["@@ci-queue-progress", "1", "node", "g1", "-", "gate", status, duration, "Verificação"].join("\t"),
      )
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
    collector.ingest(["@@ci-queue-progress", "1", "node", "z", "-", "gate", "passed", "0", "Zero"].join("\t"))
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
    collector.ingest(["@@ci-queue-progress", "1", "node", "x", "-", "gate", "failed", "-", "Sem início"].join("\t"))
    expect(collector.snapshot().nodes[0]).toMatchObject({
      durationUnavailableReason: "missing-start",
    })
    expect(collector.snapshot().nodes[0].durationMs).toBeUndefined()
  })

  it("finalize turns open running into open-at-finalize", () => {
    let ms = 0
    const collector = new ProgressCollector(tempRoot(), "timing-4", {
      clock: {
        monotonicNowNs: () => BigInt(ms) * 1_000_000n,
        wallNowIso: () => "2026-09-17T00:00:00.000Z",
      },
    })
    ms = 10
    collector.ingest(["@@ci-queue-progress", "1", "node", "open", "-", "stage", "running", "-", "Aberto"].join("\t"))
    const finalized = collector.finalize()
    expect(finalized.nodes[0]).toMatchObject({
      status: "running",
      durationUnavailableReason: "open-at-finalize",
    })
    collector.ingest(["@@ci-queue-progress", "1", "node", "open", "-", "stage", "passed", "-", "Aberto"].join("\t"))
    expect(collector.snapshot().nodes[0].status).toBe("running")
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
    const mid = Buffer.from("ção", "utf8")
    // Split UTF-8 of ção across pushes on the same decoder.
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
    expect(collector.snapshot().nodes.find((n) => n.id === "u1")?.label).toBe("Verificação")
  })
})
