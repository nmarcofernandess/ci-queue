import { RelativeTime } from "@/features/shared/live-time"
import { ClipboardIcon, GitCommitIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DetailDrawer,
  DetailDrawerHeader,
  DetailDrawerBody,
  DetailDrawerFooter,
} from "@/features/shared/detail-drawer"
import { FactsTable } from "@/features/shared/facts-table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  formatDuration,
  formatTimelineDate,
  shortSha,
} from "@/features/shared/format"
import { StatusIndicator } from "@/features/shared/status-indicator"
import { describeJobState } from "@/features/shared/presentation"
import { EntityIdentity } from "@/features/shared/entity-identity"
import { InspectButton } from "@/features/shared/inspect-button"
import { DataTableFrame } from "@/features/shared/data-table-frame"
import type { GreenCommitGroup } from "@/features/status/green-commit"

function originLabel(origins: GreenCommitGroup["origins"]) {
  return origins
    .map((value) => (value === "machine" ? "Máquina" : "Git"))
    .join(" + ")
}

function commitColumnClass(
  id: "status" | "commit" | "time" | "count" | "origin" | "actions",
  placement: "card" | "body"
) {
  if (id === "status") return "w-16"
  if (id === "commit") return "w-24"
  if (id === "time") return "w-28"
  if (id === "count") return "w-24"
  if (id === "origin") return "w-28"
  return placement === "card" ? "w-14 text-right" : "w-10 text-right"
}

function commitRunColumnClass(
  id: "status" | "preset" | "time" | "duration" | "actions"
) {
  if (id === "status") return "w-16"
  if (id === "preset") return "w-48"
  if (id === "time") return "w-28"
  if (id === "duration") return "w-20"
  return "w-10 text-right"
}

export function GreenCommitTable({
  embedded = false,
  groups,
  onOpen,
  emptyDescription,
}: {
  embedded?: boolean
  groups: GreenCommitGroup[]
  onOpen: (group: GreenCommitGroup) => void
  emptyDescription: string
}) {
  const placement = embedded ? "card" : "body"
  if (!groups.length)
    return (
      <div className={embedded ? undefined : "rounded-lg border"}>
        <Empty className="border-0 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitCommitIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhum commit encontrado</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  return (
    <DataTableFrame placement={placement} label="Commits verdes">
      <TableHeader>
        <TableRow>
          <TableHead className={commitColumnClass("status", placement)}>
            Estado
          </TableHead>
          <TableHead className={commitColumnClass("commit", placement)}>
            Commit
          </TableHead>
          <TableHead className={commitColumnClass("time", placement)}>
            Último verde
          </TableHead>
          <TableHead className={commitColumnClass("count", placement)}>
            Execuções
          </TableHead>
          <TableHead className={commitColumnClass("origin", placement)}>
            Origem
          </TableHead>
          <TableHead className={commitColumnClass("actions", placement)}>
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.sha}>
            <TableCell className={commitColumnClass("status", placement)}>
              <StatusIndicator
                descriptor={describeJobState("passed")}
                presentation="table"
              />
            </TableCell>
            <TableCell className={commitColumnClass("commit", placement)}>
              <EntityIdentity
                presentation="table"
                title={shortSha(group.sha)}
                monospaceTitle
                onOpen={() => onOpen(group)}
              />
            </TableCell>
            <TableCell className={commitColumnClass("time", placement)}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="block truncate whitespace-nowrap text-muted-foreground"
                  >
                    {formatTimelineDate(group.finishedAt)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <RelativeTime value={group.finishedAt} />
                </TooltipContent>
              </Tooltip>
            </TableCell>
            <TableCell className={commitColumnClass("count", placement)}>
              {group.rows.length}
            </TableCell>
            <TableCell className={commitColumnClass("origin", placement)}>
              {originLabel(group.origins)}
            </TableCell>
            <TableCell className={commitColumnClass("actions", placement)}>
              <InspectButton
                presentation="table"
                onClick={() => onOpen(group)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DataTableFrame>
  )
}

export function GreenCommitDrawer({
  group,
  onClose,
  onOpenJob,
}: {
  group: GreenCommitGroup
  onClose: () => void
  onOpenJob: (id: string) => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.sha)
      toast.success("SHA copiado.")
    } catch {
      toast.error("Não foi possível copiar o SHA.")
    }
  }
  return (
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title={shortSha(group.sha)}
        monospaceTitle
        description={
          <>
            {group.rows.length} execuções verdes ·{" "}
            {formatTimelineDate(group.finishedAt)} ·{" "}
            <RelativeTime value={group.finishedAt} />
          </>
        }
        closeLabel="Fechar commit"
      />
      <DetailDrawerBody>
        <div className="flex min-w-0 flex-col gap-4">
          <FactsTable
            caption="Detalhes do commit"
            rows={[
              { id: "sha", label: "SHA", value: group.sha, technical: true },
              {
                id: "branches",
                label: "Branches",
                value: group.branches.join(", ") || "Não informadas",
              },
              {
                id: "origin",
                label: "Origem",
                value: originLabel(group.origins),
              },
            ]}
          />
          <DataTableFrame placement="body" label="Execuções do commit">
            <TableHeader>
              <TableRow>
                <TableHead className={commitRunColumnClass("status")}>
                  Estado
                </TableHead>
                <TableHead className={commitRunColumnClass("preset")}>
                  Preset
                </TableHead>
                <TableHead className={commitRunColumnClass("time")}>
                  Término
                </TableHead>
                <TableHead className={commitRunColumnClass("duration")}>
                  Duração
                </TableHead>
                <TableHead className={commitRunColumnClass("actions")}>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => {
                const id =
                  row.detailsJobId ??
                  (row.detailsAvailable !== false ? row.id : undefined)
                return (
                  <TableRow
                    key={
                      row.rowKey ??
                      row.ticketId ??
                      `${row.preset}-${row.finishedAt}`
                    }
                  >
                    <TableCell className={commitRunColumnClass("status")}>
                      <StatusIndicator
                        descriptor={describeJobState("passed")}
                        presentation="table"
                      />
                    </TableCell>
                    <TableCell className={commitRunColumnClass("preset")}>
                      <EntityIdentity
                        presentation="table"
                        title={row.preset || "Não informada"}
                        onOpen={
                          id
                            ? () => {
                                onClose()
                                onOpenJob(id)
                              }
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className={commitRunColumnClass("time")}>
                      {formatTimelineDate(row.finishedAt)}
                    </TableCell>
                    <TableCell className={commitRunColumnClass("duration")}>
                      {formatDuration(row.durationMs)}
                    </TableCell>
                    <TableCell className={commitRunColumnClass("actions")}>
                      {id ? (
                        <InspectButton
                          presentation="table"
                          onClick={() => {
                            onClose()
                            onOpenJob(id)
                          }}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </DataTableFrame>
        </div>
      </DetailDrawerBody>
      <DetailDrawerFooter>
        <Button variant="outline" onClick={() => void copy()}>
          <ClipboardIcon data-icon="inline-start" />
          Copiar SHA
        </Button>
      </DetailDrawerFooter>
    </DetailDrawer>
  )
}
