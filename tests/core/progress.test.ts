import { describe, expect, it } from "vitest"
import { applyProgressLine, createProgressState, parseProgressLine } from "../../src/core/progress.js"

const marker = (status: string, duration = "-") =>
  ["@@ci-queue-progress", "1", "node", "case:1", "suite:1", "case", status, duration, "Retries"].join("\t")

describe("progress attempts", () => {
  it("accepts only a producer-confirmed focal upgrade without changing progress counts", () => {
    const focal = "@@ci-queue-progress\t1\tvariant\tfocal"
    expect(parseProgressLine(focal)).toEqual({ type: "variant", runVariant: "focal" })
    expect(parseProgressLine("@@ci-queue-progress\t1\tvariant\tcustom")).toBeUndefined()
    expect(parseProgressLine("@@ci-queue-progress\t1\tvariant\tfocal\textra")).toBeUndefined()
    const before = applyProgressLine(createProgressState(), marker("running"))
    const after = applyProgressLine(before, focal)
    expect(after.runVariant).toBe("focal")
    expect(after.nodes).toEqual(before.nodes)
  })
  it("counts only failed to running transitions within the same node and preserves the terminal fact", () => {
    let progress = createProgressState()
    for (const status of ["running", "failed", "running", "running", "passed"]) {
      progress = applyProgressLine(progress, marker(status))
    }
    expect(progress.nodes).toHaveLength(1)
    expect(progress.nodes[0]).toMatchObject({ id: "case:1", status: "passed", retryCount: 1 })
    const otherJob = applyProgressLine(createProgressState(), marker("passed"))
    expect(otherJob.nodes[0].retryCount).toBeUndefined()
  })
  it("does not retain a failed attempt's duration while retrying", () => {
    const failed = applyProgressLine(createProgressState(), marker("failed", "600"))
    const retry = applyProgressLine(failed, marker("running"))
    expect(retry.nodes[0].durationMs).toBeUndefined()
    expect(applyProgressLine(retry, marker("passed", "300")).nodes[0]).toMatchObject({ durationMs: 300, retryCount: 1 })
  })
})
