import type { ShipConfig } from "../contracts/schema.js"
import type { AcceptedRecipe, ShipProofQuery } from "./eligibility.js"

export type ShipTarget = {
  host: "github.com"
  repo: string
  repositoryId: number
  pr: number
  headBranch: string
  headSha: string
  baseBranch: string
  baseSha: string
  executionCwd: string
  configPath: string
  configDigest: string
  isDraft: boolean
}

export type MergeState = false | true | "unknown"

export type ShipEffects = {
  ticketId?: string
  reused: boolean
  attested: boolean
  markedReady: boolean
  run?: { id: number; attempt: number }
  merged: MergeState
  mergeVerified: boolean
}

export type ShipRequest = {
  dryRun: boolean
  noRemote: boolean
  timeoutMs: number
  pr?: number
  repo?: string
}

export type ShipReport = {
  target: ShipTarget
  policy: "wait" | "skipped"
  effects: ShipEffects
  dryRun: boolean
  mergeSha?: string
  guarantee: "head-pinned-base-observed"
  limitation?: string
}

export type VerdictRequest = {
  target: ShipTarget
  workflow: string
  job: string
  requestId?: string
}

export type VerdictRun = {
  id: number
  attempt: number
  pr: number
  headSha: string
  baseSha: string
  workflow: string
  job: string
  status: string
  conclusion: string | null
}

export type ShipOps = {
  nowMs(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  log(message: string): void
  resolveTarget(request: ShipRequest, signal: AbortSignal): Promise<ShipTarget>
  readShipConfig(target: ShipTarget): Promise<ShipConfig>
  readProofQuery(target: ShipTarget): Promise<ShipProofQuery>
  readHistory(query: ShipProofQuery): Promise<unknown[]>
  findPending(query: ShipProofQuery): Promise<{ id: string } | undefined>
  enqueue(recipe: AcceptedRecipe, target: ShipTarget, signal: AbortSignal): Promise<{ id: string }>
  waitTicket(id: string, signal: AbortSignal): Promise<unknown>
  readPolicy(target: ShipTarget): Promise<"wait" | "skipped">
  revalidate(target: ShipTarget, signal: AbortSignal): Promise<void>
  attest(target: ShipTarget, context: string, signal: AbortSignal): Promise<void>
  markReady(target: ShipTarget, signal: AbortSignal): Promise<void>
  observeVerdict(input: VerdictRequest, signal: AbortSignal): Promise<VerdictRun | undefined>
  dispatchVerdict(input: VerdictRequest, signal: AbortSignal): Promise<void>
  mergePinned(target: ShipTarget, signal: AbortSignal): Promise<{ merged: boolean; sha?: string }>
  inspectMerge(target: ShipTarget, signal: AbortSignal): Promise<{
    merged: MergeState
    sha?: string
    parents?: string[]
    treeMatchesHead?: boolean
  }>
}

export class ShipError extends Error {
  readonly code: string
  readonly effects: ShipEffects
  readonly mergeSha?: string

  constructor(code: string, message: string, effects: ShipEffects, mergeSha?: string) {
    super(message)
    this.name = "ShipError"
    this.code = code
    this.effects = effects
    if (mergeSha !== undefined) this.mergeSha = mergeSha
  }
}

export function emptyShipEffects(): ShipEffects {
  return {
    reused: false,
    attested: false,
    markedReady: false,
    merged: false,
    mergeVerified: false,
  }
}
