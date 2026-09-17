import { DataTableFrame } from "@/features/shared/data-table-frame"
import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts"

import { useProjectContext, useRequiredProject } from "@/features/projects/project-context"
import { scopeKey } from "@/features/projects/scope"
import {
  getDuration,
  getPresetHistory,
  getResults,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import {
  parseAnalysisState,
  writeAnalysisState,
  type AnalysisPeriod,
  type AnalysisViewState,
} from "@/features/analysis/analysis-state"
import { PresetMultiSelect } from "@/features/analysis/preset-multi-select"
import {
  formatShare,
  mapResultRows,
  rankResults,
  resolveSelection,
  RESULT_STATES,
  type ResultCounts,
  type ResultRow,
} from "@/features/analysis/results-model"
import { FilterSelect } from "@/features/shared/filter-select"
import type { AnalysisPreset, AnalysisResponse, ResultsResponse } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import {
  formatDateTime,
  formatTimelineDate,
  formatDuration,
  queryPeriodStart,
} from "@/features/shared/format"
const ANALYSIS_STORAGE_PREFIX = "ci-queue.analysis."
const PERIOD_OPTIONS = [
  { value: "all", label: "Todo o período" },
  { value: "week", label: "Últimos 7 dias" },
  { value: "month", label: "Últimos 30 dias" },
  { value: "quarter", label: "Últimos 90 dias" },
]

const resultChartConfig = {
  passed: { label: "Passou", color: "var(--success)" },
  failed: { label: "Falhou", color: "var(--destructive)" },
  cancelled: { label: "Cancelado", color: "var(--muted-foreground)" },
  interrupted: { label: "Interrompido", color: "var(--warning)" },
} satisfies ChartConfig

const durationChartConfig = {
  durationMs: { label: "Duração", color: "var(--primary)" },
} satisfies ChartConfig

function durationStats(preset: AnalysisPreset) {
  const { duration } = preset
  return [
    { title: "Mediana", value: formatDuration(duration.medianMs) },
    {
      title: "Faixa",
      value: `${formatDuration(duration.minMs)} — ${formatDuration(duration.maxMs)}`,
    },
    { title: "Amostra", value: `${duration.count} execução(ões)` },
  ]
}

function paddedDomain(values: number[], minimumPadding: number) {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const padding = Math.max((high - low) * 0.08, minimumPadding)
  return [low - padding, high + padding] as const
}

function validPreset(value: string | null, presets: string[]) {
  return value && presets.includes(value) ? value : ""
}

function readStoredAnalysis(projectId: string): AnalysisViewState | undefined {
  try {
    const raw = window.sessionStorage.getItem(`${ANALYSIS_STORAGE_PREFIX}${projectId}`)
    return raw ? parseAnalysisState(raw) : undefined
  } catch {
    return undefined
  }
}

function persistAnalysis(projectId: string, state: AnalysisViewState) {
  const encoded = writeAnalysisState(window.location.search, state)
  window.sessionStorage.setItem(`${ANALYSIS_STORAGE_PREFIX}${projectId}`, encoded)
  const url = new URL(window.location.href)
  url.search = encoded
  window.history.replaceState(window.history.state, "", url)
}

function resultRowsOrError(presets: ResultCounts[] | undefined): {
  rows?: ResultRow[]
  dataError?: Error
} {
  if (!presets) {
    return {}
  }
  try {
    return { rows: mapResultRows(presets).filter((row) => row.percentages) }
  } catch (reason) {
    return {
      dataError:
        reason instanceof Error ? reason : new Error("Contagem de resultado inválida"),
    }
  }
}

function ResultsShareList({
  row,
}: {
  row: ResultCounts & { percentages: Record<string, number> | null }
}) {
  return (
    <div className="grid min-w-40 items-start gap-1.5 text-xs">
      <div className="font-medium">{row.preset}</div>
      <div className="text-muted-foreground">
        {row.total.toLocaleString("pt-BR")} execuções no período
      </div>
      <div className="grid gap-1.5">
        {RESULT_STATES.map((state) => (
          <div key={state} className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              {resultChartConfig[state].label}
            </span>
            <span className="font-mono tabular-nums">
              {row[state].toLocaleString("pt-BR")} ·{" "}
              {formatShare(row.percentages?.[state] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResultsTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ResultCounts & { percentages: Record<string, number> | null } }>
}) {
  const row = payload?.[0]?.payload
  if (!active || !row?.percentages) {
    return null
  }
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 shadow-xl">
      <ResultsShareList row={row} />
    </div>
  )
}

function ResultsChart({
  presets,
  loading,
  error,
  emptySelected,
}: {
  presets: ResultCounts[] | undefined
  loading: boolean
  error: Error | undefined
  emptySelected: boolean
}) {
  const [inspected, setInspected] = React.useState<string>()
  if (loading) {
    return <Skeleton className="h-80 w-full" />
  }
  const { rows: mappedRows, dataError } = resultRowsOrError(presets)
  if (dataError) {
    return <ErrorState title="Dados de resultados inválidos" error={dataError} />
  }
  if (error && !presets?.length) {
    return (
      <ErrorState
        title="Não foi possível carregar os resultados"
        error={error}
      />
    )
  }
  if (!presets?.length) {
    return (
      <EmptyState
        title={emptySelected ? "Selecione ao menos um preset" : "Sem resultados no período"}
        description={
          emptySelected
            ? "Limpar deixa a seleção vazia. Nenhum preset selecionado não significa todos."
            : "Não há execuções terminais para os filtros selecionados."
        }
      />
    )
  }

  const rows = mappedRows ?? []
  const chartRows = rows.map((row) => ({
    ...row,
    passedPct: row.percentages?.passed ?? 0,
    failedPct: row.percentages?.failed ?? 0,
    cancelledPct: row.percentages?.cancelled ?? 0,
    interruptedPct: row.percentages?.interrupted ?? 0,
  }))
  const inspectedRow = rows.find((row) => row.preset === inspected)

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Resultados por preset</CardTitle>
        <CardDescription>
          Distribuição percentual; quantidades no detalhe e na tabela.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="overflow-x-auto">
          <ChartContainer
            config={resultChartConfig}
            className="aspect-auto h-72 max-w-none"
            style={{ minWidth: Math.max(280, chartRows.length * 120) }}
          >
            <BarChart
              accessibilityLayer
              data={chartRows}
              maxBarSize={64}
              margin={{ left: 4, right: 12, top: 12 }}
              onClick={(next) => {
                const label = next?.activeLabel
                if (typeof label === "string") {
                  setInspected(label)
                }
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="preset"
                interval={0}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  const label = String(value)
                  return label.length > 18 ? `${label.slice(0, 16)}…` : label
                }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip content={<ResultsTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="passedPct" stackId="results" fill="var(--color-passed)" name="passed" />
              <Bar dataKey="failedPct" stackId="results" fill="var(--color-failed)" name="failed" />
              <Bar dataKey="cancelledPct" stackId="results" fill="var(--color-cancelled)" name="cancelled" />
              <Bar
                dataKey="interruptedPct"
                stackId="results"
                fill="var(--color-interrupted)"
                name="interrupted"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
        {inspectedRow ? (
          <Item variant="outline" size="sm">
            <ItemContent>
              <ResultsShareList row={inspectedRow} />
            </ItemContent>
          </Item>
        ) : null}
        <DataTableFrame placement="body" label="Resultados por preset">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Preset</TableHead>
              <TableHead className="w-[12%] text-right">Passou</TableHead>
              <TableHead className="w-[12%] text-right">Falhou</TableHead>
              <TableHead className="w-[12%] text-right">Cancelado</TableHead>
              <TableHead className="w-[12%] text-right">Interrompido</TableHead>
              <TableHead className="w-[12%] text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((preset) => (
              <TableRow key={preset.preset}>
                <TableCell className="min-w-0 max-w-0 font-medium">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto max-w-full min-w-0 justify-start p-0 text-left font-medium break-words whitespace-normal [overflow-wrap:anywhere]"
                      >
                        {preset.preset}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64">
                      <ResultsShareList row={preset} />
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell className="text-right tabular-nums">{preset.passed}</TableCell>
                <TableCell className="text-right tabular-nums">{preset.failed}</TableCell>
                <TableCell className="text-right tabular-nums">{preset.cancelled}</TableCell>
                <TableCell className="text-right tabular-nums">{preset.interrupted}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{preset.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableFrame>
      </CardContent>
    </Card>
  )
}

function DurationChart({
  preset,
  loading,
  error,
  catalogState,
  onManage,
}: {
  preset: AnalysisPreset | undefined
  loading: boolean
  error: Error | undefined
  catalogState: "linked" | "unlinked" | "invalid" | "missing" | undefined
  onManage: () => void
}) {
  if (loading) {
    return <Skeleton className="h-80 w-full" />
  }
  if (catalogState && catalogState !== "linked") {
    return (
      <EmptyState
        title="Catálogo de receitas indisponível"
        description="Duração canônica exige receitas vinculadas. Pasta sem config ou config ilegível não inventam verde."
      >
        <Button type="button" variant="outline" onClick={onManage}>
          Gerenciar projetos
        </Button>
      </EmptyState>
    )
  }
  if (error && !preset?.points.length) {
    return (
      <ErrorState title="Não foi possível carregar a duração" error={error} />
    )
  }
  if (!preset) {
    return (
      <EmptyState
        title="Selecione um preset"
        description="A duração é comparável somente dentro de um preset declarado."
      />
    )
  }
  if (!preset.points.length) {
    return (
      <EmptyState
        title="Sem pontos de duração"
        description="Não há execuções canônicas com duração válida neste período."
      />
    )
  }

  const points = preset.points
    .map((point) => ({
      ...point,
      atMs: point.at ? new Date(point.at).getTime() : Number.NaN,
    }))
    .filter((point) => Number.isFinite(point.atMs))

  if (!points.length) {
    return (
      <EmptyState
        title="Sem pontos de duração"
        description="Não há execuções canônicas com data e duração válidas neste período."
      />
    )
  }

  const timeDomain = paddedDomain(
    points.map((point) => point.atMs),
    60 * 60 * 1_000
  )
  const durationDomain = paddedDomain(
    points.map((point) => point.durationMs),
    1_000
  )
  const nonNegativeDurationDomain = [
    Math.max(0, durationDomain[0]),
    durationDomain[1],
  ] as const

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Duração de {preset.preset}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ItemGroup className="grid gap-2 sm:grid-cols-3">
          {durationStats(preset).map((stat) => (
            <Item
              key={stat.title}
              variant="default"
              size="sm"
              className="border-transparent px-0 py-0"
            >
              <ItemContent>
                <ItemTitle>{stat.title}</ItemTitle>
                <ItemDescription>{stat.value}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <ChartContainer
          config={durationChartConfig}
          className="aspect-auto h-72 w-full"
        >
          <ScatterChart
            accessibilityLayer
            margin={{ left: 12, right: 16, top: 12, bottom: 16 }}
          >
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey="atMs"
              name="Horário"
              domain={timeDomain}
              tickCount={4}
              minTickGap={32}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) =>
                formatTimelineDate(new Date(Number(value)).toISOString())
              }
            />
            <YAxis
              type="number"
              dataKey="durationMs"
              name="Duração"
              domain={nonNegativeDurationDomain}
              width={72}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatDuration(Number(value))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      { at?: string } | undefined
                    return point?.at
                      ? formatDateTime(point.at)
                      : "Horário indisponível"
                  }}
                  formatter={(value) =>
                    formatDuration(
                      typeof value === "number" ? value : Number(value)
                    )
                  }
                />
              }
            />
            <Scatter
              data={points}
              dataKey="durationMs"
              fill="var(--color-durationMs)"
              line={false}
              name="durationMs"
            />
          </ScatterChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function AnalysisControls({
  period,
  preset,
  presets,
  rows,
  selection,
  durationRequiresPreset,
  onPeriod,
  onPreset,
  onSelection,
  onMenuOpenChange,
}: {
  period: AnalysisPeriod
  preset: string
  presets: string[]
  rows: ResultCounts[]
  selection: AnalysisViewState["resultSelection"]
  durationRequiresPreset: boolean
  onPeriod: (value: AnalysisPeriod) => void
  onPreset: (value: string) => void
  onSelection: (next: AnalysisViewState["resultSelection"]) => void
  onMenuOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <FilterSelect
        label="Período da análise"
        value={period}
        onValueChange={(value) => onPeriod(value as AnalysisPeriod)}
        options={PERIOD_OPTIONS}
      />
      {durationRequiresPreset ? (
        <FilterSelect
          label="Preset da duração"
          value={preset}
          placeholder="Selecione um preset"
          onValueChange={onPreset}
          options={presets.map((item) => ({ value: item, label: item }))}
        />
      ) : (
        <PresetMultiSelect
          key={period}
          rows={rows}
          selection={selection}
          onSelection={onSelection}
          onOpenChange={onMenuOpenChange}
        />
      )}
    </>
  )
}

function AnalysisStatistics({
  view,
  period,
  preset,
  presets,
  results,
  duration,
  visibleResults,
  rows,
  selection,
  missing,
  onView,
  onPeriod,
  onPreset,
  onSelection,
  onMenuOpenChange,
  catalogState,
  onManage,
}: {
  view: AnalysisViewState["metric"]
  period: AnalysisPeriod
  preset: string
  presets: string[]
  results: ApiQuery<ResultsResponse>
  duration: ApiQuery<AnalysisResponse>
  visibleResults: ResultCounts[] | undefined
  rows: ResultCounts[]
  selection: AnalysisViewState["resultSelection"]
  missing: string[]
  onView: (value: AnalysisViewState["metric"]) => void
  onPeriod: (value: AnalysisPeriod) => void
  onPreset: (value: string) => void
  onSelection: (next: AnalysisViewState["resultSelection"]) => void
  onMenuOpenChange: (open: boolean) => void
  catalogState: "linked" | "unlinked" | "invalid" | "missing" | undefined
  onManage: () => void
}) {
  const selectedPreset = duration.data?.presets.find(
    (item) => item.preset === preset
  )

  return (
    <div>
      <div className="flex flex-wrap justify-start gap-2">
        <ToggleGroup
          type="single"
          value={view}
          variant="outline"
          spacing={0}
          onValueChange={(value) => {
            if (value === "results" || value === "duration") onView(value)
          }}
          aria-label="Métrica da análise"
        >
          <ToggleGroupItem value="results">Resultados</ToggleGroupItem>
          <ToggleGroupItem value="duration">Duração</ToggleGroupItem>
        </ToggleGroup>
        <AnalysisControls
          period={period}
          preset={preset}
          presets={presets}
          rows={rows}
          selection={selection}
          durationRequiresPreset={view === "duration"}
          onPeriod={onPeriod}
          onPreset={onPreset}
          onSelection={onSelection}
          onMenuOpenChange={onMenuOpenChange}
        />
      </div>
      {view === "results" && missing.length ? (
        <p className="pt-2 text-sm text-muted-foreground">
          Sem execuções neste período: {missing.join(", ")}
        </p>
      ) : null}
      <div className="pt-5">
        {view === "results" ? (
          <ResultsChart
            presets={visibleResults}
            loading={results.loading}
            error={results.error}
            emptySelected={selection.mode === "custom" && selection.presets.length === 0}
          />
        ) : (
          <DurationChart
            preset={preset ? selectedPreset : undefined}
            loading={duration.loading}
            error={duration.error}
            catalogState={catalogState}
            onManage={onManage}
          />
        )}
      </div>
    </div>
  )
}

export function AnalysisPage() {
  const { projects, openManager } = useProjectContext()
  const project = useRequiredProject()
  const catalogState = project
    ? projects.find((item) => item.id === project.projectId)?.bindingState
    : undefined
  const [state, setState] = React.useState<AnalysisViewState>(() => {
    const url = parseAnalysisState(window.location.search)
    if (!project) {
      return url
    }
    const stored = readStoredAnalysis(project.projectId)
    return window.location.search.includes("analysisMetric") || !stored
      ? url
      : stored
  })
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [heldRows, setHeldRows] = React.useState<ResultCounts[]>([])
  const periodStart = React.useMemo(() => {
    if (state.period === "quarter") {
      const from = new Date()
      from.setDate(from.getDate() - 90)
      return from.toISOString()
    }
    return queryPeriodStart(state.period)
  }, [state.period])
  const commit = React.useCallback(
    (next: AnalysisViewState) => {
      setState(next)
      if (project) {
        persistAnalysis(project.projectId, next)
      }
    },
    [project]
  )
  const presetRequest = React.useCallback(
    () =>
      project
        ? getPresetHistory(project)
        : Promise.reject(new Error("Análise exige um projeto")),
    [project]
  )
  const presetHistory = useApiQuery(
    `analysis-presets:${project ? scopeKey(project) : "none"}`,
    presetRequest,
    { enabled: Boolean(project) }
  )
  const presetNames = React.useMemo(
    () =>
      presetHistory.data?.presets
        .filter((item) => item.declared)
        .map((item) => item.preset) ?? [],
    [presetHistory.data]
  )
  const durationPreset = validPreset(state.durationPreset, presetNames)
  const resultsRequest = React.useCallback(
    () =>
      project
        ? getResults(project, { from: periodStart })
        : Promise.reject(new Error("Análise exige um projeto")),
    [periodStart, project]
  )
  const results = useApiQuery(
    `analysis-results:${project ? scopeKey(project) : "none"}:${state.period}`,
    resultsRequest,
    { pollMs: 30_000, enabled: Boolean(project) }
  )
  const durationRequest = React.useCallback(
    () =>
      project && durationPreset
        ? getDuration(project, { from: periodStart, preset: durationPreset })
        : Promise.reject(new Error("Selecione um preset declarado")),
    [durationPreset, periodStart, project]
  )
  const duration = useApiQuery(
    `analysis-duration:${project ? scopeKey(project) : "none"}:${state.period}:${durationPreset}`,
    durationRequest,
    {
      enabled:
        Boolean(project) && state.metric === "duration" && Boolean(durationPreset),
    }
  )
  const latestRows = results.data?.presets ?? []
  const appliedRows = menuOpen ? heldRows : latestRows
  const resolved = resolveSelection(appliedRows, state.resultSelection)
  const visibleResults = rankResults(appliedRows).filter((row) =>
    resolved.selected.includes(row.preset)
  )

  if (!project) {
    return (
      <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
        <ErrorState
          title="Análise exige um projeto"
          error={new Error("Cadastre ou selecione um projeto para ver Resultados e Duração.")}
        />
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Análise</h1>
      <AnalysisStatistics
        view={state.metric}
        period={state.period}
        preset={durationPreset}
        presets={presetNames}
        results={results}
        duration={duration}
        visibleResults={visibleResults}
        rows={appliedRows}
        selection={state.resultSelection}
        missing={resolved.missing}
        onView={(metric) => commit({ ...state, metric })}
        onPeriod={(period) => {
          setMenuOpen(false)
          commit({ ...state, period })
        }}
        onPreset={(preset) => commit({ ...state, durationPreset: preset })}
        onSelection={(resultSelection) => commit({ ...state, resultSelection })}
        catalogState={catalogState}
        onManage={openManager}
        onMenuOpenChange={(open) => {
          if (open) {
            setHeldRows(latestRows)
          }
          setMenuOpen(open)
        }}
      />
    </main>
  )
}
