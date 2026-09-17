/**
 * Contratos persistidos do CI Queue. Os tickets v1, v2 e v3 continuam
 * legíveis porque o worker decide a forma executável no momento do claim.
 */

export const API_VERSION = 1 as const
export const TICKET_SCHEMA_VERSION = 3 as const

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
  }
}

export type ExecutionDeadline =
  | { state: "disabled" }
  | { state: "awaiting_capture" | "capture_unavailable"; timeoutMs: number }
  | { state: "armed" | "completed"; timeoutMs: number; armedAt: string; expiresAt: string }
  | { state: "expired"; timeoutMs: number; armedAt: string; expiresAt: string; expiredAt: string }

export type ProcessGroupIdentity = {
  leaderPid: number
  pgid: number
  /** Saída de ps lstart em locale C; protege contra reutilização de PID. */
  startedAt: string
}

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
}

export type JobProgress = {
  schema: typeof LOCAL_CI_PROGRESS_SCHEMA
  updatedAt: string | null
  nodes: ProgressNode[]
}

export type RequestContext = {
  provider: string
  packageId: string
  taskId?: string
  invocationId?: string
  sourceRevision?: string
}

/** Persisted ticket: fields added in v2/v3 remain optional for v1 readers. */
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
  source?: TicketSource
  projectId?: string
  projectName?: string
  progress?: JobProgress
  processObservation?: ProcessObservation
  processObservations?: ProcessObservation[]
  requestContext?: RequestContext
}

export type ProjectPreset = TicketFlags & {
  argv: string[]
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
