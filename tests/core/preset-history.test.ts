import { describe, expect, it } from "vitest"

import { buildPresetHistory } from "../../src/core/preset-history.js"
import type { QueueProjectConfig, QueueTicket } from "../../src/contracts/schema.js"

const config: QueueProjectConfig = {
  schemaVersion: 1,
  project: { id: "dietflow", name: "DietFlow" },
  repository: { path: "/repo", baseRef: "origin/dev" },
  presets: { smoke: { argv: ["npm", "run", "smoke"] } },
  artifacts: [],
}

function ticket(overrides: Partial<QueueTicket> = {}): QueueTicket {
  return {
    id: "green",
    createdAt: "2026-09-14T10:00:00Z",
    finishedAt: "2026-09-14T10:01:00Z",
    status: "passed",
    preset: "smoke",
    cwd: "/repo",
    branch: "dev",
    headSha: "a".repeat(40),
    requestedBy: "test",
    command: "npm run smoke",
    logPath: "/tmp/green.log",
    projectId: "dietflow",
    projectName: "DietFlow",
    argv: ["npm", "run", "smoke"],
    exitCode: 0,
    ...overrides,
  }
}

describe("preset history", () => {
  it("does not announce a green before required finalization", () => {
    const hooked = ticket({ schemaVersion: 4, finalizationDigest: "a".repeat(64), finalization: { schemaVersion: 1, argv: ["hook"], timeoutMs: 100, contract: {}, contractDigest: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" } })
    expect(buildPresetHistory([hooked], config).presets[0].lastGreenCanonical).toBeNull()
  })
  it("selects only the newest canonical green for the declared recipe", () => {
    const report = buildPresetHistory([
      ticket(),
      ticket({ id: "custom", finishedAt: "2026-09-14T11:00:00Z", extraArgs: ["--watch"] }),
      ticket({ id: "different", finishedAt: "2026-09-14T12:00:00Z", argv: ["npm", "run", "other"] }),
    ], config)
    expect(report.aggregatorSchema).toBe(1)
    expect(report.presets[0].lastGreenCanonical?.ticketId).toBe("green")
  })
})
