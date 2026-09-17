import { test, expect } from "@playwright/test"

const fixtureProjects = {
  schemaVersion: 1,
  registryRevision: 1,
  bootstrapProjectId: "example",
  observedUnregistered: [],
  projects: [
    {
      id: "example",
      displayName: "Example",
      repositoryPath: "/example",
      resolvedRepositoryPath: "/example",
      repositoryAvailable: true,
      configPath: null,
      archivedAt: null,
      revision: 1,
      bindingState: "linked",
    },
  ],
}

const nodes = [
  {
    id: "static",
    label: "Static",
    kind: "stage",
    status: "passed",
    durationMs: 120000,
    durationSource: "emitter",
  },
  {
    id: "jest",
    label: "Jest",
    kind: "stage",
    status: "passed",
    durationMs: 1500,
    durationSource: "collector",
  },
  {
    id: "miss",
    label: "Sem início",
    kind: "stage",
    status: "failed",
    durationUnavailableReason: "missing-start",
  },
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("ci-queue.lastProjectId", "example"),
  )
  await page.route("**/health", (route) =>
    route.fulfill({
      json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() },
    }),
  )
})

test("tree and stages share duration source presentation", async ({ page }) => {
  const job = {
    id: "timing",
    preset: "smoke",
    projectId: "example",
    branch: "example-branch",
    headSha: "abcdef12",
    status: "failed",
    createdAt: new Date().toISOString(),
    startedAt: new Date(Date.now() - 130000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 130000,
    cwd: "/example",
    progressSummary: {
      available: true,
      schemaVersion: 1,
      nodes,
      roots: nodes,
      active: [],
    },
  }
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/api/projects") {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    const data: Record<string, unknown> = {
      "/api/session": {
        csrfToken: "fixture",
        canReveal: false,
        clipboardLimitBytes: 1000000,
      },
      "/api/status": {
        project: { id: "example", name: "Example" },
        running: null,
        queued: [],
        history: [job],
        globalOccupancy: false,
      },
      "/api/executions": {
        jobs: [job],
        hasMore: false,
        nextCursor: null,
        coverage: { unattributedRecords: 0 },
      },
      "/api/dashboard-state": {
        revision: 0,
        presets: ["smoke"],
        meta: null,
        pending: [],
        pendingError: null,
      },
      "/api/machine": { disk: { availableBytes: 1000000000 } },
      "/api/job": job,
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })

  await page.goto("/#status")
  await page.getByRole("button", { name: "smoke", exact: true }).click()
  const drawer = page.getByRole("dialog")
  await expect(drawer.getByText("Static", { exact: true })).toBeVisible()
  // Emitter stage duration uses formatDuration(120000) => "2m 0s"
  await expect(drawer.locator('[data-duration-source="emitter"]').first()).toContainText("2m")
  await expect(drawer.locator('[data-duration-source="collector"]').first()).toContainText("≈")
  await expect(drawer.getByText("—", { exact: true }).first()).toBeVisible()
})
