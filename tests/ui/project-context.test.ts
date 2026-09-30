import { describe, expect, it } from 'vitest'
import { metaPreviewRows, pendingPreviewRows } from '../../ui/src/features/status/status-state-model'
import type { DashboardAllState, DashboardProjectState } from '../../ui/src/lib/types'

import { restoreScopedDraft } from '../../ui/src/features/projects/drafts'
import {
  matchesScope,
  parseScopeSearch,
  resolveInitialScope,
  scopeKey,
  scopeQuery,
  writeScopeSearch,
} from '../../ui/src/features/projects/scope'

describe('project scope', () => {
  it('keeps literal all and legacy as project ids', () => {
    expect(parseScopeSearch('projectId=all')).toEqual({
      kind: 'project',
      projectId: 'all',
    })
    expect(parseScopeSearch('projectId=legacy')).toEqual({
      kind: 'project',
      projectId: 'legacy',
    })
    expect(parseScopeSearch('context=unassigned')).toEqual({ kind: 'unassigned' })
    expect(parseScopeSearch('context=all')).toEqual({ kind: 'all' })
    expect(() => parseScopeSearch('projectId=alpha&context=unassigned')).toThrow(
      /mutuamente exclusivos/
    )
    expect(() => parseScopeSearch('projectId=alpha&context=all')).toThrow(
      /mutuamente exclusivos/
    )
  })

  it('prefers the tab URL over last project and bootstrap', () => {
    expect(
      resolveInitialScope({
        urlScope: { kind: 'project', projectId: 'beta' },
        lastProjectId: 'alpha',
        bootstrapProjectId: 'alpha',
        activeIds: ['alpha', 'beta'],
      })
    ).toEqual({ kind: 'project', projectId: 'beta' })
    expect(
      resolveInitialScope({
        urlScope: null,
        lastProjectId: 'missing',
        bootstrapProjectId: 'alpha',
        activeIds: ['alpha', 'beta'],
      })
    ).toEqual({ kind: 'project', projectId: 'alpha' })
    expect(
      resolveInitialScope({
        urlScope: null,
        lastProjectId: null,
        bootstrapProjectId: null,
        activeIds: [],
      })
    ).toBeNull()
  })

  it('restores a draft only for the original project revision', () => {
    expect(restoreScopedDraft({ revision: 2, value: { name: 'A' } }, 2)).toEqual({
      name: 'A',
    })
    expect(restoreScopedDraft({ revision: 1, value: { name: 'A' } }, 2)).toBeUndefined()
    expect(restoreScopedDraft(undefined, 2)).toBeUndefined()
  })

  it('rejects a late payload from another project', () => {
    const alpha = { kind: 'project' as const, projectId: 'alpha' }
    expect(matchesScope({ context: { kind: 'project', projectId: 'alpha' } }, alpha)).toBe(true)
    expect(matchesScope({ context: { kind: 'project', projectId: 'beta' } }, alpha)).toBe(false)
    expect(matchesScope({ context: { kind: 'unassigned' } }, { kind: 'unassigned' })).toBe(true)
    expect(matchesScope({ context: { kind: 'all' } }, { kind: 'all' })).toBe(true)
    expect(matchesScope({ context: { kind: 'all' } }, alpha)).toBe(false)
    expect(scopeKey(alpha)).toBe('project:alpha')
    expect(scopeKey({ kind: 'all' })).toBe('all')
    expect(scopeQuery({ kind: 'unassigned' })).toEqual({ context: 'unassigned' })
    expect(scopeQuery({ kind: 'all' })).toEqual({ context: 'all' })
    expect(writeScopeSearch('analysisMetric=results', alpha)).toBe(
      'analysisMetric=results&projectId=alpha'
    )
    expect(
      writeScopeSearch(
        'analysisMetric=results&analysisPeriod=week&analysisMode=custom&analysisPreset=alpha-only&projectId=alpha',
        { kind: 'project', projectId: 'beta' }
      )
    ).toBe('projectId=beta')
    expect(writeScopeSearch('analysisMetric=duration&projectId=alpha', alpha)).toBe(
      'analysisMetric=duration&projectId=alpha'
    )
    expect(
      writeScopeSearch(
        'analysisMetric=results&analysisPreset=check&projectId=alpha',
        { kind: 'all' }
      )
    ).toBe('context=all')
    expect(
      writeScopeSearch('analysisMetric=results&context=all', alpha)
    ).toBe('projectId=alpha')
  })
})


function previewProject(id: string, name: string): DashboardProjectState {
  return {
    projectId: id, projectName: name, revision: 1, presets: ['check'], catalog: 'linked',
    meta: { name: `${id} meta`, description: '', presets: ['check'], checks: [], candidateSha: null },
    pending: [], pendingError: null,
  }
}

describe('status previews', () => {
  it('orders metas by name then project id and limits three declared metas without mutating the state', () => {
    const projects = [previewProject('z', 'Zeta'), previewProject('b', 'Alpha'), previewProject('a', 'Alpha'), previewProject('c', 'Beta'), { ...previewProject('empty', 'A'), meta: null }]
    const state: DashboardAllState = { schemaVersion: 2, context: { kind: 'all' }, projects, projectErrors: [] }
    expect(metaPreviewRows(state, 3).map(row => row.projectId)).toEqual(['a', 'b', 'c'])
    expect(state.projects[0].projectId).toBe('z')
    expect(metaPreviewRows({ ...state, projects: [] }, 3)).toEqual([])
  })

  it('orders pending globally newest first with project and id tie breaks and limits three', () => {
    const alpha = previewProject('alpha', 'Alpha')
    const beta = previewProject('beta', 'Beta')
    const pending = (id: string, createdAt: string) => ({ id, createdAt, preset: 'check', reason: 'Validate', headSha: 'abc', pr: null, latestTicketId: null, latestStatus: null })
    alpha.pending = [pending('z', '2026-09-27'), pending('b', '2026-09-29'), pending('a', '2026-09-29')]
    beta.pending = [pending('a', '2026-09-29'), pending('latest', '2026-09-30')]
    const state: DashboardAllState = { schemaVersion: 2, context: { kind: 'all' }, projects: [beta, alpha], projectErrors: [] }
    expect(pendingPreviewRows(state, 3).map(row => `${row.projectId}:${row.item.id}`)).toEqual(['beta:latest', 'alpha:a', 'alpha:b'])
    expect(alpha.pending[0].id).toBe('z')
    expect(pendingPreviewRows({ ...state, projects: [] }, 3)).toEqual([])
  })
})
