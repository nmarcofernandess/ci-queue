import { ChevronDownIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  ItemDescription,
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
  const row = (
    <Item
      data-slot="progress-row"
      data-node-id={node.id}
      className="min-h-9 min-w-0 flex-nowrap gap-2 border-0 px-0 py-1"
    >
      <div className="flex size-7 shrink-0 items-center justify-center">
        {children.length ? (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Expandir ${node.label}`}
              className="group/stage-toggle"
            >
              <ChevronDownIcon className="transition-transform group-data-[state=closed]/stage-toggle:-rotate-90" />
            </Button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      <ItemMedia data-slot="progress-indicator">
        <StatusIndicator
          descriptor={describeProgressState(node.status, jobStatus)}
          presentation="stage"
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle
          data-slot="progress-label"
          className="line-clamp-none min-w-0 text-sm leading-5 font-medium [overflow-wrap:anywhere] break-words"
        >
          {node.label}
        </ItemTitle>
        {node.detail || node.inventoryReplaced ? (
          <ItemDescription className="line-clamp-none text-xs [overflow-wrap:anywhere]">
            {node.inventoryReplaced ? "Inventário atualizado na execução" : null}
            {node.inventoryReplaced && node.detail ? " · " : null}
            {formatProgressDetail(node.detail)}
          </ItemDescription>
        ) : null}
        {(node.retryCount ?? 0) > 0 ? (
          <Badge variant="outline">Flaky detectado</Badge>
        ) : null}
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
      <CollapsibleContent className="ml-3.5 border-l border-border pl-3.5">
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
