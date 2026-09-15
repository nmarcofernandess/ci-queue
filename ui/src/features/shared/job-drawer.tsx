import { statusColor } from "@/features/shared/status-color"
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
import type {
  Diagnostic,
  JobRecord,
  LogExport,
  LogSlice,
  ProgressNode,
} from "@/lib/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
  ItemActions,
  ItemContent,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  ChevronDownIcon,
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

type DiagnosticExportAction = "copy-diagnostic" | "download-diagnostic"

function useLiveLog(jobId: string, enabled: boolean) {
  const request = React.useCallback(
    () => getLog(jobId, 0, 8 * 1024 * 1024),
    [jobId]
  )
  return useApiQuery<LogSlice>(`log:${jobId}`, request, {
    enabled,
    pollMs: 2_000,
  })
}

function StageGlyph({ status }: { status: ProgressNode["status"] }) {
  if (status === "passed")
    return (
      <CheckCircle2Icon className={`size-4 shrink-0 ${statusColor(status)}`} />
    )
  if (status === "failed")
    return <XCircleIcon className={`size-4 shrink-0 ${statusColor(status)}`} />
  if (status === "running")
    return (
      <LoaderCircleIcon
        className={`size-4 shrink-0 animate-spin ${statusColor(status)}`}
      />
    )
  return <CircleDotIcon className={`size-4 shrink-0 ${statusColor(status)}`} />
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

function ProgressNodeRow({
  node,
  childrenByParent,
}: {
  node: ProgressNode
  childrenByParent: Map<string, ProgressNode[]>
}) {
  const children = childrenByParent.get(node.id) ?? []
  const content = (
    <Item className="min-w-0 border-transparent px-0 py-1">
      <ItemContent>
        <div className="flex min-w-0 items-center gap-2">
          <StageGlyph status={node.status} />
          <ItemTitle className="truncate">{node.label}</ItemTitle>
          {typeof node.retryCount === "number" && node.retryCount > 0 ? (
            <Badge variant="outline">Flaky detectado</Badge>
          ) : null}
        </div>
        {node.detail ? (
          <p className="text-sm text-muted-foreground">{node.detail}</p>
        ) : null}
      </ItemContent>
      <ItemActions className="text-sm text-muted-foreground">
        {typeof node.durationMs === "number"
          ? formatDuration(node.durationMs)
          : stageStatusLabel(node.status)}
      </ItemActions>
    </Item>
  )
  if (!children.length) return content
  return (
    <Collapsible
      defaultOpen={node.status === "running" || node.status === "failed"}
    >
      <div className="flex items-center gap-1">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Expandir ${node.label}`}
          >
            <ChevronDownIcon data-icon />
          </Button>
        </CollapsibleTrigger>
        <div className="min-w-0 flex-1">{content}</div>
      </div>
      <CollapsibleContent className="ml-5 border-l pl-4">
        {children.map((child) => (
          <ProgressNodeRow
            key={child.id}
            node={child}
            childrenByParent={childrenByParent}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function ProgressPanel({ job }: { job: ApiQuery<JobRecord> }) {
  if (job.loading) return <Skeleton className="h-52 w-full" />
  if (job.error)
    return (
      <ErrorState
        title="Não foi possível carregar a execução"
        error={job.error}
        onRetry={job.reload}
      />
    )
  if (!job.data)
    return (
      <EmptyState
        title="Execução indisponível"
        description="O ticket solicitado não está disponível neste projeto."
      />
    )
  const nodes =
    job.data.progressSummary?.nodes ?? job.data.progressSummary?.roots ?? []
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
    <div className="flex flex-col gap-5">
      <JobDetailsTable job={job.data} />
      {job.data.failureReason ? (
        <Alert variant="destructive">
          <FileWarningIcon />
          <AlertTitle>Motivo da falha</AlertTitle>
          <AlertDescription>{job.data.failureReason}</AlertDescription>
        </Alert>
      ) : null}
      {roots.length ? (
        <ItemGroup className="gap-1">
          {roots.map((node) => (
            <ProgressNodeRow
              key={node.id}
              node={node}
              childrenByParent={childrenByParent}
            />
          ))}
        </ItemGroup>
      ) : (
        <EmptyState
          title="Progresso não registrado"
          description="Esta execução não publicou etapas estruturadas."
        />
      )}
    </div>
  )
}

function LogPanel({
  log,
  running,
}: {
  log: ApiQuery<LogSlice>
  running: boolean
}) {
  const viewport = React.useRef<HTMLDivElement>(null)
  const [following, setFollowing] = React.useState(true)
  React.useEffect(() => {
    if (!following || !viewport.current) return
    viewport.current.scrollTop = viewport.current.scrollHeight
  }, [following, log.data?.content])
  if (log.loading) return <Skeleton className="h-64 w-full" />
  if (log.error)
    return (
      <ErrorState
        title="Não foi possível ler o log"
        error={log.error}
        onRetry={log.reload}
      />
    )
  if (!log.data || log.data.error)
    return (
      <EmptyState
        title="Log indisponível"
        description={
          log.data?.error || "O log não está disponível para este ticket."
        }
      />
    )
  return (
    <div className="relative h-full min-h-0">
      <div
        ref={viewport}
        className="h-full overflow-auto px-4 py-5"
        onScroll={(event) => {
          const target = event.currentTarget
          setFollowing(
            target.scrollHeight - target.scrollTop - target.clientHeight < 24
          )
        }}
      >
        <pre className="font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
          {log.data.content || "Log vazio."}
        </pre>
      </div>
      {!following ? (
        <Button
          type="button"
          size="sm"
          className="absolute right-5 bottom-5"
          onClick={() => {
            setFollowing(true)
            requestAnimationFrame(() => {
              if (viewport.current)
                viewport.current.scrollTop = viewport.current.scrollHeight
            })
          }}
        >
          {running ? "Acompanhar" : "Ir ao fim"}
        </Button>
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

          downloadFile(
            `ci-diagnostic-${jobId}.json`,
            JSON.stringify(bundle, null, 2),
            "application/json;charset=utf-8"
          )
          toast.success("Diagnóstico baixado.")
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
  const log = useLiveLog(jobId, logRequested)
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
      <DrawerContent className="h-[80vh] min-h-0 sm:h-auto sm:w-[36rem] sm:max-w-[36rem]!">
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
            <LogPanel log={log} running={job.data?.status === "running"} />
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
