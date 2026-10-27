import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { describeIntegration } from "@/features/shared/format"
import type { GreenIntegration } from "@/lib/types"

export function IntegrationValue({
  integration,
}: {
  integration?: GreenIntegration
}) {
  if (!integration) {
    return <span className="text-muted-foreground">Sem leitura</span>
  }
  const { label, detail, muted } = describeIntegration(integration)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={
            muted
              ? "block truncate whitespace-nowrap text-muted-foreground"
              : "block truncate whitespace-nowrap"
          }
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  )
}
