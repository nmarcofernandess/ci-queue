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
  "open-at-finalize": "Nó ainda aberto no encerramento",
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
        description: "Duração observada pelo coletor entre running e terminal",
        show: true,
      }
    }
    if (node.durationSource === "emitter") {
      return {
        text: formatted,
        description: "Duração informada pelo emissor",
        show: true,
      }
    }
    // Legacy numeric without source — present the number, do not invent origin.
    return {
      text: formatted,
      description: "Duração publicada sem origem explícita",
      show: true,
    }
  }

  if (node.durationUnavailableReason) {
    const terminalJob =
      jobStatus === "passed" ||
      jobStatus === "failed" ||
      jobStatus === "cancelled" ||
      jobStatus === "interrupted"
    const nodeTerminal =
      node.status === "passed" ||
      node.status === "failed" ||
      node.status === "skipped"
    if (terminalJob || nodeTerminal) {
      return {
        text: "—",
        description:
          REASON_LABEL[node.durationUnavailableReason] ??
          node.durationUnavailableReason,
        show: true,
      }
    }
  }

  // Running without a number: no live timer.
  return { text: "", description: "", show: false }
}
