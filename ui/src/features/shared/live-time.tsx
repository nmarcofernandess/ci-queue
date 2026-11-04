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
  compact = false,
}: {
  job: Pick<JobRecord, "status" | "startedAt" | "durationMs">
  compact?: boolean
}) {
  return jobDuration(job, useLocalClock(), compact)
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
    "status" | "startedAt" | "durationMs" | "durationReference" | "pause"
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
  const paused = job.status === "running" && job.pause?.state === "paused"
  return (
    <Item variant="default">
      <ItemContent className="min-w-0">
        <span className={elapsedPresentation[presentation]}>{elapsed}</span>
        <ItemDescription>
          {[paused ? "pausado" : "decorrido", mean ? `média ${mean}` : null, paused ? job.pause?.reason : null]
            .filter(Boolean)
            .join(" · ")}
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

export function QueueWait({
  value,
  compact = false,
}: {
  value?: string | null
  compact?: boolean
}) {
  const clock = useLocalClock()
  const start = value ? Date.parse(value) : NaN
  return formatDuration(
    Number.isFinite(start) ? Math.max(0, clock - start) : undefined,
    compact ? "—" : "Sem duração",
  )
}
