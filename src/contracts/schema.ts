import { createHash } from "node:crypto"
import { isAbsolute, posix } from "node:path"
import type { RuntimeReceipt } from "./runtime.js"

/**
 * Contratos persistidos do CI Queue. Os tickets v1, v2, v3 e v4 continuam
 * legíveis porque o worker decide a forma executável no momento do claim.
 */

export const API_VERSION = 1 as const
export const TICKET_SCHEMA_VERSION = 4 as const
export const TERMINAL_FINALIZATION_CAPABILITY = "terminal-finalization-v1" as const
export const NO_ARTIFACT_SNAPSHOTS_CAPABILITY = "no-artifact-snapshots-v1" as const
export const RECOVERABLE_FINALIZATION_CAPABILITY = "recoverable-finalization-v1" as const
/** Pause/resume of a running job by command, limited to progress nodes the recipe declares safe. */
export const EXECUTION_PAUSE_CAPABILITY = "execution-pause-v1" as const
/** Free-space guard of the state volume: hold the queue and pause eligible work below a fixed floor. */
export const DISK_GUARD_CAPABILITY = "disk-guard-v1" as const
export const FINALIZATION_JSON_MAX_BYTES = 64 * 1024

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type FinalizationSpec = {
  schemaVersion: 1 | 2
  argv: string[]
  timeoutMs: number
  contract: JsonValue
  contractDigest: string
}
export type FinalizationPhase = "pending" | "running" | "passed" | "failed" | "interrupted"
export type RecoveryDisposition = "none" | "retryable" | "blocked-ownership"
export type FinalizationResult = ({ schemaVersion: 1; recovery?: never } | { schemaVersion: 2; recovery: RecoveryDisposition }) & {
  cleanup: "confirmed" | "not-required" | "uncertain"
  outputs: { path: string; sha256: string; role: string }[]
  error?: string
}
export type FinalizationRecord = {
  schemaVersion: 1
  ticketId: string
  ticketDigest: string
  finalizationDigest: string
  phase: FinalizationPhase
  attempt: number
  startedAt?: string
  finishedAt?: string
  processGroupIdentity?: ProcessGroupIdentity
  supervisorIdentity?: WorkerIdentity
  cancelRequestedAt?: string
  exitCode?: number | null
  failureReason?: string
  result?: FinalizationResult
  recovery?: RecoveryDisposition
  lastQueuedRecoveryTicketId?: string
}

/** Canonical JSON shared by the producer, persisted-ticket reader and supervisor. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>()
  function serialize(item: unknown): string {
    if (item === null || typeof item === "boolean" || typeof item === "string") return JSON.stringify(item)
    if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item)
    if (!item || typeof item !== "object" || ancestors.has(item)) throw new Error("contract precisa ser JSON finito sem ciclos")
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error("contract precisa ser JSON simples")
    }
    ancestors.add(item)
    try {
      if (Array.isArray(item)) {
        return `[${Array.from({ length: item.length }, (_, index) => serialize(item[index])).join(",")}]`
      }
      return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${serialize((item as Record<string, unknown>)[key])}`).join(",")}}`
    } finally {
      ancestors.delete(item)
    }
  }
  return serialize(value)
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex") }

export function normalizeFinalization(value: unknown): FinalizationSpec | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("finalization precisa ser objeto")
  const raw = value as Record<string, unknown>
  if (![1, 2].includes(Number(raw.schemaVersion)) || typeof raw.schemaVersion !== "number") throw new Error("finalization.schemaVersion precisa ser 1 ou 2")
  if (!isValidPresetArgv(raw.argv)) throw new Error("finalization.argv precisa ser não vazio e válido")
  if (typeof raw.timeoutMs !== "number" || !Number.isSafeInteger(raw.timeoutMs) || raw.timeoutMs < 1 || raw.timeoutMs > 2_147_483_647) {
    throw new Error("finalization.timeoutMs inválido")
  }
  const contractJson = canonicalJson(raw.contract)
  if (Buffer.byteLength(contractJson, "utf8") > FINALIZATION_JSON_MAX_BYTES) throw new Error("finalization.contract excede 64 KiB")
  if (raw.contractDigest !== sha256(contractJson)) throw new Error("finalization.contractDigest inválido")
  return {
    schemaVersion: raw.schemaVersion as 1 | 2,
    argv: [...raw.argv],
    timeoutMs: raw.timeoutMs,
    contract: JSON.parse(contractJson) as JsonValue,
    contractDigest: raw.contractDigest as string,
  }
}

/** Seals the complete finalization request, including argv and its independent deadline. */
export function finalizationDigest(spec: FinalizationSpec): string {
  return sha256(canonicalJson(spec))
}

/** Validate protocol data only; publication IO and containment stay in the supervisor. */
export function normalizeFinalizationResult(value: unknown, requiredVersion?: 1 | 2): FinalizationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("resultado da finalização inválido")
  const raw = value as Record<string, unknown>
  const bytes = JSON.stringify(value)
  if (!bytes || Buffer.byteLength(bytes, "utf8") > FINALIZATION_JSON_MAX_BYTES) throw new Error("resultado excede 64 KiB")
  if (Object.keys(raw).some(key => !["schemaVersion", "cleanup", "outputs", "error", ...(raw.schemaVersion === 2 ? ["recovery"] : [])].includes(key))
    || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) || requiredVersion === 2 && raw.schemaVersion !== 2
    || raw.schemaVersion === 2 && ((typeof raw.recovery !== "string" || !["none", "retryable", "blocked-ownership"].includes(raw.recovery)) || raw.cleanup !== "uncertain" && raw.recovery !== "none") || typeof raw.cleanup !== "string"
    || !["confirmed", "not-required", "uncertain"].includes(raw.cleanup) || !Array.isArray(raw.outputs)
    || (raw.error !== undefined && typeof raw.error !== "string")) throw new Error("resultado da finalização inválido")
  const outputs = raw.outputs.map((output: unknown) => {
    if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("resultado outputs inválido")
    const item = output as Record<string, unknown>
    if (Object.keys(item).some(key => !["path", "sha256", "role"].includes(key))
      || typeof item.path !== "string" || !item.path || isAbsolute(item.path)
      || /[\\\0\r\n]/.test(item.path) || item.path.split("/").includes("..") || posix.normalize(item.path).replace(/\/$/, "") === "."
      || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)
      || typeof item.role !== "string" || !item.role.trim()) throw new Error("resultado outputs path/hash/role inválido")
    return { path: item.path, sha256: item.sha256, role: item.role }
  })
  return { ...(raw.schemaVersion === 2 ? { schemaVersion: 2 as const, recovery: raw.recovery as RecoveryDisposition } : { schemaVersion: 1 as const }), cleanup: raw.cleanup as FinalizationResult["cleanup"], outputs,
    ...(raw.error !== undefined ? { error: raw.error as string } : {}) }
}

export function rejectArtifactSnapshots(value: unknown, owner = "artifacts"): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length !== 0) {
    throw new Error(`${owner}: artifacts não é mais suportado; migre a publicação para finalization e mantenha os outputs no consumidor`)
  }
}

export const TERMINAL_STATUSES = ["passed", "failed", "cancelled", "interrupted"] as const
export const JOB_STATUSES = ["queued", "running", ...TERMINAL_STATUSES] as const

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number]
export type JobStatus = (typeof JOB_STATUSES)[number]

export const TICKET_SOURCES = ["queue", "direct-runtime", "direct-cloud"] as const
export type TicketSource = (typeof TICKET_SOURCES)[number]

export type GitInfo = {
  branch: string
  headSha: string
  baseSha: string
  statusShort: string
}

export type TicketFlags = {
  executionTimeoutMs?: number
  requireCleanTree?: boolean
  fetchBase?: string
  requireGitStability?: boolean
  pinHeadSha?: boolean
  abortOnStaleBase?: boolean
  /** Whether this recipe is allowed to emit structured progress markers. */
  progressEnabled?: boolean
  /**
   * Progress node labels whose work has no wall clock (type checks, lint, static
   * checks). A pause acts only while every running leaf node is one of them.
   */
  pauseSafeNodes?: string[]
}

export const PAUSE_SAFE_NODES_MAX = 128

/** Validates the recipe's pause-safe labels; absent means the recipe never pauses. */
export function normalizePauseSafeNodes(value: unknown, owner = "pauseSafeNodes"): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > PAUSE_SAFE_NODES_MAX) {
    throw new Error(`${owner} precisa ser lista não vazia com até ${PAUSE_SAFE_NODES_MAX} rótulos`)
  }
  const labels = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || item.length > 200 || /[\u0000\n\t]/.test(item)) {
      throw new Error(`${owner} contém rótulo inválido`)
    }
    labels.add(item)
  }
  return [...labels]
}

function optionalBoolean(
  value: Record<string, unknown>,
  name: keyof TicketFlags
): boolean | undefined {
  const item = value[name]
  if (item === undefined) return undefined
  if (typeof item !== "boolean") {
    throw new Error(`${name} precisa ser booleano`)
  }
  return item
}

/** Normalizes the only execution controls accepted from a consumer. */
export function normalizeTicketFlags(value: unknown): TicketFlags {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("flags precisa ser um objeto")
  }
  const raw = value as Record<string, unknown>
  const timeout = raw.executionTimeoutMs
  if (
    timeout !== undefined &&
    (typeof timeout !== "number" ||
      !Number.isSafeInteger(timeout) ||
      timeout <= 0 ||
      timeout > 2_147_483_647)
  ) {
    throw new Error("executionTimeoutMs inválido")
  }
  const fetchBase = raw.fetchBase
  if (
    fetchBase !== undefined &&
    (typeof fetchBase !== "string" || !fetchBase.trim() || fetchBase.length > 512)
  ) {
    throw new Error("fetchBase inválido")
  }
  return {
    ...(typeof timeout === "number" ? { executionTimeoutMs: timeout } : {}),
    ...(optionalBoolean(raw, "requireCleanTree") !== undefined
      ? { requireCleanTree: optionalBoolean(raw, "requireCleanTree") }
      : {}),
    ...(typeof fetchBase === "string" ? { fetchBase: fetchBase.trim() } : {}),
    ...(optionalBoolean(raw, "requireGitStability") !== undefined
      ? { requireGitStability: optionalBoolean(raw, "requireGitStability") }
      : {}),
    ...(optionalBoolean(raw, "pinHeadSha") !== undefined
      ? { pinHeadSha: optionalBoolean(raw, "pinHeadSha") }
      : {}),
    ...(optionalBoolean(raw, "abortOnStaleBase") !== undefined
      ? { abortOnStaleBase: optionalBoolean(raw, "abortOnStaleBase") }
      : {}),
    ...(optionalBoolean(raw, "progressEnabled") !== undefined
      ? { progressEnabled: optionalBoolean(raw, "progressEnabled") }
      : {}),
    ...(raw.pauseSafeNodes !== undefined
      ? { pauseSafeNodes: normalizePauseSafeNodes(raw.pauseSafeNodes) }
      : {}),
  }
}

export type ExecutionDeadline =
  | { state: "disabled" }
  | { state: "awaiting_capture" | "capture_unavailable"; timeoutMs: number }
  | { state: "armed" | "completed"; timeoutMs: number; armedAt: string; expiresAt: string }
  | { state: "expired"; timeoutMs: number; armedAt: string; expiresAt: string; expiredAt: string }

export type ProcessGroupIdentity = {
  /** Present on new observations; a different host never owns this group. */
  hostname?: string
  leaderPid: number
  pgid: number
  /** Saída de ps lstart em locale C; protege contra reutilização de PID. */
  startedAt: string
}

export type WorkerIdentity = {
  schemaVersion: 1
  hostname: string
  pid: number
  startedAt: string
  capabilities: string[]
}

/** A process outside the job group that the pause stopped; `startedAt` guards against PID reuse. */
export type FrozenProcess = { pid: number; startedAt: string }

export type PauseSource = "manual" | "auto"

export type PauseWindow = {
  pausedAt: string
  source: PauseSource
  reason: string
  resumedAt?: string
  resumedBy?: PauseSource
}

/**
 * Optional pause record of a running job. `status` stays `running`: readers of
 * the closed status set are unaffected. Only closed windows count in
 * `pausedMsTotal`; the open one ends at `resumedAt`.
 */
export type ExecutionPause = {
  schemaVersion: 1
  state: "paused" | "running"
  windows: PauseWindow[]
  pausedMsTotal: number
  /** Out-of-group descendants stopped by the current window. */
  frozen: FrozenProcess[]
  /** Set on the terminal record when a failure follows a pause window closely. */
  possibleInterference?: boolean
}

export type ResourceEventKind =
  | "disk-low"
  | "disk-critical"
  | "disk-recovered"
  | "paused"
  | "resumed"
  | "not-eligible"
  | "would-pause"
  | "would-resume"

/** What the disk guard saw or did during this job; `mode` tells observation from action. */
export type ResourceEvent = {
  at: string
  kind: ResourceEventKind
  mode: "observe" | "enforce"
  freeBytes?: number
  detail?: string
}

export const RESOURCE_EVENTS_MAX = 40

export type ProcessObservationItem = {
  pid: number
  ppid: number | null
  pgid: number | null
  rssBytes: number | null
  command: string
  startedAt?: string
  cwd?: string
  source?: "host" | "vm"
}

export type ProcessObservation = {
  schemaVersion: 1
  observedAt: string
  coverage: "complete" | "partial" | "unavailable"
  association: "exact" | "observed-cwd" | "unknown"
  items: ProcessObservationItem[]
  capture?: "start" | "end"
  source?: "host" | "vm"
  jobId?: string
  cwd?: string
  reason?: string
}

export const LOCAL_CI_PROGRESS_SCHEMA = 1 as const
export const PROGRESS_STATUSES = ["pending", "running", "passed", "failed", "skipped"] as const
export const PROGRESS_NODE_KINDS = ["stage", "group", "gate", "suite", "case", "artifact"] as const
export const PROGRESS_COUNT_KINDS = ["gates", "suites", "cases", "artifacts", "items"] as const

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number]
export type ProgressNodeKind = (typeof PROGRESS_NODE_KINDS)[number]
export type ProgressCountKind = (typeof PROGRESS_COUNT_KINDS)[number]

export type ProgressCounts = {
  kind: ProgressCountKind
  completed: number
  total: number
  passed: number
  failed: number
  running: number
  pending: number
  skipped: number
}

export type ProgressDurationSource = "emitter" | "collector"
export type ProgressDurationUnavailableReason =
  | "missing-start"
  | "collector-restarted"
  | "clock-invalid"
  | "missing-end"

export type ProgressNode = {
  id: string
  parentId: string | null
  kind: ProgressNodeKind
  label: string
  status: ProgressStatus
  durationMs?: number
  /** Who produced durationMs: emitter TSV value, or collector monotonic observation. */
  durationSource?: ProgressDurationSource
  /** Honest absence — never invent 0 ms when timing could not be established. */
  durationUnavailableReason?: ProgressDurationUnavailableReason
  detail?: ProgressCounts
  retryCount?: number
  /** The predeclared children were replaced by the execution's actual inventory. */
  inventoryReplaced?: boolean
}

export type JobProgress = {
  schema: typeof LOCAL_CI_PROGRESS_SCHEMA
  updatedAt: string | null
  nodes: ProgressNode[]
  /** Producer-confirmed observational variant; never a proof predicate. */
  runVariant?: RunVariant
  /** Retry facts from cases omitted by the presentation budget, keyed by owner node. */
  retrySummary?: Record<string, number>
}

export type RequestContext = {
  provider: string
  packageId: string
  taskId?: string
  invocationId?: string
  sourceRevision?: string
}

/** Persisted ticket: fields added in v2–v4 remain optional for historical readers. */
export type RunVariant = "custom" | "focal"

export const RUN_VARIANTS = ["custom", "focal"] as const

export function parseRunVariant(value: unknown): RunVariant | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !(RUN_VARIANTS as readonly string[]).includes(value)) {
    throw new Error("--run-variant precisa ser custom ou focal")
  }
  return value as RunVariant
}

export type QueueTicket = {
  id: string
  createdAt: string
  status: JobStatus
  preset: string
  cwd: string
  branch: string
  headSha: string
  requestedBy: string
  command: string
  logPath: string
  extraArgs?: string[]
  artifactsPath?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  exitCode?: number | null
  workerPid?: number
  /** Original native claimant, sealed before launch and retained across recovery. */
  producerIdentity?: WorkerIdentity
  childPid?: number
  processGroupIdentity?: ProcessGroupIdentity
  executionDeadline?: ExecutionDeadline
  cancelRequestedAt?: string
  cancelledAt?: string
  failureReason?: string
  cleanupBlockedReason?: string
  preflight?: GitInfo
  postflight?: GitInfo
  schemaVersion?: number
  argv?: string[]
  flags?: TicketFlags
  baseRef?: string
  artifacts?: string[]
  finalization?: FinalizationSpec
  finalizationDigest?: string
  source?: TicketSource
  projectId?: string
  projectName?: string
  progress?: JobProgress
  processObservation?: ProcessObservation
  processObservations?: ProcessObservation[]
  requestContext?: RequestContext
  /** Observational only — never affects ship eligibility. */
  runVariant?: RunVariant
  /** User-space Node guard evidence; never implies an OS sandbox. */
  runtime?: RuntimeReceipt
  /** Pause windows of this execution; durationMs excludes the closed ones. */
  pause?: ExecutionPause
  /** Disk guard observations and actions; observational, never a verdict. */
  resourceEvents?: ResourceEvent[]
}

export type ProjectPreset = TicketFlags & {
  argv: string[]
  artifacts?: string[]
  finalization?: FinalizationSpec
  note?: string
  /** Project-local declaration; persisted as flags.progressEnabled on the ticket. */
  progress?: boolean
}

export type ShipConfig = {
  acceptedPresets: string[]
  attestationContext: string
  remoteVerdict?: { workflow: string; job: string }
}

export type QueueProjectConfig = {
  schemaVersion: 1
  project: { id: string; name: string }
  repository?: { path?: string; baseRef?: string }
  presets: Record<string, ProjectPreset>
  artifacts?: string[]
  ship?: ShipConfig
  execution?: {
    executor: "queue"
    queue?: { command?: string }
  }
}

export type CliSuccess<T> = { apiVersion: typeof API_VERSION; ok: true; result: T }
export type CliFailure = {
  apiVersion: typeof API_VERSION
  ok: false
  error: { code: string; message: string; details?: Record<string, unknown> }
}
export type CliResult<T> = CliSuccess<T> | CliFailure

export function isTerminalStatus(status: JobStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function isValidPresetArgv(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((part) =>
    typeof part === "string" && part.length > 0 && !part.includes("\u0000") && !part.includes("\n"),
  )
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function isValidProjectId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value)
}

export function parseRequestContext(value: unknown): RequestContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.provider !== "string" || !isValidProjectId(raw.provider)) return undefined
  if (!isValidProjectId(raw.packageId)) return undefined
  const context: RequestContext = { provider: raw.provider, packageId: raw.packageId }
  for (const key of ["taskId", "invocationId", "sourceRevision"] as const) {
    if (isValidProjectId(raw[key])) context[key] = raw[key]
  }
  return context
}
