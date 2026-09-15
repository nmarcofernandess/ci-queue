import { describe, expect, it } from "vitest"
import { applyProgressLine, createProgressState } from "../../src/core/progress.js"

const marker = (status: string, duration = "-") =>
  ["@@ci-queue-progress", "1", "node", "case:1", "suite:1", "case", status, duration, "Retries"].join("\t")

describe("progress attempts", () => {
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
