import { describe, expect, it } from "vitest"

import { runVariantLabel } from "../../ui/src/features/shared/run-variant-label"

describe("runVariantLabel", () => {
  it.each([
    ["custom", "Personalizado"],
    ["focal", "Focal"],
    [undefined, null],
  ] as const)("maps %s to %s", (variant, expected) => {
    expect(runVariantLabel(variant)).toBe(expected)
  })
})
