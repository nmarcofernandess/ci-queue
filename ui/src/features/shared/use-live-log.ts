import * as React from "react"
import { getLog, type ApiQuery } from "@/lib/api"
import type { LogSlice } from "@/lib/types"
import { appendLog } from "./log-buffer"

export function useLiveLog(
  jobId: string,
  enabled: boolean,
  running: boolean
): ApiQuery<LogSlice> {
  const buffer = React.useRef<LogSlice | undefined>(undefined)
  const [data, setData] = React.useState<LogSlice>()
  const [error, setError] = React.useState<Error>()
  const [refreshing, setRefreshing] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    if (!enabled) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      setRefreshing(true)
      try {
        const chunk = await getLog(jobId, buffer.current?.nextOffset ?? 0)
        if (disposed) return
        const next = appendLog(buffer.current, chunk)
        buffer.current = next
        setData(next)
        setError(undefined)
        // Drain unread bytes before idling, including the final write at exit.
        if (!next.error && (!next.complete || running))
          timer = setTimeout(load, next.complete ? 2000 : 0)
      } catch (reason) {
        if (!disposed)
          setError(
            reason instanceof Error ? reason : new Error("Falha ao ler o log.")
          )
      } finally {
        if (!disposed) setRefreshing(false)
      }
    }
    void load()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [jobId, enabled, running, revision])
  const reload = React.useCallback(() => setRevision((value) => value + 1), [])
  return {
    data,
    error,
    loading: enabled && !data && !error,
    refreshing,
    reload,
  }
}
