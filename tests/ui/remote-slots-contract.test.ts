import { describe, expect, it } from "vitest"

import {
  RemoteSlotsContractError,
  parseRemoteSlotsResponse,
} from "../../ui/src/lib/remote-slots"

describe("remote slots browser contract", () => {
  it("accepts the independent CI Queue envelope", () => {
    const response = {
      schemaVersion: 2,
      source: { available: true, kind: "git" },
      greens: [],
    }

    expect(parseRemoteSlotsResponse(response)).toBe(response)
  })

  it("rejects the legacy DietFlow bridge envelope", () => {
    expect(() =>
      parseRemoteSlotsResponse({
        ok: true,
        stale: false,
        report: { slots: [] },
      })
    ).toThrow(RemoteSlotsContractError)
  })
})
