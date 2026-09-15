import * as React from "react"
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  EyeIcon,
  InboxIcon,
  LoaderCircleIcon,
  MinusCircleIcon,
  XCircleIcon,
} from "lucide-react"

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
  Table,
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
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  shortSha,
  statusLabel,
} from "@/features/shared/format"
import type { JobRecord, JobStatus } from "@/lib/types"

const features = tableFeatures({})
export type RunTableJob = Omit<JobRecord, "id"> & {
  id?: string
  ticketId?: string
  rowKey?: string
  detailsJobId?: string
  detailsAvailable?: boolean
  origin?: "machine" | "git"
  origins?: Array<"machine" | "git">
}
const helper = createColumnHelper<typeof features, RunTableJob>()
const EMPTY: RunTableJob[] = []

function statusVariant(status: JobStatus | undefined) {
  return status === "failed" || status === "interrupted"
    ? ("destructive" as const)
    : status === "passed"
      ? ("secondary" as const)
      : ("outline" as const)
}
export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
}
export function JobStatusIcon({ status }: { status: JobStatus | undefined }) {
  const Icon =
    status === "passed"
      ? CheckCircle2Icon
      : status === "running"
        ? LoaderCircleIcon
        : status === "failed" ||
            status === "interrupted" ||
            status === "cancelled"
          ? XCircleIcon
          : status === "queued"
            ? CircleDotIcon
            : MinusCircleIcon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-8 items-center justify-center"
          aria-label={statusLabel(status)}
        >
          <Icon
            className={status === "running" ? "size-4 animate-spin" : "size-4"}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{statusLabel(status)}</TooltipContent>
    </Tooltip>
  )
}

export type RunTableProps = {
  title: string
  description?: string
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
}
function detailId(job: RunTableJob) {
  return (
    job.detailsJobId ?? (job.detailsAvailable !== false ? job.id : undefined)
  )
}

function columnClass(id: string) {
  if (id === "status") return "w-16"
  if (id === "execution") return "w-36"
  if (id === "time") return "w-36"
  if (id === "duration") return "w-20"
  if (id === "actions") return "w-10"
  return undefined
}

function RunDataTable({
  jobs,
  onOpenJob,
  showOrigin = false,
}: {
  jobs: RunTableJob[]
  onOpenJob: (jobId: string) => void
  showOrigin?: boolean
}) {
  const queued = jobs.some((job) => job.status === "queued")
  const columns = React.useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "status",
          header: "Estado",
          cell: ({ row }) => <JobStatusIcon status={row.original.status} />,
        }),
        helper.display({
          id: "execution",
          header: "Execução",
          cell: ({ row }) => {
            const job = row.original
            const id = detailId(job)
            return job.preset ? (
              id ? (
                <Button
                  variant="link"
                  className="h-auto w-full min-w-0 justify-start truncate p-0"
                  onClick={() => onOpenJob(id)}
                >
                  {job.preset}
                </Button>
              ) : (
                <span className="block w-full min-w-0 truncate font-medium">
                  {job.preset}
                </span>
              )
            ) : (
              <span className="text-muted-foreground">Não informada</span>
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
              <span className="block truncate whitespace-nowrap text-muted-foreground">
                {formatTimelineDate(at)} · {formatRelativeTime(at)}
              </span>
            )
          },
        }),
        helper.display({
          id: "duration",
          header: queued ? "Espera" : "Duração",
          cell: ({ row }) => (
            <span className="block truncate whitespace-nowrap">
              {row.original.status === "queued"
                ? formatRelativeTime(row.original.createdAt)
                : formatDuration(row.original.durationMs)}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Ver ${row.original.preset ?? "execução"}`}
                    onClick={() => onOpenJob(id)}
                  >
                    <EyeIcon data-icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver execução</TooltipContent>
              </Tooltip>
            ) : null
          },
        }),
      ]),
    [onOpenJob, queued, showOrigin]
  )
  const table = useTable({
    columns,
    data: jobs,
    features,
    getRowId: (row) =>
      row.rowKey ?? row.id ?? row.ticketId ?? `${row.preset}-${row.finishedAt}`,
  })
  return (
    <Table className="min-w-[40rem] table-fixed">
      <TableHeader className="bg-muted/50">
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
                className={`h-12 overflow-hidden py-2 ${columnClass(cell.column.id) ?? ""}`}
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
    <Table className="table-fixed">
      <TableHeader className="bg-muted/50">
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
    </Table>
  )
}

export function RunTable({
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
}: RunTableProps) {
  const data = jobs ?? EMPTY
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`${title}-heading`}
    >
      <div id={`${title}-heading`}>
        <h2 className="text-base font-medium">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {loading ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
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
          </Table>
        </div>
      ) : null}
      {!loading && error ? (
        <ErrorState
          title={`Não foi possível carregar ${title.toLowerCase()}`}
          error={error}
        />
      ) : null}
      {!loading && !error && !data.length ? (
        <div className="overflow-hidden rounded-lg border">
          <EmptyTable
            title={emptyTitle}
            description={emptyDescription}
            kind={kind}
          />
        </div>
      ) : null}
      {!loading && !error && data.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <RunDataTable
            jobs={data}
            onOpenJob={onOpenJob}
            showOrigin={showOrigin}
          />
        </div>
      ) : null}
      {loadMoreError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadMoreError.message}
        </p>
      ) : null}
      {hasMore && onLoadMore ? (
        <div>
          <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? "Carregando…" : "Carregar mais"}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
