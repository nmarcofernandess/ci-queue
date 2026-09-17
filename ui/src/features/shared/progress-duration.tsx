import type { JobStatus, ProgressNode } from "@/lib/types"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { progressDurationView } from "./progress-duration-model"

export function ProgressDuration({
  node,
  jobStatus,
}: {
  node: ProgressNode
  jobStatus: JobStatus | undefined
}) {
  const view = progressDurationView(node, jobStatus)
  if (!view.show) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="progress-duration"
          data-duration-source={node.durationSource ?? "unknown"}
          className="tabular-nums"
          tabIndex={0}
        >
          {view.text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{view.description}</TooltipContent>
    </Tooltip>
  )
}
