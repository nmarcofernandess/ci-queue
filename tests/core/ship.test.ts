import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { isShipEligibleTicket, type ShipProofQuery } from "../../src/ship/eligibility.js"
import {
  ShipError,
  emptyShipEffects,
  type ShipOps,
  type ShipRequest,
  type ShipTarget,
  type VerdictRun,
} from "../../src/ship/ops.js"
import { runShip } from "../../src/ship/ship.js"
import type { QueueTicket, ShipConfig, TicketFlags } from "../../src/contracts/schema.js"

const H = "a".repeat(40)
const B = "b".repeat(40)
const MERGE = "m".repeat(40)
const flags: TicketFlags = {
  fetchBase: "dest/dev",
  requireCleanTree: true,
  requireGitStability: true,
  pinHeadSha: true,
}
const git = { branch: "feature/one", headSha: H, baseSha: B, statusShort: "" }
const recipe = { name: "check", argv: ["npm", "run", "check"] as const, flags }
const query: ShipProofQuery = {
  projectId: "fixture",
  executionCwd: "/tmp/fixture",
  headSha: H,
  baseSha: B,
  acceptedRecipes: [recipe],
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
const laterFailed: QueueTicket = {
  ...valid,
  id: "job-later-red",
  status: "failed",
  exitCode: 1,
  startedAt: "2026-09-17T00:00:10Z",
  finishedAt: "2026-09-17T00:00:11Z",
}
const target: ShipTarget = {
  host: "github.com",
  repo: "acme/app",
  repositoryId: 42,
  pr: 12,
  headBranch: "feature/one",
  headSha: H,
  baseBranch: "dev",
  baseSha: B,
  executionCwd: "/tmp/fixture",
  configPath: "/tmp/fixture/ci-queue.json",
  configDigest: "digest-1",
  isDraft: false,
}
const shipConfig: ShipConfig = {
  acceptedPresets: ["check"],
  attestationContext: "local/check",
  remoteVerdict: {
    workflow: ".github/workflows/ci-queue-verdict.yml",
    job: "ci-verdict",
  },
}
const causalRun: VerdictRun = {
  id: 88,
  attempt: 1,
  pr: 12,
  headSha: H,
  baseSha: B,
  workflow: ".github/workflows/ci-queue-verdict.yml",
  job: "ci-verdict",
  status: "completed",
  conclusion: "success",
}

function abortError(): Error {
  const error = new Error("The operation was aborted.")
  error.name = "AbortError"
  return error
}

function sleepUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => resolve(), ms)
    timer.unref?.()
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(abortError())
    }, { once: true })
  })
}

type Fake = ShipOps & {
  calls: {
    order: string[]
    resolveTarget: number
    enqueue: Array<{ recipe: { name: string }; target: ShipTarget }>
    waitTicket: string[]
    attest: string[]
    markReady: number
    dispatchVerdict: number
    mergePinned: ShipTarget[]
    inspectMerge: number
    revalidate: number
    observeVerdict: VerdictRun[]
    cancel: number
  }
  history: unknown[]
}

function createFake(overrides: Partial<ShipOps> & {
  history?: unknown[]
  pending?: { id: string }
  policy?: "wait" | "skipped"
  config?: ShipConfig | undefined
  liveDigest?: string
  target?: ShipTarget
  verdict?: VerdictRun | undefined
} = {}): Fake {
  const history = [...(overrides.history ?? [])]
  const calls: Fake["calls"] = {
    order: [],
    resolveTarget: 0,
    enqueue: [],
    waitTicket: [],
    attest: [],
    markReady: 0,
    dispatchVerdict: 0,
    mergePinned: [],
    inspectMerge: 0,
    revalidate: 0,
    observeVerdict: [],
    cancel: 0,
  }
  const resolvedTarget = { ...(overrides.target ?? target) }
  let liveDigest = overrides.liveDigest ?? resolvedTarget.configDigest
  const ops: Fake = {
    calls,
    history,
    nowMs: overrides.nowMs ?? (() => Date.now()),
    sleep: overrides.sleep ?? abortableSleep,
    log: overrides.log ?? (() => undefined),
    async resolveTarget(request, signal) {
      calls.order.push("resolveTarget")
      calls.resolveTarget += 1
      if (overrides.resolveTarget) return overrides.resolveTarget(request, signal)
      return { ...resolvedTarget }
    },
    async readShipConfig(next) {
      calls.order.push("readShipConfig")
      if (overrides.readShipConfig) return overrides.readShipConfig(next)
      if (overrides.config === undefined && "config" in overrides) {
        return overrides.config as unknown as ShipConfig
      }
      if (next.configDigest !== liveDigest) {
        throw new ShipError("CONFIG_CHANGED", "digest do catálogo mudou", emptyShipEffects())
      }
      return overrides.config ?? shipConfig
    },
    async readProofQuery(next) {
      calls.order.push("readProofQuery")
      if (overrides.readProofQuery) return overrides.readProofQuery(next)
      return {
        ...query,
        executionCwd: next.executionCwd,
        headSha: next.headSha,
        baseSha: next.baseSha,
      }
    },
    async readHistory(next) {
      calls.order.push("readHistory")
      if (overrides.readHistory) return overrides.readHistory(next)
      return history
    },
    async findPending(next) {
      calls.order.push("findPending")
      if (overrides.findPending) return overrides.findPending(next)
      return overrides.pending
    },
    async enqueue(nextRecipe, nextTarget, signal) {
      calls.order.push("enqueue")
      calls.enqueue.push({ recipe: nextRecipe, target: nextTarget })
      if (overrides.enqueue) return overrides.enqueue(nextRecipe, nextTarget, signal)
      const ticket = { ...valid, id: "job-enqueued" }
      history.push(ticket)
      return { id: ticket.id }
    },
    async waitTicket(id, signal) {
      calls.order.push("waitTicket")
      calls.waitTicket.push(id)
      if (overrides.waitTicket) return overrides.waitTicket(id, signal)
      const ticket = history.find((item) => typeof item === "object" && item !== null && "id" in item && item.id === id)
      return ticket ?? valid
    },
    async readPolicy(next) {
      calls.order.push("readPolicy")
      if (overrides.readPolicy) return overrides.readPolicy(next)
      return overrides.policy ?? "wait"
    },
    async revalidate(next, signal) {
      calls.order.push("revalidate")
      calls.revalidate += 1
      if (overrides.revalidate) return overrides.revalidate(next, signal)
    },
    async attest(next, context, signal) {
      calls.order.push("attest")
      calls.attest.push(context)
      if (overrides.attest) return overrides.attest(next, context, signal)
    },
    async markReady(next, signal) {
      calls.order.push("markReady")
      calls.markReady += 1
      if (overrides.markReady) return overrides.markReady(next, signal)
    },
    async observeVerdict(input, signal) {
      calls.order.push("observeVerdict")
      if (overrides.observeVerdict) return overrides.observeVerdict(input, signal)
      const run = "verdict" in overrides ? overrides.verdict : causalRun
      if (run) calls.observeVerdict.push(run)
      return run
    },
    async dispatchVerdict(input, signal) {
      calls.order.push("dispatchVerdict")
      calls.dispatchVerdict += 1
      if (overrides.dispatchVerdict) return overrides.dispatchVerdict(input, signal)
    },
    async mergePinned(next, signal) {
      calls.order.push("mergePinned")
      calls.mergePinned.push(next)
      if (overrides.mergePinned) return overrides.mergePinned(next, signal)
      return { merged: true, sha: MERGE }
    },
    async inspectMerge(next, signal) {
      calls.order.push("inspectMerge")
      calls.inspectMerge += 1
      if (overrides.inspectMerge) return overrides.inspectMerge(next, signal)
      return {
        merged: true,
        sha: MERGE,
        parents: [next.baseSha, next.headSha],
        treeMatchesHead: true,
      }
    },
  }
  return ops
}

function request(partial: Partial<ShipRequest> = {}): ShipRequest {
  return { dryRun: false, noRemote: false, remote: false, timeoutMs: 5_000, ...partial }
}

async function expectShipError(work: () => Promise<unknown>, code: string): Promise<ShipError> {
  try {
    await work()
    throw new Error(`expected ShipError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ShipError)
    const shipError = error as ShipError
    expect(shipError.code).toBe(code)
    return shipError
  }
}

function expectNoMutation(fake: Fake) {
  expect(fake.calls.enqueue).toEqual([])
  expect(fake.calls.attest).toEqual([])
  expect(fake.calls.markReady).toBe(0)
  expect(fake.calls.dispatchVerdict).toBe(0)
  expect(fake.calls.mergePinned).toEqual([])
  expect(fake.calls.waitTicket).toEqual([])
  expect(fake.calls.cancel).toBe(0)
}

describe("runShip", () => {
  it("dry-run without proof returns LOCAL_RED after resolveTarget and does not mutate", async () => {
    const fake = createFake({ history: [] })
    const error = await expectShipError(() => runShip(fake, request({ dryRun: true })), "LOCAL_RED")
    expect(fake.calls.resolveTarget).toBe(1)
    expect(error.effects.merged).toBe(false)
    expectNoMutation(fake)
  })

  it("dry-run with an eligible ticket reuses it and does not mutate", async () => {
    const fake = createFake({ history: [valid] })
    const report = await runShip(fake, request({ dryRun: true }))
    expect(report.dryRun).toBe(true)
    expect(report.guarantee).toBe("head-pinned-base-observed")
    expect(report.effects.reused).toBe(true)
    expect(report.effects.ticketId).toBe("job-proof")
    expect(report.effects.merged).toBe(false)
    expect(report.effects.attested).toBe(false)
    expectNoMutation(fake)
  })

  it("does not attest or merge a passed test with unverified finalization", async () => {
    const sample = JSON.parse(readFileSync(new URL("../fixtures/finalization-completion.json", import.meta.url), "utf8"))[0]
    const hooked = { ...valid, schemaVersion: 4, finalization: JSON.parse(sample.terminalBytes).finalization, finalizationDigest: sample.record.finalizationDigest }
    const fake = createFake({ history: [hooked] })
    await expectShipError(() => runShip(fake, request({ dryRun: true })), "LOCAL_RED")
    expectNoMutation(fake)
  })

  it("dry-run uses findEligibleTicket so a later canonical red is not reused", async () => {
    expect(isShipEligibleTicket(valid, query)).toBe(true)
    const fake = createFake({ history: [valid, laterFailed] })
    await expectShipError(() => runShip(fake, request({ dryRun: true })), "LOCAL_RED")
    expectNoMutation(fake)
  })

  it("does not attest when repo, PR, HEAD or base diverged on revalidate", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async revalidate() {
        throw new ShipError("TARGET_CHANGED", "alvo divergiu", emptyShipEffects())
      },
    })
    await expectShipError(() => runShip(fake, request()), "TARGET_CHANGED")
    expect(fake.calls.attest).toEqual([])
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("refuses when the config digest changes between lookup and readShipConfig", async () => {
    const fake = createFake({
      history: [valid],
      async readShipConfig(next) {
        if (next.configDigest === "digest-1") {
          throw new ShipError("CONFIG_CHANGED", "digest do catálogo mudou", emptyShipEffects())
        }
        return shipConfig
      },
    })
    await expectShipError(() => runShip(fake, request({ dryRun: true })), "CONFIG_CHANGED")
    expect(fake.calls.resolveTarget).toBe(1)
    expect(fake.calls.enqueue).toEqual([])
  })

  it("wait timeout reports ticketId, does not cancel, and does not enqueue again", async () => {
    const fake = createFake({
      history: [],
      async waitTicket(_id, signal) {
        return sleepUntilAbort(signal)
      },
    })
    const error = await expectShipError(() => runShip(fake, request({ timeoutMs: 40 })), "WAIT_TIMEOUT")
    expect(error.effects.ticketId).toBe("job-enqueued")
    expect(fake.calls.enqueue).toHaveLength(1)
    expect(fake.calls.cancel).toBe(0)
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("waits on a compatible pending ticket instead of enqueueing another", async () => {
    const pending = { ...valid, id: "job-pending", status: "running" as const }
    const fake = createFake({
      history: [pending],
      pending: { id: "job-pending" },
      policy: "skipped",
      async waitTicket(id) {
        const done = { ...valid, id }
        fake.history.splice(0, fake.history.length, done)
        return done
      },
    })
    const report = await runShip(fake, request())
    expect(fake.calls.waitTicket).toEqual(["job-pending"])
    expect(fake.calls.enqueue).toEqual([])
    expect(report.effects.ticketId).toBe("job-pending")
    expect(report.effects.merged).toBe(true)
    expect(report.effects.mergeVerified).toBe(true)
  })

  it("rejects a missing ship block before enqueue", async () => {
    const fake = createFake({ history: [], config: undefined })
    await expectShipError(() => runShip(fake, request()), "SHIP_CONFIG")
    expect(fake.calls.enqueue).toEqual([])
  })

  it("rejects wait policy without a remote verdict workflow before enqueue", async () => {
    const fake = createFake({
      history: [],
      policy: "wait",
      config: { acceptedPresets: ["check"], attestationContext: "local/check" },
    })
    await expectShipError(() => runShip(fake, request()), "SHIP_CONFIG")
    expect(fake.calls.enqueue).toEqual([])
  })

  it("treats attest failure in wait as ATTESTATION_FAILED", async () => {
    const fake = createFake({
      history: [valid],
      policy: "wait",
      async attest() {
        throw new Error("status 403")
      },
    })
    await expectShipError(() => runShip(fake, request()), "ATTESTATION_FAILED")
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("records an attestation limitation in skipped mode and still merges after Git/PR guards", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async attest() {
        throw new Error("status 403")
      },
    })
    const report = await runShip(fake, request())
    expect(report.policy).toBe("skipped")
    expect(report.limitation).toBe("attestation-failed")
    expect(report.effects.attested).toBe(false)
    expect(fake.calls.revalidate).toBeGreaterThanOrEqual(2)
    expect(fake.calls.mergePinned).toHaveLength(1)
    expect(report.effects.merged).toBe(true)
    expect(report.effects.mergeVerified).toBe(true)
  })

  it("attests a draft then marks it ready", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      target: { ...target, isDraft: true },
    })
    const report = await runShip(fake, request())
    expect(fake.calls.order.indexOf("attest")).toBeGreaterThan(-1)
    expect(fake.calls.order.indexOf("markReady")).toBeGreaterThan(fake.calls.order.indexOf("attest"))
    expect(report.effects.markedReady).toBe(true)
    expect(report.effects.attested).toBe(true)
  })

  it("returns REMOTE_IN_PROGRESS without a second executor when already ready, wait, and remote is running", async () => {
    const fake = createFake({
      history: [],
      policy: "wait",
      verdict: {
        ...causalRun,
        status: "in_progress",
        conclusion: null,
      },
    })
    const error = await expectShipError(() => runShip(fake, request()), "REMOTE_IN_PROGRESS")
    expect(error.effects.run).toEqual({ id: 88, attempt: 1 })
    expect(fake.calls.enqueue).toEqual([])
    expect(fake.calls.dispatchVerdict).toBe(0)
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("does not dispatch after marking ready when the first polls are empty", async () => {
    let polls = 0
    const fake = createFake({
      history: [valid],
      target: { ...target, isDraft: true },
      sleep: async (ms, signal) => {
        if (ms === 5_000) {
          if (signal.aborted) throw abortError()
          return
        }
        return sleepUntilAbort(signal)
      },
      async observeVerdict() {
        polls += 1
        return polls === 1 ? undefined : causalRun
      },
    })
    const report = await runShip(fake, request({ timeoutMs: 60_000 }))
    expect(fake.calls.markReady).toBe(1)
    expect(fake.calls.dispatchVerdict).toBe(0)
    expect(report.effects.merged).toBe(true)
  })

  it("dispatches once for an already-ready PR when no causal run exists yet", async () => {
    let polls = 0
    const fake = createFake({
      history: [valid],
      async observeVerdict() {
        polls += 1
        return polls === 1 ? undefined : causalRun
      },
    })
    const report = await runShip(fake, request())
    expect(fake.calls.markReady).toBe(0)
    expect(fake.calls.dispatchVerdict).toBe(1)
    expect(report.effects.merged).toBe(true)
  })

  it("inspects the PR when merge HTTP is non-success instead of reporting merged false", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async mergePinned() {
        return { merged: false }
      },
    })
    const report = await runShip(fake, request())
    expect(fake.calls.inspectMerge).toBeGreaterThanOrEqual(1)
    expect(report.effects.merged).toBe(true)
    expect(report.effects.mergeVerified).toBe(true)
  })

  it("inspects an already-merged PR without new proof", async () => {
    const fake = createFake({
      history: [],
      target: { ...target, alreadyMerged: true },
    })
    const report = await runShip(fake, request())
    expect(fake.calls.enqueue).toEqual([])
    expect(fake.calls.attest).toEqual([])
    expect(fake.calls.dispatchVerdict).toBe(0)
    expect(report.effects.merged).toBe(true)
    expect(report.effects.mergeVerified).toBe(true)
  })

  it("rejects timeoutMs of 0", async () => {
    const fake = createFake({ history: [valid] })
    await expectShipError(() => runShip(fake, request({ timeoutMs: 0 })), "USAGE")
    expectNoMutation(fake)
  })

  it("does not treat another PR, base, or HEAD success as the causal run", async () => {
    const bads: VerdictRun[] = [
      { ...causalRun, pr: 99 },
      { ...causalRun, baseSha: "c".repeat(40) },
      { ...causalRun, attempt: 1, headSha: "d".repeat(40) },
    ]
    for (const verdict of bads) {
      const fake = createFake({
        history: [valid],
        policy: "wait",
        verdict,
      })
      const error = await expectShipError(() => runShip(fake, request({ timeoutMs: 40 })), "REMOTE_RUN_MISSING")
      expect(fake.calls.mergePinned).toEqual([])
      expect(error.effects.merged).toBe(false)
    }
  })

  it("reports REMOTE_RED for a causal skipped or neutral conclusion", async () => {
    for (const conclusion of ["skipped", "neutral"] as const) {
      const fake = createFake({
        history: [valid],
        policy: "wait",
        verdict: { ...causalRun, conclusion },
      })
      await expectShipError(() => runShip(fake, request()), "REMOTE_RED")
      expect(fake.calls.mergePinned).toEqual([])
    }
  })

  it("treats any B0 change on revalidate as BASE_MOVED and does not POST merge", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async revalidate() {
        if (fake.calls.revalidate >= 2) {
          throw new ShipError("BASE_MOVED", "B0 mudou", emptyShipEffects())
        }
      },
    })
    await expectShipError(() => runShip(fake, request()), "BASE_MOVED")
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("pins merge to frozen HEAD without --admin and inspects before retrying a timed-out merge", async () => {
    const source = readFileSync(fileURLToPath(new URL("../../src/ship/ship.ts", import.meta.url)), "utf8")
    expect(source).not.toMatch(/--admin/)
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async mergePinned(next, signal) {
        expect(next.headSha).toBe(H)
        return sleepUntilAbort(signal)
      },
      async inspectMerge() {
        expect(fake.calls.mergePinned).toHaveLength(1)
        return { merged: "unknown" }
      },
    })
    const error = await expectShipError(() => runShip(fake, request({ timeoutMs: 40 })), "MERGE_OUTCOME_UNKNOWN")
    expect(error.effects.merged).toBe("unknown")
    expect(error.effects.mergeVerified).toBe(false)
    expect(fake.calls.inspectMerge).toBe(1)
    expect(fake.calls.mergePinned).toHaveLength(1)
    expect(fake.calls.order.indexOf("inspectMerge")).toBeGreaterThan(fake.calls.order.indexOf("mergePinned"))
  })

  it("reports MERGED_BASE_CHANGED when first parent is not B0 after a successful merge", async () => {
    const other = "c".repeat(40)
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async inspectMerge(next) {
        return {
          merged: true,
          sha: MERGE,
          parents: [other, next.headSha],
          treeMatchesHead: true,
        }
      },
    })
    const error = await expectShipError(() => runShip(fake, request()), "MERGED_BASE_CHANGED")
    expect(error.effects.merged).toBe(true)
    expect(error.effects.mergeVerified).toBe(false)
    expect(error.mergeSha).toBe(MERGE)
    expect(fake.calls.mergePinned[0]?.headSha).toBe(H)
  })

  it("does not set markedReady when markReady leaves the PR draft", async () => {
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      target: { ...target, isDraft: true },
      async markReady() {
        throw new ShipError("READY_FAILED", "PR permanece draft após gh pr ready", emptyShipEffects())
      },
    })
    const error = await expectShipError(() => runShip(fake, request()), "READY_FAILED")
    expect(error.effects.markedReady).toBe(false)
    expect(error.effects.attested).toBe(true)
    expect(error.effects.merged).toBe(false)
    expect(fake.calls.mergePinned).toEqual([])
  })

  it("rejects --remote together with --no-remote", async () => {
    const fake = createFake({ history: [valid], policy: "wait" })
    const error = await expectShipError(
      () => runShip(fake, request({ remote: true, noRemote: true })),
      "USAGE",
    )
    expect(error.message).toMatch(/juntos/)
  })

  it("forces wait when --remote is set regardless of skipped file policy", async () => {
    let polls = 0
    const fake = createFake({
      history: [valid],
      policy: "skipped",
      async observeVerdict() {
        polls += 1
        return polls === 1 ? undefined : causalRun
      },
    })
    const report = await runShip(fake, request({ remote: true, timeoutMs: 60_000 }))
    expect(report.policy).toBe("wait")
    expect(fake.calls.dispatchVerdict).toBe(1)
    expect(report.effects.merged).toBe(true)
  })
})
