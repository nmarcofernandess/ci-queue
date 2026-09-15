import { useRef, useState, type ComponentProps, type ReactNode } from "react"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useIsMobile } from "@/hooks/use-mobile"
import { EntityIdentity } from "./entity-identity"

export function DetailDrawer({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(true)
  const returnFocus = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null)
  )
  return (
    <Drawer
      open={open}
      autoFocus
      direction={isMobile ? "bottom" : "right"}
      onOpenChange={setOpen}
      onAnimationEnd={(isOpen) => !isOpen && onClose()}
    >
      <DrawerContent
        size="detail"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus.current?.focus()
        }}
      >
        {children}
      </DrawerContent>
    </Drawer>
  )
}

type HeaderProps = Pick<
  ComponentProps<typeof EntityIdentity>,
  "title" | "description" | "media" | "badge" | "monospaceTitle"
> & {
  closeLabel: string
  children?: ReactNode
}

export function DetailDrawerHeader({
  closeLabel,
  children,
  ...identity
}: HeaderProps) {
  return (
    <DrawerHeader className="shrink-0 gap-3 border-b text-left!">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <EntityIdentity presentation="drawer" {...identity} />
        </div>
        <DrawerClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={closeLabel}
          >
            <XIcon />
          </Button>
        </DrawerClose>
      </div>
      {children}
    </DrawerHeader>
  )
}

export function DetailDrawerTabs({ children }: { children: ReactNode }) {
  return (
    <div data-slot="detail-drawer-tabs" className="shrink-0 border-b p-4">
      {children}
    </div>
  )
}

export function DetailDrawerBody({
  children,
  scroll = "normal",
}: {
  children: ReactNode
  scroll?: "normal" | "managed"
}) {
  if (scroll === "managed")
    return (
      <div
        data-slot="detail-drawer-body"
        className="h-full min-h-0 flex-1 overflow-hidden p-4"
      >
        {children}
      </div>
    )
  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      {/* Keep the ScrollArea intrinsic table wrapper from adopting a nested list's minimum width; the list retains its own horizontal scroll. */}
      <div
        data-slot="detail-drawer-body"
        className="min-w-0 p-4 [contain:inline-size]"
      >
        {children}
      </div>
    </ScrollArea>
  )
}

export function DetailDrawerFooter({ children }: { children: ReactNode }) {
  return (
    <DrawerFooter className="mt-0 shrink-0 flex-row flex-wrap items-center justify-end border-t">
      {children}
    </DrawerFooter>
  )
}
