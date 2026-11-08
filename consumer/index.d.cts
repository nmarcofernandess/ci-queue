export type Executor = 'direct' | 'queue'
export type ExecutorReason = 'explicit' | 'environment' | 'host-without-queue' | 'catalog' | 'default'
export type QueueHost = { installed: boolean; evidence: string }
export type ResolvedExecutor = { executor: Executor; reason: ExecutorReason; detail: string }
export type ConsumerGuide = {
  consumerApiVersion: 1
  features: string[]
  project: { id: string; name: string }
  root: string
  executor: ResolvedExecutor & { host: QueueHost; override: string }
  verify: { entry: string; entryArgv?: string[]; recipes: Array<{ name: string; note: string; shipProof: boolean }> }
  integrate: { entry: string | null; proofRecipes: string[]; notes: string[] }
  teachings: { tool: string[]; repository: string[] }
  missing: string[]
}
export declare const CONSUMER_API_VERSION: 1
export declare const CONSUMER_FEATURES: readonly string[]
export declare const HOST_EXECUTOR_ENV: 'CI_QUEUE_EXECUTOR'
export declare const GENERIC_TEACHINGS: readonly string[]
export declare function selectExecutor(input?: { explicit?: Executor; environment?: string; configured?: Executor; fallback?: Executor }): Executor
export declare function detectQueueHost(input?: { env?: Record<string, string | undefined>; command?: string; home?: string }): QueueHost
export declare function resolveExecutor(input?: { explicit?: Executor; environment?: string; configured?: Executor; host?: QueueHost }): ResolvedExecutor
export declare function appendRecipeArgs(argv: readonly string[], extraArgs: readonly string[]): string[]
export declare function buildGuide(input: { config: unknown; root: string; env?: Record<string, string | undefined>; home?: string }): ConsumerGuide
export declare function formatGuide(guide: ConsumerGuide): string

/** Counts describe one engine scope; populations are never summed as unique cases. */
export type ExecutionPopulation = {
  scope: string
  unit: string
  project?: string
  profile?: string
  selected: number
  started?: number
  attempts?: number
  outcomes?: Partial<Record<'passed' | 'failed' | 'skipped' | 'interrupted' | 'unreached', number>>
}
export type ExecutionSelection = { state: 'unknown'; reason: string } | { state: 'known'; populations: ExecutionPopulation[] }
export type ExecutionPolicy = { scope: string; mode?: 'collect' | 'stop'; workers?: number; retries?: number; maxFailures?: number }
export type ExecutionFacts = {
  phase: 'resolved' | 'selected' | 'finished'
  recipe: { name: string; note?: string; selectors?: string[] }
  executor: { effective: ResolvedExecutor; baseline: ResolvedExecutor; host: QueueHost }
  selection: ExecutionSelection
  policies?: ExecutionPolicy[]
  context?: string[]
  effects?: string[]
  results?: string[]
  limits?: string[]
}
export type ExecutionDescription = ExecutionFacts & {
  consumerApiVersion: 1
  executor: ExecutionFacts['executor'] & { divergent: boolean }
  policies: ExecutionPolicy[]
  context: string[]
  effects: string[]
  results: string[]
  limits: string[]
}
export declare function buildExecutionDescription(facts: ExecutionFacts): ExecutionDescription
export declare function formatExecutionDescription(description: ExecutionDescription): string
