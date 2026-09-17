import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  formatShare,
  mapResultRows,
  projectPercentages,
  rankResults,
  resolveSelection,
  resultIdentity,
  resultLabel,
  visibleResultRows,
  type ResultCounts,
} from '../../ui/src/features/analysis/results-model'

const fixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../docs/superpowers/plans/2026-09-15-ci-queue-analysis-project-lifecycle/fixtures/analysis-cases.json'
    ),
    'utf8'
  )
) as {
  rankingSample: ResultCounts[]
  top10TieBreak: string
  denominatorIncludesCancelledInterrupted: {
    row: ResultCounts
    percentages: Record<string, number>
  }
  unequalTotalsDoNotShareGlobalDenom: { rows: ResultCounts[] }
  thirds: { row: ResultCounts; percentages: Record<string, number> }
  zeroSample: { row: ResultCounts }
  invalidCounts: ResultCounts[]
  rankingTies: ResultCounts[]
}

describe('results-model', () => {
  it('uses the four-state denominator and keeps exact counts', () => {
    const row = projectPercentages(fixture.denominatorIncludesCancelledInterrupted.row)
    expect(row.percentages).toEqual(fixture.denominatorIncludesCancelledInterrupted.percentages)
    expect(row.passed).toBe(950)
    expect(row.total).toBe(1000)
  })

  it('lets a 1000-run preset and a two-run preset each fill 100%', () => {
    const [tiny, huge] = fixture.unequalTotalsDoNotShareGlobalDenom.rows.map(projectPercentages)
    expect(tiny.percentages?.passed).toBe(100)
    expect(huge.percentages?.passed).toBe(95)
    expect(huge.percentages?.failed).toBe(5)
    expect(tiny.total + huge.total).toBe(1001)
  })

  it('keeps thirds exact and rejects invalid or inconsistent counts', () => {
    const thirds = projectPercentages(fixture.thirds.row)
    expect(thirds.percentages?.passed).toBeCloseTo(100 / 3, 12)
    expect(thirds.percentages?.failed).toBeCloseTo(100 / 3, 12)
    expect(thirds.percentages?.cancelled).toBeCloseTo(100 / 3, 12)
    expect(projectPercentages(fixture.zeroSample.row).percentages).toBeNull()
    for (const row of fixture.invalidCounts) {
      expect(() => projectPercentages(row)).toThrow(/inválida|inconsistente/)
    }
    expect(() =>
      mapResultRows([fixture.thirds.row, fixture.invalidCounts[0]])
    ).toThrow(/inválida|inconsistente/)
    expect(mapResultRows([fixture.thirds.row])[0].percentages?.passed).toBeCloseTo(100 / 3, 12)
  })

  it('ranks by volume then name and defaults top10 to clinical-readonly', () => {
    const ranked = rankResults(fixture.rankingSample)
    expect(ranked[0].preset).toBe('smoketest')
    expect(ranked[9].preset).toBe(fixture.top10TieBreak)
    expect(ranked[10].preset).toBe('proof-numeric')
    expect(resolveSelection(fixture.rankingSample, { mode: 'top10' }).selected).toEqual(
      ranked.slice(0, 10).map((row) => row.preset)
    )
    expect(rankResults(fixture.rankingTies).map((row) => row.preset)).toEqual([
      'gamma',
      'alpha',
      'beta',
    ])
  })

  it('keeps two projects with the same preset as distinct identities', () => {
    const rows: ResultCounts[] = [
      {
        preset: 'check',
        projectId: 'alpha',
        projectName: 'Alpha',
        passed: 2,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
        total: 2,
      },
      {
        preset: 'check',
        projectId: 'beta',
        projectName: 'Beta',
        passed: 1,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
        total: 1,
      },
    ]
    const ranked = rankResults(rows)
    expect(ranked.map((row) => resultIdentity(row))).toEqual(['alpha:check', 'beta:check'])
    expect(ranked.map((row) => resultLabel(row))).toEqual(['Alpha · check', 'Beta · check'])
    expect(resolveSelection(rows, { mode: 'all' }).selected).toEqual([
      'alpha:check',
      'beta:check',
    ])
    expect(visibleResultRows(rows, { mode: 'all' }).visible).toHaveLength(2)
  })

  it('keeps custom empty, all, and missing historical names distinct', () => {
    expect(resolveSelection(fixture.rankingSample, { mode: 'custom', presets: [] })).toEqual({
      mode: 'custom',
      selected: [],
      missing: [],
    })
    expect(resolveSelection(fixture.rankingSample, { mode: 'all' }).selected).toHaveLength(12)
    const custom = resolveSelection(fixture.rankingSample, {
      mode: 'custom',
      presets: ['smoketest', 'ghost', 'smoketest'],
    })
    expect(custom.selected).toEqual(['smoketest', 'ghost'])
    expect(custom.missing).toEqual(['ghost'])
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(0.05)).toBe('<0,1%')
  })

  it('rejects inconsistent counts before ranking hides them', () => {
    const broken: ResultCounts = {
      preset: 'broken',
      passed: 1,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
      total: 0,
    }
    expect(() =>
      visibleResultRows([broken], { mode: 'top10' })
    ).toThrow(/inválida|inconsistente/)
    expect(rankResults([broken])).toEqual([])
  })
})
