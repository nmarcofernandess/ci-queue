export type JobStatus =
  "queued" | "running" | "passed" | "failed" | "cancelled" | "interrupted"

export type ProgressNodeStatus =
  "pending" | "running" | "passed" | "failed" | "skipped"

export type ProgressNode = {
  id: string
  label: string
  status: ProgressNodeStatus
  durationMs?: number
}

export type ProgressSummary = {
  schemaVersion: number
  available: boolean
  reason?: string
  roots?: ProgressNode[]
  active?: ProgressNode[]
}

/** Browser-safe job projection. Process arguments and environment stay private. */
export type JobRecord = {
  id: string
  projectId?: string
  projectName?: string
  preset?: string
  status?: JobStatus
  exitCode?: number | null
  branch?: string
  headSha?: string
  createdAt?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number | null
  cwd?: string
  failureReason?: string | null
  cleanupBlockedReason?: string | null
  commitSubject?: string
  progressSummary?: ProgressSummary
}

export type StatusSnapshot = {
  schemaVersion: number
  project: { id: string; name: string }
  serverTime: string
  running: JobRecord | null
  queued: JobRecord[]
  history: JobRecord[]
  lastFailed: JobRecord | null
  globalOccupancy: boolean
}

export type ExecutionsResponse = {
  schemaVersion: number
  jobs: JobRecord[]
  hasMore: boolean
  snapshotBefore: string
  nextCursor: string | null
  coverage: { unattributedRecords: number }
}

export type PresetRunReference = {
  ticketId: string | null
  startedAt: string | null
  createdAt: string | null
  finishedAt: string | null
  status: JobStatus | null
  headSha: string | null
  branch: string | null
  custom: boolean
  durationMs: number | null
  failureReason?: string | null
}

export type PresetHistoryEntry = {
  projectId: string
  projectName: string
  preset: string
  declared: boolean
  runCount: number
  canonicalRunCount: number
  customRunCount: number
  lastGreenCanonical: PresetRunReference | null
  lastRun: PresetRunReference | null
  lastFailure: PresetRunReference | null
  durationReference: {
    medianMs: number
    meanMs: number
    sampleCount: number
    window: string
  } | null
}

export type PresetHistoryResponse = {
  schemaVersion: number
  catalog: { resolved: boolean; projectId: string; declaredCount: number }
  presets: PresetHistoryEntry[]
  totals: { tickets: number; presets: number }
  coverage: { unattributedRecords: number }
}

export type RemoteSlotsReason = {
  code: string
  message: string
}

export type RemoteSlotsSource = {
  kind: "git"
  available: boolean
  stale: boolean
  remote: string | null
  namespace: string
  readAt: string | null
  refreshedAt: string | null
  reason: RemoteSlotsReason | null
}

export type RemoteGreen = {
  origin: "git"
  preset: string
  projectId: string
  ticketId: string
  jobAvailable: boolean
  status: "passed"
  headSha: string
  commitSha: string
  baseSha: string | null
  branch: string
  finishedAt: string
  publishedAt: string
  durationMs: number | null
  ref: string
}

export type RemoteSlotsResponse = {
  schemaVersion: 2
  source: RemoteSlotsSource
  catalog: { projectId: string; resolved: true; declaredCount: number }
  coverage: {
    declaredPresets: number
    greenPresets: number
    withoutTagPresets: string[]
    invalidPayloads: Array<{ preset: string | null; reason: string }>
  }
  greens: RemoteGreen[]
}

export type AnalysisPoint = {
  id: string | null
  at: string | null
  durationMs: number
}

export type AnalysisPreset = {
  preset: string
  passed: number
  failed: number
  cancelled: number
  interrupted: number
  total: number
  passRate: number | null
  points: AnalysisPoint[]
  duration: {
    count: number
    medianMs: number | null
    minMs: number | null
    maxMs: number | null
  }
  failedDurationMs: number
  failedDurationCount: number
  failedDurationMissing: number
}

export type AnalysisResponse = {
  schemaVersion: number
  projectId: string
  from: string | null
  to: string | null
  preset: string | null
  total: number
  presets: AnalysisPreset[]
  problems: JobRecord[]
  problemTotal: number
  hasMore: boolean
  nextOffset: number | null
  coverage: { unattributedRecords: number }
}

export type MachineResponse = {
  schemaVersion: number
  observedAt: string
  disk: { totalBytes: number; usedBytes: number; freeBytes: number } | null
  error: string | null
}

export type WorktreeSize = {
  bytes: number | null
  state: "unmeasured" | "measuring" | "ready"
  error: string | null
  observedAt: string | null
}

export type WorktreeRecord = {
  id: string
  path: string
  branch: string
  headSha: string | null
  locked: boolean
  dirty: boolean | null
  changedEntries: number | null
  ahead: number | null
  behind: number | null
  gitObservedAt?: string
  size: WorktreeSize
  error?: string | null
}

export type WorktreesResponse = {
  schemaVersion: number
  observedAt: string
  baseRef: string
  baseSha: string | null
  worktrees: WorktreeRecord[]
  error: string | null
}

export type DashboardCheck = {
  preset: string
  status: "passed" | "pending" | "recipe-missing"
  ticketId: string | null
}

export type DashboardMeta = {
  name: string
  description: string
  headSha: string
  presets: string[]
  checks: DashboardCheck[]
}

export type DashboardNote = {
  id: string
  title: string
  text: string
  createdAt: string
  updatedAt: string
}

export type DashboardState = {
  revision: number
  projectId: string
  presets: string[]
  meta: DashboardMeta | null
  notes: DashboardNote[]
}

export type DashboardSession = {
  csrfToken: string
  canReveal: boolean
  revealTargets: string[]
  clipboardLimitBytes: number
}

export type RevealResult = {
  ok: boolean
  entity: "worktree" | "job"
  id: string
  target: "directory" | "file"
  path: string
}

export type DashboardStateMutation =
  | {
      revision: number
      action: "save-meta"
      meta: Pick<DashboardMeta, "name" | "description" | "headSha" | "presets">
    }
  | { revision: number; action: "remove-meta" }
  | {
      revision: number
      action: "save-note"
      note: Pick<DashboardNote, "title" | "text">
    }
  | {
      revision: number
      action: "update-note"
      id: string
      note: Pick<DashboardNote, "title" | "text">
    }
  | { revision: number; action: "remove-note"; id: string }

export type LogSlice = {
  schemaVersion: number
  jobId: string
  content: string
  offset: number
  nextOffset: number
  sourceBytes: number
  complete: boolean
  error: string | null
}

export type LogExport = {
  schemaVersion: number
  jobId: string
  content: string
  coverage: {
    available: boolean
    reason?: string
    sourceBytes?: number
    capturedBytes?: number
    complete?: boolean
    preserved?: "complete" | "head-and-tail"
  }
}

export type Diagnostic = {
  schemaVersion: number
  jobId: string
  available: boolean
  reason?: string
  ticket?: Pick<
    JobRecord,
    | "id"
    | "preset"
    | "status"
    | "exitCode"
    | "failureReason"
    | "headSha"
    | "branch"
    | "durationMs"
  >
  resources?: { observations: unknown[]; coverage: "unavailable" | "reported" }
  coverage?: unknown
}
