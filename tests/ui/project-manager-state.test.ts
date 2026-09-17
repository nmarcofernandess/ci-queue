import { describe, expect, it } from 'vitest'

import {
  editFormFromProject,
  editLinkMutation,
  registerIdentitySource,
} from '../../ui/src/features/projects/project-manager-state'
import type { ProjectSummary } from '../../ui/src/lib/types'

const signature = {
  repositoryPath: '/repo',
  gitCommonDir: '/repo/.git',
  configSha256: 'abc',
}

function project(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'alpha',
    displayName: 'Alpha',
    repositoryPath: '/repo',
    resolvedRepositoryPath: '/repo',
    repositoryAvailable: true,
    configPath: '/repo/ci-queue.json',
    archivedAt: null,
    revision: 1,
    bindingState: 'linked',
    ...overrides,
  }
}

describe('project-manager-state', () => {
  it('sends link-config without repositoryPath when the folder stays put', () => {
    expect(editLinkMutation(project(), '/repo', '/lane/ci-queue.json', signature)).toEqual({
      action: 'link-config',
      projectId: 'alpha',
      configPath: '/lane/ci-queue.json',
      signature,
    })
  })

  it('sends relocate with repositoryPath only when the folder changes', () => {
    expect(editLinkMutation(project(), '/other', '/other/ci-queue.json', signature)).toEqual({
      action: 'relocate',
      projectId: 'alpha',
      repositoryPath: '/other',
      configPath: '/other/ci-queue.json',
      signature,
    })
  })

  it('hydrates archived and active projects from the same fields', () => {
    const archived = project({
      id: 'beta',
      displayName: 'Beta',
      repositoryPath: '/beta',
      resolvedRepositoryPath: '/beta-live',
      configPath: '/beta/ci-queue.json',
      archivedAt: '2026-09-16T00:00:00Z',
    })
    expect(editFormFromProject(archived)).toEqual({
      displayName: 'Beta',
      path: '/beta-live',
      configPath: '/beta/ci-queue.json',
    })
    expect(registerIdentitySource({ observedId: '', catalogValid: false })).toBe('new')
    expect(registerIdentitySource({ observedId: 'obs', catalogValid: true })).toBe('observed')
  })
})
