import { RelativeTime } from "@/features/shared/live-time"
import { ClipboardIcon, EyeIcon, GitCommitIcon } from "lucide-react"
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
import { DataTableFrame } from "@/features/shared/data-table-frame"
import type { GreenCommitGroup } from "@/features/status/green-commit"

function originLabel(origins: GreenCommitGroup["origins"]) {
  return origins
    .map((value) => (value === "machine" ? "Máquina" : "Git"))
    .join(" + ")
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
    <DataTableFrame
      placement={embedded ? "card" : "body"}
      label="Commits verdes"
    >
      <TableHeader>
        <TableRow>
          <TableHead>Estado</TableHead>
          <TableHead>Commit</TableHead>
          <TableHead>Último verde</TableHead>
          <TableHead>Execuções</TableHead>
          <TableHead>Origem</TableHead>
          <TableHead>
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.sha}>
            <TableCell>
              <StatusIndicator
                descriptor={describeJobState("passed")}
                presentation="table"
              />
            </TableCell>
            <TableCell>
              <EntityIdentity
                presentation="table"
                title={shortSha(group.sha)}
                monospaceTitle
                onOpen={() => onOpen(group)}
              />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatTimelineDate(group.finishedAt)} ·{" "}
              {<RelativeTime value={group.finishedAt} />}
            </TableCell>
            <TableCell>{group.rows.length}</TableCell>
            <TableCell>{originLabel(group.origins)}</TableCell>
            <TableCell>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Ver commit ${shortSha(group.sha)}`}
                    onClick={() => onOpen(group)}
                  >
                    <EyeIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver commit</TooltipContent>
              </Tooltip>
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
                <TableHead>Estado</TableHead>
                <TableHead>Preset</TableHead>
                <TableHead>Término</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>
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
                    <TableCell>
                      <StatusIndicator
                        descriptor={describeJobState("passed")}
                        presentation="table"
                      />
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="whitespace-nowrap">
                      {formatTimelineDate(row.finishedAt)}
                    </TableCell>
                    <TableCell>{formatDuration(row.durationMs)}</TableCell>
                    <TableCell>
                      {id ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ver ${row.preset}`}
                          onClick={() => {
                            onClose()
                            onOpenJob(id)
                          }}
                        >
                          <EyeIcon />
                        </Button>
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
