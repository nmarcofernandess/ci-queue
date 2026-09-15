import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../docs/superpowers/plans/2026-09-15-ci-queue-analysis-project-lifecycle/fixtures/analysis-cases.json'
    ),
    'utf8'
  )
) as { rankingSample: Array<{ preset: string; total: number }> }

const context = { kind: 'project', projectId: 'example' }

async function installAnalysis(page: Page, presets = fixture.rankingSample) {
  let resultsCalls = 0
  await page.addInitScript(() => localStorage.setItem('ci-queue.lastProjectId', 'example'))
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/analysis' && url.searchParams.get('metric') === 'results') {
      resultsCalls += 1
      await route.fulfill({
        json: {
          schemaVersion: 2,
          metric: 'results',
          context,
          from: null,
          to: null,
          sampleCount: presets.reduce((sum, row) => sum + row.total, 0),
          presets,
        },
      })
      return
    }
    const data: Record<string, unknown> = {
      '/api/projects': {
        schemaVersion: 1,
        registryRevision: 1,
        bootstrapProjectId: 'example',
        observedUnregistered: [],
        projects: [{
          id: 'example',
          displayName: 'Example',
          repositoryPath: '/example',
          configPath: '/example/ci-queue.json',
          archivedAt: null,
          revision: 1,
          bindingState: 'linked',
        }],
      },
      '/api/session': { csrfToken: 'fixture', canReveal: false, clipboardLimitBytes: 1000000 },
      '/api/preset-history': {
        schemaVersion: 1,
        catalog: { resolved: true, projectId: 'example', declaredCount: 3 },
        totals: { tickets: 12, presets: 3 },
        coverage: { unattributedRecords: 0 },
        context,
        presets: ['smoketest', 'static', 'full'].map((preset) => ({
          projectId: 'example',
          projectName: 'Example',
          preset,
          declared: true,
          runCount: 4,
          canonicalRunCount: 4,
          customRunCount: 0,
          lastGreenCanonical: null,
          lastRun: null,
          lastFailure: null,
          durationReference: null,
        })),
      },
      '/api/analysis': {
        schemaVersion: 1,
        projectId: 'example',
        from: null,
        to: null,
        preset: url.searchParams.get('preset'),
        total: 2,
        coverage: { unattributedRecords: 0 },
        context,
        presets: [{
          preset: url.searchParams.get('preset') || 'smoketest',
          passed: 2,
          failed: 0,
          cancelled: 0,
          interrupted: 0,
          total: 2,
          passRate: 100,
          points: [{ id: 'd1', at: '2026-09-14T12:00:00Z', durationMs: 1000 }],
          duration: { count: 1, medianMs: 1000, minMs: 1000, maxMs: 1000 },
          failedDurationMs: null,
          failedDurationCount: 0,
          failedDurationMissing: 0,
        }],
      },
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  return {
    resultsCalls: () => resultsCalls,
  }
}

test('AN-04 checkbox changes add zero results requests and keep the menu open', async ({ page }) => {
  const api = await installAnalysis(page)
  await page.goto('/#analysis')
  await expect(page.getByRole('cell', { name: 'smoketest' })).toBeVisible()
  const before = api.resultsCalls()
  await page.getByRole('button', { name: '10 mais executados' }).click()
  await expect(page.getByLabel('Buscar preset')).toBeVisible()
  for (const name of ['smoketest', 'static', 'full', 'e2e-impact', 'review', 'flowui', 'proof-importacao', 'export-atlas', 'app-atlas', 'clinical-readonly']) {
    await page.getByRole('checkbox', { name: new RegExp(`^${name}`) }).click()
  }
  await expect(page.getByLabel('Buscar preset')).toBeVisible()
  expect(api.resultsCalls()).toBe(before)
})

test('AN-01 and AN-03 render per-preset percentages and deterministic top10', async ({ page }) => {
  await installAnalysis(page)
  await page.goto('/#analysis')
  await expect(page.getByRole('cell', { name: '1000' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'teste-pequeno' })).toHaveCount(0)
  await page.getByRole('button', { name: '10 mais executados' }).click()
  await expect(page.getByRole('checkbox', { name: /clinical-readonly/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /proof-numeric/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /teste-pequeno/ })).not.toBeChecked()
})

test('AN-05 keeps menu order while a newer ranking arrives', async ({ page }) => {
  let presets = fixture.rankingSample
  await page.clock.install()
  await page.addInitScript(() => localStorage.setItem('ci-queue.lastProjectId', 'example'))
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/analysis' && url.searchParams.get('metric') === 'results') {
      await route.fulfill({
        json: {
          schemaVersion: 2,
          metric: 'results',
          context,
          from: null,
          to: null,
          sampleCount: presets.reduce((sum, row) => sum + row.total, 0),
          presets,
        },
      })
      return
    }
    await route.fulfill({
      json: url.pathname === '/api/projects'
        ? {
            schemaVersion: 1,
            registryRevision: 1,
            bootstrapProjectId: 'example',
            observedUnregistered: [],
            projects: [{
              id: 'example',
              displayName: 'Example',
              repositoryPath: '/example',
              configPath: null,
              archivedAt: null,
              revision: 1,
              bindingState: 'unlinked',
            }],
          }
        : url.pathname === '/api/preset-history'
          ? { presets: [], context }
          : { csrfToken: 'fixture' },
    })
  })
  await page.goto('/#analysis')
  await expect(page.getByRole('cell', { name: 'smoketest' })).toBeVisible()
  await page.getByRole('button', { name: '10 mais executados' }).click()
  const first = page.getByRole('checkbox').first()
  await expect(first).toHaveAccessibleName(/smoketest/)
  presets = fixture.rankingSample.map((row) =>
    row.preset === 'teste-pequeno'
      ? { ...row, passed: 2000, failed: 0, cancelled: 0, interrupted: 0, total: 2000 }
      : row
  )
  await page.clock.runFor(30_000)
  await expect(first).toHaveAccessibleName(/smoketest/)
  await page.getByRole('dialog', { name: 'Presets de Resultados' }).press('Escape')
  await expect(page.getByRole('dialog', { name: 'Presets de Resultados' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'teste-pequeno' })).toBeVisible()
})

test('AN-05 custom keeps the chosen ids after a newer ranking arrives', async ({ page }) => {
  let presets = fixture.rankingSample
  await page.clock.install()
  await page.addInitScript(() => localStorage.setItem('ci-queue.lastProjectId', 'example'))
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/analysis' && url.searchParams.get('metric') === 'results') {
      await route.fulfill({
        json: {
          schemaVersion: 2,
          metric: 'results',
          context,
          from: null,
          to: null,
          sampleCount: presets.reduce((sum, row) => sum + row.total, 0),
          presets,
        },
      })
      return
    }
    await route.fulfill({
      json: url.pathname === '/api/projects'
        ? {
            schemaVersion: 1,
            registryRevision: 1,
            bootstrapProjectId: 'example',
            observedUnregistered: [],
            projects: [{
              id: 'example',
              displayName: 'Example',
              repositoryPath: '/example',
              configPath: null,
              archivedAt: null,
              revision: 1,
              bindingState: 'unlinked',
            }],
          }
        : url.pathname === '/api/preset-history'
          ? { presets: [], context }
          : { csrfToken: 'fixture' },
    })
  })
  await page.goto('/#analysis')
  await expect(page.getByRole('cell', { name: 'smoketest' })).toBeVisible()
  await page.getByRole('button', { name: '10 mais executados' }).click()
  await page.getByRole('checkbox', { name: /clinical-readonly/ }).click()
  await expect(page.getByRole('button', { name: '9 selecionados' })).toBeVisible()
  presets = fixture.rankingSample.map((row) =>
    row.preset === 'teste-pequeno'
      ? { ...row, passed: 2000, failed: 0, cancelled: 0, interrupted: 0, total: 2000 }
      : row
  )
  await page.clock.runFor(30_000)
  await expect(page.getByRole('checkbox').first()).toHaveAccessibleName(/smoketest/)
  await page.getByRole('dialog', { name: 'Presets de Resultados' }).press('Escape')
  await expect(page.getByRole('button', { name: '9 selecionados' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'teste-pequeno' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'clinical-readonly' })).toHaveCount(0)
})

test('UI-02 results menu keeps search and shortcuts while scrolling long names', async ({ page }) => {
  await installAnalysis(page)
  await page.goto('/#analysis')
  await page.getByRole('button', { name: '10 mais executados' }).click()
  const dialog = page.getByRole('dialog', { name: 'Presets de Resultados' })
  await expect(dialog.getByLabel('Buscar preset')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '10 mais executados' })).toBeVisible()
  await dialog.getByLabel('Buscar preset').fill('clinical-readonly')
  await expect(dialog.getByRole('checkbox', { name: /clinical-readonly/ })).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: /smoketest/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('AN-06 and AN-07 keep empty custom, all, and duration independent', async ({ page }) => {
  await installAnalysis(page)
  await page.goto('/#analysis')
  await page.getByRole('button', { name: '10 mais executados' }).click()
  await page.getByRole('button', { name: 'Limpar' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Nenhum preset' })).toBeVisible()
  await expect(page.getByText('Sem resultados no período')).toBeVisible()
  await page.getByRole('button', { name: 'Nenhum preset' }).click()
  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('cell', { name: 'teste-pequeno' })).toBeVisible()
  await page.getByRole('radio', { name: 'Duração' }).click()
  await expect(page.getByLabel('Preset da duração')).toBeVisible()
  await page.getByLabel('Preset da duração').click()
  await page.getByRole('option', { name: 'smoketest' }).click()
  await page.getByRole('radio', { name: 'Resultados' }).click()
  await expect(page.getByRole('cell', { name: 'teste-pequeno' })).toBeVisible()
})
