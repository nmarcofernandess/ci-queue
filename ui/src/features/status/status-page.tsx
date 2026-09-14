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
  ProgressNode,
  RemoteGreen,
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
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ErrorState, RefreshingLabel } from "@/features/shared/async-state"
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatTimelineDate,
  queryPeriodStart,
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

function stageDescription({
  durationMs,
  status,
}: {
  durationMs?: number
  status: JobStatus | "pending" | "skipped"
}) {
  if (typeof durationMs === "number") {
    return formatDuration(durationMs)
  }
  if (status === "running") {
    return "Em execução."
  }
  if (status === "pending") {
    return "Aguardando."
  }
  if (status === "skipped") {
    return "Ignorada."
  }
  if (status === "failed") {
    return "Falhou."
  }
  return "Concluída sem duração registrada."
}

function ExecutionStages({ stages }: { stages: ProgressNode[] }) {
  return (
    <ItemGroup className="gap-0">
      {stages.map((stage, index) => {
        const Icon = stageIcon(stage.status)
        return (
          <div
            key={stage.id}
            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3"
          >
            <div className="flex min-h-7 flex-col items-center">
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
            <Item
              variant="default"
              size="sm"
              className="min-w-0 border-transparent px-0 py-0"
            >
              <ItemContent>
                <ItemTitle>{stage.label}</ItemTitle>
                <ItemDescription>{stageDescription(stage)}</ItemDescription>
              </ItemContent>
            </Item>
          </div>
        )
      })}
    </ItemGroup>
  )
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
  if (!current) {
    return null
  }

  const timestamp = current.startedAt ?? current.createdAt
  const stages = current.progressSummary?.available
    ? (current.progressSummary.roots ?? [])
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execução atual</CardTitle>
        <CardAction>{refreshing ? <RefreshingLabel /> : null}</CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <Item variant="default" className="border-transparent px-0 py-0">
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
          {stages.length ? <ExecutionStages stages={stages} /> : null}
        </div>
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
            <Item variant="default" className="border-transparent px-0 py-0">
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
  onOpen: (tab: "meta" | "notes") => void
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
          <CardTitle>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 py-0 text-base font-semibold"
              onClick={() => onOpen("meta")}
            >
              Meta
            </Button>
          </CardTitle>
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
              {total ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {observed} de {total} requisitos atendidos
                  </p>
                  <Progress value={(observed / total) * 100} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem requisitos definidos.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta manual registrada.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" onClick={() => onOpen("meta")}>
            Editar meta
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 py-0 text-base font-semibold"
              onClick={() => onOpen("notes")}
            >
              Notas
            </Button>
          </CardTitle>
          <CardDescription>Informações manuais do projeto.</CardDescription>
        </CardHeader>
        <CardContent>
          {notes.length ? (
            <ItemGroup>
              {notes.slice(0, 3).map((note) => (
                <Item
                  key={note.id}
                  variant="default"
                  size="sm"
                  className="border-transparent px-0 py-0"
                >
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
        <CardFooter>
          <Button type="button" variant="ghost" onClick={() => onOpen("notes")}>
            Editar notas
          </Button>
        </CardFooter>
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
          placeholder="preset, branch, SHA ou ticket"
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
              <SelectItem value="all">Todo período</SelectItem>
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
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="passed">Passou</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="interrupted">Interrompido</SelectItem>
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
              <SelectItem value="preset">Por preset</SelectItem>
              <SelectItem value="commit">Por commit</SelectItem>
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

type HistoryFilters = {
  mode: HistoryMode
  search: string
  period: Period
  result: HistoryResult
  origin: GreenOrigin
  grouping: GreenGrouping
}

type ExecutionHistoryState = {
  queryKey: string
  jobs: RunTableJob[]
  loading: boolean
  loadingMore: boolean
  error: Error | undefined
  loadMoreError: Error | undefined
  hasMore: boolean
  snapshotBefore: string | undefined
  nextCursor: string | null
}

const HISTORY_DEFAULTS: HistoryFilters = {
  mode: "executions",
  search: "",
  period: "all",
  result: "all",
  origin: "machine",
  grouping: "preset",
}

function queryEnum<T extends string>(
  value: string | null,
  options: readonly T[],
  fallback: T
) {
  return value && options.includes(value as T) ? (value as T) : fallback
}

function readHistoryFilters(): HistoryFilters {
  if (typeof window === "undefined") {
    return HISTORY_DEFAULTS
  }

  const params = new URLSearchParams(window.location.search)
  const rawMode = params.get("mode")
  return {
    mode:
      rawMode === "history"
        ? "executions"
        : queryEnum(rawMode, ["executions", "greens"], HISTORY_DEFAULTS.mode),
    search: params.get("q") ?? HISTORY_DEFAULTS.search,
    period: queryEnum(
      params.get("period"),
      ["all", "today", "48h", "week", "15d"],
      HISTORY_DEFAULTS.period
    ),
    result: queryEnum(
      params.get("result"),
      ["all", "passed", "failed", "cancelled", "interrupted"],
      HISTORY_DEFAULTS.result
    ),
    origin: queryEnum(
      params.get("origin"),
      ["machine", "git", "both"],
      HISTORY_DEFAULTS.origin
    ),
    grouping: queryEnum(
      params.get("group"),
      ["preset", "commit"],
      HISTORY_DEFAULTS.grouping
    ),
  }
}

function writeHistoryFilters(filters: HistoryFilters) {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)
  for (const key of ["mode", "group", "q", "result", "period", "origin"]) {
    url.searchParams.delete(key)
  }

  url.searchParams.set("mode", filters.mode)
  if (filters.search) {
    url.searchParams.set("q", filters.search)
  }
  if (filters.mode === "executions") {
    url.searchParams.set("result", filters.result)
    url.searchParams.set("period", filters.period)
  } else {
    url.searchParams.set("group", filters.grouping)
    url.searchParams.set("origin", filters.origin)
  }
  url.hash = "status"
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  )
}

function errorFrom(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason : new Error(fallback)
}

function jobIdentity(job: RunTableJob) {
  return (
    job.rowKey ??
    job.id ??
    job.ticketId ??
    job.preset ??
    "registro-indisponível"
  )
}

function appendExecutionJobs(
  current: RunTableJob[],
  next: RunTableJob[]
): RunTableJob[] {
  const seen = new Set(current.map(jobIdentity))
  return [...current, ...next.filter((job) => !seen.has(jobIdentity(job)))]
}

function useExecutionHistory({
  search,
  period,
  result,
}: Pick<HistoryFilters, "search" | "period" | "result">) {
  const periodStart = React.useMemo(() => queryPeriodStart(period), [period])
  const requestKey = `${search}\u0000${period}\u0000${result}`
  const requestVersion = React.useRef(0)
  const [state, setState] = React.useState<ExecutionHistoryState>({
    queryKey: requestKey,
    jobs: [],
    loading: true,
    loadingMore: false,
    error: undefined,
    loadMoreError: undefined,
    hasMore: false,
    snapshotBefore: undefined,
    nextCursor: null,
  })

  React.useEffect(() => {
    const version = requestVersion.current + 1
    requestVersion.current = version
    void getExecutions({
      q: search || undefined,
      result,
      from: periodStart,
    })
      .then((page) => {
        if (requestVersion.current !== version) {
          return
        }
        setState({
          queryKey: requestKey,
          jobs: page.jobs,
          loading: false,
          loadingMore: false,
          error: undefined,
          loadMoreError: undefined,
          hasMore: page.hasMore,
          snapshotBefore: page.snapshotBefore,
          nextCursor: page.nextCursor,
        })
      })
      .catch((reason) => {
        if (requestVersion.current !== version) {
          return
        }
        setState({
          queryKey: requestKey,
          jobs: [],
          loading: false,
          loadingMore: false,
          error: errorFrom(reason, "Não foi possível carregar o histórico."),
          loadMoreError: undefined,
          hasMore: false,
          snapshotBefore: undefined,
          nextCursor: null,
        })
      })
  }, [periodStart, requestKey, result, search])

  const loadMore = React.useCallback(() => {
    if (
      state.queryKey !== requestKey ||
      !state.hasMore ||
      state.loadingMore ||
      !state.snapshotBefore ||
      !state.nextCursor
    ) {
      return
    }

    const version = requestVersion.current
    const snapshotBefore = state.snapshotBefore
    const cursor = state.nextCursor
    setState((current) => ({
      ...current,
      loadingMore: true,
      loadMoreError: undefined,
    }))

    void getExecutions({
      q: search || undefined,
      result,
      from: periodStart,
      snapshotBefore,
      cursor,
    })
      .then((page) => {
        if (requestVersion.current !== version) {
          return
        }
        setState((current) => {
          if (current.snapshotBefore !== snapshotBefore) {
            return current
          }
          return {
            ...current,
            jobs: appendExecutionJobs(current.jobs, page.jobs),
            loadingMore: false,
            loadMoreError: undefined,
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
          }
        })
      })
      .catch((reason) => {
        if (requestVersion.current !== version) {
          return
        }
        setState((current) => ({
          ...current,
          loadingMore: false,
          loadMoreError: errorFrom(
            reason,
            "Não foi possível carregar mais execuções."
          ),
        }))
      })
  }, [periodStart, requestKey, result, search, state])

  const visibleState =
    state.queryKey === requestKey
      ? state
      : {
          queryKey: requestKey,
          jobs: [],
          loading: true,
          loadingMore: false,
          error: undefined,
          loadMoreError: undefined,
          hasMore: false,
          snapshotBefore: undefined,
          nextCursor: null,
        }

  return { ...visibleState, loadMore }
}

function asMachineGreen(entry: PresetHistoryEntry): RunTableJob | undefined {
  const reference = entry.lastGreenCanonical
  if (!reference?.ticketId) {
    return undefined
  }

  return {
    id: reference.ticketId,
    rowKey: `machine:${reference.ticketId}`,
    origin: "machine",
    origins: ["machine"],
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
    rowKey: `git:${green.ticketId}`,
    origin: "git",
    origins: ["git"],
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

function greenIdentity(job: RunTableJob) {
  const ticket = job.ticketId ?? job.id
  return ticket
    ? `${job.preset ?? "preset-indisponível"}\u0000${ticket}`
    : `${job.preset ?? "preset-indisponível"}\u0000${job.headSha ?? job.rowKey ?? "registro-indisponível"}`
}

function mergeGreenRows(jobs: RunTableJob[]) {
  const byIdentity = new Map<string, RunTableJob>()
  for (const job of jobs) {
    const key = greenIdentity(job)
    const existing = byIdentity.get(key)
    if (!existing) {
      byIdentity.set(key, job)
      continue
    }

    const existingDetails =
      existing.detailsJobId ??
      (existing.detailsAvailable !== false ? existing.id : undefined)
    const nextDetails =
      job.detailsJobId ?? (job.detailsAvailable !== false ? job.id : undefined)
    const preferred = existingDetails ? existing : nextDetails ? job : existing
    const origins = [
      ...new Set([...(existing.origins ?? []), ...(job.origins ?? [])]),
    ]
    byIdentity.set(key, {
      ...existing,
      ...job,
      ...preferred,
      rowKey: `green:${key}`,
      origin: undefined,
      origins,
      id: preferred.id ?? existing.id ?? job.id,
      ticketId: preferred.ticketId ?? existing.ticketId ?? job.ticketId,
      detailsJobId: existingDetails ?? nextDetails,
      detailsAvailable: Boolean(existingDetails ?? nextDetails),
    })
  }
  return [...byIdentity.values()]
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
  return jobs
    .filter((job) => {
      const haystack = [
        job.ticketId,
        job.id,
        job.preset,
        job.branch,
        job.headSha,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
      return !needle || haystack.includes(needle)
    })
    .sort((left, right) => {
      const primary =
        grouping === "preset" ? (left.preset ?? "") : (left.headSha ?? "")
      const secondary =
        grouping === "preset" ? (right.preset ?? "") : (right.headSha ?? "")
      const leftTime = left.finishedAt ?? left.startedAt ?? left.createdAt ?? ""
      const rightTime =
        right.finishedAt ?? right.startedAt ?? right.createdAt ?? ""
      return (
        primary.localeCompare(secondary, "pt-BR") ||
        (left.preset ?? "").localeCompare(right.preset ?? "", "pt-BR") ||
        rightTime.localeCompare(leftTime)
      )
    })
}

function sourceFailure<T>(
  query: ApiQuery<T>,
  fallback: string
): Error | undefined {
  if (query.error) {
    return query.error
  }
  if (!query.loading && !query.data) {
    return new Error(fallback)
  }
  return undefined
}

function HistoryPanel({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [filters, setFilters] =
    React.useState<HistoryFilters>(readHistoryFilters)
  const executions = useExecutionHistory(filters)
  const presetRequest = React.useCallback(() => getPresetHistory(), [])
  const remoteRequest = React.useCallback(() => getRemoteSlots(), [])
  const presetHistory = useApiQuery("preset-history", presetRequest)
  const remote = useApiQuery("remote-slots", remoteRequest)

  React.useEffect(() => {
    writeHistoryFilters(filters)
  }, [filters])

  const machineGreens = React.useMemo(
    () =>
      (presetHistory.data?.presets ?? [])
        .map(asMachineGreen)
        .filter((job): job is RunTableJob => Boolean(job)),
    [presetHistory.data?.presets]
  )
  const gitGreens = React.useMemo(
    () => (remote.data?.greens ?? []).map(asGitGreen),
    [remote.data?.greens]
  )
  const needsMachine = filters.origin !== "git"
  const needsGit = filters.origin !== "machine"
  const machineFailure = sourceFailure(
    presetHistory,
    "A fonte de últimos verdes da máquina não respondeu."
  )
  const gitFailure = React.useMemo(() => {
    const responseFailure = sourceFailure(
      remote,
      "A fonte de últimos verdes do Git não respondeu."
    )
    if (responseFailure) {
      return responseFailure
    }
    if (
      remote.data &&
      !remote.data.source.available &&
      remote.data.greens.length === 0
    ) {
      return new Error(
        remote.data.source.reason?.message ||
          "O espelho Git não tem um último verde disponível."
      )
    }
    return undefined
  }, [remote])
  const selectedGreenRows = React.useMemo(() => {
    const rows = [
      ...(needsMachine ? machineGreens : []),
      ...(needsGit ? gitGreens : []),
    ]
    return filterGreens({
      jobs: mergeGreenRows(rows),
      search: filters.search,
      grouping: filters.grouping,
    })
  }, [
    filters.grouping,
    filters.search,
    gitGreens,
    machineGreens,
    needsGit,
    needsMachine,
  ])
  const machineSourceSucceeded = Boolean(presetHistory.data)
  const gitSourceSucceeded = Boolean(
    remote.data && (remote.data.source.available || remote.data.greens.length)
  )
  const selectedSourceSucceeded =
    (needsMachine && machineSourceSucceeded) || (needsGit && gitSourceSucceeded)
  const greenLoading =
    selectedGreenRows.length === 0 &&
    ((needsMachine && presetHistory.loading) || (needsGit && remote.loading))
  const greenError =
    !greenLoading && !selectedSourceSucceeded
      ? needsMachine && machineFailure
        ? machineFailure
        : gitFailure
      : undefined
  const sourceNotes = [
    needsMachine && machineFailure && selectedSourceSucceeded
      ? `Máquina indisponível: ${machineFailure.message}`
      : null,
    needsGit && remote.data?.source.reason && selectedSourceSucceeded
      ? `Git: ${remote.data.source.reason.message}`
      : null,
    needsGit && remote.error && selectedSourceSucceeded
      ? `Git indisponível: ${remote.error.message}`
      : null,
  ].filter((note): note is string => Boolean(note))
  const greenDescription = [
    filters.grouping === "preset"
      ? "Último verde canônico por preset."
      : "Últimos verdes organizados por commit.",
    ...sourceNotes,
  ].join(" ")

  const clear = () => {
    setFilters((current) =>
      current.mode === "executions"
        ? {
            ...current,
            search: HISTORY_DEFAULTS.search,
            period: HISTORY_DEFAULTS.period,
            result: HISTORY_DEFAULTS.result,
          }
        : {
            ...current,
            search: HISTORY_DEFAULTS.search,
            origin: HISTORY_DEFAULTS.origin,
            grouping: HISTORY_DEFAULTS.grouping,
          }
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Histórico">
      <HistoryToolbar
        mode={filters.mode}
        search={filters.search}
        period={filters.period}
        result={filters.result}
        origin={filters.origin}
        grouping={filters.grouping}
        onMode={(mode) => setFilters((current) => ({ ...current, mode }))}
        onSearch={(search) => setFilters((current) => ({ ...current, search }))}
        onPeriod={(period) => setFilters((current) => ({ ...current, period }))}
        onResult={(result) => setFilters((current) => ({ ...current, result }))}
        onOrigin={(origin) => setFilters((current) => ({ ...current, origin }))}
        onGrouping={(grouping) =>
          setFilters((current) => ({ ...current, grouping }))
        }
        onClear={clear}
      />
      {filters.mode === "executions" ? (
        <RunTable
          title="Histórico"
          jobs={executions.jobs}
          loading={executions.loading}
          error={executions.error}
          emptyDescription="Ajuste os filtros ou aguarde a próxima execução terminal."
          onOpenJob={onOpenJob}
          hasMore={executions.hasMore}
          loadingMore={executions.loadingMore}
          loadMoreError={executions.loadMoreError}
          onLoadMore={executions.loadMore}
        />
      ) : (
        <RunTable
          title="Últimos verdes"
          description={greenDescription}
          jobs={selectedGreenRows}
          loading={greenLoading}
          error={greenError}
          emptyDescription="Não há execução canônica aprovada para os filtros selecionados."
          onOpenJob={onOpenJob}
          showOrigin={filters.origin === "both"}
        />
      )}
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
  const [manualTab, setManualTab] = React.useState<"meta" | "notes">("meta")

  const openManualState = (tab: "meta" | "notes") => {
    setManualTab(tab)
    setManualOpen(true)
  }

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
      {status.data.running?.status === "running" ? (
        <CurrentExecution
          snapshot={status.data}
          onOpenJob={setSelectedJobId}
          refreshing={status.refreshing}
        />
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <RunTable
            title="Fila"
            jobs={status.data.queued}
            loading={false}
            error={undefined}
            emptyDescription="Fila livre."
            onOpenJob={setSelectedJobId}
          />
          <HistoryPanel onOpenJob={setSelectedJobId} />
        </div>
        <aside className="flex flex-col gap-4">
          <MachineCard />
          <ManualStateCard dashboard={dashboard} onOpen={openManualState} />
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
          initialTab={manualTab}
          onClose={() => setManualOpen(false)}
          onSaved={dashboard.reload}
        />
      ) : null}
    </main>
  )
}
