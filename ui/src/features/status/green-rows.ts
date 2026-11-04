import type { RunTableJob } from "@/features/shared/run-table"
import type { PresetHistoryEntry, RemoteGreen, RemoteSlotsSource } from "@/lib/types"
import { formatTimelineDate, queryPeriodStart } from "../shared/format"

/** The backend decides staleness by age; the UI names when the mirror was read. */
export function staleMirrorNote(source: RemoteSlotsSource | null | undefined) {
  if (!source?.stale) {
    return null
  }
  const readAt = source.refreshedAt ?? source.readAt
  return readAt
    ? `espelho desatualizado, lido em ${formatTimelineDate(readAt)}; os verdes refletem essa leitura.`
    : "espelho desatualizado, sem horário de leitura; os verdes refletem a última leitura local."
}
type GreenGrouping = "preset" | "commit"
type Period = "all" | "today" | "48h" | "week" | "15d"

export function asMachineGreen(entry: PresetHistoryEntry): RunTableJob | undefined {
  const reference = entry.lastGreenCanonical
  if (!reference?.ticketId) {
    return undefined
  }

  return {
    projectId: entry.projectId,
    projectName: entry.projectName,
    id: reference.ticketId,
    rowKey: `machine:${greenIdentity({ projectId: entry.projectId, preset: entry.preset, ticketId: reference.ticketId })}`,
    origin: "machine",
    origins: ["machine"],
    preset: entry.preset,
    status: reference.status ?? undefined,
    branch: reference.branch ?? undefined,
    headSha: reference.headSha ?? undefined,
    startedAt: reference.startedAt ?? undefined,
    createdAt: reference.createdAt ?? undefined,
    finishedAt: reference.finishedAt ?? undefined,
    durationMs: reference.durationMs,
    integration: reference.integration,
  }
}

export function asGitGreen(green: RemoteGreen & { projectName?: string }): RunTableJob {
  return {
    projectId: green.projectId,
    projectName: green.projectName,
    ticketId: green.ticketId,
    rowKey: `git:${greenIdentity(green)}`,
    origin: "git",
    origins: ["git"],
    detailsJobId: green.jobAvailable ? green.ticketId : undefined,
    preset: green.preset,
    status: green.status,
    branch: green.branch ?? undefined,
    headSha: green.headSha,
    finishedAt: green.finishedAt,
    durationMs: green.durationMs,
    detailsAvailable: green.jobAvailable,
    integration: green.integration,
  }
}

export function greenIdentity(job: RunTableJob) {
  const ticket = job.ticketId ?? job.id
  const namespace = `${job.projectId ?? ""}\u0000`
  return namespace + (
    ticket
    ? `${job.preset ?? "preset-indisponível"}\u0000${ticket}`
    : `${job.preset ?? "preset-indisponível"}\u0000${job.headSha ?? job.rowKey ?? "registro-indisponível"}`
  )
}

export function mergeGreenRows(jobs: RunTableJob[]) {
  const byIdentity = new Map<string, RunTableJob>()
  for (const job of jobs) {
    const key = greenIdentity(job)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, job)
      continue
    }

    const existingDetails =
      existing.detailsJobId ??
      (existing.detailsAvailable !== false ? existing.id : undefined)
    const nextDetails =
      job.detailsJobId ?? (job.detailsAvailable !== false ? job.id : undefined)
    const preferred = existingDetails ? existing : nextDetails ? job : existing
    const origins = [
      ...new Set([...(existing.origins ?? []), ...(job.origins ?? [])]),
    ]
    byIdentity.set(key, {
      ...existing,
      ...job,
      ...preferred,
      rowKey: `green:${key}`,
      origin: undefined,
      origins,
      id: preferred.id ?? existing.id ?? job.id,
      ticketId: preferred.ticketId ?? existing.ticketId ?? job.ticketId,
      detailsJobId: existingDetails ?? nextDetails,
      detailsAvailable: Boolean(existingDetails ?? nextDetails),
      integration: preferred.integration ?? existing.integration ?? job.integration,
    })
  }
  return [...byIdentity.values()]
}

export function filterGreens({
  jobs,
  search,
  grouping,
  period,
}: {
  jobs: RunTableJob[]
  search: string
  grouping: GreenGrouping
  period: Period
}) {
  const needle = search.trim().toLocaleLowerCase("pt-BR")
  const from = queryPeriodStart(period)
  return jobs
    .filter((job) => {
      const haystack = [
        job.projectName,
        job.ticketId,
        job.id,
        job.preset,
        job.branch,
        job.headSha,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
      return (
        (!needle || haystack.includes(needle)) &&
        (!from || (job.finishedAt ?? "") >= from)
      )
    })
    .sort((left, right) => {
      const primary =
        grouping === "preset" ? (left.preset ?? "") : (left.headSha ?? "")
      const secondary =
        grouping === "preset" ? (right.preset ?? "") : (right.headSha ?? "")
      const leftTime = left.finishedAt ?? left.startedAt ?? left.createdAt ?? ""
      const rightTime =
        right.finishedAt ?? right.startedAt ?? right.createdAt ?? ""
      return (
        primary.localeCompare(secondary, "pt-BR") ||
        (left.preset ?? "").localeCompare(right.preset ?? "", "pt-BR") ||
        rightTime.localeCompare(leftTime)
      )
    })
}

