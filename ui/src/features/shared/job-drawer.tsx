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
  ItemMedia,
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
import { Skeleton } from "@/components/ui/skeleton"
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

function diagnosticBundle(diagnostic: Diagnostic, logExport: LogExport) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      diagnostic,
      logExport,
    },
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

function JobTimeline({ job }: { job: JobRecord }) {
  const timestamp = job.finishedAt ?? job.startedAt ?? job.createdAt
  return (
    <>
      {formatTimelineDate(timestamp)} · {formatRelativeTime(timestamp)} ·{" "}
      {formatDuration(job.durationMs)}
    </>
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
        <ItemGroup>
          {stages.map((stage) => {
            const Icon = stageIcon(stage.status)
            return (
              <Item key={stage.id} variant="outline">
                <ItemMedia variant="icon">
                  <Icon
                    className={
                      stage.status === "running" ? "animate-spin" : undefined
                    }
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{stage.label}</ItemTitle>
                </ItemContent>
              </Item>
            )
          })}
        </ItemGroup>
      ) : (
        <EmptyState
          title="Progresso indisponível"
          description={
            job.data.progressSummary?.reason ||
            "Nenhuma etapa válida foi registrada para esta execução."
          }
        />
      )}
      {job.data.cwd ? (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Diretório</ItemTitle>
            <ItemDescription>{job.data.cwd}</ItemDescription>
          </ItemContent>
        </Item>
      ) : null}
    </div>
  )
}

function LogPanel({ log }: { log: ApiQuery<LogSlice> }) {
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

  return (
    <pre className="font-mono text-xs leading-5 break-words whitespace-pre-wrap text-foreground">
      {log.data.content || "Log vazio."}
    </pre>
  )
}

function DiagnosticPopover({
  diagnostic,
  logExport,
  jobId,
  clipboardLimitBytes,
}: {
  diagnostic: ApiQuery<Diagnostic>
  logExport: ApiQuery<LogExport>
  jobId: string
  clipboardLimitBytes: number | undefined
}) {
  const ticket = diagnostic.data?.available ? diagnostic.data.ticket : undefined
  const bundle =
    diagnostic.data?.available && logExport.data
      ? diagnosticBundle(diagnostic.data, logExport.data)
      : undefined

  const copyDiagnostic = async () => {
    if (!bundle) {
      return
    }
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
  }

  const downloadDiagnostic = () => {
    if (!bundle) {
      return
    }
    downloadFile(
      `ci-diagnostic-${jobId}.json`,
      JSON.stringify(bundle, null, 2),
      "application/json;charset=utf-8"
    )
    toast.success("Diagnóstico baixado.")
  }

  return (
    <Popover>
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
            {logExport.error ? (
              <PopoverDescription>{logExport.error.message}</PopoverDescription>
            ) : null}
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={!bundle}
                onClick={() => void copyDiagnostic()}
              >
                <ClipboardIcon data-icon />
                Copiar diagnóstico
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={!bundle}
                onClick={downloadDiagnostic}
              >
                <DownloadIcon data-icon />
                Baixar diagnóstico
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={!logExport.data?.coverage.available}
                onClick={() =>
                  logExport.data
                    ? downloadFile(
                        `${jobId}.log`,
                        logExport.data.content,
                        "text/plain;charset=utf-8"
                      )
                    : undefined
                }
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

export function JobDrawer({
  jobId,
  onClose,
}: {
  jobId: string
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const jobRequest = React.useCallback(() => getJob(jobId), [jobId])
  const logRequest = React.useCallback(() => getLog(jobId), [jobId])
  const exportRequest = React.useCallback(() => getLogExport(jobId), [jobId])
  const diagnosticRequest = React.useCallback(
    () => getDiagnostic(jobId),
    [jobId]
  )
  const job = useApiQuery(`job:${jobId}`, jobRequest)
  const log = useApiQuery(`log:${jobId}`, logRequest)
  const logExport = useApiQuery(`log-export:${jobId}`, exportRequest)
  const diagnostic = useApiQuery(`diagnostic:${jobId}`, diagnosticRequest)
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
      <DrawerContent className="min-h-0">
        <DrawerHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DrawerTitle>{job.data?.preset || "Execução"}</DrawerTitle>
                {job.data ? <JobStatusBadge status={job.data.status} /> : null}
              </div>
              <DrawerDescription>
                {job.data ? (
                  <JobTimeline job={job.data} />
                ) : (
                  "Carregando dados da execução…"
                )}
              </DrawerDescription>
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
        <Tabs defaultValue="progress" className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="shrink-0 border-b px-4">
            <TabsTrigger value="progress">Progresso</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
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
        <DrawerFooter className="shrink-0 border-t sm:flex-row sm:justify-between">
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
              diagnostic={diagnostic}
              logExport={logExport}
              jobId={jobId}
              clipboardLimitBytes={session.data?.clipboardLimitBytes}
            />
          </div>
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              Fechar
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
