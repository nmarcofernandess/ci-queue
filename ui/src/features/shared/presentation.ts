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
  colorClass: string
  animated: boolean
}

export const identityPresentation = {
  current: {
    title: "text-xl leading-6 font-semibold",
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

export function describeProgressState(
  nodeStatus: ProgressNode["status"],
  jobStatus: JobStatus | undefined
): StateDescriptor {
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
    }
  if (nodeStatus === "pending" || nodeStatus === "skipped")
    return {
      Icon: CircleDotIcon,
      label: nodeStatus === "pending" ? "Aguardando" : "Ignorada",
      colorClass: statusColor(nodeStatus),
      animated: false,
    }
  return describeJobState(nodeStatus)
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
