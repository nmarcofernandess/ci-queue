import { describe, expect, it } from 'vitest'

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
    expect(() => parseScopeSearch('projectId=alpha&context=unassigned')).toThrow(
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

  it('rejects a late payload from another project', () => {
    const alpha = { kind: 'project' as const, projectId: 'alpha' }
    expect(matchesScope({ context: { kind: 'project', projectId: 'alpha' } }, alpha)).toBe(true)
    expect(matchesScope({ context: { kind: 'project', projectId: 'beta' } }, alpha)).toBe(false)
    expect(matchesScope({ context: { kind: 'unassigned' } }, { kind: 'unassigned' })).toBe(true)
    expect(scopeKey(alpha)).toBe('project:alpha')
    expect(scopeQuery({ kind: 'unassigned' })).toEqual({ context: 'unassigned' })
    expect(writeScopeSearch('analysisMetric=results', alpha)).toBe(
      'analysisMetric=results&projectId=alpha'
    )
  })
})
