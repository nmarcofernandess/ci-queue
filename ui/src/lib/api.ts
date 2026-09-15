import * as React from "react"

import type {
  AnalysisResponse,
  DashboardSession,
  DashboardState,
  DashboardStateMutation,
  Diagnostic,
  ExecutionsResponse,
  JobRecord,
  LogExport,
  LogSlice,
  MachineResponse,
  PresetHistoryResponse,
  RevealResult,
  StatusSnapshot,
  WorktreesResponse,
} from "@/lib/types"
import { parseRemoteSlotsResponse } from "@/lib/remote-slots"

type QueryValue = string | number | boolean | null | undefined

type Query = Record<string, QueryValue>

const queryCache = new Map<string, unknown>()

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

async function requestJson<T>(path: string, query?: Query): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    headers: { Accept: "application/json" },
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

async function postJson<T>(
  path: string,
  csrfToken: string,
  body: unknown
): Promise<T> {
  const response = await fetch(path, {
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

export function getStatus() {
  return requestJson<StatusSnapshot>("/api/status")
}

export function getExecutions(
  query: {
    q?: string
    scope?: "terminal" | "legacy"
    result?: string
    from?: string
    to?: string
    cursor?: string
    snapshotBefore?: string
    offset?: number
  } = {}
) {
  return requestJson<ExecutionsResponse>("/api/executions", query)
}

export function getPresetHistory() {
  return requestJson<PresetHistoryResponse>("/api/preset-history")
}

export async function getRemoteSlots() {
  return parseRemoteSlotsResponse(
    await requestJson<unknown>("/api/remote-slots")
  )
}

export function getAnalysis(
  query: {
    from?: string
    to?: string
    preset?: string
  } = {}
) {
  return requestJson<AnalysisResponse>("/api/analysis", query)
}

export function getMachine() {
  return requestJson<MachineResponse>("/api/machine")
}

export function getWorktrees() {
  return requestJson<WorktreesResponse>("/api/worktrees")
}

export function getDashboardState() {
  return requestJson<DashboardState>("/api/dashboard-state")
}

export function getDashboardSession() {
  return requestJson<DashboardSession>("/api/session")
}

export function writeDashboardState(
  csrfToken: string,
  mutation: DashboardStateMutation
) {
  return postJson<DashboardState>("/api/dashboard-state", csrfToken, mutation)
}

export function revealWorktree(csrfToken: string, id: string) {
  return postJson<RevealResult>("/api/reveal", csrfToken, {
    action: "reveal",
    entity: "worktree",
    id,
    target: "directory",
  })
}

export function getJob(jobId: string) {
  return requestJson<JobRecord>("/api/job", { jobId })
}

export function getLog(jobId: string, offset = 0, length = 512 * 1024) {
  return requestJson<LogSlice>("/api/log", { jobId, offset, length })
}

export function getLogExport(jobId: string) {
  return requestJson<LogExport>("/api/log/export", { jobId })
}

export function getDiagnostic(jobId: string) {
  return requestJson<Diagnostic>("/api/diagnostic", { jobId }).catch(
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
  request: () => Promise<T>,
  options: {
    pollMs?: number
    enabled?: boolean
    pollWhile?: (data: T) => boolean
  } = {}
): ApiQuery<T> {
  const { pollMs, enabled = true, pollWhile } = options
  const [data, setData] = React.useState<T | undefined>(
    () => queryCache.get(key) as T | undefined
  )
  const [error, setError] = React.useState<ApiError | Error>()
  const [refreshing, setRefreshing] = React.useState(true)
  const [revision, setRevision] = React.useState(0)
  const previousKey = React.useRef<string | undefined>(undefined)

  React.useEffect(() => {
    let disposed = false
    const changed = previousKey.current !== key
    previousKey.current = key
    if (changed) {
      setData(queryCache.get(key) as T | undefined)
      setError(undefined)
    }

    if (!enabled) {
      return () => {
        disposed = true
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      let keepPolling = true
      setRefreshing(true)
      try {
        const next = await request()
        if (!disposed) {
          queryCache.set(key, next)
          setData(next)
          setError(undefined)
          keepPolling = !pollWhile || pollWhile(next)
        }
      } catch (reason) {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason
              : new Error("Falha ao ler a bridge.")
          )
        }
      } finally {
        if (!disposed) {
          setRefreshing(false)
          if (pollMs && keepPolling) timer = setTimeout(load, pollMs)
        }
      }
    }

    void load()
    return () => {
      disposed = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [enabled, key, pollMs, pollWhile, request, revision])

  const reload = React.useCallback(() => {
    setError(undefined)
    setRefreshing(true)
    setRevision((value) => value + 1)
  }, [])

  return {
    data,
    error,
    loading: enabled && data === undefined && error === undefined,
    refreshing: enabled && data !== undefined && refreshing,
    reload,
  }
}
