import { EntityIdentity } from "./entity-identity"
import { StatusIndicator } from "./status-indicator"
import { describeJobState } from "./presentation"
import { DataTableFrame } from "./data-table-frame"
import { InspectButton } from "./inspect-button"
import { RelativeTime, JobDuration, QueueWait } from "./live-time"
import { ProjectChip } from "./project-chip"
import { projectChipFacts, projectChipVisible } from "./project-chip-model"
import * as React from "react"
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { InboxIcon } from "lucide-react"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { statusColor } from "@/features/shared/status-color"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
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
import { ErrorState } from "@/features/shared/async-state"
import {
  formatTimelineDate,
  shortSha,
  statusLabel,
} from "@/features/shared/format"
import type { JobRecord, JobStatus } from "@/lib/types"

const features = tableFeatures({})
export type RunTableJob = Omit<JobRecord, "id" | "progressEnabled"> & {
  id?: string
  ticketId?: string
  rowKey?: string
  detailsJobId?: string
  detailsAvailable?: boolean
  origin?: "machine" | "git"
  origins?: Array<"machine" | "git">
  progressEnabled?: boolean
}
const helper = createColumnHelper<typeof features, RunTableJob>()
const EMPTY: RunTableJob[] = []

export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  return (
    <Badge variant="outline" className={statusColor(status)}>
      {statusLabel(status)}
    </Badge>
  )
}
export type RunTableProps = {
  title: string
  description?: string
  toolbar?: React.ReactNode
  jobs: RunTableJob[] | undefined
  loading: boolean
  error: Error | undefined
  emptyTitle?: string
  emptyDescription: string
  onOpenJob: (jobId: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  loadMoreError?: Error
  onLoadMore?: () => void
  showOrigin?: boolean
  showFailureReason?: boolean
  kind?: "queue" | "terminal"
  showProjectChip?: boolean
  filterProjectId?: string
}
function detailId(job: RunTableJob) {
  return (
    job.detailsJobId ?? (job.detailsAvailable !== false ? job.id : undefined)
  )
}

function columnClass(id: string) {
  if (id === "status") return "w-16"
  if (id === "execution") return "w-52"
  if (id === "time") return "w-28"
  if (id === "duration") return "w-20"
  if (id === "actions") return "w-14 text-right"
  return undefined
}

function identityBadge(
  job: RunTableJob,
  chip: { always?: boolean; filterProjectId?: string }
) {
  const flaky = Boolean(
    job.hasRetries ||
      job.progressSummary?.nodes?.some((node) => (node.retryCount ?? 0) > 0)
  )
  const chipVisible = projectChipVisible(job, chip)
  const observed = job.recordKind === "observed-execution"
  if (!flaky && !chipVisible && !observed) {
    return undefined
  }
  return (
    <>
      {observed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline">Direta</Badge>
          </TooltipTrigger>
          <TooltipContent>
            Resultado declarado pelo receipt; não é comprovação canônica
          </TooltipContent>
        </Tooltip>
      ) : null}
      {chipVisible && job.projectName ? (
        <ProjectChip name={job.projectName} facts={projectChipFacts(job)} />
      ) : null}
      {flaky ? <Badge variant="outline">Flaky detectado</Badge> : null}
    </>
  )
}

function RunDataTable({
  jobs,
  onOpenJob,
  showOrigin = false,
  showProjectChip = false,
  filterProjectId,
}: {
  jobs: RunTableJob[]
  onOpenJob: (jobId: string) => void
  showOrigin?: boolean
  showProjectChip?: boolean
  filterProjectId?: string
}) {
  const queued = jobs.some((job) => job.status === "queued")
  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "status",
          header: "Estado",
          cell: ({ row }) => (
            <StatusIndicator
              descriptor={describeJobState(row.original.status)}
              presentation="table"
            />
          ),
        }),
        helper.display({
          id: "execution",
          header: "Execução",
          cell: ({ row }) => {
            const job = row.original
            const id = detailId(job)
            return (
              <EntityIdentity
                presentation="table"
                title={job.preset || "Não informada"}
                onOpen={id && job.preset ? () => onOpenJob(id) : undefined}
                badge={identityBadge(job, {
                  always: showProjectChip,
                  filterProjectId,
                })}
              />
            )
          },
        }),
        helper.display({
          id: "time",
          header: queued ? "Entrada" : "Término",
          cell: ({ row }) => {
            const job = row.original
            const at =
              job.status === "queued"
                ? job.createdAt
                : (job.finishedAt ?? job.startedAt ?? job.createdAt)
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="block truncate whitespace-nowrap text-muted-foreground"
                  >
                    {formatTimelineDate(at)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <RelativeTime value={at} />
                </TooltipContent>
              </Tooltip>
            )
          },
        }),
        helper.display({
          id: "duration",
          header: queued ? "Espera" : "Duração",
          cell: ({ row }) => (
            <span className="block truncate whitespace-nowrap">
              {row.original.status === "queued" ? (
                <QueueWait value={row.original.createdAt} />
              ) : (
                <JobDuration job={row.original} />
              )}
            </span>
          ),
        }),
        helper.display({
          id: "revision",
          header: "Revisão",
          cell: ({ row }) => {
            const job = row.original
            const origins = job.origins ?? (job.origin ? [job.origin] : [])
            const origin = origins
              .map((value) => (value === "machine" ? "Máquina" : "Git"))
              .join(" + ")
            const label =
              [shortSha(job.headSha), job.branch].filter(Boolean).join(" · ") ||
              "Não informada"
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="block max-w-64 truncate font-mono text-xs">
                    {label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {label}
                  {showOrigin && origin ? ` · ${origin}` : ""}
                </TooltipContent>
              </Tooltip>
            )
          },
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Ações</span>,
          cell: ({ row }) => {
            const id = detailId(row.original)
            return id ? (
              <InspectButton
                presentation="table"
                onClick={() => onOpenJob(id)}
              />
            ) : null
          },
        }),
      ]),
    [filterProjectId, onOpenJob, queued, showOrigin, showProjectChip]
  )
  const table = useTable({
    columns,
    data: jobs,
    features,
    getRowId: (row) =>
      row.rowKey ?? row.id ?? row.ticketId ?? `${row.preset}-${row.finishedAt}`,
  })
  return (
    <DataTableFrame placement="card" label="Execuções">
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className={columnClass(header.column.id)}
              >
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={`overflow-hidden ${columnClass(cell.column.id) ?? ""}`}
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </DataTableFrame>
  )
}

function headers(kind: "queue" | "terminal") {
  return [
    "Estado",
    "Execução",
    kind === "queue" ? "Entrada" : "Término",
    kind === "queue" ? "Espera" : "Duração",
    "Revisão",
    "",
  ]
}
function EmptyTable({
  title,
  description,
  kind,
}: {
  title: string
  description: string
  kind: "queue" | "terminal"
}) {
  return (
    <DataTableFrame placement="card" label="Execuções">
      <TableHeader>
        <TableRow>
          {headers(kind).map((header, index) => (
            <TableHead
              key={`${header}-${index}`}
              className={columnClass(
                [
                  "status",
                  "execution",
                  "time",
                  "duration",
                  "revision",
                  "actions",
                ][index]
              )}
            >
              {header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={6} className="p-0">
            <Empty className="sticky left-0 w-[calc(100vw-2rem)] border-0 py-8 sm:static sm:w-auto">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>{title}</EmptyTitle>
                <EmptyDescription>{description}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableCell>
        </TableRow>
      </TableBody>
    </DataTableFrame>
  )
}

export function RunTable({
  toolbar,
  title,
  description,
  jobs,
  loading,
  error,
  emptyTitle = "Nenhuma execução encontrada",
  emptyDescription,
  onOpenJob,
  hasMore = false,
  loadingMore = false,
  loadMoreError,
  onLoadMore,
  showOrigin = false,
  kind = "terminal",
  showProjectChip = false,
  filterProjectId,
}: RunTableProps) {
  const data = jobs ?? EMPTY
  if (kind === "queue" && !loading && !error && !data.length) {
    return (
      <Card size="sm">
        <CardContent>
          <Empty className="flex-row justify-start gap-3 rounded-none p-0 text-left">
            <EmptyMedia className="mb-0 text-muted-foreground">
              <InboxIcon className="size-4" />
            </EmptyMedia>
            <EmptyHeader className="items-start">
              <EmptyTitle>Fila livre</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="gap-0 pb-0" aria-label={title}>
      <CardHeader className="gap-3 pb-4">
        {!toolbar ? (
          <CardTitle role="heading" aria-level={2}>
            {title}
          </CardTitle>
        ) : null}
        {toolbar}
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="overflow-hidden">
            <DataTableFrame placement="card" label="Carregando execuções">
              <TableHeader>
                <TableRow>
                  {headers(kind).map((h, i) => (
                    <TableHead key={`${h}-${i}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    {headers(kind).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </DataTableFrame>
          </div>
        ) : null}
        {!loading && error ? (
          <ErrorState
            title={`Não foi possível carregar ${title.toLowerCase()}`}
            error={error}
          />
        ) : null}
        {!loading && !error && !data.length ? (
          <div className="overflow-hidden">
            <EmptyTable
              title={emptyTitle}
              description={emptyDescription}
              kind={kind}
            />
          </div>
        ) : null}
        {!loading && !error && data.length ? (
          <RunDataTable
            jobs={data}
            onOpenJob={onOpenJob}
            showOrigin={showOrigin}
            showProjectChip={showProjectChip}
            filterProjectId={filterProjectId}
          />
        ) : null}
      </CardContent>
      {loadMoreError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadMoreError.message}
        </p>
      ) : null}
      {hasMore && onLoadMore ? (
        <CardFooter className="border-0 bg-transparent">
          <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
