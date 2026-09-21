import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  indicatorPresentation,
  type IndicatorPresentation,
  type StateDescriptor,
} from "./presentation"

export function StatusIndicator({
  descriptor,
  presentation,
}: {
  descriptor: StateDescriptor
  presentation: IndicatorPresentation
}) {
  const size = indicatorPresentation[presentation]
  const { Icon } = descriptor
  const accessibleLabel = [descriptor.label, descriptor.detail].filter(Boolean).join(" · ")
  const indicator = (
    <span
      data-slot="status-indicator"
      role="img"
      aria-label={accessibleLabel}
      tabIndex={presentation === "table" || descriptor.detail ? 0 : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size.area,
        descriptor.colorClass
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          size.glyph,
          descriptor.animated && "animate-spin motion-reduce:animate-none"
        )}
      />
    </span>
  )
  return presentation === "table" || descriptor.detail ? (
    <Tooltip>
      <TooltipTrigger asChild>{indicator}</TooltipTrigger>
      <TooltipContent>{accessibleLabel}</TooltipContent>
    </Tooltip>
  ) : (
    indicator
  )
}
