import * as React from "react"

import type { ProjectScope, ReadScope } from "@/features/projects/scope"
import { matchesScope, scopeQuery } from "@/features/projects/scope"
import type {
  AnalysisResponse,
  DashboardSession,
  DashboardState,
  DashboardStateMutation,
  Diagnostic,
  ExecutionsResponse,
  HealthResponse,
  JobRecord,
  LogExport,
  LogSlice,
  MachineResponse,
  PickedHostPath,
  PresetHistoryResponse,
  ProjectProbe,
  ProjectsResponse,
  ResultsResponse,
  RevealResult,
  StatusSnapshot,
  WorktreesResponse,
} from "@/lib/types"
import { parseRemoteSlotsResponse } from "@/lib/remote-slots"
import { queryStore } from "@/lib/query-store"

type QueryValue = string | number | boolean | null | undefined

type Query = Record<string, QueryValue>

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

function buildUrl(path: string, query?: Query) {
  if (!query) {
    return path
  }

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }

  const suffix = search.toString()
  return suffix ? `${path}?${suffix}` : path
}

async function requestJson<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    headers: { Accept: "application/json" },
    signal,
  })

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : body && typeof body === "object" && "reason" in body
          ? String(body.reason)
          : `A bridge respondeu com ${response.status}.`
    throw new ApiError(response.status, message, body)
  }

  return body as T
}

async function requestScoped<T>(
  scope: ReadScope,
  path: string,
  query?: Query,
  signal?: AbortSignal
): Promise<T> {
  const body = await requestJson<T>(path, query, signal)
  if (!matchesScope(body, scope)) {
    throw new ApiError(409, "resposta fora do contexto", body)
  }
  return body
}

async function postJson<T>(
  path: string,
  csrfToken: string,
  body: unknown,
  query?: Query
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CI-CSRF": csrfToken,
    },
    body: JSON.stringify(body),
  })

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `A bridge respondeu com ${response.status}.`
    throw new ApiError(response.status, message, payload)
  }

  return payload as T
}

export function getHealth() {
  return requestJson<HealthResponse>("/health")
}

export function getProjects(includeObserved = false) {
  return requestJson<ProjectsResponse>(
    "/api/projects",
    includeObserved ? { includeObserved: 1 } : undefined
  )
}

export function probeProject(
  csrfToken: string,
  body: {
    repositoryPath?: string
    configPath?: string | null
    existingProjectId?: string | null
  }
) {
  return postJson<ProjectProbe>("/api/project-probe", csrfToken, body)
}

export function mutateProjects(csrfToken: string, body: Record<string, unknown>) {
  return postJson<ProjectsResponse>("/api/projects", csrfToken, body)
}

export function pickHostPath(
  csrfToken: string,
  kind: "directory" | "file"
) {
  return postJson<PickedHostPath>("/api/project-pick", csrfToken, { kind })
}

export function getStatus(scope: ReadScope, signal?: AbortSignal) {
  return requestScoped<StatusSnapshot>(scope, "/api/status", {
    ...scopeQuery(scope),
    view: "live",
  }, signal)
}

export function getExecutions(
  scope: ReadScope,
  query: {
    q?: string
    result?: string
    from?: string
    to?: string
    cursor?: string
    snapshotBefore?: string
    offset?: number
  } = {},
  signal?: AbortSignal
) {
  return requestScoped<ExecutionsResponse>(scope, "/api/executions", {
    ...scopeQuery(scope),
    ...query,
    view: "summary",
  }, signal)
}

export function getPresetHistory(scope: ProjectScope) {
  return requestScoped<PresetHistoryResponse>(
    scope,
    "/api/preset-history",
    scopeQuery(scope)
  )
}

export async function getRemoteSlots(scope: ProjectScope) {
  return parseRemoteSlotsResponse(
    await requestScoped<unknown>(scope, "/api/remote-slots", scopeQuery(scope))
  )
}

export function getResults(
  scope: Extract<ReadScope, { kind: "project" | "all" }>,
  bounds: { from?: string; to?: string } = {}
) {
  return requestScoped<ResultsResponse>(scope, "/api/analysis", {
    ...scopeQuery(scope),
    ...bounds,
    metric: "results",
  })
}

export function getDuration(
  scope: Extract<ReadScope, { kind: "project" | "all" }>,
  query: { from?: string; to?: string; preset: string }
) {
  return requestScoped<AnalysisResponse>(scope, "/api/analysis", {
    ...scopeQuery(scope),
    ...query,
    metric: "duration",
  })
}

export function getMachine() {
  return requestJson<MachineResponse>("/api/machine")
}

export function getWorktrees(scope: Extract<ReadScope, { kind: "project" | "all" }>, signal?: AbortSignal) {
  return requestScoped<WorktreesResponse>(scope, "/api/worktrees", scopeQuery(scope), signal)
}

export function getDashboardState(scope: ProjectScope) {
  return requestScoped<DashboardState>(
    scope,
    "/api/dashboard-state",
    scopeQuery(scope)
  )
}

export function getDashboardSession() {
  return requestJson<DashboardSession>("/api/session")
}

export function writeDashboardState(
  scope: ProjectScope,
  csrfToken: string,
  mutation: DashboardStateMutation
) {
  return postJson<DashboardState>(
    "/api/dashboard-state",
    csrfToken,
    mutation,
    scopeQuery(scope)
  )
}

export function revealWorktree(
  scope: ProjectScope | Extract<ReadScope, { kind: "all" }>,
  csrfToken: string,
  id: string,
  ownerProjectId?: string
) {
  return postJson<RevealResult>(
    "/api/reveal",
    csrfToken,
    {
      action: "reveal",
      entity: "worktree",
      id,
      target: "directory",
      ...(ownerProjectId ? { projectId: ownerProjectId } : {}),
    },
    scopeQuery(scope)
  )
}

export function getJob(scope: ReadScope, jobId: string) {
  return requestScoped<JobRecord>(scope, "/api/job", {
    ...scopeQuery(scope),
    jobId,
  })
}

export function getLog(
  scope: ReadScope,
  jobId: string,
  offset = 0,
  length = 512 * 1024
) {
  return requestScoped<LogSlice>(scope, "/api/log", {
    ...scopeQuery(scope),
    jobId,
    offset,
    length,
  })
}

export function getLogExport(scope: ReadScope, jobId: string) {
  return requestScoped<LogExport>(scope, "/api/log/export", {
    ...scopeQuery(scope),
    jobId,
  })
}

export function getDiagnostic(scope: ReadScope, jobId: string) {
  return requestScoped<Diagnostic>(scope, "/api/diagnostic", {
    ...scopeQuery(scope),
    jobId,
  }).catch(
    (error) => {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.body &&
        typeof error.body === "object" &&
        "available" in error.body
      ) {
        return error.body as Diagnostic
      }
      throw error
    }
  )
}

export type ApiQuery<T> = {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
  refreshing: boolean
  reload: () => void
}

/**
 * Keeps the prior response visible during a refresh, while a different key
 * intentionally returns to the local loading state.
 */
export function useApiQuery<T>(
  key: string,
  request: (signal?: AbortSignal) => Promise<T>,
  options: {
    pollMs?: number
    enabled?: boolean
    pollWhile?: (data: T) => boolean
  } = {}
): ApiQuery<T> {
  const { pollMs, enabled = true, pollWhile } = options
  queryStore.configure(key, request, pollMs, pollWhile)
  const subscribe = React.useCallback(
    (listener: () => void) => enabled ? queryStore.subscribe<T>(key, listener) : () => undefined,
    [enabled, key]
  )
  const getSnapshot = React.useCallback(() => queryStore.snapshot<T>(key), [key])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const reload = React.useCallback(() => queryStore.reload<T>(key), [key])

  return {
    data: snapshot.data,
    error: snapshot.error,
    loading: enabled && snapshot.data === undefined && snapshot.error === undefined,
    refreshing: enabled && snapshot.data !== undefined && snapshot.refreshing,
    reload,
  }
}
