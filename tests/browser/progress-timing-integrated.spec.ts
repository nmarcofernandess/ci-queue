import { expect, test } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "../..")
/** Same origin Vite proxies to by default (see ui/vite.config.ts). */
const PORT = 18876

async function startCandidateApi() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-timing-int-"))
  const state = join(root, "state-root")
  mkdirSync(join(state, "history"), { recursive: true })
  mkdirSync(join(state, "state"), { recursive: true })
  writeFileSync(
    join(state, "state", "projects.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      bootstrapProjectId: "demo",
      projects: {
        demo: {
          id: "demo",
          displayName: "Timing Demo",
          repositoryPath: null,
          gitCommonDir: null,
          configPath: null,
          archivedAt: null,
          revision: 1,
          createdAt: "2026-09-17T12:00:00Z",
          updatedAt: "2026-09-17T12:00:00Z",
        },
      },
    }),
  )
  writeFileSync(
    join(state, "history", "timing-demo.json"),
    JSON.stringify({
      id: "timing-demo",
      projectId: "demo",
      projectName: "Timing Demo",
      preset: "smoke",
      status: "failed",
      createdAt: "2026-09-17T12:00:00Z",
      startedAt: "2026-09-17T12:00:00Z",
      finishedAt: "2026-09-17T12:02:10Z",
      durationMs: 130000,
      exitCode: 1,
      cwd: "/tmp/demo",
      branch: "main",
      headSha: "c".repeat(40),
      command: "node",
      logPath: "/tmp/demo.log",
      progress: {
        schema: 1,
        updatedAt: "2026-09-17T12:02:10Z",
        nodes: [
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
          {
            id: "legacy",
            label: "Legado",
            kind: "stage",
            status: "passed",
          },
        ],
      },
    }),
  )
  const env = { ...process.env }
  delete env.CI_QUEUE_STATE_DIR
  const child: ChildProcess = spawn(
    "python3",
    ["-m", "ci_queue_api.server", "--state", state, "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: ROOT,
      env: { ...env, PYTHONPATH: join(ROOT, "backend"), CI_QUEUE_STATE_DIR: state },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("API candidata não iniciou")), 8000)
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes("CI Queue API")) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout?.on("data", onData)
    child.stderr?.on("data", onData)
    child.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`API candidata saiu com ${code}`))
    })
  })
  return {
    stop() {
      child.kill("SIGTERM")
    },
  }
}

test.describe.configure({ mode: "serial" })

test("R06 real API+UI shows emitter, collector approx, and legacy em dash", async ({ page }) => {
  // No page.route / route.fulfill on proof endpoints — Vite proxies to candidata API.
  const api = await startCandidateApi()
  try {
    const jobRes = await page.request.get(`/api/job?projectId=demo&jobId=timing-demo`)
    expect(jobRes.status()).toBe(200)
    const job = await jobRes.json()
    const byId = Object.fromEntries(
      (job.progressSummary?.nodes ?? []).map((n: { id: string }) => [n.id, n]),
    )
    expect(byId.static).toMatchObject({ durationMs: 120000, durationSource: "emitter" })
    expect(byId.jest).toMatchObject({ durationMs: 1500, durationSource: "collector" })
    expect(byId.miss).toMatchObject({ durationUnavailableReason: "missing-start" })
    expect(byId.legacy.durationMs).toBeUndefined()

    await page.addInitScript(() => localStorage.setItem("ci-queue.lastProjectId", "demo"))
    await page.goto("/?projectId=demo")
    // History UI shows preset label, not full ticket id.
    const smoke = page.getByRole("button", { name: "smoke", exact: true })
    await expect(smoke).toBeVisible({ timeout: 10_000 })
    await smoke.click()
    const drawer = page.getByRole("dialog")
    await expect(drawer).toBeVisible({ timeout: 10_000 })
    await expect(drawer.locator('[data-duration-source="collector"]').first()).toContainText("≈")
    await expect(drawer.getByText("—", { exact: true }).first()).toBeVisible()
  } finally {
    api.stop()
  }
})
