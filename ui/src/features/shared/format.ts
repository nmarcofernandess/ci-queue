import type { GreenIntegration, JobPause, JobStatus } from "@/lib/types"

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
})

const byteFormatter = new Intl.NumberFormat("pt-BR", {
  style: "unit",
  unit: "gigabyte",
  maximumFractionDigits: 1,
})

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem horário"
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? "Horário indisponível"
    : dateFormatter.format(parsed)
}

/** Compact chronology used by the queue and drawers: dd/MM HH:mm. */
export function formatTimelineDate(value: string | null | undefined) {
  if (!value) {
    return "Sem horário"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "Horário indisponível"
  }

  const day = String(parsed.getDate()).padStart(2, "0")
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const hours = String(parsed.getHours()).padStart(2, "0")
  const minutes = String(parsed.getMinutes()).padStart(2, "0")
  return `${day}/${month} ${hours}:${minutes}`
}

export function formatRelativeTime(
  value: string | null | undefined,
  now = Date.now()
) {
  if (!value) {
    return "sem referência"
  }

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) {
    return "sem referência"
  }

  const difference = timestamp - now
  const absoluteSeconds = Math.round(Math.abs(difference) / 1_000)
  if (absoluteSeconds < 45) {
    return difference >= 0 ? "em instantes" : "agora"
  }

  const units = [
    { seconds: 31_536_000, singular: "ano", plural: "anos" },
    { seconds: 2_592_000, singular: "mês", plural: "meses" },
    { seconds: 86_400, singular: "dia", plural: "dias" },
    { seconds: 3_600, singular: "h", plural: "h" },
    { seconds: 60, singular: "min", plural: "min" },
  ]
  const unit =
    units.find((candidate) => absoluteSeconds >= candidate.seconds) ??
    units.at(-1)!
  const quantity = Math.max(1, Math.floor(absoluteSeconds / unit.seconds))
  const label = quantity === 1 ? unit.singular : unit.plural
  return difference >= 0 ? `em ${quantity} ${label}` : `há ${quantity} ${label}`
}

export function formatDuration(
  value: number | null | undefined,
  unavailable = "Sem duração",
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return unavailable
  }

  if (value < 1_000) {
    return `${Math.round(value)} ms`
  }

  const totalSeconds = Math.round(value / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  if (hours) {
    return `${hours}h ${minutes}m`
  }
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Indisponível"
  }

  return byteFormatter.format(value / 1024 ** 3)
}

export function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "Sem SHA"
}

export function statusLabel(status: JobStatus | null | undefined) {
  const labels: Record<JobStatus, string> = {
    queued: "Na fila",
    running: "Em execução",
    passed: "Passou",
    failed: "Falhou",
    cancelled: "Cancelado",
    interrupted: "Interrompido",
  }

  return status ? labels[status] : "Sem estado"
}

export function queryPeriodStart(
  period: "all" | "today" | "48h" | "week" | "15d" | "day" | "month"
) {
  if (period === "all") {
    return undefined
  }

  const now = new Date()
  if (period === "today") {
    now.setHours(0, 0, 0, 0)
    return now.toISOString()
  }

  const days =
    period === "48h"
      ? 2
      : period === "15d"
        ? 15
        : period === "week"
          ? 7
          : period === "day"
            ? 1
            : 30
  now.setDate(now.getDate() - days)
  return now.toISOString()
}

export function jobDuration(
  job: {
    status?: JobStatus
    startedAt?: string | null
    durationMs?: number | null
    pause?: Pick<JobPause, "state" | "pausedAt" | "pausedMsTotal"> | null
  },
  now = Date.now(),
  compact = false,
) {
  const unavailable = compact ? "—" : "Sem duração"
  if (job.status === "cancelled" && !job.startedAt) {
    return compact ? unavailable : "Não iniciada"
  }
  if (job.status === "running") {
    const start = job.startedAt ? Date.parse(job.startedAt) : NaN
    // Active time: the clock stands still while the job is paused.
    const pausedAt = job.pause?.state === "paused" && job.pause.pausedAt ? Date.parse(job.pause.pausedAt) : NaN
    const end = Number.isFinite(pausedAt) ? pausedAt : now
    return formatDuration(
      Number.isFinite(start) ? Math.max(0, end - start - (job.pause?.pausedMsTotal ?? 0)) : undefined,
      unavailable,
    )
  }
  return formatDuration(job.durationMs, unavailable)
}

/** Short label and full sentence for "is this green already in the base". */
export function describeIntegration(integration: GreenIntegration) {
  const read = integration.readAt
    ? ` pela ref local de ${formatTimelineDate(integration.readAt)}`
    : " pela ref local"
  const via = integration.via ? ` Origem: ${integration.via}.` : ""
  if (integration.state === "integrated") {
    return { label: `Em ${integration.baseName}`, muted: false,
      detail: `Contido em ${integration.baseRef}${read}.${via}` }
  }
  if (integration.state === "not-integrated") {
    return { label: `Fora de ${integration.baseName}`, muted: false,
      detail: `Ainda fora de ${integration.baseRef}${read}.${via}` }
  }
  const reason = integration.reason ?? "Sem leitura local da base."
  if (integration.state === "stale") {
    return { label: "Desatualizado", muted: true,
      detail: integration.readAt
        ? `${reason} Última leitura: ${formatTimelineDate(integration.readAt)}.${via}`
        : reason }
  }
  return { label: "Desconhecido", muted: true, detail: reason }
}
