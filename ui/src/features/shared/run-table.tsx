import * as React from "react"
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/features/shared/async-state"
import {
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  shortSha,
  statusLabel,
} from "@/features/shared/format"
import type { JobRecord, JobStatus } from "@/lib/types"

const runTableFeatures = tableFeatures({})
export type RunTableJob = Omit<JobRecord, "id"> & {
  id?: string
  ticketId?: string
  rowKey?: string
  detailsJobId?: string
  detailsAvailable?: boolean
  origin?: "machine" | "git"
  origins?: Array<"machine" | "git">
}

const runColumnHelper = createColumnHelper<
  typeof runTableFeatures,
  RunTableJob
>()
const EMPTY_JOBS: RunTableJob[] = []

function statusVariant(status: JobStatus | undefined) {
  if (status === "failed" || status === "interrupted") {
    return "destructive" as const
  }
  if (status === "passed") {
    return "secondary" as const
  }
  return "outline" as const
}

export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  const Icon =
    status === "passed"
      ? CheckCircle2Icon
      : status === "running"
        ? LoaderCircleIcon
        : status === "failed" ||
            status === "interrupted" ||
            status === "cancelled"
          ? XCircleIcon
          : CircleDotIcon
  return (
    <Badge variant={statusVariant(status)}>
      <Icon
        data-icon
        className={status === "running" ? "animate-spin" : undefined}
      />
      {statusLabel(status)}
    </Badge>
  )
}

export type RunTableProps = {
  title: string
  description?: string
  jobs: RunTableJob[] | undefined
  loading: boolean
  error: Error | undefined
  emptyDescription: string
  onOpenJob: (jobId: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  loadMoreError?: Error
  onLoadMore?: () => void
  showOrigin?: boolean
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
  const columns = React.useMemo(
    () =>
      runColumnHelper.columns([
        runColumnHelper.display({
          id: "execution",
          header: "Execução",
          cell: ({ row }) => {
            const job = row.original
            const timestamp = job.finishedAt ?? job.startedAt ?? job.createdAt
            const detailJobId =
              job.detailsJobId ??
              (job.detailsAvailable !== false ? job.id : undefined)
            return (
              <div className="flex min-w-52 flex-col items-start gap-1.5">
                <div className="flex max-w-full flex-wrap items-center gap-2">
                  {job.preset ? (
                    detailJobId === undefined ? (
                      <span className="font-medium">{job.preset}</span>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto max-w-full justify-start px-0 py-0 text-left"
                        onClick={() => onOpenJob(detailJobId)}
                      >
                        {job.preset}
                      </Button>
                    )
                  ) : (
                    <span className="font-medium">Preset não informado</span>
                  )}
                  <JobStatusBadge status={job.status} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatTimelineDate(timestamp)} ·{" "}
                  {formatRelativeTime(timestamp)} ·{" "}
                  {formatDuration(job.durationMs)}
                </span>
              </div>
            )
          },
        }),
        runColumnHelper.display({
          id: "context",
          header: "Contexto",
          cell: ({ row }) => {
            const job = row.original
            const origins = job.origins ?? (job.origin ? [job.origin] : [])
            const originLabel = origins
              .map((origin) => (origin === "machine" ? "Máquina" : "Git"))
              .join(" · ")
            return (
              <div className="flex flex-col gap-1 text-muted-foreground">
                <span>Ticket {job.ticketId ?? job.id ?? "indisponível"}</span>
                <span>{job.branch || "Branch não informada"}</span>
                <span className="font-mono text-xs">
                  {shortSha(job.headSha)}
                </span>
                {showOrigin && originLabel ? (
                  <span className="text-xs">Origem: {originLabel}</span>
                ) : null}
              </div>
            )
          },
        }),
      ]),
    [onOpenJob, showOrigin]
  )
  const table = useTable({
    columns,
    data: jobs,
    features: runTableFeatures,
    getRowId: (row) =>
      row.rowKey ??
      row.id ??
      row.ticketId ??
      row.preset ??
      "registro-indisponível",
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
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
              <TableCell key={cell.id} className="align-top">
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RunEmptyTable({ description }: { description: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Execução</TableHead>
          <TableHead>Contexto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={2}
            className="h-24 text-center text-sm text-muted-foreground"
          >
            {description}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function RunTableHeader({
  title,
  description,
}: Pick<RunTableProps, "title" | "description">) {
  return (
    <div>
      <h2 className="text-base font-medium">{title}</h2>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

/** Official DataTable composition adapted to the two-column CI execution contract. */
export function RunTable({
  title,
  description,
  jobs,
  loading,
  error,
  emptyDescription,
  onOpenJob,
  hasMore = false,
  loadingMore = false,
  loadMoreError,
  onLoadMore,
  showOrigin = false,
}: RunTableProps) {
  const data = jobs ?? EMPTY_JOBS

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`${title}-heading`}
    >
      <div id={`${title}-heading`}>
        <RunTableHeader title={title} description={description} />
      </div>
      {loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Execução</TableHead>
              <TableHead>Contexto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[0, 1, 2].map((index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-52" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {!loading && error ? (
        <ErrorState
          title={`Não foi possível carregar ${title.toLowerCase()}`}
          error={error}
        />
      ) : null}
      {!loading && !error && !data.length ? (
        <RunEmptyTable description={emptyDescription} />
      ) : null}
      {!loading && !error && data.length ? (
        <RunDataTable
          jobs={data}
          onOpenJob={onOpenJob}
          showOrigin={showOrigin}
        />
      ) : null}
      {loadMoreError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadMoreError.message}
        </p>
      ) : null}
      {hasMore && onLoadMore ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Carregando execuções" : "Carregar mais execuções"}
        </Button>
      ) : null}
    </section>
  )
}
