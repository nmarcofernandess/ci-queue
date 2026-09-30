import { ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import type { JobStatus, ProgressNode } from "@/lib/types"
import { formatProgressDetail } from "./progress-detail"
import { ProgressDuration } from "./progress-duration"
import { describeProgressState } from "./presentation"
import { StatusIndicator } from "./status-indicator"

type ProgressTreeProps = {
  nodes: readonly ProgressNode[]
  jobStatus: JobStatus | undefined
}

function ProgressNodeRow({
  node,
  childrenByParent,
  jobStatus,
}: {
  node: ProgressNode
  childrenByParent: Map<string, ProgressNode[]>
  jobStatus: JobStatus | undefined
}) {
  const children = childrenByParent.get(node.id) ?? []
  const detail = formatProgressDetail(node.detail)
  const fullTitle = [
    node.label,
    detail,
    node.inventoryReplaced ? "Inventário atualizado na execução" : null,
  ].filter(Boolean).join(" · ")
  const row = (
    <Item
      data-slot="progress-row"
      data-node-id={node.id}
      className="min-h-9 min-w-0 flex-nowrap gap-2 border-0 px-0 py-1"
    >
      <ItemMedia data-slot="progress-indicator">
        <StatusIndicator
          descriptor={describeProgressState(node, jobStatus)}
          presentation="stage"
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle data-slot="progress-label" className="w-full min-w-0 line-clamp-none">
          {children.length ? (
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="link"
                title={fullTitle}
                className="group/stage-toggle h-auto min-h-7 w-full min-w-0 justify-start gap-2 rounded-none border-b border-transparent px-1 text-left text-foreground no-underline hover:border-b-current hover:text-foreground hover:no-underline focus-visible:border-b-current"
              >
                <ChevronDownIcon className="shrink-0 transition-transform group-data-[state=closed]/stage-toggle:-rotate-90" />
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
                {detail ? <span className="shrink-0 text-muted-foreground">{detail}</span> : null}
              </Button>
            </CollapsibleTrigger>
          ) : (
            <span className="flex min-w-0 items-start gap-2 px-1" title={fullTitle}>
              <span className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words whitespace-normal">{node.label}</span>
              {detail ? <span className="shrink-0 text-muted-foreground">{detail}</span> : null}
            </span>
          )}
        </ItemTitle>
      </ItemContent>
      <ItemActions className="shrink-0 text-sm text-muted-foreground">
        <ProgressDuration node={node} jobStatus={jobStatus} />
      </ItemActions>
    </Item>
  )
  if (!children.length) return row
  return (
    <Collapsible
      defaultOpen={node.status === "running" || node.status === "failed"}
    >
      {row}
      <CollapsibleContent className="ml-4">
        {children.map((child) => (
          <ProgressNodeRow
            key={child.id}
            node={child}
            childrenByParent={childrenByParent}
            jobStatus={jobStatus}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ProgressTree({ nodes, jobStatus }: ProgressTreeProps) {
  const childrenByParent = new Map<string, ProgressNode[]>()
  for (const node of nodes) {
    if (!node.parentId) continue
    childrenByParent.set(node.parentId, [
      ...(childrenByParent.get(node.parentId) ?? []),
      node,
    ])
  }
  const roots = nodes.filter(
    (node) =>
      !node.parentId ||
      !nodes.some((candidate) => candidate.id === node.parentId)
  )
  return (
    <ItemGroup className="gap-1">
      {roots.map((node) => (
        <ProgressNodeRow
          key={node.id}
          node={node}
          childrenByParent={childrenByParent}
          jobStatus={jobStatus}
        />
      ))}
    </ItemGroup>
  )
}
