import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type ProjectChipMode = "inline" | "compact-context"

export function ProjectChip({
  name,
  facts,
  mode,
}: {
  name: string
  facts?: string
  mode: ProjectChipMode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={mode === "compact-context" ? "min-w-0 max-w-full" : undefined}
        >
          {mode === "compact-context" ? (
            <span className="min-w-0 truncate">{name}</span>
          ) : name}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <span>{name}</span>
        {facts ? <span>{facts}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}
