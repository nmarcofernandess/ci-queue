import {
  CheckCircle2Icon,
  CircleDotIcon,
  LoaderCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import type { JobStatus, JobRecord, ProgressNode } from "../../lib/types"
import { statusColor } from "./status-color"
import { statusLabel } from "./format"

export type IdentityPresentation = "current" | "drawer" | "table"
export type IndicatorPresentation = IdentityPresentation | "stage"
export type StateDescriptor = {
  Icon: LucideIcon
  label: string
  detail?: string
  colorClass: string
  animated: boolean
}

export const identityPresentation = {
  current: {
    title: "text-base leading-5 font-medium",
    description: "text-xs leading-4 text-muted-foreground",
    media: "size-10",
  },
  drawer: {
    title: "text-base leading-5 font-medium",
    description: "text-xs leading-4 text-muted-foreground",
    media: "size-9",
  },
  table: {
    title: "text-sm leading-5 font-medium",
    description: "text-xs leading-4 text-muted-foreground",
    media: "size-4",
  },
} as const
export const elapsedPresentation = {
  current: "text-xl leading-6 font-semibold tabular-nums",
  drawer: "text-base leading-5 font-medium tabular-nums",
  table: "text-sm leading-5 font-medium tabular-nums",
} as const
export const inspectPresentation = {
  current: "icon-lg",
  drawer: "icon",
  table: "icon-sm",
} as const
export const INSPECT_LABEL = "Inspecionar"
export const indicatorPresentation = {
  current: { area: "size-10", glyph: "size-10" },
  drawer: { area: "size-9", glyph: "size-9" },
  table: { area: "size-8", glyph: "size-4" },
  stage: { area: "size-5", glyph: "size-5" },
} as const

export function describeJobState(
  status: JobStatus | undefined
): StateDescriptor {
  const Icon =
    status === "passed"
      ? CheckCircle2Icon
      : status === "running"
        ? LoaderCircleIcon
        : status === "queued"
          ? CircleDotIcon
          : status
            ? XCircleIcon
            : MinusCircleIcon
  return {
    Icon,
    label: statusLabel(status),
    colorClass: statusColor(status),
    animated: status === "running",
  }
}

function executionProgressSome(
  job: Pick<JobRecord, "progressSummary">,
  predicate: (node: ProgressNode) => boolean
): boolean {
  const progress = job.progressSummary
  return [progress?.nodes, progress?.roots, progress?.active]
    .some((nodes) => nodes?.some(predicate))
}

export function executionHasRetries(
  job: Pick<JobRecord, "hasRetries" | "progressSummary">
): boolean {
  return Boolean(
    job.hasRetries || executionProgressSome(job, (node) => (node.retryCount ?? 0) > 0)
  )
}

function progressHasFailure(node: ProgressNode): boolean {
  return node.status === "failed" ||
    (node.status === "running" && node.detail != null &&
      typeof node.detail === "object" && node.detail.failed > 0)
}

export function describeExecutionState(
  job: Pick<JobRecord, "status" | "hasRetries" | "progressSummary">
): StateDescriptor {
  const base = describeJobState(job.status)
  const flaky = executionHasRetries(job)
  if (job.status === "running") {
    const failed = executionProgressSome(job, progressHasFailure)
    return {
      ...base,
      colorClass: failed
        ? statusColor("failed")
        : flaky
          ? statusColor("retrying")
          : base.colorClass,
      detail: [failed ? "Etapa com falha" : null, flaky ? "Flaky detectado" : null]
        .filter(Boolean)
        .join(" · ") || undefined,
    }
  }
  return flaky ? { ...base, detail: "Flaky detectado" } : base
}

export function describeProgressState(
  node: ProgressNode | ProgressNode["status"],
  jobStatus: JobStatus | undefined
): StateDescriptor {
  const nodeStatus = typeof node === "string" ? node : node.status
  const retryDetail = typeof node !== "string" && (node.retryCount ?? 0) > 0
    ? "Flaky detectado"
    : undefined
  const stopped =
    jobStatus !== "running" &&
    (nodeStatus === "running" || nodeStatus === "pending")
  if (stopped)
    return {
      Icon: CircleDotIcon,
      label:
        jobStatus === "cancelled"
          ? "Interrompida pelo cancelamento"
          : "Execução encerrada; etapa sem conclusão registrada",
      colorClass: statusColor("skipped"),
      animated: false,
      detail: retryDetail,
    }
  if (nodeStatus === "pending" || nodeStatus === "skipped")
    return {
      Icon: CircleDotIcon,
      label: nodeStatus === "pending" ? "Aguardando" : "Ignorada",
      colorClass: statusColor(nodeStatus),
      animated: false,
      detail: retryDetail,
    }
  const base = describeJobState(nodeStatus)
  if (typeof node === "string") return base
  return {
    ...base,
    colorClass: nodeStatus === "running"
      ? progressHasFailure(node)
        ? statusColor("failed")
        : (node.retryCount ?? 0) > 0
          ? statusColor("retrying")
          : base.colorClass
      : base.colorClass,
    detail: [
      nodeStatus === "running" && progressHasFailure(node) ? "Etapa com falha" : null,
      retryDetail,
    ].filter(Boolean).join(" · ") || undefined,
  }
}

export type ProgressSurface = "tree" | "unconfigured" | "declared-silent" | "not-collected"

export const unconfiguredProgressCopy = {
  variant: "default" as const,
  title: "Progresso contínuo não configurado",
  description:
    "Esta receita não declara progresso contínuo. Os estágios da execução não aparecem.",
}

export const observedProgressCopy = {
  title: "Etapas não coletadas por este registro",
  description:
    "O resultado foi registrado a partir do receipt. Este histórico não inclui a árvore de progresso da fila.",
}

export function isObservedExecution(
  job: Pick<JobRecord, "recordKind"> | null | undefined
): boolean {
  return job?.recordKind === "observed-execution"
}

export function progressSurface(
  job: Pick<JobRecord, "progressEnabled" | "progressSummary" | "recordKind">
): ProgressSurface {
  if (isObservedExecution(job)) return "not-collected"
  if (job.progressEnabled !== true) return "unconfigured"
  const nodes = job.progressSummary?.nodes ?? job.progressSummary?.roots ?? []
  return nodes.length ? "tree" : "declared-silent"
}
