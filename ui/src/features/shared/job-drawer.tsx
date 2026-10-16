import { ProgressTree } from "./progress-tree"
import { useLiveLog } from "./use-live-log"
import { JobTimeline } from "./live-time"
import * as React from "react"

import { useProjectContext } from "@/features/projects/project-context"
import { scopeKey } from "@/features/projects/scope"
import {
  getDiagnostic,
  getJob,
  getLogExport,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type { Diagnostic, JobRecord, LogExport, LogSlice } from "@/lib/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DetailDrawer,
  DetailDrawerHeader,
  DetailDrawerTabs,
  DetailDrawerBody,
  DetailDrawerFooter,
} from "./detail-drawer"
import { FactsTable } from "./facts-table"
import {
  describeExecutionState,
  describeCompletionFacts,
  executionIsLive,
  observedProgressCopy,
  progressSurface,
  unconfiguredProgressCopy,
} from "./presentation"
import { ProjectChip } from "./project-chip"
import { projectChipFacts } from "./project-chip-model"
import { RunVariantBadge } from "./run-variant-badge"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import { formatDuration, statusLabel } from "@/features/shared/format"
import { useDashboardSession } from "@/features/status/use-dashboard-session"
import { ClipboardIcon, CircleAlertIcon, DownloadIcon, FileWarningIcon } from "lucide-react"
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
  const observed = job.recordKind === "observed-execution"
  return [
    observed ? `Execução: ${job.executionId || job.id}` : `Ticket: ${job.id}`,
    ...(observed ? [`Registro: ${job.id}`] : []),
    `Executor: ${observed ? "direct" : job.executor || "queue"}`,
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

function JobDetailsTable({ job }: { job: JobRecord }) {
  const observed = job.recordKind === "observed-execution"
  return (
    <FactsTable
      caption="Detalhes da execução"
      rows={[
        ...(observed
          ? [
              {
                id: "execution",
                label: "Execução",
                value: job.executionId || job.id || "Não informado",
                technical: true,
              },
              {
                id: "record",
                label: "Registro",
                value: job.id || "Não informado",
                technical: true,
              },
              {
                id: "origin",
                label: "Origem",
                value: "Execução direta",
              },
            ]
          : [
              {
                id: "ticket",
                label: "Ticket",
                value: job.id || "Não informado",
                technical: true,
              },
            ]),
        { id: "branch", label: "Branch", value: job.branch || "Não informado" },
        {
          id: "sha",
          label: "SHA",
          value: job.headSha || "Não informado",
          technical: true,
        },
        {
          id: "directory",
          label: "Diretório",
          value: job.cwd || "Não informado",
          technical: true,
        },
      ]}
    />
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
  const surface = progressSurface(job.data)
  return (
    <div className="flex flex-col gap-5">
      <ItemGroup aria-label="Resultado, finalização e limpeza">
        {describeCompletionFacts(job.data).map((fact) => (
          <Item key={fact.label} size="sm">
            <ItemContent>
              <ItemTitle>{fact.label}</ItemTitle>
              <ItemDescription>{fact.value}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
      <JobDetailsTable job={job.data} />
      {job.data.failureReason ? (
        <Alert variant="destructive">
          <FileWarningIcon />
          <AlertTitle>Motivo da falha</AlertTitle>
          <AlertDescription>{job.data.failureReason}</AlertDescription>
        </Alert>
      ) : null}
      {surface === "tree" ? (
        <ProgressTree nodes={nodes} jobStatus={job.data.status} />
      ) : surface === "not-collected" ? (
        <EmptyState
          title={observedProgressCopy.title}
          description={observedProgressCopy.description}
        />
      ) : surface === "unconfigured" ? (
        <Alert variant={unconfiguredProgressCopy.variant}>
          <CircleAlertIcon />
          <AlertTitle>{unconfiguredProgressCopy.title}</AlertTitle>
          <AlertDescription>
            {unconfiguredProgressCopy.description}
          </AlertDescription>
        </Alert>
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
  const [pausedContent, setPausedContent] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!following || !viewport.current) return
    viewport.current.scrollTop = viewport.current.scrollHeight
  }, [following, log.data?.content])
  if (log.loading || (!log.data && !log.error))
    return <Skeleton className="h-64 w-full" />
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
        className="h-full overflow-auto"
        onScroll={(event) => {
          const target = event.currentTarget
          const atEnd =
            target.scrollHeight - target.scrollTop - target.clientHeight < 24
          setFollowing(atEnd)
          setPausedContent(
            atEnd ? null : (pausedContent ?? log.data?.content ?? "")
          )
        }}
      >
        <pre className="font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
          {(pausedContent ?? log.data.content) || "Log vazio."}
        </pre>
      </div>
      {!following ? (
        <Button
          type="button"
          size="sm"
          className="absolute right-5 bottom-5"
          onClick={() => {
            setPausedContent(null)
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
  const { scope } = useProjectContext()
  const diagnosticRequest = React.useCallback(
    (signal?: AbortSignal) =>
      scope ? getDiagnostic(scope, jobId, signal) : Promise.reject(new Error("projeto ausente")),
    [jobId, scope]
  )
  const diagnostic = useApiQuery(`diagnostic:${scope ? scopeKey(scope) : "none"}:${jobId}`, diagnosticRequest, {
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
    const request = getLogExport(scope!, jobId)
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
  }, [jobId, scope])

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
          <FileWarningIcon data-icon="inline-start" />
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
                <ClipboardIcon data-icon="inline-start" />
                Copiar diagnóstico
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={exporting}
                onClick={() => requestExport("download-diagnostic")}
              >
                <DownloadIcon data-icon="inline-start" />
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
  const { scope } = useProjectContext()
  const [activeTab, setActiveTab] = React.useState<"progress" | "log">(
    "progress"
  )
  const [logRequested, setLogRequested] = React.useState(false)
  const jobRequest = React.useCallback(
    (signal?: AbortSignal) =>
      scope ? getJob(scope, jobId, signal) : Promise.reject(new Error("projeto ausente")),
    [jobId, scope]
  )
  const job = useApiQuery(`job:${scope ? scopeKey(scope) : "none"}:${jobId}`, jobRequest, {
    pollMs: 2000,
    pollWhile: executionIsLive,
    enabled: Boolean(scope),
  })
  const isObserved = job.data?.recordKind === "observed-execution"
  const log = useLiveLog(
    scope,
    jobId,
    logRequested && Boolean(job.data) && !isObserved,
    !isObserved && job.data?.status === "running"
  )
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
    <DetailDrawer onClose={onClose}>
      <DetailDrawerHeader
        title={job.data?.preset || "Execução"}
        description={
          job.data ? (
            <JobTimeline job={job.data} />
          ) : (
            "Carregando dados da execução…"
          )
        }
        media={
          job.data
            ? { kind: "state", descriptor: describeExecutionState(job.data) }
            : undefined
        }
        badge={
          job.data &&
          (job.data.projectName ||
            job.data.runVariant ||
            job.data.recordKind === "observed-execution") ? (
            <>
              {job.data.recordKind === "observed-execution" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline">Direta</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Resultado declarado pelo receipt; não é comprovação canônica
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {job.data.projectName ? (
                <ProjectChip
                  mode="inline"
                  name={job.data.projectName}
                  facts={projectChipFacts(job.data)}
                />
              ) : null}
              <RunVariantBadge runVariant={job.data.runVariant} />
            </>
          ) : undefined
        }
        closeLabel="Fechar execução"
      />
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
        <DetailDrawerTabs>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="progress">Progresso</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
        </DetailDrawerTabs>
        <TabsContent value="progress" className="min-h-0 overflow-hidden px-0">
          <DetailDrawerBody>
            <ProgressPanel job={job} />
          </DetailDrawerBody>
        </TabsContent>
        <TabsContent value="log" className="min-h-0 overflow-hidden px-0">
          <DetailDrawerBody scroll="managed">
            {job.loading ? (
              <Skeleton className="h-64 w-full" />
            ) : job.error ? (
              <ErrorState
                title="Não foi possível carregar a execução"
                error={job.error}
                onRetry={job.reload}
              />
            ) : isObserved ? (
              <EmptyState
                title="Log bruto não coletado"
                description="O resultado foi registrado a partir do receipt. Logs ou relatórios específicos podem existir no ambiente de origem."
              />
            ) : (
              <LogPanel log={log} running={job.data?.status === "running"} />
            )}
          </DetailDrawerBody>
        </TabsContent>
      </Tabs>
      <DetailDrawerFooter>
        <Button
          type="button"
          variant="outline"
          disabled={!job.data}
          onClick={() => void copyContext()}
        >
          <ClipboardIcon data-icon="inline-start" />
          Copiar contexto
        </Button>
        {isObserved ? null : (
          <DiagnosticPopover
            jobId={jobId}
            clipboardLimitBytes={session.data?.clipboardLimitBytes}
          />
        )}
      </DetailDrawerFooter>
    </DetailDrawer>
  )
}
