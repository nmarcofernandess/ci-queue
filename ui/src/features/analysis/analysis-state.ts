import type { PresetSelection } from "@/features/analysis/results-model"

export type AnalysisMetric = "results" | "duration"
export type AnalysisPeriod = "all" | "week" | "month" | "quarter"

export type AnalysisViewState = {
  metric: AnalysisMetric
  period: AnalysisPeriod
  resultSelection: PresetSelection
  durationPreset: string | null
}

export const ANALYSIS_SEARCH_KEYS = [
  "analysisMetric",
  "analysisPeriod",
  "analysisMode",
  "analysisPreset",
  "durationPreset",
] as const

const PERIODS: AnalysisPeriod[] = ["all", "week", "month", "quarter"]

function isPeriod(value: string | null): value is AnalysisPeriod {
  return value !== null && PERIODS.includes(value as AnalysisPeriod)
}

export function parseNamespacedPreset(
  value: string
): { projectId: string; preset: string } | null {
  const separator = value.indexOf(":")
  if (separator <= 0) {
    return null
  }
  const projectId = value.slice(0, separator)
  const preset = value.slice(separator + 1)
  if (!projectId || !preset) {
    return null
  }
  return { projectId, preset }
}

export function defaultAnalysisState(): AnalysisViewState {
  return {
    metric: "results",
    period: "all",
    resultSelection: { mode: "top10" },
    durationPreset: null,
  }
}

export function parseAnalysisState(
  search: string,
  fallback: AnalysisViewState = defaultAnalysisState()
): AnalysisViewState {
  const params = new URLSearchParams(search)
  const metric = params.get("analysisMetric")
  const period = params.get("analysisPeriod")
  const mode = params.get("analysisMode")
  const listed = params.getAll("analysisPreset")
  const durationPreset = params.get("durationPreset")
  const next = { ...fallback }

  if (metric === "results" || metric === "duration") {
    next.metric = metric
  }
  if (isPeriod(period)) {
    next.period = period
  }
  if (mode === "top10" || mode === "all") {
    next.resultSelection = { mode }
  } else if (mode === "custom") {
    next.resultSelection = { mode: "custom", presets: listed }
  } else if (!mode && listed.length > 0) {
    next.resultSelection = { mode: "custom", presets: listed }
    if (!durationPreset && listed.length === 1) {
      next.durationPreset = listed[0]
    }
  }
  if (durationPreset !== null) {
    next.durationPreset = durationPreset || null
  }
  return next
}

export function writeAnalysisState(
  search: string,
  state: AnalysisViewState
): string {
  const params = new URLSearchParams(search)
  for (const key of ANALYSIS_SEARCH_KEYS) {
    params.delete(key)
  }
  params.set("analysisMetric", state.metric)
  params.set("analysisPeriod", state.period)
  params.set("analysisMode", state.resultSelection.mode)
  if (state.resultSelection.mode === "custom") {
    for (const preset of state.resultSelection.presets) {
      params.append("analysisPreset", preset)
    }
  }
  if (state.durationPreset) {
    params.set("durationPreset", state.durationPreset)
  }
  return params.toString()
}
