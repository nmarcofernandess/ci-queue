import { describe, expect, it } from "vitest"
import { applyProgressLine, createProgressState, parseProgressLine } from "../../src/core/progress.js"

const marker = (status: string, duration = "-") =>
  ["@@ci-queue-progress", "1", "node", "case:1", "suite:1", "case", status, duration, "Retries"].join("\t")

describe("progress attempts", () => {
  it("replaces only an invocation's anticipated children when execution inventory drifts", () => {
    const node = (id: string, parent: string, kind: string, status: string, label: string) =>
      ["@@ci-queue-progress", "1", "node", id, parent, kind, status, "-", label].join("\t")
    let state = createProgressState()
    state = applyProgressLine(state, node("e2e", "-", "stage", "running", "E2E"))
    state = applyProgressLine(state, node("pw-a", "e2e", "stage", "running", "Playwright A"))
    state = applyProgressLine(state, node("pw-b", "e2e", "stage", "pending", "Playwright B"))
    state = applyProgressLine(state, node("case-old", "pw-a", "case", "pending", "Old"))
    state = applyProgressLine(state, node("case-b", "pw-b", "case", "pending", "B"))
    state = applyProgressLine(state, "@@ci-queue-progress\t1\tcounts\tpw-a\tcases\t0\t1\t0\t0\t0\t1\t0")
    state = applyProgressLine(state, "@@ci-queue-progress\t1\treplace-children\tpw-a")
    expect(state.nodes.map((item) => item.id)).toEqual(["e2e", "pw-a", "pw-b", "case-b"])
    expect(state.nodes.find((item) => item.id === "pw-a")?.detail).toBeUndefined()
    expect(state.nodes.find((item) => item.id === "pw-a")?.inventoryReplaced).toBe(true)
    expect(parseProgressLine("@@ci-queue-progress\t1\treplace-children\tmissing\textra")).toBeUndefined()
    const completed = applyProgressLine(state, node("case-done", "pw-a", "case", "passed", "Done"))
    expect(applyProgressLine(completed, "@@ci-queue-progress\t1\treplace-children\tpw-a")).toBe(completed)
  })

  it("keeps retries of omitted cases independently of materialized case nodes", () => {
    let state = applyProgressLine(createProgressState(), "@@ci-queue-progress\t1\tnode\tpw-a\t-\tstage\trunning\t-\tPlaywright")
    state = applyProgressLine(state, "@@ci-queue-progress\t1\tretries\tpw-a\t1")
    expect(state.retrySummary).toEqual({ "pw-a": 1 })
    expect(state.nodes[0]?.retryCount).toBeUndefined()
    expect(parseProgressLine("@@ci-queue-progress\t1\tretries\tpw-a\t-1")).toBeUndefined()
    expect(parseProgressLine("@@ci-queue-progress\t1\tretries\tmissing\t1\textra")).toBeUndefined()
  })
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
