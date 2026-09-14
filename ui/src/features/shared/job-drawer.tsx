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
} from "@/features/shared/format"
import { JobStatusBadge } from "@/features/shared/run-table"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  DownloadIcon,
  FileWarningIcon,
  LoaderCircleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

function downloadLog(jobId: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${jobId}.log`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
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
}: {
  diagnostic: ApiQuery<Diagnostic>
}) {
  const incidents = diagnostic.data?.available
    ? (diagnostic.data.incidents ?? [])
    : []

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
              <PopoverTitle>Observações da execução</PopoverTitle>
              <PopoverDescription>
                {incidents.length
                  ? "Ocorrências correlacionadas ao log."
                  : "Nenhuma ocorrência reconhecida no diagnóstico."}
              </PopoverDescription>
            </PopoverHeader>
            {incidents.length ? (
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                {incidents.map((incident) => (
                  <li key={incident.kind}>{incident.kind}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function ExportButton({
  jobId,
  logExport,
}: {
  jobId: string
  logExport: ApiQuery<LogExport>
}) {
  if (logExport.loading || !logExport.data?.coverage.available) {
    return null
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => downloadLog(jobId, logExport.data!.content)}
    >
      <DownloadIcon data-icon />
      Exportar log
    </Button>
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
            <DiagnosticPopover diagnostic={diagnostic} />
            <ExportButton jobId={jobId} logExport={logExport} />
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
