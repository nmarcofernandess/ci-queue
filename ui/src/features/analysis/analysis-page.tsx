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

import { getAnalysis, getPresetHistory, useApiQuery } from "@/lib/api"
import type { AnalysisPreset } from "@/lib/types"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
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
  tab,
  view,
  period,
  preset,
  presets,
  onView,
  onPeriod,
  onPreset,
}: {
  tab: AnalysisTab
  view: StatisticsView
  period: Period
  preset: string
  presets: string[]
  onView: (value: StatisticsView) => void
  onPeriod: (value: Period) => void
  onPreset: (value: string) => void
}) {
  const durationRequiresPreset = tab === "statistics" && view === "duration"

  return (
    <div className="flex flex-wrap justify-start gap-2">
      {tab === "statistics" ? (
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value === "results" || value === "duration") onView(value)
          }}
          variant="outline"
          spacing={0}
        >
          <ToggleGroupItem value="results">Resultados</ToggleGroupItem>
          <ToggleGroupItem value="duration">Duração</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
      <Select
        value={period}
        onValueChange={(value) => onPeriod(value as Period)}
      >
        <SelectTrigger aria-label="Período da análise">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo o período</SelectItem>
          <SelectItem value="week">Últimos 7 dias</SelectItem>
          <SelectItem value="month">Últimos 30 dias</SelectItem>
          <SelectItem value="quarter">Últimos 90 dias</SelectItem>
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
          {!durationRequiresPreset ? (
            <SelectItem value="all">Todos os presets</SelectItem>
          ) : null}
          {presets.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function AnalysisPage() {
  const [tab, setTab] = React.useState<AnalysisTab>("statistics")
  const [view, setView] = React.useState<StatisticsView>("results")
  const [period, setPeriod] = React.useState<Period>("all")
  const [preset, setPreset] = React.useState("")
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
  const analysisRequest = React.useCallback(
    () => getAnalysis({ from: periodStart, preset: preset || undefined }),
    [periodStart, preset]
  )
  const analysis = useApiQuery(`analysis:${period}:${preset}`, analysisRequest)
  const selectedPreset = analysis.data?.presets.find(
    (item) => item.preset === preset
  )

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-medium">Análise</h1>
        <p className="text-sm text-muted-foreground">
          Leitura dos registros terminais retidos pela bridge.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as AnalysisTab)}>
        <TabsList variant="line" className="max-w-full overflow-x-auto">
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
          <TabsTrigger value="problems">Problemas</TabsTrigger>
        </TabsList>
        <AnalysisControls
          tab={tab}
          view={view}
          period={period}
          preset={preset}
          presets={presetHistory.data?.presets.map((item) => item.preset) ?? []}
          onView={setView}
          onPeriod={setPeriod}
          onPreset={setPreset}
        />
        <TabsContent value="statistics" className="pt-5">
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
        </TabsContent>
        <TabsContent value="problems" className="pt-5">
          <RunTable
            title="Problemas"
            description="Falhas e interrupções terminais, sem classificação adicional inventada pela interface."
            jobs={analysis.data?.problems}
            loading={analysis.loading}
            error={analysis.error}
            emptyDescription="Não há execução falha ou interrompida para os filtros selecionados."
            onOpenJob={setSelectedJobId}
          />
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
