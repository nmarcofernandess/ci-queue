import * as React from "react"
import type { JobStatus, ProgressNode } from "@/lib/types"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  stageContextDescription,
} from "./progress-detail"
import { ProgressDuration } from "./progress-duration"
import { describeProgressState } from "./presentation"
import { StatusIndicator } from "./status-indicator"

export function ExecutionStages({
  stages,
  jobStatus,
  active = [],
  planned = [],
}: {
  stages: readonly ProgressNode[]
  jobStatus: JobStatus | undefined
  active?: readonly ProgressNode[]
  planned?: readonly (ProgressNode & { rootId: string })[]
}) {
  const root = React.useRef<HTMLDivElement>(null)
  const following = React.useRef(true)
  const activeIndex = stages.findIndex((stage) => stage.status === "running")
  const targetIndex = activeIndex >= 0 ? activeIndex : stages.length - 1
  const targetId = stages[targetIndex]?.id

  React.useEffect(() => {
    const viewport = root.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    if (!viewport) return
    const track = () => {
      if (
        viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft <
        24
      )
        following.current = true
    }
    viewport.addEventListener("scroll", track, { passive: true })
    return () => viewport.removeEventListener("scroll", track)
  }, [])

  React.useEffect(() => {
    if (!following.current) return
    const viewport = root.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
    const target = root.current?.querySelector<HTMLElement>(
      `[data-stage-index="${targetIndex}"]`
    )
    if (!viewport || !target) return
    // Move only this strip, never the page or the execution drawer.
    const right = target.offsetLeft + target.offsetWidth
    if (right > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = right - viewport.clientWidth
    }
  }, [targetId, targetIndex])

  return (
    <ScrollArea
      ref={root}
      className="@container w-full min-w-0"
      aria-label="Etapas da execução"
      onWheelCapture={() => {
        following.current = false
      }}
      onPointerDownCapture={() => {
        following.current = false
      }}
      onKeyDownCapture={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          following.current = false
      }}
    >
      <ItemGroup className="flex-row gap-0 pb-3 has-data-[size=sm]:gap-0">
        {stages.map((stage, index) => {
          return (
            <Item
              key={stage.id}
              data-stage-index={index}
              size="sm"
              className="w-[12.5cqw] min-w-28 shrink-0 flex-col items-start"
            >
              <div className="flex w-full items-center gap-2">
                <StatusIndicator
                  descriptor={describeProgressState(stage, jobStatus)}
                  presentation="stage"
                />
                {index < stages.length - 1 ? (
                  <Separator className="flex-1" />
                ) : null}
              </div>
              <ItemContent className="w-full min-w-0">
                <ItemTitle
                  className="max-w-full truncate"
                  title={stage.label}
                >
                  {stage.label}
                </ItemTitle>
                <ItemDescription className="text-xs">
                  {stageContextDescription(stage, active, planned) ?? (
                    <ProgressDuration node={stage} jobStatus={jobStatus} />
                  )}
                </ItemDescription>
              </ItemContent>
            </Item>
          )
        })}
      </ItemGroup>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
