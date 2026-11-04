import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  evaluateShipTicket,
  findEligibleTicket,
  isShipEligibleTicket,
  type ShipProofQuery,
} from "../../src/ship/eligibility.js"
import type { QueueTicket, TicketFlags } from "../../src/contracts/schema.js"

const H = "a".repeat(40)
const B = "b".repeat(40)
const flags: TicketFlags = {
  fetchBase: "dest/dev",
  requireCleanTree: true,
  requireGitStability: true,
  pinHeadSha: true,
}
const git = { branch: "feature/one", headSha: H, baseSha: B, statusShort: "" }
const query: ShipProofQuery = {
  projectId: "fixture",
  executionCwd: "/tmp/fixture",
  headSha: H,
  baseSha: B,
  acceptedRecipes: [{ name: "check", argv: ["npm", "run", "check"], flags }],
}
const valid: QueueTicket = {
  id: "job-proof",
  preset: "check",
  projectId: "fixture",
  projectName: "Fixture",
  source: "queue",
  status: "passed",
  exitCode: 0,
  cwd: "/tmp/fixture",
  headSha: H,
  branch: "feature/one",
  requestedBy: "test",
  createdAt: "2026-09-17T00:00:00Z",
  startedAt: "2026-09-17T00:00:01Z",
  finishedAt: "2026-09-17T00:00:02Z",
  logPath: "/tmp/fixture/job-proof.log",
  command: "npm run check",
  argv: ["npm", "run", "check"],
  extraArgs: [],
  flags,
  executionDeadline: { state: "disabled" },
  preflight: git,
  postflight: { ...git },
}

function ineligible(raw: unknown, proof = query) {
  expect(isShipEligibleTicket(raw, proof)).toBe(false)
  const result = evaluateShipTicket(raw, proof)
  expect(result.eligible).toBe(false)
  if (!result.eligible) expect(result.reason.length).toBeGreaterThan(0)
}

describe("ship eligibility", () => {
  it("rejects a passed test whose required finalization has no record", () => {
    const hooked = { ...valid, schemaVersion: 4, finalization: { schemaVersion: 1, argv: ["hook"], timeoutMs: 100, contract: {}, contractDigest: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a" }, finalizationDigest: "a".repeat(64) }
    expect(isShipEligibleTicket(hooked, query)).toBe(false)
  })
  it("does not reuse a legacy green for a recipe requiring finalization", () => {
    expect(isShipEligibleTicket(valid, { ...query, acceptedRecipes: [{ ...query.acceptedRecipes[0], finalizationDigest: "a".repeat(64) }] } as ShipProofQuery)).toBe(false)
  })
  it("uses explicit joined evidence and the recipe digest, ignoring forged completion JSON", () => {
    const sample = JSON.parse(readFileSync(new URL("../fixtures/finalization-completion.json", import.meta.url), "utf8"))[0]
    const hooked: QueueTicket = { ...valid, schemaVersion: 4, finalization: JSON.parse(sample.terminalBytes).finalization, finalizationDigest: sample.record.finalizationDigest }
    const terminalDigest = createHash("sha256").update(JSON.stringify(hooked)).digest("hex")
    const record = { ...sample.record, ticketId: hooked.id, ticketDigest: terminalDigest }
    const proof: ShipProofQuery = { ...query, acceptedRecipes: [{ ...query.acceptedRecipes[0], finalizationDigest: hooked.finalizationDigest }] }
    expect(isShipEligibleTicket({ ...hooked, completion: { state: "complete", eligible: true } }, proof)).toBe(false)
    expect(isShipEligibleTicket(hooked, proof, record, terminalDigest)).toBe(true)
    expect(isShipEligibleTicket(hooked, proof, record, "0".repeat(64))).toBe(false)
    expect(findEligibleTicket([{ ticket: hooked, record, terminalDigest }], proof)).toBe(hooked)
    expect(findEligibleTicket([{ ticket: hooked, record: { ...record, phase: "failed" }, terminalDigest }], proof)).toBeUndefined()
  })

  it("accepts a canonical passed ticket for the recipe at H", () => {
    expect(isShipEligibleTicket(valid, query)).toBe(true)
    expect(evaluateShipTicket(valid, query)).toEqual({ eligible: true, ticket: valid })
    expect(findEligibleTicket([valid], query)).toBe(valid)
  })

  it("ignores runVariant for material ship eligibility", () => {
    const base = { ...valid }
    expect(isShipEligibleTicket({ ...base, runVariant: undefined }, query)).toBe(true)
    expect(isShipEligibleTicket({ ...base, runVariant: "focal" }, query)).toBe(true)
    expect(isShipEligibleTicket({ ...base, runVariant: "custom" }, query)).toBe(true)
  })

  it("rejects a different executed argv", () => {
    expect(isShipEligibleTicket({ ...valid, argv: [process.execPath, "-e", "process.exit(0)"] }, query)).toBe(false)
  })

  it("rejects extraArgs as a different tuple", () => {
    expect(isShipEligibleTicket({ ...valid, extraArgs: ["--testNamePattern=one"] }, query)).toBe(false)
  })

  it("rejects custom true even without extraArgs", () => {
    ineligible({ ...valid, custom: true })
  })

  it("rejects a shell command string in place of argv", () => {
    const { argv, ...commandOnly } = valid
    ineligible(commandOnly)
  })

  it("rejects the wrong HEAD or base", () => {
    ineligible({ ...valid, headSha: "c".repeat(40) })
    ineligible({
      ...valid,
      preflight: { ...git, headSha: "c".repeat(40) },
      postflight: { ...git, headSha: "c".repeat(40) },
    })
    ineligible({
      ...valid,
      preflight: { ...git, baseSha: "c".repeat(40) },
      postflight: { ...git, baseSha: "c".repeat(40) },
    })
  })

  it("rejects a dirty statusShort", () => {
    ineligible({
      ...valid,
      preflight: { ...git, statusShort: " M file.ts" },
      postflight: { ...git, statusShort: " M file.ts" },
    })
  })

  it("rejects a missing postflight instead of inventing one", () => {
    const { postflight, ...missing } = valid
    ineligible(missing)
  })

  it("rejects direct-cloud and direct-runtime sources", () => {
    ineligible({ ...valid, source: "direct-cloud" })
    ineligible({ ...valid, source: "direct-runtime" })
  })

  it("rejects an expired deadline", () => {
    ineligible({
      ...valid,
      executionDeadline: {
        state: "expired",
        timeoutMs: 1_000,
        armedAt: "2026-09-17T00:00:01Z",
        expiresAt: "2026-09-17T00:00:02Z",
        expiredAt: "2026-09-17T00:00:02Z",
      },
    })
  })

  it("rejects another project or cwd", () => {
    ineligible({ ...valid, projectId: "other" })
    ineligible({ ...valid, cwd: "/tmp/other" })
  })

  it("does not treat a last-green-shaped object as a ticket", () => {
    ineligible({
      ticketId: valid.id,
      finishedAt: valid.finishedAt,
      status: "passed",
      headSha: H,
      branch: valid.branch,
      custom: false,
      durationMs: null,
    })
  })

  it("rejects a boolean exitCode", () => {
    ineligible({ ...valid, exitCode: true })
  })

  it("does not resurrect an older pass after a later canonical failed", () => {
    const laterFailed: QueueTicket = {
      ...valid,
      id: "job-later-red",
      status: "failed",
      exitCode: 1,
      startedAt: "2026-09-17T00:00:10Z",
      finishedAt: "2026-09-17T00:00:11Z",
    }
    expect(isShipEligibleTicket(valid, query)).toBe(true)
    expect(isShipEligibleTicket(laterFailed, query)).toBe(false)
    expect(findEligibleTicket([valid, laterFailed], query)).toBeUndefined()
    expect(findEligibleTicket([laterFailed, valid], query)).toBeUndefined()
  })

  it("does not resurrect an older pass after a later canonical interrupted", () => {
    const laterInterrupted: QueueTicket = {
      ...valid,
      id: "job-later-interrupt",
      status: "interrupted",
      exitCode: 1,
      startedAt: "2026-09-17T00:00:10Z",
      finishedAt: "2026-09-17T00:00:11Z",
    }
    expect(findEligibleTicket([valid, laterInterrupted], query)).toBeUndefined()
  })

  it("keeps an older canonical pass when a later extraArgs red is a different tuple", () => {
    const laterCustomFailed: QueueTicket = {
      ...valid,
      id: "job-custom-red",
      status: "failed",
      exitCode: 1,
      extraArgs: ["--testNamePattern=one"],
      argv: ["npm", "run", "check", "--", "--testNamePattern=one"],
      startedAt: "2026-09-17T00:00:10Z",
      finishedAt: "2026-09-17T00:00:11Z",
    }
    expect(findEligibleTicket([valid, laterCustomFailed], query)).toBe(valid)
  })

  it("accepts the second recipe when the first is empty", () => {
    const orQuery: ShipProofQuery = {
      ...query,
      acceptedRecipes: [
        { name: "full", argv: [], flags },
        { name: "check", argv: ["npm", "run", "check"], flags },
      ],
    }
    expect(isShipEligibleTicket(valid, orQuery)).toBe(true)
    expect(findEligibleTicket([valid], orQuery)).toBe(valid)
  })

  it("does not disqualify on progress-only field differences", () => {
    expect(isShipEligibleTicket({
      ...valid,
      flags: { ...flags, progressEnabled: true },
      progress: { schema: 1, updatedAt: "2026-09-17T00:00:02Z", nodes: [] },
    }, query)).toBe(true)
  })

  it("does not disqualify on abortOnStaleBase mismatch alone", () => {
    expect(isShipEligibleTicket({
      ...valid,
      flags: { ...flags, abortOnStaleBase: true },
    }, query)).toBe(true)
    expect(isShipEligibleTicket(valid, {
      ...query,
      acceptedRecipes: [{ name: "check", argv: ["npm", "run", "check"], flags: { ...flags, abortOnStaleBase: true } }],
    })).toBe(true)
  })

  it("rejects a ship-relevant flag mismatch", () => {
    ineligible({ ...valid, flags: { ...flags, pinHeadSha: false } })
  })

  it("accepts a missing source for compatibility", () => {
    const { source, ...compat } = valid
    expect(isShipEligibleTicket(compat, query)).toBe(true)
  })

  it("does not let a cancel without preflight invalidate a finished proof", () => {
    const cancelBeforeStart: QueueTicket = {
      ...valid,
      id: "job-cancel",
      status: "cancelled",
      exitCode: null,
      startedAt: undefined,
      finishedAt: "2026-09-17T00:00:03Z",
      preflight: undefined,
      postflight: undefined,
    }
    expect(findEligibleTicket([valid, cancelBeforeStart], query)).toBe(valid)
  })

  it("selects the latest started canonical pass and tie-breaks by id", () => {
    const older: QueueTicket = {
      ...valid,
      id: "job-old",
      startedAt: "2026-09-17T00:00:01Z",
    }
    const newer: QueueTicket = {
      ...valid,
      id: "job-new",
      startedAt: "2026-09-17T00:00:05Z",
    }
    const tiedLow: QueueTicket = {
      ...valid,
      id: "job-a",
      startedAt: "2026-09-17T00:00:05Z",
    }
    const tiedHigh: QueueTicket = {
      ...valid,
      id: "job-b",
      startedAt: "2026-09-17T00:00:05Z",
    }
    expect(findEligibleTicket([older, newer], query)).toBe(newer)
    expect(findEligibleTicket([tiedLow, tiedHigh], query)).toBe(tiedHigh)
  })
})
