import type { ReactNode } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

export function SelectionPanel({
  open,
  onOpenChange,
  trigger,
  header,
  footer,
  children,
  align = "start",
  label,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  align?: "start" | "end" | "center"
  label: string
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={16}
        aria-label={label}
        className="w-[min(22rem,calc(100vw-2rem))] gap-2 p-2"
      >
        {header}
        <ScrollArea className="max-h-80">
          <div className="flex flex-col gap-1 pr-2">{children}</div>
        </ScrollArea>
        {footer}
      </PopoverContent>
    </Popover>
  )
}
