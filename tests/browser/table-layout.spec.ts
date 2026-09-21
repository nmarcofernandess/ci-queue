import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureTerminals, fixtureTrees, installConsistencyFixtures } from './fixtures/ui-consistency'

const capture = process.env.CI_QUEUE_CAPTURE_TABLE_LAYOUT === '1'

async function shot(page: Page, path: string) {
  if (capture) await page.screenshot({ path, animations: 'disabled' })
}

async function columnAlignment(table: Locator) {
  const columns = await table.locator('thead th').count()
  for (let index = 0; index < columns; index++) {
    const head = await table.locator('thead th').nth(index).boundingBox()
    const cell = await table.locator('tbody tr').first().locator('td').nth(index).boundingBox()
    expect(head && cell).toBeTruthy()
    expect(Math.abs(head!.x - cell!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(head!.width - cell!.width)).toBeLessThanOrEqual(1)
  }
}

for (const width of [1440, 820, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`tables keep content and actions usable at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      test.setTimeout(30_000)
      await page.setViewportSize({ width, height: 900 })
      const longBranch = 'feature/a-long-branch-name-that-stays-readable-until-the-column-is-full'
      const longWorktree = 'a-worktree-directory-name-that-needs-more-than-eleven-rem'
      await installConsistencyFixtures(page, {
        theme,
        history: [
          { ...fixtureTerminals[0], id: 'flaky', preset: 'smoketest', branch: longBranch, projectName: 'DietFlow', runVariant: 'custom' },
          { ...fixtureTerminals[1], id: 'no-name', preset: '', branch: longBranch },
        ],
        worktrees: [
          { ...fixtureTrees[0], path: `/example/projects/${longWorktree}`, branch: longBranch },
          { ...fixtureTrees[1], projectId: 'another', projectName: 'Another project' },
        ],
      })

      await page.goto('/#status')
      const history = page.getByRole('table', { name: 'Execuções' }).last()
      await expect(history.getByRole('button', { name: 'smoketest', exact: true })).toBeVisible()
      const flaky = history.getByRole('row').filter({ has: page.getByRole('button', { name: 'smoketest', exact: true }) })
      const name = flaky.getByRole('button', { name: 'smoketest', exact: true })
      expect((await name.boundingBox())!.width).toBeGreaterThan(45)
      await expect(flaky.getByText('Flaky detectado')).toBeVisible()
      await expect(flaky.getByText('Personalizado')).toBeVisible()
      await expect(history.getByText('Não informada').first()).toBeVisible()
      const revision = flaky.getByRole('cell').nth(4)
      expect((await revision.boundingBox())!.width).toBeGreaterThan(250)
      await columnAlignment(history)
      await shot(page, testInfo.outputPath(`history-initial-${width}-${theme}.png`))
      const historyScroll = history.locator('..')
      const eye = flaky.getByRole('button', { name: 'Inspecionar' })
      await historyScroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await expect(eye).toBeInViewport()
      if (width < 820) expect(await historyScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, testInfo.outputPath(`history-${width}-${theme}.png`))

      await page.goto('/#worktrees')
      const worktrees = page.getByRole('table', { name: 'Worktrees' })
      const row = worktrees.getByRole('row').filter({ has: page.getByRole('button', { name: longWorktree, exact: true }) })
      const tableScroll = worktrees.locator('..')
      await columnAlignment(worktrees)
      await shot(page, testInfo.outputPath(`worktrees-initial-${width}-${theme}.png`))
      await tableScroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await expect(row.getByRole('button', { name: longWorktree, exact: true })).toBeInViewport()
      await expect(row.getByRole('checkbox')).toBeInViewport()
      await expect(row.getByRole('button', { name: 'Inspecionar' })).toBeInViewport()
      await row.getByRole('checkbox').check()
      await expect(row).toHaveAttribute('data-state', 'selected')
      if (width < 820) expect(await tableScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, testInfo.outputPath(`worktrees-${width}-${theme}.png`))
    })
  }
}

test('all projects keeps the recipe readable alongside project, variant and flaky badges', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installConsistencyFixtures(page, {
    extraProjects: [{ id: 'another', displayName: 'Another project' }],
    history: [{ ...fixtureTerminals[0], id: 'multi-project-flaky', preset: 'smoketest', projectId: 'example', projectName: 'DietFlow', runVariant: 'custom' }],
  })
  await page.goto('/#status')
  await page.getByRole('button', { name: 'Example', exact: true }).click()
  await page.getByRole('button', { name: 'Todos os projetos', exact: true }).click()
  const history = page.getByRole('table', { name: 'Execuções' }).last()
  const row = history.getByRole('row').filter({ has: page.getByRole('button', { name: 'smoketest', exact: true }) })
  const recipe = row.getByRole('button', { name: 'smoketest', exact: true })
  await expect(row.getByText('DietFlow')).toBeVisible()
  await expect(row.getByText('Personalizado')).toBeVisible()
  await expect(row.getByText('Flaky detectado')).toBeVisible()
  expect((await recipe.boundingBox())!.width).toBeGreaterThan(80)
  await shot(page, testInfo.outputPath('history-all-projects.png'))
})
