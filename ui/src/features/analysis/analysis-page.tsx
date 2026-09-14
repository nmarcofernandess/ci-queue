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

import {
  getAnalysis,
  getPresetHistory,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type { AnalysisPreset, AnalysisResponse, JobRecord } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState, ErrorState } from "@/features/shared/async-state"
import {
  formatDateTime,
  formatDuration,
  queryPeriodStart,
} from "@/features/shared/format"
import { JobDrawer } from "@/features/shared/job-drawer"
import { RunTable } from "@/features/shared/run-table"

type AnalysisTab = "statistics" | "problems"
type StatisticsView = "results" | "duration"
type Period = "all" | "week" | "month" | "quarter"

const DURATION_PRESET_QUERY_KEY = "analysisPreset"

function readAnalysisTab(): AnalysisTab {
  if (typeof window === "undefined") return "statistics"
  return new URLSearchParams(window.location.search).get("analysisTab") ===
    "problems"
    ? "problems"
    : "statistics"
}

function writeAnalysisTab(tab: AnalysisTab) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (tab === "problems") url.searchParams.set("analysisTab", "problems")
  else url.searchParams.delete("analysisTab")
  url.hash = "analysis"
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  )
}

const resultChartConfig = {
  passed: { label: "Passou", color: "var(--primary)" },
  failed: { label: "Falhou", color: "var(--destructive)" },
  cancelled: { label: "Cancelado", color: "var(--muted-foreground)" },
  interrupted: { label: "Interrompido", color: "var(--foreground)" },
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

function readDurationPreset() {
  if (typeof window === "undefined") {
    return ""
  }

  return (
    new URLSearchParams(window.location.search).get(
      DURATION_PRESET_QUERY_KEY
    ) ?? ""
  )
}

function writeDurationPreset(preset: string) {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)
  if (preset) {
    url.searchParams.set(DURATION_PRESET_QUERY_KEY, preset)
  } else {
    url.searchParams.delete(DURATION_PRESET_QUERY_KEY)
  }
  url.hash = "analysis"
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  )
}

function validPreset(value: string, presets: string[]) {
  return value && presets.includes(value) ? value : ""
}

function appendProblemPage(existing: JobRecord[], next: JobRecord[]) {
  const seen = new Set(existing.map((job) => job.id))
  return [...existing, ...next.filter((job) => !seen.has(job.id))]
}

function ResultsChart({
  presets,
  loading,
  error,
}: {
  presets: AnalysisPreset[] | undefined
  loading: boolean
  error: Error | undefined
}) {
  if (loading) {
    return <Skeleton className="h-80 w-full" />
  }
  if (error) {
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
        title="Sem resultados no período"
        description="Não há execuções terminais para os filtros selecionados."
      />
    )
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Resultados por preset</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ChartContainer
          config={resultChartConfig}
          className="aspect-auto h-72 w-full"
        >
          <BarChart
            accessibilityLayer
            data={presets}
            margin={{ left: 4, right: 12, top: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="preset" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="passed"
              stackId="results"
              fill="var(--color-passed)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="failed"
              stackId="results"
              fill="var(--color-failed)"
            />
            <Bar
              dataKey="cancelled"
              stackId="results"
              fill="var(--color-cancelled)"
            />
            <Bar
              dataKey="interrupted"
              stackId="results"
              fill="var(--color-interrupted)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Preset</TableHead>
                <TableHead className="text-right">Passou</TableHead>
                <TableHead className="text-right">Falhou</TableHead>
                <TableHead className="text-right">Cancelado</TableHead>
                <TableHead className="text-right">Interrompido</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets.map((preset) => (
                <TableRow key={preset.preset}>
                  <TableCell className="font-medium">{preset.preset}</TableCell>
                  <TableCell className="text-right">{preset.passed}</TableCell>
                  <TableCell className="text-right">{preset.failed}</TableCell>
                  <TableCell className="text-right">
                    {preset.cancelled}
                  </TableCell>
                  <TableCell className="text-right">
                    {preset.interrupted}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {preset.passed +
                      preset.failed +
                      preset.cancelled +
                      preset.interrupted}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function DurationChart({
  preset,
  loading,
  error,
}: {
  preset: AnalysisPreset | undefined
  loading: boolean
  error: Error | undefined
}) {
  if (loading) {
    return <Skeleton className="h-80 w-full" />
  }
  if (error) {
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
            margin={{ left: 4, right: 12, top: 12 }}
          >
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey="atMs"
              name="Horário"
              domain={timeDomain}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) =>
                formatDateTime(new Date(Number(value)).toISOString())
              }
            />
            <YAxis
              type="number"
              dataKey="durationMs"
              name="Duração"
              domain={durationDomain}
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
  durationRequiresPreset,
  onPeriod,
  onPreset,
}: {
  period: Period
  preset: string
  presets: string[]
  durationRequiresPreset: boolean
  onPeriod: (value: Period) => void
  onPreset: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap justify-start gap-2">
      <Select
        value={period}
        onValueChange={(value) => onPeriod(value as Period)}
      >
        <SelectTrigger aria-label="Período da análise">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">Todo o período</SelectItem>
            <SelectItem value="week">Últimos 7 dias</SelectItem>
            <SelectItem value="month">Últimos 30 dias</SelectItem>
            <SelectItem value="quarter">Últimos 90 dias</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={preset || (durationRequiresPreset ? undefined : "all")}
        onValueChange={(value) => onPreset(value === "all" ? "" : value)}
      >
        <SelectTrigger aria-label="Preset da análise">
          <SelectValue
            placeholder={
              durationRequiresPreset
                ? "Selecione um preset"
                : "Todos os presets"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!durationRequiresPreset ? (
              <SelectItem value="all">Todos os presets</SelectItem>
            ) : null}
            {presets.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function AnalysisStatistics({
  view,
  period,
  preset,
  presets,
  analysis,
  onView,
  onPeriod,
  onPreset,
}: {
  view: StatisticsView
  period: Period
  preset: string
  presets: string[]
  analysis: ApiQuery<AnalysisResponse>
  onView: (value: StatisticsView) => void
  onPeriod: (value: Period) => void
  onPreset: (value: string) => void
}) {
  const selectedPreset = analysis.data?.presets.find(
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
          durationRequiresPreset={view === "duration"}
          onPeriod={onPeriod}
          onPreset={onPreset}
        />
      </div>
      <div className="pt-5">
        {view === "results" ? (
          <ResultsChart
            presets={analysis.data?.presets}
            loading={analysis.loading}
            error={analysis.error}
          />
        ) : (
          <DurationChart
            preset={preset ? selectedPreset : undefined}
            loading={analysis.loading}
            error={analysis.error}
          />
        )}
      </div>
    </div>
  )
}

function ProblemsTable({
  analysis,
  from,
  preset,
  onOpenJob,
}: {
  analysis: ApiQuery<AnalysisResponse>
  from: string | undefined
  preset: string
  onOpenJob: (jobId: string) => void
}) {
  const [pages, setPages] = React.useState<
    Array<Pick<AnalysisResponse, "problems" | "hasMore" | "nextOffset">>
  >([])
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [loadMoreError, setLoadMoreError] = React.useState<Error>()
  const matchingInitial =
    analysis.data &&
    analysis.data.from === (from ?? null) &&
    analysis.data.preset === (preset || null)
      ? analysis.data
      : undefined
  const loadedPages = matchingInitial
    ? [
        {
          problems: matchingInitial.problems,
          hasMore: matchingInitial.hasMore,
          nextOffset: matchingInitial.nextOffset,
        },
        ...pages,
      ]
    : []
  const lastPage = loadedPages.at(-1)
  const jobs = loadedPages.reduce(
    (all, page) => appendProblemPage(all, page.problems),
    [] as JobRecord[]
  )

  const loadMore = React.useCallback(async () => {
    if (!lastPage?.hasMore || lastPage.nextOffset === null || loadingMore) {
      return
    }
    setLoadingMore(true)
    setLoadMoreError(undefined)
    try {
      const next = await getAnalysis({
        from,
        preset: preset || undefined,
        offset: lastPage.nextOffset,
      })
      setPages((current) => [
        ...current,
        {
          problems: next.problems,
          hasMore: next.hasMore,
          nextOffset: next.nextOffset,
        },
      ])
    } catch (reason) {
      setLoadMoreError(
        reason instanceof Error
          ? reason
          : new Error("Não foi possível carregar mais problemas.")
      )
    } finally {
      setLoadingMore(false)
    }
  }, [from, lastPage, loadingMore, preset])

  return (
    <RunTable
      title="Problemas"
      jobs={matchingInitial ? jobs : undefined}
      loading={analysis.loading && !matchingInitial}
      error={analysis.error}
      emptyDescription="Não há execução falha ou interrompida para os filtros selecionados."
      onOpenJob={onOpenJob}
      showFailureReason
      hasMore={lastPage?.hasMore}
      loadingMore={loadingMore}
      loadMoreError={loadMoreError}
      onLoadMore={() => void loadMore()}
    />
  )
}

export function AnalysisPage() {
  const [tab, setTab] = React.useState<AnalysisTab>(readAnalysisTab)
  const [view, setView] = React.useState<StatisticsView>("results")
  const [period, setPeriod] = React.useState<Period>("all")
  const [preset, setPreset] = React.useState("")
  const [lastDurationPreset, setLastDurationPreset] =
    React.useState(readDurationPreset)
  const [selectedJobId, setSelectedJobId] = React.useState<string>()
  const periodStart = React.useMemo(() => {
    if (period === "quarter") {
      const from = new Date()
      from.setDate(from.getDate() - 90)
      return from.toISOString()
    }
    return queryPeriodStart(period)
  }, [period])
  const presetRequest = React.useCallback(() => getPresetHistory(), [])
  const presetHistory = useApiQuery("analysis-presets", presetRequest)
  const presetNames = React.useMemo(
    () => presetHistory.data?.presets.map((item) => item.preset) ?? [],
    [presetHistory.data]
  )
  const rememberedDurationPreset = React.useMemo(
    () => validPreset(lastDurationPreset, presetNames),
    [lastDurationPreset, presetNames]
  )

  const selectedPreset = preset === "all" ? "" : preset
  const durationPreset =
    validPreset(selectedPreset, presetNames) || rememberedDurationPreset

  const handlePreset = React.useCallback((next: string) => {
    setPreset(next)
    if (next && next !== "all") {
      setLastDurationPreset(next)
      writeDurationPreset(next)
    }
  }, [])

  const effectivePreset =
    tab === "statistics" && view === "duration"
      ? durationPreset
      : selectedPreset
  const analysisRequest = React.useCallback(
    () =>
      getAnalysis({
        from: periodStart,
        preset: effectivePreset || undefined,
      }),
    [effectivePreset, periodStart]
  )
  const analysis = useApiQuery(
    `analysis:${period}:${effectivePreset}`,
    analysisRequest
  )
  const problemKey = `${periodStart ?? "all"}:${effectivePreset}`

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Análise</h1>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "statistics" || value === "problems") {
            setTab(value)
            writeAnalysisTab(value)
          }
        }}
      >
        <TabsList variant="line" className="max-w-full overflow-x-auto">
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="problems">Problemas</TabsTrigger>
        </TabsList>
        <TabsContent value="statistics" className="pt-5">
          <AnalysisStatistics
            view={view}
            period={period}
            preset={effectivePreset}
            presets={presetNames}
            analysis={analysis}
            onView={setView}
            onPeriod={setPeriod}
            onPreset={handlePreset}
          />
        </TabsContent>
        <TabsContent value="problems" className="pt-5">
          <div className="flex flex-col gap-5">
            <AnalysisControls
              period={period}
              preset={preset}
              presets={presetNames}
              durationRequiresPreset={false}
              onPeriod={setPeriod}
              onPreset={handlePreset}
            />
            <ProblemsTable
              key={problemKey}
              analysis={analysis}
              from={periodStart}
              preset={effectivePreset}
              onOpenJob={setSelectedJobId}
            />
          </div>
        </TabsContent>
      </Tabs>
      {selectedJobId ? (
        <JobDrawer
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(undefined)}
        />
      ) : null}
    </main>
  )
}
