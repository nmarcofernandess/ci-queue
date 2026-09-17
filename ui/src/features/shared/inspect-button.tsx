import { EyeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  INSPECT_LABEL,
  inspectPresentation,
  type IdentityPresentation,
} from "./presentation"

export function InspectButton({
  presentation,
  onClick,
}: {
  presentation: IdentityPresentation
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={inspectPresentation[presentation]}
          aria-label={INSPECT_LABEL}
          onClick={onClick}
        >
          <EyeIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{INSPECT_LABEL}</TooltipContent>
    </Tooltip>
  )
}
