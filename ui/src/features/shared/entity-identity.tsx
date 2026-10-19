import type { ReactNode } from "react"
import { FolderGit2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ItemMedia, ItemContent } from "@/components/ui/item"
import { DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { StatusIndicator } from "./status-indicator"
import {
  identityPresentation,
  type IdentityPresentation,
  type StateDescriptor,
} from "./presentation"

export type IdentityMedia =
  { kind: "state"; descriptor: StateDescriptor } | { kind: "worktree" }
type EntityIdentityProps = {
  presentation: IdentityPresentation
  title: string
  description?: ReactNode
  media?: IdentityMedia
  badge?: ReactNode
  onOpen?: () => void
  monospaceTitle?: boolean
}

export function EntityIdentity({
  presentation,
  title,
  description,
  media,
  badge,
  onOpen,
  monospaceTitle,
}: EntityIdentityProps) {
  const scale = identityPresentation[presentation]
  const titleClass = cn(
    scale.title,
    monospaceTitle && "font-mono",
    presentation === "table"
      ? "truncate"
      : "[overflow-wrap:anywhere] break-words whitespace-normal"
  )
  return (
    <div
      data-slot="entity-identity"
      data-presentation={presentation}
      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
    >
      {media ? (
        <ItemMedia>
          {media.kind === "state" ? (
            <StatusIndicator
              descriptor={media.descriptor}
              presentation={presentation}
            />
          ) : (
            <FolderGit2Icon
              aria-hidden="true"
              className={cn("shrink-0", scale.media)}
            />
          )}
        </ItemMedia>
      ) : null}
      <ItemContent className="min-w-0">
        <div
          className={cn(
            "flex min-w-0 items-center gap-x-2 gap-y-1",
            presentation === "table" ? "flex-nowrap" : "flex-wrap"
          )}
        >
          {presentation === "drawer" ? (
            <DrawerTitle className={titleClass}>{title}</DrawerTitle>
          ) : onOpen ? (
            <Button
              variant="link"
              size={scale.buttonSize}
              onClick={onOpen}
              className={cn(
                "max-w-full min-w-0 justify-start text-left",
                presentation === "table" &&
                  "min-w-0 flex-1 shrink overflow-hidden",
                presentation === "current" && cn("h-auto", scale.title),
                monospaceTitle && "font-mono",
                presentation !== "table" &&
                  "[overflow-wrap:anywhere] break-words whitespace-normal"
              )}
              title={presentation === "table" ? title : undefined}
            >
              <span
                className={cn(
                  presentation === "table" && "block min-w-0 truncate"
                )}
              >
                {title}
              </span>
            </Button>
          ) : (
            <span className={titleClass}>{title}</span>
          )}
          {badge ? (
            presentation === "table" ? (
              <span className="shrink-0">{badge}</span>
            ) : (
              badge
            )
          ) : null}
        </div>
        {description != null ? (
          presentation === "drawer" ? (
            <DrawerDescription
              className={cn(
                "[overflow-wrap:anywhere] break-words",
                scale.description
              )}
            >
              {description}
            </DrawerDescription>
          ) : (
            <div
              className={cn(
                "[overflow-wrap:anywhere] break-words",
                scale.description
              )}
            >
              {description}
            </div>
          )
        ) : null}
      </ItemContent>
    </div>
  )
}
