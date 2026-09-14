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
import type { AnalysisPreset, AnalysisResponse } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
    <Card>
      <CardHeader>
        <CardTitle>Resultados por preset</CardTitle>
        <CardDescription>
          Todos os presets filtrados aparecem nas barras empilhadas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={resultChartConfig}
          className="aspect-auto h-80 w-full"
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
    <Card>
      <CardHeader>
        <CardTitle>Duração de {preset.preset}</CardTitle>
        <CardDescription>
          Pontos de execuções canônicas, sem tendência interpolada.
        </CardDescription>
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
          className="aspect-auto h-80 w-full"
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
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (value === "results" || value === "duration") {
          onView(value)
        }
      }}
    >
      <div className="flex flex-wrap justify-start gap-2">
        <TabsList>
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="duration">Duração</TabsTrigger>
        </TabsList>
        <AnalysisControls
          period={period}
          preset={preset}
          presets={presets}
          durationRequiresPreset={view === "duration"}
          onPeriod={onPeriod}
          onPreset={onPreset}
        />
      </div>
      <TabsContent value="results" className="pt-5">
        <ResultsChart
          presets={analysis.data?.presets}
          loading={analysis.loading}
          error={analysis.error}
        />
      </TabsContent>
      <TabsContent value="duration" className="pt-5">
        <DurationChart
          preset={preset ? selectedPreset : undefined}
          loading={analysis.loading}
          error={analysis.error}
        />
      </TabsContent>
    </Tabs>
  )
}

export function AnalysisPage() {
  const [tab, setTab] = React.useState<AnalysisTab>("statistics")
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

  const durationPreset =
    validPreset(preset, presetNames) || rememberedDurationPreset

  const handlePreset = React.useCallback(
    (next: string) => {
      if (!next) {
        if (tab !== "statistics" || view !== "duration") {
          setPreset("")
        }
        return
      }

      setPreset(next)
      setLastDurationPreset(next)
      writeDurationPreset(next)
    },
    [tab, view]
  )

  const effectivePreset =
    tab === "statistics" && view === "duration" ? durationPreset : preset
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

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-medium">Análise</h1>
        <p className="text-sm text-muted-foreground">
          Leitura dos registros terminais retidos pela bridge.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "statistics" || value === "problems") {
            setTab(value)
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
            <RunTable
              title="Problemas"
              description="Falhas e interrupções terminais, sem classificação adicional inventada pela interface."
              jobs={analysis.data?.problems}
              loading={analysis.loading}
              error={analysis.error}
              emptyDescription="Não há execução falha ou interrompida para os filtros selecionados."
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
