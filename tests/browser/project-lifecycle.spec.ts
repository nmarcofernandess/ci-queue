import { expect, test } from '@playwright/test'

test('PR-01 zero projects can open the shell and the manager', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const data: Record<string, unknown> = {
      '/api/projects': {
        schemaVersion: 1,
        registryRevision: 0,
        bootstrapProjectId: null,
        observedUnregistered: [],
        projects: [],
      },
      '/api/session': { csrfToken: 'fixture', canReveal: false, clipboardLimitBytes: 1000000 },
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/#status')
  await page.getByRole('button', { name: 'Selecionar projeto' }).click()
  await expect(page.getByRole('button', { name: 'Histórico sem projeto' })).toBeVisible()
  await page.getByRole('button', { name: 'Gerenciar projetos' }).click()
  await expect(page.getByRole('heading', { name: 'Projetos locais' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cadastrar pasta' })).toBeVisible()
})

test('UI-02 local environment menu exposes Bridge and theme', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      json: url.pathname === '/api/projects'
        ? {
            schemaVersion: 1,
            registryRevision: 0,
            bootstrapProjectId: null,
            observedUnregistered: [],
            projects: [],
          }
        : { csrfToken: 'fixture', canReveal: false },
    })
  })
  await page.goto('/#status')
  await page.getByRole('button', { name: 'Ambiente local' }).click()
  await expect(page.getByText('Estado da Bridge')).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Claro' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Escuro' })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Sistema' })).toBeVisible()
})
