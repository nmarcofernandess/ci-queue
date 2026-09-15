import { describe, expect, it } from 'vitest'

import {
  defaultAnalysisState,
  parseAnalysisState,
  writeAnalysisState,
} from '../../ui/src/features/analysis/analysis-state'

describe('analysis-state', () => {
  it('treats a literal preset named all as a custom item, not a sentinel', () => {
    const state = parseAnalysisState(
      'analysisMode=custom&analysisPreset=all&durationPreset=smoketest'
    )
    expect(state.resultSelection).toEqual({ mode: 'custom', presets: ['all'] })
    expect(state.durationPreset).toBe('smoketest')
  })

  it('migrates a lone analysisPreset into custom instead of silent top10', () => {
    const state = parseAnalysisState('analysisPreset=full')
    expect(state.resultSelection).toEqual({ mode: 'custom', presets: ['full'] })
    expect(state.durationPreset).toBe('full')
  })

  it('keeps results and duration selections independent across roundtrips', () => {
    const encoded = writeAnalysisState('q=keep', {
      metric: 'duration',
      period: 'week',
      resultSelection: { mode: 'custom', presets: ['full', 'static'] },
      durationPreset: 'smoketest',
    })
    const params = new URLSearchParams(encoded)
    expect(params.get('q')).toBe('keep')
    expect(params.getAll('analysisPreset')).toEqual(['full', 'static'])
    expect(params.get('durationPreset')).toBe('smoketest')
    expect(parseAnalysisState(encoded)).toEqual({
      metric: 'duration',
      period: 'week',
      resultSelection: { mode: 'custom', presets: ['full', 'static'] },
      durationPreset: 'smoketest',
    })
    expect(defaultAnalysisState().resultSelection).toEqual({ mode: 'top10' })
  })
})
