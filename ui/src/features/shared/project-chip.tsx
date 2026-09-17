import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ProjectChip({
  name,
  facts,
}: {
  name: string
  facts?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline">{name}</Badge>
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        <span>{name}</span>
        {facts ? <span>{facts}</span> : null}
      </TooltipContent>
    </Tooltip>
  )
}
