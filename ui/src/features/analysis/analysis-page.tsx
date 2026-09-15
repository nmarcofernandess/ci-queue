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

import {
  getAnalysis,
  getPresetHistory,
  type ApiQuery,
  useApiQuery,
} from "@/lib/api"
import type { AnalysisPreset, AnalysisResponse } from "@/lib/types"
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
type StatisticsView = "results" | "duration"
type Period = "all" | "week" | "month" | "quarter"

const DURATION_PRESET_QUERY_KEY = "analysisPreset"

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
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Resultados por preset</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="overflow-x-auto">
          <ChartContainer
            config={resultChartConfig}
            className="aspect-auto h-72 max-w-none"
            style={{ minWidth: Math.max(280, presets.length * 120) }}
          >
            <BarChart
              accessibilityLayer
              data={presets}
              maxBarSize={64}
              margin={{ left: 4, right: 12, top: 12 }}
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
        </div>
        <DataTableFrame placement="body" label="Resultados por preset">
          <TableHeader>
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
                <TableCell className="text-right">{preset.cancelled}</TableCell>
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
        </DataTableFrame>
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
        value={preset || (durationRequiresPreset ? "" : "all")}
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

export function AnalysisPage() {
  const [view, setView] = React.useState<StatisticsView>("results")
  const [period, setPeriod] = React.useState<Period>("all")
  const [preset, setPreset] = React.useState("")
  const [lastDurationPreset, setLastDurationPreset] =
    React.useState(readDurationPreset)
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
  const effectivePreset = view === "duration" ? durationPreset : selectedPreset
  const analysisRequest = React.useCallback(
    () =>
      getAnalysis({ from: periodStart, preset: effectivePreset || undefined }),
    [effectivePreset, periodStart]
  )
  const analysis = useApiQuery(
    `analysis:${period}:${effectivePreset}`,
    analysisRequest
  )

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Análise</h1>
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
    </main>
  )
}
