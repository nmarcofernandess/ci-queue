export const RESULT_STATES = [
  "passed",
  "failed",
  "cancelled",
  "interrupted",
] as const

export type ResultState = (typeof RESULT_STATES)[number]

export type ResultCounts = {
  preset: string
  passed: number
  failed: number
  cancelled: number
  interrupted: number
  total: number
}

export type ResultRow = ResultCounts & {
  percentages: Record<ResultState, number> | null
}

export type PresetSelection =
  | { mode: "top10" }
  | { mode: "all" }
  | { mode: "custom"; presets: string[] }

export type ResolvedSelection = {
  mode: PresetSelection["mode"]
  selected: string[]
  missing: string[]
}

export function projectPercentages(row: ResultCounts): ResultRow {
  for (const key of RESULT_STATES) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0) {
      throw new Error("Contagem de resultado inválida")
    }
  }
  const total = RESULT_STATES.reduce((sum, key) => sum + row[key], 0)
  if (total !== row.total || !Number.isSafeInteger(total)) {
    throw new Error("Total de resultado inconsistente")
  }
  return {
    ...row,
    percentages:
      total === 0
        ? null
        : {
            passed: (100 * row.passed) / total,
            failed: (100 * row.failed) / total,
            cancelled: (100 * row.cancelled) / total,
            interrupted: (100 * row.interrupted) / total,
          },
  }
}

export function rankResults(rows: ResultCounts[]): ResultCounts[] {
  return rows
    .filter((row) => row.total > 0)
    .toSorted(
      (left, right) =>
        right.total - left.total ||
        (left.preset < right.preset ? -1 : left.preset > right.preset ? 1 : 0)
    )
}

export function resolveSelection(
  rows: ResultCounts[],
  selection: PresetSelection
): ResolvedSelection {
  const ranked = rankResults(rows)
  const available = new Set(ranked.map((row) => row.preset))
  if (selection.mode === "top10") {
    return {
      mode: "top10",
      selected: ranked.slice(0, 10).map((row) => row.preset),
      missing: [],
    }
  }
  if (selection.mode === "all") {
    return {
      mode: "all",
      selected: ranked.map((row) => row.preset),
      missing: [],
    }
  }
  const unique = [...new Set(selection.presets)]
  return {
    mode: "custom",
    selected: unique,
    missing: unique.filter((name) => !available.has(name)),
  }
}

export function mapResultRows(presets: ResultCounts[] | undefined): ResultRow[] {
  return (presets ?? []).map((row) => projectPercentages(row))
}

export function validateResultCounts(rows: ResultCounts[]): ResultCounts[] {
  mapResultRows(rows)
  return rows
}

export function visibleResultRows(
  rows: ResultCounts[],
  selection: PresetSelection
): { resolved: ResolvedSelection; visible: ResultCounts[] } {
  validateResultCounts(rows)
  const resolved = resolveSelection(rows, selection)
  return {
    resolved,
    visible: rankResults(rows).filter((row) => resolved.selected.includes(row.preset)),
  }
}

export function formatShare(value: number): string {
  if (value === 0) {
    return "0%"
  }
  if (value > 0 && value < 0.1) {
    return "<0,1%"
  }
  const text = value.toFixed(1).replace(/\.0$/, "").replace(".", ",")
  return `${text}%`
}
