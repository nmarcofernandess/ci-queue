import { findEligibleTicket, type AcceptedRecipe, type ShipProofQuery } from "./eligibility.js"
import type { ShipConfig } from "../contracts/schema.js"
import {
  ShipError,
  emptyShipEffects,
  type MergeState,
  type ShipEffects,
  type ShipOps,
  type ShipReport,
  type ShipRequest,
  type ShipTarget,
  type VerdictRequest,
  type VerdictRun,
} from "./ops.js"

const VERDICT_POLL_MS = 5_000

type Phase = "setup" | "wait" | "attest" | "verdict" | "merge"

function abortError(): Error {
  const error = new Error("The operation was aborted.")
  error.name = "AbortError"
  return error
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("name" in error && error.name === "AbortError") return true
  return "code" in error && error.code === "ABORT_ERR"
}

function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true })
  })
}

function freezeTarget(target: ShipTarget): ShipTarget {
  return Object.freeze({
    host: target.host,
    repo: target.repo,
    repositoryId: target.repositoryId,
    pr: target.pr,
    headBranch: target.headBranch,
    headSha: target.headSha,
    baseBranch: target.baseBranch,
    baseSha: target.baseSha,
    executionCwd: target.executionCwd,
    configPath: target.configPath,
    configDigest: target.configDigest,
    isDraft: target.isDraft,
  })
}

function isUsableShipConfig(value: unknown): value is ShipConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const config = value as ShipConfig
  return Array.isArray(config.acceptedPresets)
    && config.acceptedPresets.length > 0
    && typeof config.attestationContext === "string"
    && config.attestationContext.length > 0
}

function snapshot(effects: ShipEffects): ShipEffects {
  return {
    reused: effects.reused,
    attested: effects.attested,
    markedReady: effects.markedReady,
    merged: effects.merged,
    mergeVerified: effects.mergeVerified,
    ...(effects.ticketId !== undefined ? { ticketId: effects.ticketId } : {}),
    ...(effects.run !== undefined ? { run: { ...effects.run } } : {}),
  }
}

function rethrow(error: unknown, effects: ShipEffects): never {
  if (error instanceof ShipError) {
    throw new ShipError(error.code, error.message, { ...error.effects, ...snapshot(effects) }, error.mergeSha)
  }
  throw error
}

function fail(code: string, message: string, effects: ShipEffects, mergeSha?: string): never {
  throw new ShipError(code, message, snapshot(effects), mergeSha)
}

function isCausalTuple(
  run: VerdictRun,
  target: ShipTarget,
  remote: { workflow: string; job: string },
): boolean {
  return run.pr === target.pr
    && run.headSha === target.headSha
    && run.baseSha === target.baseSha
    && run.workflow === remote.workflow
    && run.job === remote.job
}

function isInProgress(run: VerdictRun): boolean {
  if (run.status === "completed" || run.status === "success" || run.status === "failure") return false
  return run.status === "in_progress"
    || run.status === "queued"
    || run.status === "waiting"
    || run.status === "requested"
    || run.status === "pending"
    || run.conclusion === null
}

function isCausalSuccess(
  run: VerdictRun,
  target: ShipTarget,
  remote: { workflow: string; job: string },
): boolean {
  return isCausalTuple(run, target, remote)
    && (run.status === "completed" || run.status === "success")
    && run.conclusion === "success"
}

function isUnusableVerdict(
  run: VerdictRun,
  target: ShipTarget,
  remote: { workflow: string; job: string },
): boolean {
  const badConclusion = run.conclusion === "skipped"
    || run.conclusion === "neutral"
    || run.conclusion === "cancelled"
    || run.conclusion === "failure"
    || run.conclusion === "timed_out"
  if (isCausalTuple(run, target, remote) && badConclusion) return true
  if ((run.status === "completed" || run.status === "success") && !isCausalSuccess(run, target, remote)) return true
  return false
}

async function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError()
  return Promise.race([work, whenAborted(signal)])
}

export async function runShip(ops: ShipOps, request: ShipRequest): Promise<ShipReport> {
  const controller = new AbortController()
  const signal = controller.signal
  let done = false
  const watchdog = ops.sleep(request.timeoutMs, signal).then(
    () => {
      if (!done) controller.abort()
    },
    () => undefined,
  )

  try {
    return await orchestrate(ops, request, signal)
  } finally {
    done = true
    controller.abort()
    await watchdog
  }
}

async function orchestrate(ops: ShipOps, request: ShipRequest, signal: AbortSignal): Promise<ShipReport> {
  const effects = emptyShipEffects()
  let phase: Phase = "setup"
  let limitation: string | undefined
  let mergeSha: string | undefined

  const failAbort = (): never => {
    if (phase === "wait") fail("WAIT_TIMEOUT", "tempo esgotado aguardando o ticket", effects)
    if (phase === "merge") fail("MERGE_OUTCOME_UNKNOWN", "resultado do merge ambíguo", { ...snapshot(effects), merged: "unknown" })
    if (phase === "verdict") fail("REMOTE_RUN_MISSING", "execução remota causal ausente", effects)
    if (phase === "attest") fail("ATTESTATION_FAILED", "falha na atestação", effects)
    fail("WAIT_TIMEOUT", "tempo esgotado", effects)
  }

  const guard = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await raceAbort(work, signal)
    } catch (error) {
      if (isAbortError(error) || signal.aborted) failAbort()
      throw error
    }
  }

  try {
    const frozen = freezeTarget(await guard(ops.resolveTarget(request, signal)))

    let configRaw: unknown
    try {
      configRaw = await ops.readShipConfig(frozen)
    } catch (error) {
      rethrow(error, effects)
    }
    if (!isUsableShipConfig(configRaw)) {
      fail("SHIP_CONFIG", "bloco ship ausente ou incompleto", effects)
    }
    const config = configRaw

    const filePolicy = await ops.readPolicy(frozen)
    const policy = request.noRemote ? "skipped" : filePolicy
    if (policy === "wait" && !config.remoteVerdict) {
      fail("SHIP_CONFIG", "wait exige remoteVerdict.workflow", effects)
    }

    const query = await ops.readProofQuery(frozen)
    if (query.acceptedRecipes.length === 0) {
      fail("SHIP_CONFIG", "ship.acceptedPresets vazio", effects)
    }

    const report = (extra: Partial<ShipReport> = {}): ShipReport => ({
      target: frozen,
      policy,
      effects: snapshot(effects),
      dryRun: request.dryRun,
      guarantee: "head-pinned-base-observed",
      ...(limitation ? { limitation } : {}),
      ...(mergeSha ? { mergeSha } : {}),
      ...extra,
    })

    const history = await ops.readHistory(query)
    let ticket = findEligibleTicket(history, query)
    if (request.dryRun) {
      if (!ticket) fail("LOCAL_RED", "não há prova local reutilizável", effects)
      effects.ticketId = ticket.id
      effects.reused = true
      return report()
    }

    if (!ticket) {
      const pending = await ops.findPending(query)
      if (pending) {
        effects.ticketId = pending.id
        effects.reused = true
        phase = "wait"
        await guard(ops.waitTicket(pending.id, signal))
        ticket = findEligibleTicket(await ops.readHistory(query), query)
      } else {
        if (!frozen.isDraft && policy === "wait" && config.remoteVerdict) {
          const existing = await guard(ops.observeVerdict(verdictRequest(frozen, config), signal))
          if (existing && isCausalTuple(existing, frozen, config.remoteVerdict) && isInProgress(existing)) {
            effects.run = { id: existing.id, attempt: existing.attempt }
            fail("REMOTE_IN_PROGRESS", "execução remota já em andamento", effects)
          }
        }
        const recipe = firstRecipe(query)
        phase = "wait"
        const enqueued = await guard(ops.enqueue(recipe, frozen, signal))
        effects.ticketId = enqueued.id
        await guard(ops.waitTicket(enqueued.id, signal))
        ticket = findEligibleTicket(await ops.readHistory(query), query)
      }
    } else {
      effects.ticketId = ticket.id
      effects.reused = true
    }

    if (!ticket) fail("LOCAL_RED", "não há prova local reutilizável", effects)

    phase = "setup"
    try {
      await guard(ops.revalidate(frozen, signal))
    } catch (error) {
      rethrow(error, effects)
    }

    phase = "attest"
    try {
      await guard(ops.attest(frozen, config.attestationContext, signal))
      effects.attested = true
    } catch (error) {
      if (isAbortError(error) || signal.aborted) failAbort()
      if (policy === "wait") fail("ATTESTATION_FAILED", "falha na atestação", effects)
      limitation = "attestation-failed"
    }

    if (frozen.isDraft) {
      await guard(ops.markReady(frozen, signal))
      effects.markedReady = true
    }

    if (policy === "wait" && config.remoteVerdict) {
      phase = "verdict"
      try {
        const run = await waitForCausalVerdict(ops, frozen, config.remoteVerdict, signal, guard, effects)
        effects.run = { id: run.id, attempt: run.attempt }
      } catch (error) {
        rethrow(error, effects)
      }
    }

    phase = "setup"
    try {
      await guard(ops.revalidate(frozen, signal))
    } catch (error) {
      rethrow(error, effects)
    }

    phase = "merge"
    const merged = await mergePinnedHonestly(ops, frozen, signal, effects)
    mergeSha = merged.sha
    effects.merged = merged.merged
    effects.mergeVerified = merged.mergeVerified
    if (merged.mergeSha) mergeSha = merged.mergeSha
    return report({ mergeSha })
  } catch (error) {
    if (error instanceof ShipError) throw error
    if (isAbortError(error) || signal.aborted) failAbort()
    throw error
  }
}

function firstRecipe(query: ShipProofQuery): AcceptedRecipe {
  const recipe = query.acceptedRecipes[0]
  if (!recipe) {
    throw new ShipError("SHIP_CONFIG", "ship.acceptedPresets vazio", emptyShipEffects())
  }
  return recipe
}

function verdictRequest(target: ShipTarget, config: ShipConfig): VerdictRequest {
  const remote = config.remoteVerdict
  if (!remote) {
    throw new ShipError("SHIP_CONFIG", "wait exige remoteVerdict.workflow", emptyShipEffects())
  }
  return { target, workflow: remote.workflow, job: remote.job }
}

async function waitForCausalVerdict(
  ops: ShipOps,
  target: ShipTarget,
  remote: { workflow: string; job: string },
  signal: AbortSignal,
  guard: <T>(work: Promise<T>) => Promise<T>,
  effects: ShipEffects,
): Promise<VerdictRun> {
  const input: VerdictRequest = { target, workflow: remote.workflow, job: remote.job }
  let dispatched = false
  for (;;) {
    const run = await guard(ops.observeVerdict(input, signal))
    if (run && isCausalSuccess(run, target, remote)) return run
    if (run && isUnusableVerdict(run, target, remote)) {
      throw new ShipError("REMOTE_RED", "veredito remoto não atende o alvo congelado", snapshot(effects))
    }
    if (run && isCausalTuple(run, target, remote) && isInProgress(run)) {
      await guard(ops.sleep(VERDICT_POLL_MS, signal))
      continue
    }
    if (!dispatched) {
      await guard(ops.dispatchVerdict({ ...input, requestId: crypto.randomUUID() }, signal))
      dispatched = true
      continue
    }
    await guard(ops.sleep(VERDICT_POLL_MS, signal))
  }
}

async function mergePinnedHonestly(
  ops: ShipOps,
  target: ShipTarget,
  signal: AbortSignal,
  effects: ShipEffects,
): Promise<{ merged: MergeState; mergeVerified: boolean; sha?: string; mergeSha?: string }> {
  let inspect: Awaited<ReturnType<ShipOps["inspectMerge"]>> | undefined
  let posted: { merged: boolean; sha?: string } | undefined
  const inspectSignal = () => new AbortController().signal

  try {
    posted = await raceAbort(ops.mergePinned(target, signal), signal)
  } catch (error) {
    if (error instanceof ShipError) throw error
    if (!(isAbortError(error) || signal.aborted)) rethrow(error, effects)
    inspect = await ops.inspectMerge(target, inspectSignal())
    if (inspect.merged === true) {
      posted = { merged: true, sha: inspect.sha }
    } else if (inspect.merged === "unknown") {
      fail("MERGE_OUTCOME_UNKNOWN", "resultado do merge ambíguo", { ...snapshot(effects), merged: "unknown" }, inspect.sha)
    } else {
      try {
        posted = await ops.mergePinned(target, inspectSignal())
      } catch {
        inspect = await ops.inspectMerge(target, inspectSignal())
        if (inspect.merged === true) {
          posted = { merged: true, sha: inspect.sha }
        } else {
          fail(
            "MERGE_OUTCOME_UNKNOWN",
            "resultado do merge ambíguo",
            { ...snapshot(effects), merged: "unknown" },
            inspect.sha,
          )
        }
      }
    }
  }

  if (!posted?.merged && inspect === undefined) {
    fail("MERGE_REFUSED", "o servidor recusou o merge", { ...snapshot(effects), merged: false })
  }

  if (!inspect) inspect = await ops.inspectMerge(target, signal)
  const sha = inspect.sha ?? posted?.sha
  if (inspect.merged === "unknown") {
    fail("MERGE_OUTCOME_UNKNOWN", "resultado do merge ambíguo", { ...snapshot(effects), merged: "unknown" }, sha)
  }
  if (inspect.merged !== true && posted?.merged !== true) {
    fail("MERGE_REFUSED", "o servidor recusou o merge", { ...snapshot(effects), merged: false }, sha)
  }

  const first = inspect.parents?.[0]
  if (first !== target.baseSha) {
    fail(
      "MERGED_BASE_CHANGED",
      "merge ocorreu sobre outra base",
      { ...snapshot(effects), merged: true, mergeVerified: false },
      sha,
    )
  }
  const second = inspect.parents?.[1]
  if (second !== target.headSha || inspect.treeMatchesHead !== true) {
    fail(
      "MERGED_BASE_CHANGED",
      "merge ocorreu sobre outra base",
      { ...snapshot(effects), merged: true, mergeVerified: false },
      sha,
    )
  }
  return { merged: true, mergeVerified: true, sha, mergeSha: sha }
}
