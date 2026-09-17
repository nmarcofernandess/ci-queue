import { useSyncExternalStore } from "react"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
} from "@/components/ui/item"
import type { JobRecord } from "@/lib/types"

import {
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  jobDuration,
} from "./format"
import { InspectButton } from "./inspect-button"
import {
  elapsedPresentation,
  type IdentityPresentation,
} from "./presentation"

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

export function JobTimeline({ job }: { job: JobRecord }) {
  const running = job.status === "running"
  const terminal = ["passed", "failed", "cancelled", "interrupted"].includes(
    job.status ?? ""
  )
  const timestamp = running ? job.startedAt : (job.finishedAt ?? job.createdAt)
  return (
    <>
      {formatTimelineDate(timestamp)}
      {running ? (
        <>
          {" "}
          · Decorrido: <JobDuration job={job} />
        </>
      ) : null}
      {terminal && job.finishedAt ? (
        <>
          {" "}
          · <RelativeTime value={job.finishedAt} />
        </>
      ) : null}
      {terminal && typeof job.durationMs === "number" ? (
        <>
          {" "}
          · Duração: <JobDuration job={job} />
        </>
      ) : null}
    </>
  )
}

export function ElapsedItem({
  job,
  presentation = "current",
  onInspect,
}: {
  job: Pick<
    JobRecord,
    "status" | "startedAt" | "durationMs" | "durationReference"
  >
  presentation?: IdentityPresentation
  onInspect?: () => void
}) {
  const elapsed = jobDuration(job, useLocalClock())
  const meanMs = job.durationReference?.meanMs
  const mean =
    typeof meanMs === "number" && Number.isFinite(meanMs)
      ? formatDuration(meanMs)
      : null
  return (
    <Item variant="default" className="border-transparent px-0 py-0">
      <ItemContent className="min-w-0 gap-0">
        <span className={elapsedPresentation[presentation]}>{elapsed}</span>
        <ItemDescription>
          {mean ? `decorrido · média ${mean}` : "decorrido"}
        </ItemDescription>
      </ItemContent>
      {onInspect ? (
        <ItemActions>
          <InspectButton presentation={presentation} onClick={onInspect} />
        </ItemActions>
      ) : null}
    </Item>
  )
}

export function QueueWait({ value }: { value?: string | null }) {
  const clock = useLocalClock()
  const start = value ? Date.parse(value) : NaN
  return formatDuration(
    Number.isFinite(start) ? Math.max(0, clock - start) : undefined
  )
}
