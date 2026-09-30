import { describe, expect, it } from "vitest"

import {
  isObservedExecution,
  observedProgressCopy,
  progressSurface,
  unconfiguredProgressCopy,
} from "../../ui/src/features/shared/presentation"

describe("observed execution presentation", () => {
  it("does not treat observed runs as unconfigured queue progress", () => {
    const observed = {
      recordKind: "observed-execution" as const,
      progressEnabled: false,
      executionId: "20260920090000-example",
    }
    expect(isObservedExecution(observed)).toBe(true)
    expect(progressSurface(observed)).toBe("not-collected")
    expect(progressSurface(observed)).not.toBe("unconfigured")
    expect(observedProgressCopy.title).toMatch(/não coletadas/i)
    expect(unconfiguredProgressCopy.title).toMatch(/não configurado/i)
  })

  it("keeps legacy tickets without recordKind on the queue path", () => {
    expect(isObservedExecution({ progressEnabled: false } as { progressEnabled: boolean })).toBe(
      false,
    )
    expect(progressSurface({ progressEnabled: false })).toBe("unconfigured")
    expect(
      progressSurface({
        recordKind: "queue-ticket",
        progressEnabled: true,
        progressSummary: {
          schemaVersion: 1,
          available: true,
          nodes: [{ id: "root", label: "Root", status: "passed" }],
        },
      }),
    ).toBe("tree")
  })
})
