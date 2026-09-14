import type { JobStatus } from "@/lib/types"

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
    { seconds: 86_400, singular: "dia", plural: "dias" },
    { seconds: 3_600, singular: "hora", plural: "horas" },
    { seconds: 60, singular: "minuto", plural: "minutos" },
  ]
  const unit =
    units.find((candidate) => absoluteSeconds >= candidate.seconds) ??
    units.at(-1)!
  const quantity = Math.max(1, Math.round(absoluteSeconds / unit.seconds))
  const label = quantity === 1 ? unit.singular : unit.plural
  return difference >= 0 ? `em ${quantity} ${label}` : `há ${quantity} ${label}`
}

export function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Sem duração"
  }

  if (value < 1_000) {
    return `${Math.round(value)} ms`
  }

  const totalSeconds = Math.round(value / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes
    ? `${minutes} min ${seconds.toString().padStart(2, "0")} s`
    : `${seconds} s`
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
    passed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
    interrupted: "Interrompida",
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
