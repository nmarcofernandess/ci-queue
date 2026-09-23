import { EntityIdentity } from "@/features/shared/entity-identity"
import { describeExecutionState } from "@/features/shared/presentation"
import { ExecutionStages } from "@/features/shared/execution-stages"
import { ElapsedItem } from "@/features/shared/live-time"
import { ProjectChip } from "@/features/shared/project-chip"
import { projectChipFacts } from "@/features/shared/project-chip-model"
import { RunVariantBadge } from "@/features/shared/run-variant-badge"
import * as React from "react"

import { useProjectContext } from "@/features/projects/project-context"
import { scopeKey, type ReadScope } from "@/features/projects/scope"
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
import { sharedPageRequest } from "@/lib/query-store"
import type {
  DashboardState,
  PresetHistoryEntry,
  RemoteGreen,
  StatusSnapshot,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Card,
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
} from "@/components/ui/input-group"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { FilterSelect } from "@/features/shared/filter-select"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ErrorState } from "@/features/shared/async-state"
import {
  formatBytes,
  shortSha,
  queryPeriodStart,
} from "@/features/shared/format"
import { JobDrawer } from "@/features/shared/job-drawer"
import { type RunTableJob, RunTable } from "@/features/shared/run-table"
import { StatusStateDrawer } from "@/features/status/status-state-drawer"
import {
  GreenCommitDrawer,
  GreenCommitTable,
} from "@/features/status/green-commit-table"
import {
  groupGreenCommits,
  type GreenCommitGroup,
} from "@/features/status/green-commit"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  HardDriveIcon,
  SearchIcon,
} from "lucide-react"

type HistoryResult = "all" | "passed" | "failed" | "cancelled" | "interrupted"
type Period = "all" | "today" | "48h" | "week" | "15d"
type HistoryMode = "executions" | "greens"
type GreenOrigin = "machine" | "git" | "both"
type GreenGrouping = "preset" | "commit"

function CurrentExecution({
  snapshot,
  onOpenJob,
}: {
  snapshot: StatusSnapshot
  onOpenJob: (jobId: string) => void
}) {
  const current =
    snapshot.running?.status === "running" ? snapshot.running : null
  if (!current) {
    return (
      <Card size="sm">
        <CardContent>
          <Item size="sm" className="px-0 py-0">
            <ItemMedia>
              <CircleDotIcon className="size-4 text-muted-foreground" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Nenhuma execução em andamento</ItemTitle>
            </ItemContent>
          </Item>
        </CardContent>
      </Card>
    )
  }

  const stages = current.progressSummary?.available
    ? (current.progressSummary.roots ?? [])
    : []
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Execução atual</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-w-0 flex-col gap-5">
          <EntityIdentity
            presentation="current"
            title={current.preset || "Preset não informado"}
            media={{
              kind: "state",
              descriptor: describeExecutionState(current),
            }}
            onOpen={() => onOpenJob(current.id)}
            description={
              <>
                {current.branch || "Branch não informada"} ·{" "}
                <span className="font-mono">{shortSha(current.headSha)}</span>
              </>
            }
            badge={
              current.projectName || current.runVariant ? (
                <>
                  {current.projectName ? (
                    <ProjectChip
                      name={current.projectName}
                      facts={projectChipFacts(current)}
                    />
                  ) : null}
                  <RunVariantBadge runVariant={current.runVariant} />
                </>
              ) : undefined
            }
          />
          {current.commitSubject ? (
            <ItemDescription>{current.commitSubject}</ItemDescription>
          ) : null}
          {stages.length ? (
            <ExecutionStages
              key={current.id}
              stages={stages}
              jobStatus={current.status}
              active={current.progressSummary?.active ?? []}
              planned={current.progressSummary?.planned ?? []}
            />
          ) : null}
          <ElapsedItem
            job={current}
            presentation="current"
            onInspect={() => onOpenJob(current.id)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function MachineCard() {
  const request = React.useCallback((signal?: AbortSignal) => getMachine(signal), [])
  const machine = useApiQuery("machine", request, { pollMs: 60_000 })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Máquina</CardTitle>
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
    </Card>
  )
}

function StatusStateCards({
  dashboard,
  projectScoped,
  onOpen,
  onOpenJob,
}: {
  dashboard: ApiQuery<DashboardState>
  projectScoped: boolean
  onOpen: (surface: "meta" | "pending") => void
  onOpenJob: (jobId: string) => void
}) {
  if (projectScoped && (dashboard.loading || dashboard.error || !dashboard.data)) {
    return (
      <>
        {["Metas", "Pendências"].map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard.loading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <p className="text-sm text-destructive">
                  {dashboard.error?.message || "Dados indisponíveis."}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </>
    )
  }

  const meta = dashboard.data?.meta
  const pending = dashboard.data?.pending ?? []
  const pendingError = dashboard.data?.pendingError
  const observed =
    meta?.checks.filter((check) => check.status === "passed").length ?? 0
  const total = meta?.checks.length ?? 0

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Metas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!projectScoped ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyTitle>Selecione um projeto</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : meta ? (
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
                  {meta.candidateSha ? (
                    <p className="text-sm text-muted-foreground">
                      Candidato{" "}
                      <span className="font-mono">
                        {shortSha(meta.candidateSha)}
                      </span>
                    </p>
                  ) : null}
                  <ItemGroup className="gap-0">
                    {meta.checks.map((check) => {
                      const Icon =
                        check.status === "passed"
                          ? CheckCircle2Icon
                          : CircleDotIcon
                      return (
                        <Item
                          key={check.preset}
                          variant="default"
                          size="sm"
                          className="border-transparent px-0 py-1"
                        >
                          <ItemMedia variant="icon">
                            <Icon />
                          </ItemMedia>
                          <ItemContent>
                            <ItemTitle>
                              {check.status === "passed" && check.ticketId ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto p-0"
                                  onClick={() => onOpenJob(check.ticketId!)}
                                >
                                  {check.preset}
                                </Button>
                              ) : (
                                check.preset
                              )}
                            </ItemTitle>
                            <ItemDescription>
                              {check.status === "passed"
                                ? "Verde elegível"
                                : check.status === "recipe-missing"
                                  ? "Receita não declarada"
                                  : "Sem verde elegível"}
                            </ItemDescription>
                          </ItemContent>
                        </Item>
                      )
                    })}
                  </ItemGroup>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem requisitos definidos.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta declarada.
            </p>
          )}
        </CardContent>
        <CardFooter className="border-0 bg-transparent pt-0">
          <StatusCardAction
            label="Abrir meta"
            disabled={!projectScoped}
            onClick={() => onOpen("meta")}
          />
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pendências</CardTitle>
        </CardHeader>
        <CardContent>
          {!projectScoped ? (
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyTitle>Selecione um projeto</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : pendingError ? (
            <p className="text-sm text-destructive">{pendingError}</p>
          ) : pending.length ? (
            <ItemGroup>
              {pending.slice(0, 3).map((item) => (
                <Item
                  key={item.id}
                  variant="default"
                  size="sm"
                  className="border-transparent px-0 py-0"
                >
                  <ItemContent>
                    <ItemTitle>
                      {item.latestTicketId ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto px-0 py-0"
                          onClick={() => onOpenJob(item.latestTicketId!)}
                        >
                          {item.preset}
                        </Button>
                      ) : (
                        item.preset
                      )}
                    </ItemTitle>
                    <ItemDescription>
                      {item.pr ? `PR #${item.pr} · ` : ""}
                      {shortSha(item.headSha)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
          )}
        </CardContent>
        <CardFooter className="border-0 bg-transparent pt-0">
          <StatusCardAction
            label="Ver pendências"
            disabled={!projectScoped}
            onClick={() => onOpen("pending")}
          />
        </CardFooter>
      </Card>
    </>
  )
}

function StatusCardAction({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const button = (
    <Button type="button" variant="ghost" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
  if (!disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>escolha um projeto</TooltipContent>
    </Tooltip>
  )
}

function HistoryToolbar({
  mode,
  greensAvailable,
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
  greensAvailable: boolean
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
      : Boolean(
          search ||
          period !== "all" ||
          origin !== "both" ||
          grouping !== "preset"
        )

  const greensToggle = (
    <ToggleGroupItem value="greens" disabled={!greensAvailable}>
      Últimos verdes
    </ToggleGroupItem>
  )

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value === "executions" || value === "greens") onMode(value)
        }}
        variant="default"
        spacing={1}
        aria-label="Modo do histórico"
      >
        <ToggleGroupItem value="executions">Execuções</ToggleGroupItem>
        {greensAvailable ? (
          greensToggle
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{greensToggle}</span>
            </TooltipTrigger>
            <TooltipContent>escolha um projeto</TooltipContent>
          </Tooltip>
        )}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-48 flex-1 basis-full sm:basis-48">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={
              mode === "executions"
                ? "Buscar execuções…"
                : "Buscar últimos verdes…"
            }
            aria-label="Buscar por preset, branch, SHA ou ticket"
          />
        </InputGroup>
        <FilterSelect
          label="Período do histórico"
          value={period}
          onValueChange={(value) => onPeriod(value as Period)}
          options={[
            { value: "all", label: "Todo período" },
            { value: "today", label: "Hoje" },
            { value: "48h", label: "48h" },
            { value: "week", label: "Semana" },
            { value: "15d", label: "15 dias" },
          ]}
        />
        {mode === "executions" ? (
          <FilterSelect
            label="Resultado"
            value={result}
            onValueChange={(value) => onResult(value as HistoryResult)}
            options={[
              { value: "all", label: "Todos os resultados" },
              { value: "passed", label: "Passou" },
              { value: "failed", label: "Falhou" },
              { value: "cancelled", label: "Cancelado" },
              { value: "interrupted", label: "Interrompido" },
            ]}
          />
        ) : (
          <>
            <FilterSelect
              label="Origem"
              value={origin}
              onValueChange={(value) => onOrigin(value as GreenOrigin)}
              options={[
                { value: "both", label: "Máquina e Git" },
                { value: "machine", label: "Máquina" },
                { value: "git", label: "Git" },
              ]}
            />
            <FilterSelect
              label="Agrupamento do histórico"
              value={grouping}
              onValueChange={(value) => onGrouping(value as GreenGrouping)}
              options={[
                { value: "preset", label: "Por preset" },
                { value: "commit", label: "Por commit" },
              ]}
            />
          </>
        )}
        {hasFilters ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            Limpar
          </Button>
        ) : null}
      </div>
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
  unattributedRecords?: number
  corruptRecords?: number
}

const HISTORY_DEFAULTS: HistoryFilters = {
  mode: "executions",
  search: "",
  period: "all",
  result: "all",
  origin: "both",
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
  url.searchParams.set("period", filters.period)
  if (filters.mode === "executions") {
    url.searchParams.set("result", filters.result)
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
  const safeCurrent = Array.isArray(current) ? current : []
  const safeNext = Array.isArray(next) ? next : []
  const seen = new Set(safeCurrent.map(jobIdentity))
  return [...safeCurrent, ...safeNext.filter((job) => !seen.has(jobIdentity(job)))]
}

function mergeFirstPage(
  current: RunTableJob[],
  firstPage: RunTableJob[]
): RunTableJob[] {
  const safeFirst = Array.isArray(firstPage) ? firstPage : []
  const safeCurrent = Array.isArray(current) ? current : []
  const updatedIds = new Map(safeFirst.map((job) => [jobIdentity(job), job]))
  const remaining = safeCurrent.filter((job) => !updatedIds.has(jobIdentity(job)))
  return [...safeFirst, ...remaining]
}

function useExecutionHistory(
  scope: ReadScope,
  {
    search,
    period,
    result,
  }: Pick<HistoryFilters, "search" | "period" | "result">,
  historyRevision = ""
) {
  const periodStart = React.useMemo(() => queryPeriodStart(period), [period])
  const requestKey = `${scopeKey(scope)}\u0000${search}\u0000${period}\u0000${result}`
  const requestVersion = React.useRef(0)
  const appliedHistoryRevision = React.useRef(historyRevision)
  const lastRequestKey = React.useRef(requestKey)
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

  const initialRequest = React.useCallback(
    (signal?: AbortSignal) => getExecutions(scope, {
      q: search || undefined,
      result,
      from: periodStart,
    }, signal),
    [periodStart, result, scope, search]
  )
  const initialPage = useApiQuery(
    `executions:${requestKey}:${historyRevision}`,
    initialRequest,
    { pollMs: 10_000 }
  )

  React.useEffect(() => {
    const isNewQuery = lastRequestKey.current !== requestKey
    if (isNewQuery) {
      lastRequestKey.current = requestKey
      requestVersion.current += 1
    }

    const pageError = initialPage.error
      ? errorFrom(initialPage.error, "Não foi possível carregar o histórico.")
      : undefined

    if (initialPage.data) {
      const page = initialPage.data
      const pageJobs = Array.isArray(page.jobs) ? page.jobs : []
      const isNewGen = appliedHistoryRevision.current !== historyRevision
      if (isNewGen || isNewQuery) {
        appliedHistoryRevision.current = historyRevision
        if (isNewGen) requestVersion.current += 1
      }
      setState((current) => {
        const preserveSubsequent =
          !isNewGen &&
          !isNewQuery &&
          current.queryKey === requestKey &&
          current.jobs.length > pageJobs.length

        if (preserveSubsequent) {
          return {
            ...current,
            jobs: mergeFirstPage(current.jobs, pageJobs),
            loading: false,
            error: pageError,
            unattributedRecords: page.coverage?.unattributedRecords,
            corruptRecords: page.coverage?.corruptRecords,
          }
        }

        return {
          queryKey: requestKey,
          jobs: pageJobs,
          loading: false,
          loadingMore: false,
          error: pageError,
          loadMoreError: undefined,
          hasMore: Boolean(page.hasMore),
          snapshotBefore: page.snapshotBefore,
          nextCursor: page.nextCursor ?? null,
          unattributedRecords: page.coverage?.unattributedRecords,
          corruptRecords: page.coverage?.corruptRecords,
        }
      })
      return
    }

    if (initialPage.error) {
      setState((current) => ({
        queryKey: requestKey,
        jobs: current.queryKey === requestKey ? current.jobs : [],
        loading: false,
        loadingMore: false,
        error: pageError,
        loadMoreError: undefined,
        hasMore: false,
        snapshotBefore: undefined,
        nextCursor: null,
      }))
      return
    }

    const waitingNewGen = appliedHistoryRevision.current !== historyRevision
    if (waitingNewGen) {
      requestVersion.current += 1
      setState({
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
      return
    }

    setState((current) =>
      current.queryKey === requestKey
        ? { ...current, loading: true }
        : { queryKey: requestKey, jobs: [], loading: true, loadingMore: false, error: undefined, loadMoreError: undefined, hasMore: false, snapshotBefore: undefined, nextCursor: null }
    )
  }, [initialPage.data, initialPage.error, requestKey, historyRevision])

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

    void sharedPageRequest(`executions-page:${requestKey}:${snapshotBefore}:${cursor}`, () => getExecutions(scope, {
      q: search || undefined,
      result,
      from: periodStart,
      snapshotBefore,
      cursor,
    }))
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
            unattributedRecords: page.coverage?.unattributedRecords,
            corruptRecords: page.coverage?.corruptRecords,
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
  }, [periodStart, requestKey, result, scope, search, state])

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
  period,
}: {
  jobs: RunTableJob[]
  search: string
  grouping: GreenGrouping
  period: Period
}) {
  const needle = search.trim().toLocaleLowerCase("pt-BR")
  const from = queryPeriodStart(period)
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
      return (
        (!needle || haystack.includes(needle)) &&
        (!from || (job.finishedAt ?? "") >= from)
      )
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

function HistoryPanel({
  onOpenJob,
  historyRevision,
  scope,
}: {
  onOpenJob: (jobId: string) => void
  historyRevision: string
  scope: ReadScope
}) {
  const [filters, setFilters] =
    React.useState<HistoryFilters>(readHistoryFilters)
  const [selectedCommit, setSelectedCommit] = React.useState<GreenCommitGroup>()
  const executions = useExecutionHistory(scope, filters, historyRevision)
  const projectScope = scope.kind === "project" ? scope : null
  const greensAvailable = Boolean(projectScope)
  if (!greensAvailable && filters.mode !== "executions") {
    setFilters((current) =>
      current.mode === "executions" ? current : { ...current, mode: "executions" },
    )
  }
  const historyMode = greensAvailable ? filters.mode : "executions"
  const greensMode = historyMode === "greens"
  const needsMachine = filters.origin !== "git"
  const needsGit = filters.origin !== "machine"
  const presetRequest = React.useCallback(
    (signal?: AbortSignal) =>
      projectScope
        ? getPresetHistory(projectScope, signal)
        : Promise.reject(new Error("catálogo exige um projeto")),
    [projectScope]
  )
  const remoteRequest = React.useCallback(
    (signal?: AbortSignal) =>
      projectScope
        ? getRemoteSlots(projectScope, signal)
        : Promise.reject(new Error("verdes exigem um projeto")),
    [projectScope]
  )
  const presetHistory = useApiQuery(
    `preset-history:${projectScope ? scopeKey(projectScope) : "none"}`,
    presetRequest,
    {
      enabled: greensMode && needsMachine,
      pollMs: 10_000,
    }
  )
  const remote = useApiQuery(
    `remote-slots:${projectScope ? scopeKey(projectScope) : "none"}`,
    remoteRequest,
    {
      enabled: greensMode && needsGit,
      pollMs: 10_000,
    }
  )

  React.useEffect(() => {
    writeHistoryFilters({ ...filters, mode: historyMode })
  }, [filters, historyMode])

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
      period: filters.period,
    })
  }, [
    filters.grouping,
    filters.period,
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
            period: HISTORY_DEFAULTS.period,
            origin: HISTORY_DEFAULTS.origin,
            grouping: HISTORY_DEFAULTS.grouping,
          }
    )
  }

  const toolbar = (
    <>
      <HistoryToolbar
        mode={historyMode}
        greensAvailable={greensAvailable}
        search={filters.search}
        period={filters.period}
        result={filters.result}
        origin={filters.origin}
        grouping={filters.grouping}
        onMode={(mode) => {
          setFilters((current) => ({ ...current, mode }))
        }}
        onSearch={(search) => setFilters((current) => ({ ...current, search }))}
        onPeriod={(period) => setFilters((current) => ({ ...current, period }))}
        onResult={(result) => setFilters((current) => ({ ...current, result }))}
        onOrigin={(origin) => setFilters((current) => ({ ...current, origin }))}
        onGrouping={(grouping) =>
          setFilters((current) => ({ ...current, grouping }))
        }
        onClear={clear}
      />
    </>
  )

  return (
    <section className="min-w-0" aria-label="Histórico">
      {historyMode === "executions" ? (
        <RunTable
          toolbar={toolbar}
          title="Histórico"
          jobs={executions.jobs}
          loading={executions.loading}
          error={executions.error}
          emptyTitle={
            filters.search ||
            filters.period !== "all" ||
            filters.result !== "all"
              ? "Nenhuma execução corresponde aos filtros"
              : "Nenhuma execução concluída"
          }
          emptyDescription={
            filters.search ||
            filters.period !== "all" ||
            filters.result !== "all"
              ? "Ajuste ou limpe os filtros para ampliar a busca."
              : "As execuções terminais aparecerão aqui."
          }
          onOpenJob={onOpenJob}
          hasMore={executions.hasMore}
          loadingMore={executions.loadingMore}
          loadMoreError={executions.loadMoreError}
          onLoadMore={executions.loadMore}
          showProjectChip={scope.kind !== "project"}
          filterProjectId={
            scope.kind === "project" ? scope.projectId : undefined
          }
        />
      ) : filters.grouping === "commit" ? (
        <Card className="gap-0 pb-0">
          <CardHeader className="gap-3">
            <CardDescription>{greenDescription}</CardDescription>
            {toolbar}
          </CardHeader>
          <CardContent className="px-0">
            <GreenCommitTable
              embedded
              groups={groupGreenCommits(selectedGreenRows)}
              onOpen={setSelectedCommit}
              emptyDescription="Não há execução canônica aprovada para os filtros selecionados."
            />
          </CardContent>
        </Card>
      ) : (
        <RunTable
          toolbar={toolbar}
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
      {selectedCommit ? (
        <GreenCommitDrawer
          group={selectedCommit}
          onClose={() => setSelectedCommit(undefined)}
          onOpenJob={onOpenJob}
        />
      ) : null}
    </section>
  )
}

export function StatusPage() {
  const { scope, loading: projectsLoading } = useProjectContext()
  const statusRequest = React.useCallback(
    (signal?: AbortSignal) =>
      scope
        ? getStatus(scope, signal)
        : Promise.reject(new Error("Selecione um projeto ou o arquivo sem projeto.")),
    [scope]
  )
  const status = useApiQuery(`status:${scope ? scopeKey(scope) : "none"}`, statusRequest, {
    pollMs: 10_000,
    enabled: Boolean(scope),
  })
  const projectScope = scope?.kind === "project" ? scope : null
  const dashboardRequest = React.useCallback(
    (signal?: AbortSignal) =>
      projectScope
        ? getDashboardState(projectScope, signal)
        : Promise.reject(new Error("Meta exige um projeto")),
    [projectScope]
  )
  const dashboard = useApiQuery(
    `dashboard-state:${projectScope ? scopeKey(projectScope) : "none"}`,
    dashboardRequest,
    {
      pollMs: 10_000,
      enabled: Boolean(projectScope),
    }
  )
  const [selectedJobId, setSelectedJobId] = React.useState<string>()
  const [stateDrawerOpen, setStateDrawerOpen] = React.useState(false)
  const [stateSurface, setStateSurface] = React.useState<"meta" | "pending">(
    "meta"
  )

  const openStatusState = (surface: "meta" | "pending") => {
    setStateSurface(surface)
    setStateDrawerOpen(true)
  }

  if (projectsLoading || !scope) {
    return (
      <main className="flex flex-1 p-4 lg:p-6">
        <div className="w-full">
          {projectsLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ErrorState
              title="Nenhum projeto selecionado"
              error={new Error("Cadastre um projeto no seletor do header ou abra o histórico sem projeto.")}
            />
          )}
        </div>
      </main>
    )
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

  const projectScoped = scope.kind === "project"

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <CurrentExecution snapshot={status.data} onOpenJob={setSelectedJobId} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <RunTable
            title="Fila"
            kind="queue"
            jobs={status.data.queued}
            loading={false}
            error={undefined}
            emptyTitle="Fila livre"
            emptyDescription="A próxima execução aguardando aparecerá aqui."
            onOpenJob={setSelectedJobId}
            showProjectChip
          />
          <HistoryPanel
            scope={scope}
            onOpenJob={setSelectedJobId}
            historyRevision={status.data.historyRevision ?? status.data.history?.[0]?.id ?? ""}
          />
        </div>
        <aside className="flex flex-col gap-4">
          <MachineCard />
          <StatusStateCards
            dashboard={dashboard}
            projectScoped={projectScoped}
            onOpen={openStatusState}
            onOpenJob={setSelectedJobId}
          />
        </aside>
      </div>
      {selectedJobId ? (
        <JobDrawer
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(undefined)}
        />
      ) : null}
      {stateDrawerOpen && dashboard.data ? (
        <StatusStateDrawer
          state={dashboard.data}
          surface={stateSurface}
          onClose={() => setStateDrawerOpen(false)}
          onSaved={dashboard.reload}
          onOpenJob={(jobId) => {
            setStateDrawerOpen(false)
            setSelectedJobId(jobId)
          }}
        />
      ) : null}
    </main>
  )
}
