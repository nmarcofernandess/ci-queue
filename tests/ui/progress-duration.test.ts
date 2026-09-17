import { describe, expect, it } from "vitest"
import { progressDurationView } from "../../ui/src/features/shared/progress-duration-model"

describe("progressDurationView", () => {
  it("shows emitter zero as 0 ms", () => {
    expect(
      progressDurationView(
        { id: "a", label: "A", status: "passed", durationMs: 0, durationSource: "emitter" },
        "passed",
      ),
    ).toMatchObject({ text: "0 ms", show: true })
  })

  it("prefixes collector observations and includes exact ms", () => {
    const view = progressDurationView(
      { id: "a", label: "A", status: "passed", durationMs: 1500, durationSource: "collector" },
      "passed",
    )
    expect(view.text.startsWith("≈")).toBe(true)
    expect(view.description).toContain("1500 ms")
    expect(view.description.toLowerCase()).toContain("buffer")
    expect(view.show).toBe(true)
  })

  it("shows em dash for terminal absence with reason", () => {
    expect(
      progressDurationView(
        {
          id: "a",
          label: "A",
          status: "failed",
          durationUnavailableReason: "missing-start",
        },
        "failed",
      ),
    ).toMatchObject({ text: "—", show: true })
  })

  it("shows em dash for legacy terminal without reason", () => {
    expect(
      progressDurationView({ id: "a", label: "A", status: "passed" }, "passed"),
    ).toMatchObject({
      text: "—",
      description: "Duração ausente na publicação legada",
      show: true,
    })
  })

  it("hides running without a number", () => {
    expect(
      progressDurationView({ id: "a", label: "A", status: "running" }, "running"),
    ).toMatchObject({ show: false })
  })
})
