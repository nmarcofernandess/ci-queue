import { expect, test, type Locator, type Page } from '@playwright/test'
import { fixtureJob, fixtureTerminals, fixtureTrees, installConsistencyFixtures } from './fixtures/ui-consistency'

const capture = process.env.CI_QUEUE_CAPTURE_TABLE_LAYOUT === '1'

async function shot(page: Page, path: string) {
  if (capture) await page.screenshot({ path, animations: 'disabled', scale: 'device' })
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

async function expectActionReachableInTable(page: Page, container: Locator, action: Locator) {
  const [containerBox, actionBox, viewportHeight] = await Promise.all([
    container.boundingBox(),
    action.boundingBox(),
    page.evaluate(() => window.innerHeight),
  ])

  expect(containerBox && actionBox).toBeTruthy()
  expect(actionBox!.x).toBeGreaterThanOrEqual(containerBox!.x)
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(containerBox!.x + containerBox!.width)
  expect(actionBox!.y).toBeGreaterThanOrEqual(0)
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(viewportHeight)
}

async function expectTitleReachableBesideAction(page: Page, container: Locator, title: Locator, action: Locator) {
  const [containerBox, titleBox, actionBox, viewportHeight] = await Promise.all([
    container.boundingBox(),
    title.boundingBox(),
    action.boundingBox(),
    page.evaluate(() => window.innerHeight),
  ])

  expect(containerBox && titleBox && actionBox).toBeTruthy()
  const visibleLeft = Math.max(titleBox!.x, containerBox!.x)
  const visibleRight = Math.min(titleBox!.x + titleBox!.width, actionBox!.x, containerBox!.x + containerBox!.width)
  expect(visibleRight - visibleLeft).toBeGreaterThanOrEqual(45)
  expect(titleBox!.y).toBeGreaterThanOrEqual(0)
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(viewportHeight)
}

const layoutScenarios = [
  { width: 1600, zoom: 1 },
  { width: 1440, zoom: 1 },
  { width: 820, zoom: 1 },
  { width: 640, zoom: 1 },
  { width: 390, zoom: 1 },
  { width: 1600, zoom: 2 },
  { width: 1440, zoom: 2 },
  { width: 820, zoom: 2 },
  { width: 640, zoom: 2 },
] as const

for (const { width, zoom } of layoutScenarios) {
  const cssViewport = { width: Math.round(width / zoom), height: Math.round(900 / zoom) }
  test.describe(`${width}px physical at ${zoom * 100}%`, () => {
    test.use({ viewport: cssViewport, deviceScaleFactor: zoom })
  for (const theme of ['light', 'dark'] as const) {
    test(`tables keep content and actions usable at ${width}px and ${zoom * 100}% in ${theme}`, async ({ page }, testInfo) => {
      test.setTimeout(30_000)
      const viewport = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      }))
      expect(viewport).toEqual({
        innerWidth: cssViewport.width,
        innerHeight: cssViewport.height,
        devicePixelRatio: zoom,
      })
      await testInfo.attach(`viewport-${width}-${theme}-zoom-${zoom * 100}.json`, {
        body: JSON.stringify({ physicalViewport: { width, height: 900 }, zoomPercent: zoom * 100, ...viewport }, null, 2),
        contentType: 'application/json',
      })
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
      await expect(flaky.getByRole('img', { name: 'Passou · Flaky detectado' })).toBeVisible()
      await expect(flaky.getByText('Flaky detectado')).toHaveCount(0)
      await expect(flaky.getByText('Personalizado')).toBeVisible()
      await expect(history.getByText('Não informada').first()).toBeVisible()
      const revision = flaky.getByRole('cell').nth(4)
      expect((await revision.boundingBox())!.width).toBeGreaterThan(100)
      await columnAlignment(history)
      const zoomSuffix = zoom === 1 ? '' : `-zoom-${zoom * 100}`
      await shot(page, testInfo.outputPath(`history-initial-${width}-${theme}${zoomSuffix}.png`))
      const historyScroll = history.locator('..')
      const eye = flaky.getByRole('button', { name: 'Inspecionar' })
      if (width === 1440 && zoom === 1) {
        const revisionBox = (await revision.boundingBox())!
        const eyeBox = (await eye.boundingBox())!
        expect(revisionBox.x).toBeLessThan(eyeBox.x - 48)
      }
      await historyScroll.scrollIntoViewIfNeeded()
      await historyScroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await expectActionReachableInTable(page, historyScroll, eye)
      if (cssViewport.width < 820) expect(await historyScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, testInfo.outputPath(`history-${width}-${theme}${zoomSuffix}.png`))

      await page.goto('/#worktrees')
      const worktrees = page.getByRole('table', { name: 'Worktrees' })
      const row = worktrees.getByRole('row').filter({ has: page.getByRole('button', { name: longWorktree, exact: true }) })
      const tableScroll = worktrees.locator('..')
      await columnAlignment(worktrees)
      if (width === 1440 && zoom === 1) {
        const branch = (await worktrees.getByRole('columnheader', { name: 'Branch' }).boundingBox())!
        const container = (await tableScroll.boundingBox())!
        expect(branch.x).toBeLessThan(container.x + container.width - 150)
      }
      await shot(page, testInfo.outputPath(`worktrees-initial-${width}-${theme}${zoomSuffix}.png`))
      await tableScroll.scrollIntoViewIfNeeded()
      await tableScroll.evaluate(element => {
        element.scrollLeft = Math.floor((element.scrollWidth - element.clientWidth) / 2)
      })
      const worktreeName = row.getByRole('button', { name: longWorktree, exact: true })
      const worktreeCheckbox = row.getByRole('checkbox')
      const worktreeEye = row.getByRole('button', { name: 'Inspecionar' })
      await expectTitleReachableBesideAction(page, tableScroll, worktreeName, worktreeEye)
      await expectActionReachableInTable(page, tableScroll, worktreeCheckbox)
      await expectActionReachableInTable(page, tableScroll, worktreeEye)
      const middleHitTargets = await Promise.all([
        worktreeCheckbox.boundingBox(),
        worktreeEye.boundingBox(),
      ])
      expect(middleHitTargets.every(Boolean)).toBe(true)
      expect(middleHitTargets[0]!.x + middleHitTargets[0]!.width).toBeLessThanOrEqual(middleHitTargets[1]!.x)
      await shot(page, testInfo.outputPath(`worktrees-middle-${width}-${theme}${zoomSuffix}.png`))
      await tableScroll.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await expectTitleReachableBesideAction(page, tableScroll, worktreeName, worktreeEye)
      await expectActionReachableInTable(page, tableScroll, worktreeCheckbox)
      await expectActionReachableInTable(page, tableScroll, worktreeEye)
      await worktreeCheckbox.check()
      await expect(row).toHaveAttribute('data-state', 'selected')
      if (cssViewport.width < 820) expect(await tableScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await shot(page, testInfo.outputPath(`worktrees-${width}-${theme}${zoomSuffix}.png`))
      await worktreeEye.focus()
      await expect(worktreeEye).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('button', { name: 'Fechar worktree' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }
  })
}

test('all projects keeps the recipe readable alongside project and variant badges', async ({ page }, testInfo) => {
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
  const status = row.getByRole('img', { name: 'Passou · Flaky detectado' })
  await expect(status).toBeVisible()
  await status.focus()
  await expect(page.getByRole('tooltip', { name: 'Passou · Flaky detectado' })).toBeVisible()
  expect((await recipe.boundingBox())!.width).toBeGreaterThan(80)
  await shot(page, testInfo.outputPath('history-all-projects.png'))
})

for (const theme of ['light', 'dark'] as const) {
  test(`analysis keeps the preset in view while numeric columns scroll in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await installConsistencyFixtures(page, { theme })
    await page.goto('/#analysis')
    const table = page.getByRole('table', { name: 'Resultados por preset' })
    const container = table.locator('..')
    const preset = table.getByRole('row').filter({ has: page.getByRole('button', { name: 'smoketest', exact: true }) }).getByRole('cell').first()
    await shot(page, testInfo.outputPath(`analysis-initial-390-${theme}.png`))
    await container.evaluate(element => { element.scrollLeft = element.scrollWidth })
    await expect(preset).toBeInViewport()
    await expect(table.getByRole('columnheader', { name: 'Total' })).toBeInViewport()
    expect(await container.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    const backgrounds = await preset.evaluate(cell => ({
      sticky: getComputedStyle(cell).backgroundColor,
      card: getComputedStyle(cell.closest('[data-slot=card]')!).backgroundColor,
    }))
    expect(backgrounds.sticky).toBe(backgrounds.card)
    await shot(page, testInfo.outputPath(`analysis-390-${theme}.png`))
  })
}

test('a failed stage takes priority over retry while the execution is running', async ({ page }) => {
  const progress = fixtureJob.progressSummary!
  await installConsistencyFixtures(page, {
    living: {
      ...fixtureJob,
      progressSummary: {
        ...progress,
        nodes: [
          ...(progress.nodes ?? []),
          { id: 'failed-stage', label: 'Falha', status: 'failed' },
        ],
      },
    },
  })
  await page.goto('/#status')
  const state = page.locator('[data-slot=entity-identity][data-presentation=current] [data-slot=status-indicator]')
  await expect(state).toHaveAttribute('aria-label', 'Em execução · Etapa com falha · Flaky detectado')
  await expect(state).toHaveClass(/text-destructive/)
  await expect(page.locator('[data-slot=entity-identity][data-presentation=current]').getByText('Flaky detectado')).toHaveCount(0)
})
