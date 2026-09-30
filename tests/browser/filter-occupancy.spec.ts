import { expect, test } from "@playwright/test"

import {
  fixtureJob,
  fixtureDashboard,
  installConsistencyFixtures,
} from "./fixtures/ui-consistency"

const dietflowLive = {
  ...fixtureJob,
  id: "dietflow-live",
  projectId: "dietflow",
  projectName: "DietFlow",
  preset: "full",
}

test("status shows foreign living without changing the project filter", async ({
  page,
}) => {
  await installConsistencyFixtures(page, {
    living: dietflowLive,
    extraProjects: [{ id: "dietflow", displayName: "DietFlow" }],
  })
  await page.goto("/#status")
  const current = page.locator(
    "[data-slot=entity-identity][data-presentation=current]"
  )
  await expect(current.getByRole("button", { name: "full", exact: true })).toBeVisible()
  await expect(current.getByText("DietFlow", { exact: true })).toBeVisible()
  await expect(page.getByText("média", { exact: false })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Example" })).toBeVisible()
  await expect(page).toHaveURL(/projectId=example/)
  await page
    .locator("[data-slot=card]")
    .filter({ hasText: "Execução atual" })
    .getByRole("button", { name: "Inspecionar", exact: true })
    .click()
  const drawer = page.getByRole("dialog")
  await expect(drawer).toBeVisible()
  await expect(drawer.locator("[data-slot=drawer-title]")).toHaveText("full")
  await expect(drawer.getByText("DietFlow", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(drawer).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Example" })).toBeVisible()
  await expect(page).toHaveURL(/projectId=example/)
  await expect(page).not.toHaveURL(/context=all/)
})

test("últimos verdes preserve the single-project controls", async ({ page }) => {
  await installConsistencyFixtures(page)
  await page.goto("/#status")
  await expect(page.getByRole("button", { name: "Example" })).toBeVisible()
  await page.getByRole("radio", { name: "Últimos verdes", exact: true }).click()
  await expect(page).toHaveURL(/mode=greens/)
  await expect(
    page.getByRole("radio", { name: "Últimos verdes", exact: true })
  ).toBeChecked()
  await expect(page.getByLabel("Origem")).toBeVisible()
  await expect(
    page.getByPlaceholder("Buscar últimos verdes…")
  ).toBeVisible()
})

test("status empty living has no occupancy copy", async ({ page }) => {
  await installConsistencyFixtures(page, { empty: true })
  await page.goto("/#status")
  await expect(
    page.getByText("Nenhuma execução em andamento", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("Há trabalho de outro projeto")).toHaveCount(0)
  await expect(page.getByText("O executor está ocupado.")).toHaveCount(0)
  await expect(page.getByText("Fila livre", { exact: true })).toBeVisible()
})

test("status publishes the mean only when the snapshot includes it", async ({
  page,
}) => {
  await installConsistencyFixtures(page, { durationMeanMs: 120_000 })
  await page.goto("/#status")
  await expect(page.getByText("decorrido · média 2m 0s")).toBeVisible()
})

test("status keeps living when the filter is Todos or unassigned", async ({
  page,
}) => {
  await installConsistencyFixtures(page, {
    living: dietflowLive,
    extraProjects: [{ id: "dietflow", displayName: "DietFlow" }],
    history: [
      {
        ...fixtureJob,
        id: "dietflow-passed",
        projectId: "dietflow",
        projectName: "DietFlow",
        preset: "check",
        status: "passed",
        finishedAt: "2026-09-15T11:55:00Z",
        startedAt: "2026-09-15T11:54:00Z",
        durationMs: 62_000,
        progressSummary: undefined,
      },
    ],
  })
  await page.route('**/api/dashboard-state?context=all', route =>
    route.fulfill({ json: { schemaVersion: 2, context: { kind: 'all' }, projectErrors: [], projects: [{ ...fixtureDashboard(), projectId: 'example', projectName: 'Example', catalog: 'linked' }] } })
  )
  await page.goto("/?context=all#status")
  await expect(page.getByRole("button", { name: "Todos os projetos" })).toBeVisible()
  await expect(
    page.locator("[data-slot=entity-identity][data-presentation=current]")
      .getByRole("button", { name: "full", exact: true })
  ).toBeVisible()
  await expect(page.getByText("DietFlow", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "check", exact: true })).toBeVisible()
  const greensAll = page.getByRole("radio", { name: "Últimos verdes", exact: true })
  await expect(greensAll).toBeEnabled()
  for (const [title, action] of [["Metas", "Abrir metas"], ["Pendências", "Ver pendências"]] as const) {
    const card = page.locator("[data-slot=card]").filter({ has: page.getByText(title, { exact: true }) })
    await expect(card).toBeVisible()
    await expect(card.getByText("Example", { exact: true })).toBeVisible()
    await expect(card.getByRole("button", { name: action })).toBeEnabled()
  }
  await expect(page.locator("[data-slot=card]").filter({ hasText: "Máquina" })).toBeVisible()
  await page.goto("/?context=unassigned#status")
  await expect(page.getByRole("button", { name: "Histórico sem projeto" })).toBeVisible()
  await expect(
    page.getByRole("radio", { name: "Últimos verdes", exact: true })
  ).toBeDisabled()
  await expect(
    page.locator("[data-slot=entity-identity][data-presentation=current]")
      .getByRole("button", { name: "full", exact: true })
  ).toBeVisible()
  await expect(page.getByText("Há trabalho de outro projeto")).toHaveCount(0)
  for (const title of ["Metas", "Pendências"]) {
    const card = page.locator("[data-slot=card]").filter({ has: page.getByText(title, { exact: true }) })
    await expect(card.getByText("Selecione um projeto", { exact: true })).toBeVisible()
  }
})

test("analysis in Todos keeps homonymous presets apart", async ({ page }) => {
  await installConsistencyFixtures(page, {
    extraProjects: [{ id: "dietflow", displayName: "DietFlow" }],
    resultsPresets: [
      {
        preset: "check",
        projectId: "example",
        projectName: "Example",
        passed: 4,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
        total: 4,
      },
      {
        preset: "check",
        projectId: "dietflow",
        projectName: "DietFlow",
        passed: 2,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
        total: 2,
      },
    ],
    durationPresets: [
      {
        key: "example:check",
        label: "Example · check",
        projectId: "example",
        preset: "check",
      },
      {
        key: "dietflow:check",
        label: "DietFlow · check",
        projectId: "dietflow",
        preset: "check",
      },
    ],
  })
  await page.goto("/?context=all#analysis")
  await expect(page.getByRole("button", { name: "Example · check" })).toBeVisible()
  await expect(page.getByRole("button", { name: "DietFlow · check" })).toBeVisible()
  await page.getByRole("radio", { name: "Duração" }).click()
  await page.getByLabel("Preset da duração").click()
  await page.getByRole("option", { name: "DietFlow · check" }).click()
  await expect(page).toHaveURL(/durationPreset=dietflow%3Acheck|durationPreset=dietflow:check/)
  await expect(page.getByText("1m 30s").first()).toBeVisible()
  await expect(page.getByText("1m 2s")).toHaveCount(0)
})

test("analysis in unassigned stays project-required", async ({ page }) => {
  await installConsistencyFixtures(page)
  await page.goto("/?context=unassigned#analysis")
  await expect(page.getByText("Análise exige um projeto")).toBeVisible()
})
