import * as React from "react"

import {
  getDashboardState,
  getExecutions,
  getMachine,
  getPresetHistory,
  getRemoteSlots,
  getStatus,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type {
  DashboardState,
  JobStatus,
  PresetHistoryEntry,
  RemoteGreen,
  RemoteSlotsResponse,
  StatusSnapshot,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  EmptyState,
  ErrorState,
  RefreshingLabel,
} from "@/features/shared/async-state"
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  queryPeriodStart,
  shortSha,
} from "@/features/shared/format"
import { JobDrawer } from "@/features/shared/job-drawer"
import {
  JobStatusBadge,
  type RunTableJob,
  RunTable,
} from "@/features/shared/run-table"
import { ManualStateDrawer } from "@/features/status/manual-state-drawer"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  HardDriveIcon,
  LoaderCircleIcon,
  SearchIcon,
  XCircleIcon,
} from "lucide-react"

type HistoryResult = "all" | "passed" | "failed" | "cancelled" | "interrupted"
type Period = "all" | "today" | "48h" | "week" | "15d"
type HistoryMode = "executions" | "greens"
type GreenOrigin = "machine" | "git" | "both"
type GreenGrouping = "preset" | "commit"

function stageIcon(status: JobStatus | "pending" | "skipped") {
  if (status === "passed") {
    return CheckCircle2Icon
  }
  if (
    status === "failed" ||
    status === "interrupted" ||
    status === "cancelled"
  ) {
    return XCircleIcon
  }
  if (status === "running") {
    return LoaderCircleIcon
  }
  return CircleDotIcon
}

function CurrentExecution({
  snapshot,
  onOpenJob,
  refreshing,
}: {
  snapshot: StatusSnapshot
  onOpenJob: (jobId: string) => void
  refreshing: boolean
}) {
  const current =
    snapshot.running?.status === "running" ? snapshot.running : null
  const timestamp = current?.startedAt ?? current?.createdAt

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execução atual</CardTitle>
        <CardDescription>
          Somente um ticket que está realmente em execução aparece aqui.
        </CardDescription>
        <CardAction>{refreshing ? <RefreshingLabel /> : null}</CardAction>
      </CardHeader>
      <CardContent>
        {!current ? (
          <EmptyState
            title="Nenhuma execução em andamento"
            description="Os tickets concluídos permanecem no histórico."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Item variant="outline">
              <ItemMedia variant="icon">
                <LoaderCircleIcon className="animate-spin" />
              </ItemMedia>
              <ItemContent>
                <div className="flex flex-wrap items-center gap-2">
                  <ItemTitle>
                    {current.preset ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto px-0 py-0"
                        onClick={() => onOpenJob(current.id)}
                      >
                        {current.preset}
                      </Button>
                    ) : (
                      "Preset não informado"
                    )}
                  </ItemTitle>
                  <JobStatusBadge status={current.status} />
                </div>
                <ItemDescription>
                  {formatTimelineDate(timestamp)} ·{" "}
                  {formatRelativeTime(timestamp)} ·{" "}
                  {formatDuration(current.durationMs)}
                </ItemDescription>
                {current.commitSubject ? (
                  <ItemDescription>{current.commitSubject}</ItemDescription>
                ) : null}
              </ItemContent>
            </Item>
            {current.progressSummary?.available &&
            current.progressSummary.roots?.length ? (
              <ItemGroup>
                {current.progressSummary.roots.map((stage, index) => {
                  const Icon = stageIcon(stage.status)
                  return (
                    <React.Fragment key={stage.id}>
                      <Item variant="muted" size="sm">
                        <ItemMedia variant="icon">
                          <Icon
                            className={
                              stage.status === "running"
                                ? "animate-spin"
                                : undefined
                            }
                          />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{stage.label}</ItemTitle>
                          <ItemDescription>
                            {stage.durationMs
                              ? formatDuration(stage.durationMs)
                              : "Em andamento ou sem duração."}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                      {index < current.progressSummary!.roots!.length - 1 ? (
                        <ItemSeparator />
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </ItemGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum estágio válido foi registrado para esta execução.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MachineCard() {
  const request = React.useCallback(() => getMachine(), [])
  const machine = useApiQuery("machine", request)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Máquina</CardTitle>
        <CardDescription>
          Capacidade observada na instalação local.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {machine.loading ? <Skeleton className="h-12 w-36" /> : null}
        {machine.error ? (
          <p className="text-sm text-destructive">{machine.error.message}</p>
        ) : null}
        {machine.data ? (
          machine.data.disk ? (
            <Item variant="outline">
              <ItemMedia variant="icon">
                <HardDriveIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {formatBytes(machine.data.disk.freeBytes)} livres
                </ItemTitle>
              </ItemContent>
            </Item>
          ) : (
            <p className="text-sm text-muted-foreground">
              {machine.data.error || "Disco indisponível."}
            </p>
          )
        ) : null}
      </CardContent>
      <CardFooter>
        <Button type="button" variant="ghost" asChild>
          <a href="#analysis">Ocorrências e recursos</a>
        </Button>
      </CardFooter>
    </Card>
  )
}

function ManualStateCard({
  dashboard,
  onOpen,
}: {
  dashboard: ApiQuery<DashboardState>
  onOpen: () => void
}) {
  if (dashboard.loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (dashboard.error || !dashboard.data) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">
            {dashboard.error?.message || "Estado manual indisponível."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const { meta, notes } = dashboard.data
  const observed =
    meta?.checks.filter((check) => check.status === "passed").length ?? 0
  const total = meta?.checks.length ?? 0

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Meta</CardTitle>
          <CardDescription>
            Referência manual do projeto, sem efeito na fila.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {meta ? (
            <>
              <p className="font-medium">{meta.name}</p>
              {meta.description ? (
                <p className="text-sm text-muted-foreground">
                  {meta.description}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                1 projeto · {observed}/{total}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta manual registrada.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" onClick={onOpen}>
            Editar meta e notas
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notas</CardTitle>
          <CardDescription>Informações manuais do projeto.</CardDescription>
        </CardHeader>
        <CardContent>
          {notes.length ? (
            <ItemGroup>
              {notes.slice(0, 3).map((note) => (
                <Item key={note.id} variant="outline" size="sm">
                  <ItemContent>
                    <ItemTitle>{note.title}</ItemTitle>
                    <ItemDescription>
                      {note.text || "Sem texto."}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma nota manual registrada.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function HistoryToolbar({
  mode,
  search,
  period,
  result,
  origin,
  grouping,
  onMode,
  onSearch,
  onPeriod,
  onResult,
  onOrigin,
  onGrouping,
  onClear,
}: {
  mode: HistoryMode
  search: string
  period: Period
  result: HistoryResult
  origin: GreenOrigin
  grouping: GreenGrouping
  onMode: (value: HistoryMode) => void
  onSearch: (value: string) => void
  onPeriod: (value: Period) => void
  onResult: (value: HistoryResult) => void
  onOrigin: (value: GreenOrigin) => void
  onGrouping: (value: GreenGrouping) => void
  onClear: () => void
}) {
  const hasFilters =
    mode === "executions"
      ? Boolean(search || period !== "all" || result !== "all")
      : Boolean(search || origin !== "machine" || grouping !== "preset")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (value === "executions" || value === "greens") onMode(value)
        }}
        className="contents"
      >
        <TabsList variant="line">
          <TabsTrigger value="executions">Execuções</TabsTrigger>
          <TabsTrigger value="greens">Últimos verdes</TabsTrigger>
        </TabsList>
      </Tabs>
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar preset, branch ou SHA"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>Busca</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {mode === "executions" ? (
        <>
          <Select
            value={period}
            onValueChange={(value) => onPeriod(value as Period)}
          >
            <SelectTrigger aria-label="Período do histórico">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo o período</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="48h">48h</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="15d">15 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={result}
            onValueChange={(value) => onResult(value as HistoryResult)}
          >
            <SelectTrigger aria-label="Resultado da execução">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os resultados</SelectItem>
              <SelectItem value="passed">Concluídas</SelectItem>
              <SelectItem value="failed">Falhas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="interrupted">Interrompidas</SelectItem>
            </SelectContent>
          </Select>
        </>
      ) : (
        <>
          <Select
            value={origin}
            onValueChange={(value) => onOrigin(value as GreenOrigin)}
          >
            <SelectTrigger aria-label="Origem dos últimos verdes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="machine">Máquina</SelectItem>
              <SelectItem value="git">Git</SelectItem>
              <SelectItem value="both">Ambos</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={grouping}
            onValueChange={(value) => onGrouping(value as GreenGrouping)}
          >
            <SelectTrigger aria-label="Agrupar últimos verdes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preset">Agrupar por preset</SelectItem>
              <SelectItem value="commit">Agrupar por commit</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={onClear}>
          Limpar
        </Button>
      ) : null}
    </div>
  )
}

function asMachineGreen(entry: PresetHistoryEntry): RunTableJob | undefined {
  const reference = entry.lastGreenCanonical
  if (!reference?.ticketId) {
    return undefined
  }

  return {
    id: reference.ticketId,
    preset: entry.preset,
    status: reference.status ?? undefined,
    branch: reference.branch ?? undefined,
    headSha: reference.headSha ?? undefined,
    startedAt: reference.startedAt ?? undefined,
    createdAt: reference.createdAt ?? undefined,
    finishedAt: reference.finishedAt ?? undefined,
    durationMs: reference.durationMs,
  }
}

function asGitGreen(green: RemoteGreen): RunTableJob {
  return {
    ticketId: green.ticketId,
    rowKey: `${green.origin}:${green.preset}:${green.headSha}`,
    detailsJobId: green.jobAvailable ? green.ticketId : undefined,
    preset: green.preset,
    status: green.status,
    branch: green.branch ?? undefined,
    headSha: green.headSha,
    finishedAt: green.finishedAt,
    durationMs: green.durationMs,
    detailsAvailable: green.jobAvailable,
  }
}

function filterGreens({
  jobs,
  search,
  grouping,
}: {
  jobs: RunTableJob[]
  search: string
  grouping: GreenGrouping
}) {
  const needle = search.trim().toLocaleLowerCase("pt-BR")
  const bySourceKey = new Map<string, RunTableJob>()
  for (const job of jobs) {
    const key =
      job.rowKey ??
      `${job.preset ?? ""}:${job.headSha ?? ""}:${job.ticketId ?? job.id ?? ""}`
    if (!bySourceKey.has(key)) {
      bySourceKey.set(key, job)
    }
  }
  const greens = [...bySourceKey.values()].filter((job) => {
    const haystack = [
      job.ticketId,
      job.id,
      job.preset,
      job.branch,
      job.headSha,
      job.cwd,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR")
    return !needle || haystack.includes(needle)
  })

  return greens.sort((left, right) => {
    const leftKey =
      grouping === "preset" ? (left.preset ?? "") : (left.headSha ?? "")
    const rightKey =
      grouping === "preset" ? (right.preset ?? "") : (right.headSha ?? "")
    return (
      leftKey.localeCompare(rightKey, "pt-BR") ||
      (left.preset ?? "").localeCompare(right.preset ?? "", "pt-BR")
    )
  })
}

function GreenTableSet({
  title,
  jobs,
  loading,
  error,
  grouping,
  emptyTitle,
  emptyDescription,
  onOpenJob,
}: {
  title: string
  jobs: RunTableJob[]
  loading: boolean
  error: Error | undefined
  grouping: GreenGrouping
  emptyTitle: string
  emptyDescription: string
  onOpenJob: (jobId: string) => void
}) {
  if (loading || error || !jobs.length || grouping === "preset") {
    return (
      <RunTable
        title={title}
        jobs={jobs}
        loading={loading}
        error={error}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        onOpenJob={onOpenJob}
      />
    )
  }

  const groups = new Map<string, RunTableJob[]>()
  for (const job of jobs) {
    const key = job.headSha ?? job.rowKey ?? job.ticketId ?? job.id ?? "sem-sha"
    groups.set(key, [...(groups.get(key) ?? []), job])
  }

  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([commit, rows]) => (
        <RunTable
          key={commit}
          title={`${title} · commit ${shortSha(commit)}`}
          jobs={rows}
          loading={false}
          error={undefined}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          onOpenJob={onOpenJob}
        />
      ))}
    </div>
  )
}

function GitUnavailable({ remote }: { remote: ApiQuery<RemoteSlotsResponse> }) {
  if (remote.loading) {
    return <Skeleton className="h-24 w-full" />
  }

  if (remote.error) {
    return (
      <ErrorState
        title="Não foi possível consultar os últimos verdes do Git"
        error={remote.error}
        onRetry={remote.reload}
      />
    )
  }

  const reason =
    remote.data?.source.reason?.message ||
    "A API não retornou um estado de espelho Git para este projeto."
  return (
    <EmptyState
      title="Últimos verdes do Git indisponíveis"
      description={reason}
    />
  )
}

function HistoryPanel({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [mode, setMode] = React.useState<HistoryMode>("executions")
  const [search, setSearch] = React.useState("")
  const [period, setPeriod] = React.useState<Period>("all")
  const [result, setResult] = React.useState<HistoryResult>("all")
  const [origin, setOrigin] = React.useState<GreenOrigin>("machine")
  const [grouping, setGrouping] = React.useState<GreenGrouping>("preset")
  const periodStart = React.useMemo(() => queryPeriodStart(period), [period])
  const executionsRequest = React.useCallback(
    () => getExecutions({ q: search || undefined, result, from: periodStart }),
    [periodStart, result, search]
  )
  const presetRequest = React.useCallback(() => getPresetHistory(), [])
  const remoteRequest = React.useCallback(() => getRemoteSlots(), [])
  const executions = useApiQuery(
    `history:${search}:${period}:${result}`,
    executionsRequest
  )
  const presetHistory = useApiQuery("preset-history", presetRequest)
  const remote = useApiQuery("remote-slots", remoteRequest)
  const machineGreens = React.useMemo(
    () =>
      filterGreens({
        jobs: (presetHistory.data?.presets ?? [])
          .map(asMachineGreen)
          .filter((job): job is RunTableJob => Boolean(job)),
        search,
        grouping,
      }),
    [grouping, presetHistory.data?.presets, search]
  )
  const gitGreens = React.useMemo(
    () =>
      filterGreens({
        jobs: (remote.data?.greens ?? []).map(asGitGreen),
        search,
        grouping,
      }),
    [grouping, remote.data?.greens, search]
  )
  const canShowGitGreens = Boolean(
    remote.data && (remote.data.source.available || remote.data.greens.length)
  )

  const clear = () => {
    setSearch("")
    setPeriod("all")
    if (mode === "executions") {
      setResult("all")
    } else {
      setOrigin("machine")
      setGrouping("preset")
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Histórico">
      <HistoryToolbar
        mode={mode}
        search={search}
        period={period}
        result={result}
        origin={origin}
        grouping={grouping}
        onMode={setMode}
        onSearch={setSearch}
        onPeriod={setPeriod}
        onResult={setResult}
        onOrigin={setOrigin}
        onGrouping={setGrouping}
        onClear={clear}
      />
      {mode === "executions" ? (
        <RunTable
          title="Histórico"
          jobs={executions.data?.jobs}
          loading={executions.loading}
          error={executions.error}
          emptyTitle="Nenhuma execução encontrada"
          emptyDescription="Ajuste os filtros ou aguarde a próxima execução terminal."
          onOpenJob={onOpenJob}
        />
      ) : null}
      {mode === "greens" && origin !== "git" ? (
        <GreenTableSet
          title={
            origin === "both" ? "Últimos verdes da máquina" : "Últimos verdes"
          }
          jobs={machineGreens}
          loading={presetHistory.loading}
          error={presetHistory.error}
          grouping={grouping}
          emptyTitle="Nenhum último verde"
          emptyDescription="Não há execução canônica aprovada para os filtros selecionados."
          onOpenJob={onOpenJob}
        />
      ) : null}
      {mode === "greens" && origin !== "machine" ? (
        canShowGitGreens ? (
          <div className="flex flex-col gap-3">
            {remote.data?.source.stale && remote.data.source.reason ? (
              <p className="text-sm text-muted-foreground">
                Espelho Git desatualizado: {remote.data.source.reason.message}
              </p>
            ) : null}
            <GreenTableSet
              title="Últimos verdes do Git"
              jobs={gitGreens}
              loading={false}
              error={undefined}
              grouping={grouping}
              emptyTitle="Nenhum último verde do Git"
              emptyDescription="O espelho Git não publicou um verde válido para os filtros selecionados."
              onOpenJob={onOpenJob}
            />
          </div>
        ) : (
          <GitUnavailable remote={remote} />
        )
      ) : null}
    </section>
  )
}

export function StatusPage() {
  const statusRequest = React.useCallback(() => getStatus(), [])
  const status = useApiQuery("status", statusRequest, { pollMs: 10_000 })
  const dashboardRequest = React.useCallback(() => getDashboardState(), [])
  const dashboard = useApiQuery("dashboard-state", dashboardRequest)
  const [selectedJobId, setSelectedJobId] = React.useState<string>()
  const [manualOpen, setManualOpen] = React.useState(false)

  if (status.loading) {
    return (
      <main className="flex flex-1 p-4 lg:p-6">
        <div className="w-full">
          <Skeleton className="h-56 w-full" />
        </div>
      </main>
    )
  }

  if (status.error || !status.data) {
    return (
      <main className="flex flex-1 p-4 lg:p-6">
        <ErrorState
          title="Não foi possível carregar o status"
          error={status.error || new Error("Resposta vazia da bridge.")}
          onRetry={status.reload}
        />
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-8 p-4 lg:p-6">
      <h1 className="sr-only">Status do CI Queue</h1>
      <CurrentExecution
        snapshot={status.data}
        onOpenJob={setSelectedJobId}
        refreshing={status.refreshing}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <RunTable
            title="Fila"
            jobs={status.data.queued}
            loading={false}
            error={undefined}
            emptyTitle="Fila livre"
            emptyDescription="Nenhuma execução aguardando."
            onOpenJob={setSelectedJobId}
          />
          <HistoryPanel onOpenJob={setSelectedJobId} />
        </div>
        <aside className="flex flex-col gap-4">
          <MachineCard />
          <ManualStateCard
            dashboard={dashboard}
            onOpen={() => setManualOpen(true)}
          />
        </aside>
      </div>
      {selectedJobId ? (
        <JobDrawer
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(undefined)}
        />
      ) : null}
      {manualOpen && dashboard.data ? (
        <ManualStateDrawer
          state={dashboard.data}
          onClose={() => setManualOpen(false)}
          onSaved={dashboard.reload}
        />
      ) : null}
    </main>
  )
}
