import { describe, expect, it, vi } from 'vitest'
// These tests exercise semantic descriptors, not SVG rendering.
vi.mock('lucide-react', () => ({ CheckCircle2Icon: () => null, CircleDotIcon: () => null, LoaderCircleIcon: () => null, MinusCircleIcon: () => null, XCircleIcon: () => null }))
import {
  describeJobState,
  describeExecutionState,
  describeCompletionFacts,
  executionIsLive,
  describeProgressState,
  elapsedPresentation,
  inspectPresentation,
  INSPECT_LABEL,
  progressSurface,
  unconfiguredProgressCopy,
} from '../../ui/src/features/shared/presentation'
import type { JobRecord } from '../../ui/src/lib/types'
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
  it('uses one indicator for running failure, retry and terminal flaky history', () => {
    const retry = { id: 'retry', label: 'Retry', status: 'running' as const, retryCount: 1 }
    const failed = { id: 'failed', label: 'Failed', status: 'failed' as const }
    const progressSummary = { schemaVersion: 1, available: true, nodes: [retry] }
    expect(describeExecutionState({ status: 'running' })).toMatchObject({
      colorClass: 'text-muted-foreground', animated: true, label: 'Em execução',
    })
    expect(describeExecutionState({ status: 'running', progressSummary })).toMatchObject({
      colorClass: 'text-warning', detail: 'Flaky detectado', animated: true,
    })
    expect(describeExecutionState({ status: 'running', progressSummary: { ...progressSummary, nodes: [retry, failed] } })).toMatchObject({
      colorClass: 'text-destructive', detail: 'Etapa com falha · Flaky detectado', animated: true,
    })
    expect(describeExecutionState({ status: 'passed', hasRetries: true })).toMatchObject({
      colorClass: 'text-success', detail: 'Flaky detectado', animated: false,
    })
    expect(describeExecutionState({
      status: 'running',
      hasRetries: true,
      progressSummary: {
        schemaVersion: 1,
        available: true,
        nodes: [{
          id: 'recovered', label: 'Recovered', status: 'passed', retryCount: 1,
          detail: { kind: 'cases', completed: 1, total: 1, passed: 1, failed: 1, running: 0, pending: 0, skipped: 0 },
        }],
      },
    })).toMatchObject({ colorClass: 'text-warning', detail: 'Flaky detectado' })
    expect(describeProgressState(retry, 'running')).toMatchObject({
      colorClass: 'text-warning', detail: 'Flaky detectado', animated: true,
    })
    expect(describeProgressState(failed, 'running')).toMatchObject({
      colorClass: 'text-destructive', animated: false,
    })
    expect(describeProgressState(retry, 'cancelled')).toMatchObject({
      colorClass: 'text-muted-foreground', detail: 'Flaky detectado', animated: false,
    })
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


describe('public terminal completion presentation', () => {
  const job = (completion: JobRecord['completion'], status: JobRecord['status'] = 'passed') => ({ status, completion })
  for (const phase of ['pending', 'running'] as const) {
    it(`keeps a passed test neutral while finalization is ${phase}`, () => {
      expect(describeExecutionState(job({ state: 'running', eligible: false, testStatus: 'passed', finalization: { phase } })))
        .toMatchObject({ label: 'Finalizando', detail: 'Teste passou', animated: true, colorClass: 'text-muted-foreground' })
    })
  }
  it('keeps unverified finalization neutral and explains the safe reason', () => {
    expect(describeExecutionState(job({ state: 'running', eligible: false, testStatus: 'passed', reason: 'finalization-unverified' })))
      .toMatchObject({ label: 'Finalizando', detail: 'Teste passou · Finalização não verificada', colorClass: 'text-muted-foreground' })
  })
  it('reports failed hook without replacing the passed test', () => {
    const state = describeExecutionState(job({ state: 'failed', eligible: false, testStatus: 'passed', reason: 'finalization-failed', finalization: { phase: 'failed', cleanup: 'confirmed', error: 'finalization-failed' } }))
    expect(state).toMatchObject({ label: 'Falha na finalização', animated: false, colorClass: 'text-destructive' })
    expect(state.detail).toContain('Teste passou; entrega incompleta')
  })
  it('reports invalid contracts as a finalization failure, never a green test result', () => {
    expect(describeExecutionState(job({ state: 'failed', eligible: false, testStatus: 'passed', reason: 'finalization-contract-invalid' })))
      .toMatchObject({ label: 'Falha na finalização', detail: 'Teste passou; entrega incompleta · Contrato de finalização inválido', colorClass: 'text-destructive' })
  })
  it('gives uncertain cleanup its literal label and safe reason', () => {
    expect(describeExecutionState(job({ state: 'failed', eligible: false, testStatus: 'passed', reason: 'cleanup-uncertain', finalization: { phase: 'passed', cleanup: 'uncertain' } })))
      .toMatchObject({ label: 'Limpeza não confirmada', detail: 'Teste passou; entrega incompleta · O finalizador não confirmou a limpeza', colorClass: 'text-destructive' })
  })
  for (const status of ['passed', 'failed', 'cancelled', 'interrupted'] as const) {
    it(`preserves ${status} after confirmed cleanup and successful finalization`, () => {
      const state = describeExecutionState(job({ state: 'complete', eligible: status === 'passed', testStatus: status, finalization: { phase: 'passed', cleanup: 'confirmed' } }, status))
      expect(state).toMatchObject({ ...describeJobState(status), detail: 'Finalização concluída' })
    })
  }
  it('does not invent a finalization for legacy or absent completion', () => {
    expect(describeExecutionState(job(undefined))).toEqual(describeJobState('passed'))
    expect(describeExecutionState(job({ state: 'legacy', eligible: true, testStatus: 'passed' }))).toEqual(describeJobState('passed'))
  })
  it('preserves flaky facts while finalization is incomplete', () => {
    expect(describeExecutionState({ ...job({ state: 'running', eligible: false, testStatus: 'passed', finalization: { phase: 'pending' } }), hasRetries: true }))
      .toMatchObject({ label: 'Finalizando', colorClass: 'text-muted-foreground', detail: 'Teste passou · Flaky detectado' })
  })
  it('preserves the failed test while finalization is pending', () => {
    expect(describeExecutionState(job({ state: 'running', eligible: false, testStatus: 'failed', finalization: { phase: 'pending' } }, 'failed')))
      .toMatchObject({ label: 'Finalizando', detail: 'Teste falhou', colorClass: 'text-muted-foreground' })
  })
})


describe('independent completion facts and detail refresh', () => {
  it('does not equate a passed finalizer process with a completed delivery', () => {
    expect(describeCompletionFacts({ status: 'passed', completion: { state: 'failed', eligible: false, testStatus: 'passed', reason: 'cleanup-uncertain', finalization: { phase: 'passed', cleanup: 'uncertain' } } }))
      .toEqual([
        { label: 'Resultado do teste', value: 'Teste passou' },
        { label: 'Finalização', value: 'Finalizador encerrado; entrega incompleta · O finalizador não confirmou a limpeza' },
        { label: 'Limpeza', value: 'Limpeza não confirmada · O finalizador não confirmou a limpeza' },
      ])
  })
  it('separates failed tests, successful finalization and confirmed cleanup', () => {
    expect(describeCompletionFacts({ status: 'failed', completion: { state: 'complete', eligible: false, testStatus: 'failed', finalization: { phase: 'passed', cleanup: 'confirmed' } } }))
      .toEqual([
        { label: 'Resultado do teste', value: 'Teste falhou' },
        { label: 'Finalização', value: 'Finalização concluída' },
        { label: 'Limpeza', value: 'Limpeza confirmada' },
      ])
  })
  it('explains absent legacy evidence only in inspected facts', () => {
    expect(describeCompletionFacts({ status: 'passed' })).toContainEqual({ label: 'Finalização', value: 'Sem registro de finalização' })
    expect(describeCompletionFacts({ status: 'passed' })).toContainEqual({ label: 'Limpeza', value: 'Sem confirmação de limpeza' })
  })
  it('refreshes terminal test details until the finalizer reaches a composed terminal state', () => {
    expect(executionIsLive({ status: 'passed', completion: { state: 'running', eligible: false, testStatus: 'passed' } })).toBe(true)
    expect(executionIsLive({ status: 'passed', completion: { state: 'complete', eligible: true, testStatus: 'passed' } })).toBe(false)
    expect(executionIsLive({ status: 'passed', completion: { state: 'failed', eligible: false, testStatus: 'passed' } })).toBe(false)
    expect(executionIsLive({ status: 'passed' })).toBe(false)
  })
})

it.each(['retryable', 'blocked-ownership'] as const)('shows %s recovery without changing the failed test into a pass', recovery => {
  const job: JobRecord = { id: 'own-recovery', status: 'failed', completion: { state: 'failed', eligible: false, testStatus: 'failed', finalization: { phase: 'failed', cleanup: 'uncertain', recovery } } }
  const message = recovery === 'retryable' ? 'Recuperação pendente' : 'Propriedade dos processos não confirmada'
  expect(describeExecutionState(job).detail).toContain(message)
  expect(describeCompletionFacts(job).find(fact => fact.label === 'Finalização')?.value).toContain(message)
  expect(describeCompletionFacts(job)[0].value).toBe('Teste falhou')
})
