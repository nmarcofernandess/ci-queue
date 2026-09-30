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

  it("accepts all projects with separate Git coverage", () => {
    const response = {
      schemaVersion: 2, context: { kind: "all" }, projectErrors: [],
      projects: [{ projectId: "alpha", projectName: "Alpha",
        source: { available: true }, coverage: { invalidPayloads: [] } }],
      greens: [{ projectId: "alpha", projectName: "Alpha" }],
    }
    expect(parseRemoteSlotsResponse(response)).toBe(response)
    expect(parseRemoteSlotsResponse({ ...response,
      projects: [...response.projects, { projectId: "beta", projectName: "Beta",
        catalog: "invalid", source: null, coverage: null }],
      projectErrors: [{ projectId: "beta", projectName: "Beta", error: "catalog" }],
    })).toMatchObject({ greens: response.greens })
    expect(() => parseRemoteSlotsResponse({ ...response,
      greens: [{ projectId: "beta" }] })).toThrow(RemoteSlotsContractError)
    expect(() => parseRemoteSlotsResponse({ ...response,
      projects: [{ projectId: "alpha" }] })).toThrow(RemoteSlotsContractError)
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
