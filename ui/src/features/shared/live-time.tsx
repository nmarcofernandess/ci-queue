import { useSyncExternalStore } from "react"
import { formatRelativeTime, jobDuration } from "./format"
import type { JobRecord } from "@/lib/types"

let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((notify) => notify())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}
const snapshot = () => now
function useLocalClock() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
export function RelativeTime({ value }: { value?: string | null }) {
  return formatRelativeTime(value, useLocalClock())
}
export function JobDuration({
  job,
}: {
  job: Pick<JobRecord, "status" | "startedAt" | "durationMs">
}) {
  return jobDuration(job, useLocalClock())
}
