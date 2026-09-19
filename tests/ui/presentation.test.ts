import { describe, expect, it } from 'vitest'
import {
  describeJobState,
  describeProgressState,
  elapsedPresentation,
  inspectPresentation,
  INSPECT_LABEL,
  progressSurface,
  unconfiguredProgressCopy,
} from '../../ui/src/features/shared/presentation'
import { projectChipVisible } from '../../ui/src/features/shared/project-chip-model'

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
  it('sizes inspect and elapsed by presentation and keeps the inspect label', () => {
    expect(inspectPresentation.current).toBe('icon-lg')
    expect(inspectPresentation.drawer).toBe('icon')
    expect(inspectPresentation.table).toBe('icon-sm')
    expect(elapsedPresentation.current).toContain('tabular-nums')
    expect(elapsedPresentation.current).toContain('text-xl')
    expect(INSPECT_LABEL).toBe('Inspecionar')
  })
  it('shows the project chip when the filter cannot identify the ticket', () => {
    const job = { projectId: 'beta', projectName: 'Beta' }
    expect(projectChipVisible(job, { always: true })).toBe(true)
    expect(projectChipVisible(job, { filterProjectId: 'alpha' })).toBe(true)
    expect(projectChipVisible(job, { filterProjectId: 'beta' })).toBe(false)
    expect(projectChipVisible({ projectId: 'beta' }, { always: true })).toBe(false)
  })
  it('unconfigured progress uses default alert copy and does not mark the job failed', () => {
    const job = {
      status: 'passed' as const,
      progressEnabled: false,
      progressSummary: {
        schemaVersion: 1,
        available: true,
        nodes: [{ id: 'artifacts', label: 'Artefatos', kind: 'artifact' as const, status: 'passed' as const }],
      },
    }
    expect(progressSurface(job)).toBe('unconfigured')
    expect(unconfiguredProgressCopy).toEqual({
      variant: 'default',
      title: 'Progresso contínuo não configurado',
      description: 'Esta receita não declara progresso contínuo. Os estágios da execução não aparecem.',
    })
    expect(job.status).toBe('passed')
  })
  it('declared-but-silent still uses non-failure empty copy', () => {
    expect(progressSurface({ progressEnabled: true })).toBe('declared-silent')
  })
  it('failureReason Alert remains destructive and separate', () => {
    expect(progressSurface({
      progressEnabled: false,
      failureReason: 'A recorded fixture assertion failed',
      status: 'failed',
    })).toBe('unconfigured')
    expect(unconfiguredProgressCopy.variant).not.toBe('destructive')
  })
})
