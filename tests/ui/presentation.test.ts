import { describe, expect, it } from 'vitest'
import { describeJobState, describeProgressState } from '../../ui/src/features/shared/presentation'

describe('presentation preserves published semantics', () => {
  it('shares state representation without hiding distinct terminal labels', () => {
    for (const status of ['passed','failed','running'] as const) {
      expect(describeProgressState(status, 'running')).toEqual(describeJobState(status))
    }
    expect(describeJobState('cancelled').label).toBe('Cancelado')
    expect(describeJobState('interrupted').label).toBe('Interrompido')
    expect(describeJobState(undefined).label).toBe('Sem estado')
    expect(describeJobState('queued').animated).toBe(false)
  })
  it('does not animate unfinished nodes after cancellation or invent their completion', () => {
    for (const status of ['pending', 'running'] as const) {
      expect(describeProgressState(status, 'cancelled')).toMatchObject({ animated: false, label: 'Interrompida pelo cancelamento' })
      expect(describeProgressState(status, 'failed')).toMatchObject({ animated: false, label: 'Execução encerrada; etapa sem conclusão registrada' })
    }
    expect(describeProgressState('passed', 'cancelled')).toEqual(describeJobState('passed'))
    expect(describeProgressState('failed', 'cancelled')).toEqual(describeJobState('failed'))
    expect(describeProgressState('running', 'running').animated).toBe(true)
  })
})
