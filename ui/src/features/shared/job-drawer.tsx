import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  getDiagnostic,
  getJob,
  getLog,
  getLogExport,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type { Diagnostic, JobRecord, LogExport, LogSlice } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import {
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  statusLabel,
} from "@/features/shared/format"
import { JobStatusBadge } from "@/features/shared/run-table"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import {
  CheckCircle2Icon,
  ClipboardIcon,
  CircleDotIcon,
  DownloadIcon,
  FileWarningIcon,
  LoaderCircleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

const DEFAULT_CLIPBOARD_LIMIT_BYTES = 512_000

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function copyText(value: string, limit: number | undefined) {
  const maxBytes = limit ?? DEFAULT_CLIPBOARD_LIMIT_BYTES
  if (new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new Error("O conteúdo excede o limite de cópia da bridge.")
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error(
      "A área de transferência não está disponível neste navegador."
    )
  }
  await navigator.clipboard.writeText(value)
}

function contextForJob(job: JobRecord) {
  return [
    `Ticket: ${job.id}`,
    `Preset: ${job.preset || "Não informado"}`,
    `Estado: ${statusLabel(job.status)}`,
    `Branch: ${job.branch || "Não informada"}`,
    `SHA: ${job.headSha || "Não informado"}`,
    `Diretório: ${job.cwd || "Não informado"}`,
    `Início: ${job.startedAt || "Não registrado"}`,
    `Conclusão: ${job.finishedAt || "Não registrada"}`,
    `Duração: ${formatDuration(job.durationMs)}`,
    ...(job.failureReason ? [`Motivo: ${job.failureReason}`] : []),
  ].join("\n")
}

function diagnosticBundle(diagnostic: Diagnostic, logExport?: LogExport) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      diagnostic,
      ...(logExport ? { logExport } : {}),
    },
  }
}

type DiagnosticExportAction =
  "copy-diagnostic" | "download-diagnostic" | "download-log"

type PagedLogQuery = ApiQuery<LogSlice> & {
  loadMore: () => void
  loadingMore: boolean
  loadMoreError: Error | undefined
}

function mergeLogSlices(first: LogSlice, pages: LogSlice[]) {
  return pages.reduce<LogSlice>(
    (combined, page) => ({
      ...page,
      content: `${combined.content}${page.content}`,
      offset: first.offset,
    }),
    first
  )
}

function usePagedLog(jobId: string, enabled: boolean): PagedLogQuery {
  const request = React.useCallback(() => getLog(jobId), [jobId])
  const initial = useApiQuery(`log:${jobId}`, request, { enabled })
  const { reload: reloadInitial } = initial
  const [pageState, setPageState] = React.useState<{
    jobId: string
    pages: LogSlice[]
    loadingMore: boolean
    loadMoreError: Error | undefined
  }>({
    jobId,
    pages: [],
    loadingMore: false,
    loadMoreError: undefined,
  })
  const requestVersion = React.useRef(0)
  const loadingMore = pageState.jobId === jobId ? pageState.loadingMore : false
  const loadMoreError =
    pageState.jobId === jobId ? pageState.loadMoreError : undefined

  const data = React.useMemo(() => {
    if (!initial.data || initial.data.jobId !== jobId) {
      return undefined
    }
    return mergeLogSlices(
      initial.data,
      pageState.jobId === jobId ? pageState.pages : []
    )
  }, [initial.data, jobId, pageState])

  const reload = React.useCallback(() => {
    requestVersion.current += 1
    setPageState({
      jobId,
      pages: [],
      loadingMore: false,
      loadMoreError: undefined,
    })
    reloadInitial()
  }, [jobId, reloadInitial])

  const loadMore = React.useCallback(() => {
    if (
      !data ||
      data.error ||
      data.complete ||
      data.nextOffset >= data.sourceBytes ||
      loadingMore
    ) {
      return
    }

    const offset = data.nextOffset
    const version = requestVersion.current
    setPageState((current) => ({
      jobId,
      pages: current.jobId === jobId ? current.pages : [],
      loadingMore: true,
      loadMoreError: undefined,
    }))

    void getLog(jobId, offset)
      .then((page) => {
        if (requestVersion.current !== version || page.offset !== offset) {
          return
        }
        setPageState((current) => {
          if (current.jobId !== jobId) {
            return current
          }
          return {
            ...current,
            pages: [...current.pages, page],
          }
        })
      })
      .catch((reason) => {
        if (requestVersion.current !== version) {
          return
        }
        setPageState((current) => {
          if (current.jobId !== jobId) {
            return current
          }
          return {
            ...current,
            loadMoreError:
              reason instanceof Error
                ? reason
                : new Error("Não foi possível carregar mais do log."),
          }
        })
      })
      .finally(() => {
        if (requestVersion.current === version) {
          setPageState((current) =>
            current.jobId === jobId
              ? { ...current, loadingMore: false }
              : current
          )
        }
      })
  }, [data, jobId, loadingMore])

  return {
    ...initial,
    data,
    reload,
    loadMore,
    loadingMore,
    loadMoreError,
  }
}

function stageIcon(
  status: "pending" | "running" | "passed" | "failed" | "skipped"
) {
  if (status === "passed") {
    return CheckCircle2Icon
  }
  if (status === "failed") {
    return XCircleIcon
  }
  if (status === "running") {
    return LoaderCircleIcon
  }
  return CircleDotIcon
}

function JobHeaderTimeline({ job }: { job: JobRecord }) {
  const timestamp = job.finishedAt ?? job.startedAt ?? job.createdAt
  return (
    <DrawerDescription>
      {formatTimelineDate(timestamp)} · {formatRelativeTime(timestamp)} ·{" "}
      {formatDuration(job.durationMs)}
    </DrawerDescription>
  )
}

function stageStatusLabel(
  status: "pending" | "running" | "passed" | "failed" | "skipped"
) {
  const labels = {
    pending: "Aguardando",
    running: "Em execução",
    passed: "Passou",
    failed: "Falhou",
    skipped: "Ignorada",
  }
  return labels[status]
}

function JobDetailsTable({ job }: { job: JobRecord }) {
  const rows = [
    { label: "Ticket", value: job.id, className: "font-mono" },
    { label: "Branch", value: job.branch },
    { label: "SHA", value: job.headSha, className: "font-mono" },
    { label: "Diretório", value: job.cwd },
  ]

  return (
    <Table>
      <TableCaption className="sr-only">Detalhes da execução</TableCaption>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableHead scope="row" className="w-28 text-muted-foreground">
              {row.label}
            </TableHead>
            <TableCell
              className={`break-all whitespace-normal ${row.className ?? ""}`}
            >
              {row.value || "Não informado"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ProgressPanel({ job }: { job: ApiQuery<JobRecord> }) {
  if (job.loading) {
    return <Skeleton className="h-52 w-full" />
  }

  if (job.error) {
    return (
      <ErrorState
        title="Não foi possível carregar a execução"
        error={job.error}
        onRetry={job.reload}
      />
    )
  }

  if (!job.data) {
    return (
      <EmptyState
        title="Execução indisponível"
        description="O ticket solicitado não está disponível neste projeto."
      />
    )
  }

  const stages = job.data.progressSummary?.roots ?? []

  return (
    <div className="flex flex-col gap-5">
      {stages.length ? (
        <ItemGroup className="gap-0">
          {stages.map((stage, index) => {
            const Icon = stageIcon(stage.status)
            return (
              <div
                key={stage.id}
                className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3"
              >
                <div className="flex min-h-10 flex-col items-center pt-2">
                  <Icon
                    aria-hidden="true"
                    className={
                      stage.status === "running" ? "animate-spin" : undefined
                    }
                  />
                  {index < stages.length - 1 ? (
                    <Separator
                      orientation="vertical"
                      className="my-1 min-h-4 flex-1"
                    />
                  ) : null}
                </div>
                <Item className="border-transparent px-0 py-1">
                  <ItemContent>
                    <ItemTitle>{stage.label}</ItemTitle>
                    <ItemDescription>
                      {stageStatusLabel(stage.status)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            )
          })}
        </ItemGroup>
      ) : null}
      <JobDetailsTable job={job.data} />
    </div>
  )
}

function LogPanel({ log }: { log: PagedLogQuery }) {
  if (log.loading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (log.error) {
    return (
      <ErrorState
        title="Não foi possível ler o log"
        error={log.error}
        onRetry={log.reload}
      />
    )
  }

  if (!log.data || log.data.error) {
    return (
      <EmptyState
        title="Log indisponível"
        description={
          log.data?.error || "O log não está disponível para este ticket."
        }
      />
    )
  }

  const canLoadMore =
    !log.data.complete && log.data.nextOffset < log.data.sourceBytes

  return (
    <div className="flex flex-col gap-3">
      <pre className="font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
        {log.data.content || "Log vazio."}
      </pre>
      {!log.data.complete ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Exibidos {log.data.nextOffset.toLocaleString("pt-BR")} de{" "}
            {log.data.sourceBytes.toLocaleString("pt-BR")} bytes.
          </p>
          {log.loadMoreError ? (
            <p className="text-sm text-destructive" role="alert">
              {log.loadMoreError.message}
            </p>
          ) : null}
          {canLoadMore ? (
            <Button
              type="button"
              variant="ghost"
              onClick={log.loadMore}
              disabled={log.loadingMore}
            >
              {log.loadingMore ? "Carregando log" : "Carregar mais do log"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DiagnosticPopover({
  jobId,
  clipboardLimitBytes,
}: {
  jobId: string
  clipboardLimitBytes: number | undefined
}) {
  const [diagnosticRequested, setDiagnosticRequested] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<Error>()
  const exportCache = React.useRef<LogExport | undefined>(undefined)
  const exportRequest = React.useRef<Promise<LogExport> | undefined>(undefined)
  const diagnosticRequest = React.useCallback(
    () => getDiagnostic(jobId),
    [jobId]
  )
  const diagnostic = useApiQuery(`diagnostic:${jobId}`, diagnosticRequest, {
    enabled: diagnosticRequested,
  })
  const ticket = diagnostic.data?.available ? diagnostic.data.ticket : undefined

  const copyDiagnostic = React.useCallback(
    async (bundle: ReturnType<typeof diagnosticBundle>) => {
      try {
        await copyText(JSON.stringify(bundle, null, 2), clipboardLimitBytes)
        toast.success("Diagnóstico copiado.")
      } catch (reason) {
        toast.error(
          reason instanceof Error
            ? reason.message
            : "Não foi possível copiar o diagnóstico."
        )
      }
    },
    [clipboardLimitBytes]
  )

  const loadExport = React.useCallback(async () => {
    if (exportCache.current) {
      return exportCache.current
    }
    if (exportRequest.current) {
      return exportRequest.current
    }

    setExportError(undefined)
    setExporting(true)
    const request = getLogExport(jobId)
      .then((result) => {
        exportCache.current = result
        return result
      })
      .catch((reason) => {
        const error =
          reason instanceof Error
            ? reason
            : new Error("Não foi possível preparar a exportação.")
        setExportError(error)
        throw error
      })
      .finally(() => {
        exportRequest.current = undefined
        setExporting(false)
      })
    exportRequest.current = request
    return request
  }, [jobId])

  const requestExport = React.useCallback(
    (action: DiagnosticExportAction) => {
      const currentDiagnostic = diagnostic.data
      if (!currentDiagnostic?.available) {
        return
      }

      void loadExport()
        .then((logExport) => {
          const bundle = diagnosticBundle(currentDiagnostic, logExport)
          if (action === "copy-diagnostic") {
            return copyDiagnostic(bundle)
          }

          if (action === "download-diagnostic") {
            downloadFile(
              `ci-diagnostic-${jobId}.json`,
              JSON.stringify(bundle, null, 2),
              "application/json;charset=utf-8"
            )
            toast.success("Diagnóstico baixado.")
            return
          }

          if (!logExport.coverage.available) {
            const error = new Error(
              logExport.coverage.reason || "Log indisponível para download."
            )
            setExportError(error)
            toast.error(error.message)
            return
          }

          downloadFile(
            `${jobId}.log`,
            logExport.content,
            "text/plain;charset=utf-8"
          )
        })
        .catch((reason) => {
          toast.error(
            reason instanceof Error
              ? reason.message
              : "Não foi possível preparar a exportação."
          )
        })
    },
    [copyDiagnostic, diagnostic.data, jobId, loadExport]
  )

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setDiagnosticRequested(true)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost">
          <FileWarningIcon data-icon />
          Diagnóstico
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {diagnostic.loading ? <Skeleton className="h-16 w-full" /> : null}
        {diagnostic.error ? (
          <PopoverDescription>{diagnostic.error.message}</PopoverDescription>
        ) : null}
        {diagnostic.data && !diagnostic.data.available ? (
          <PopoverDescription>
            {diagnostic.data.reason || "Diagnóstico indisponível."}
          </PopoverDescription>
        ) : null}
        {diagnostic.data?.available ? (
          <>
            <PopoverHeader>
              <PopoverTitle>Diagnóstico</PopoverTitle>
              <PopoverDescription>
                {ticket
                  ? `${statusLabel(ticket.status)}${
                      typeof ticket.exitCode === "number"
                        ? ` · código de saída ${ticket.exitCode}`
                        : ""
                    }`
                  : "Estado não registrado."}
              </PopoverDescription>
              {ticket?.failureReason ? (
                <PopoverDescription>
                  Motivo registrado: {ticket.failureReason}
                </PopoverDescription>
              ) : null}
            </PopoverHeader>
            {exportError ? (
              <PopoverDescription>{exportError.message}</PopoverDescription>
            ) : null}
            {exporting ? (
              <PopoverDescription>
                Preparando conteúdo para exportação…
              </PopoverDescription>
            ) : null}
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={exporting}
                onClick={() => requestExport("copy-diagnostic")}
              >
                <ClipboardIcon data-icon />
                Copiar diagnóstico
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={exporting}
                onClick={() => requestExport("download-diagnostic")}
              >
                <DownloadIcon data-icon />
                Baixar diagnóstico
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={exporting}
                onClick={() => requestExport("download-log")}
              >
                <DownloadIcon data-icon />
                Baixar log
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

type JobDrawerProps = {
  jobId: string
  onClose: () => void
}

export function JobDrawer(props: JobDrawerProps) {
  return <JobDrawerContent key={props.jobId} {...props} />
}

function JobDrawerContent({ jobId, onClose }: JobDrawerProps) {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = React.useState<"progress" | "log">(
    "progress"
  )
  const [logRequested, setLogRequested] = React.useState(false)
  const jobRequest = React.useCallback(() => getJob(jobId), [jobId])
  const job = useApiQuery(`job:${jobId}`, jobRequest)
  const log = usePagedLog(jobId, logRequested)
  const session = useDashboardSession()

  const copyContext = async () => {
    if (!job.data) {
      return
    }
    try {
      await copyText(contextForJob(job.data), session.data?.clipboardLimitBytes)
      toast.success("Contexto copiado.")
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "Não foi possível copiar o contexto."
      )
    }
  }

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent className="min-h-0 sm:max-w-2xl">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DrawerTitle>{job.data?.preset || "Execução"}</DrawerTitle>
                {job.data ? <JobStatusBadge status={job.data.status} /> : null}
              </div>
              {job.data ? (
                <JobHeaderTimeline job={job.data} />
              ) : (
                <DrawerDescription>
                  Carregando dados da execução…
                </DrawerDescription>
              )}
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fechar execução"
              >
                <XIcon data-icon />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "log") {
              setLogRequested(true)
            }
            setActiveTab(value as "progress" | "log")
          }}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="shrink-0 border-b px-4 py-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="progress">Progresso</TabsTrigger>
              <TabsTrigger value="log">Log</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="progress"
            className="min-h-0 overflow-hidden px-0"
          >
            <ScrollArea className="h-full px-4 py-5">
              <ProgressPanel job={job} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="log" className="min-h-0 overflow-hidden px-0">
            <ScrollArea className="h-full px-4 py-5">
              <LogPanel log={log} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
        <DrawerFooter className="shrink-0 border-t sm:flex-row sm:justify-end">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!job.data}
              onClick={() => void copyContext()}
            >
              <ClipboardIcon data-icon />
              Copiar contexto
            </Button>
            <DiagnosticPopover
              jobId={jobId}
              clipboardLimitBytes={session.data?.clipboardLimitBytes}
            />
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
