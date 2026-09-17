import type {
  JobStatus,
  ProgressNode,
} from "@/lib/types"
import { formatDuration } from "./format"

export type ProgressDurationView = {
  text: string
  description: string
  show: boolean
}

const REASON_LABEL: Record<string, string> = {
  "missing-start": "Início não observado",
  "collector-restarted": "Continuidade perdida após reinício do coletor",
  "clock-invalid": "Relógio inválido",
  "missing-end": "Nó ainda aberto no encerramento",
}

function isTerminalJob(jobStatus: JobStatus | undefined): boolean {
  return (
    jobStatus === "passed" ||
    jobStatus === "failed" ||
    jobStatus === "cancelled" ||
    jobStatus === "interrupted"
  )
}

function isTerminalNode(node: ProgressNode): boolean {
  return node.status === "passed" || node.status === "failed" || node.status === "skipped"
}

export function progressDurationView(
  node: ProgressNode,
  jobStatus: JobStatus | undefined,
): ProgressDurationView {
  if (typeof node.durationMs === "number") {
    const formatted = formatDuration(node.durationMs)
    if (node.durationSource === "collector") {
      return {
        text: `≈ ${formatted}`,
        description: `Duração observada pelo coletor entre running e terminal (${node.durationMs} ms). Pode incluir buffering do coletor.`,
        show: true,
      }
    }
    if (node.durationSource === "emitter") {
      return {
        text: formatted,
        description: `Duração informada pelo emissor (${node.durationMs} ms)`,
        show: true,
      }
    }
    // Legacy numeric without source — present the number, do not invent origin.
    return {
      text: formatted,
      description: `Duração publicada sem origem explícita (${node.durationMs} ms)`,
      show: true,
    }
  }

  if (node.durationUnavailableReason) {
    if (isTerminalJob(jobStatus) || isTerminalNode(node)) {
      return {
        text: "—",
        description:
          REASON_LABEL[node.durationUnavailableReason] ??
          node.durationUnavailableReason,
        show: true,
      }
    }
  }

  // Legacy terminal without number and without reason: show em dash, generic absence.
  if (isTerminalNode(node) || (isTerminalJob(jobStatus) && node.status !== "running" && node.status !== "pending")) {
    return {
      text: "—",
      description: "Duração ausente na publicação legada",
      show: true,
    }
  }

  // Running / pending without a number: no live timer.
  return { text: "", description: "", show: false }
}
