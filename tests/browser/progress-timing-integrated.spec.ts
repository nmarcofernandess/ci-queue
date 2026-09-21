import { expect, test } from "@playwright/test"
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { createServer, request as httpRequest, type Server } from "node:http"
import { closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve, sep } from "node:path"

import { enqueueExplicitTicket } from "../../src/core/enqueue.js"
import { cancelQueuedOrRunningTicket } from "../../src/core/runner.js"
import { progressPath, listHistoryJobs } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const ROOT = join(import.meta.dirname, "../..")
/** Same origin Vite proxies to by default (see ui/vite.config.ts). */
const PORT = 18876
const COMPILED_UI = join(ROOT, "ui", "dist")

async function startCandidateApi(running?: { job: Record<string, unknown>; progress: Record<string, unknown> }) {
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
      flags: { progressEnabled: true },
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
  if (running) {
    mkdirSync(join(state, "progress"), { recursive: true })
    writeFileSync(join(state, "running.json"), JSON.stringify(running.job))
    writeFileSync(join(state, "progress", `${running.job.id}.json`), JSON.stringify(running.progress))
  }
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

function sha256(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex")
}

function directorySha256(root: string, label: string): string {
  if (!existsSync(root)) throw new Error(`${label} não existe`)
  const hash = createHash("sha256")
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      if (entry.isFile()) {
        hash.update(relative(root, path))
        hash.update(readFileSync(path))
      }
    }
  }
  visit(root)
  return hash.digest("hex")
}

function compiledUiHash(root: string): string {
  return directorySha256(root, "bundle compilado da UI")
}

function compileCandidateUi(): string {
  const result = spawnSync("npm", ["--prefix", join(ROOT, "ui"), "run", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  })
  if (result.status !== 0) {
    throw new Error(`build da UI candidata falhou: ${result.stderr || result.stdout}`)
  }
  return compiledUiHash(COMPILED_UI)
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`tempo esgotado aguardando ${label}`)
}

async function settleWithin<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`tempo esgotado aguardando ${label}`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function releaseGate(gate: string): boolean {
  try {
    const fd = openSync(gate, constants.O_WRONLY | constants.O_NONBLOCK)
    try {
      writeSync(fd, "release\n")
    } finally {
      closeSync(fd)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENXIO") return false
    throw error
  }
}

async function listen(server: Server): Promise<number> {
  const listening = once(server, "listening")
  server.listen(0, "127.0.0.1")
  await listening
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("porta temporária indisponível")
  return address.port
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return
  const closed = once(server, "close")
  server.close()
  await closed
}

async function reservePort(): Promise<number> {
  const server = createServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const done = () => resolve()
    child.once("exit", done)
    if (child.exitCode !== null) {
      child.removeListener("exit", done)
      resolve()
      return
    }
    child.kill("SIGTERM")
  })
}

async function startApiForState(state: string, port: number) {
  const env = { ...process.env }
  delete env.CI_QUEUE_STATE_DIR
  const child: ChildProcess = spawn(
    "python3",
    ["-m", "ci_queue_api.server", "--state", state, "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: ROOT,
      env: { ...env, PYTHONPATH: join(ROOT, "backend"), CI_QUEUE_STATE_DIR: state },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("API candidata não iniciou")), 8_000)
      const ready = (chunk: Buffer) => {
        if (chunk.toString().includes("CI Queue API")) {
          clearTimeout(timer)
          resolve()
        }
      }
      child.stdout?.on("data", ready)
      child.stderr?.on("data", ready)
      child.on("exit", (code) => {
        clearTimeout(timer)
        reject(new Error(`API candidata saiu com ${code}`))
      })
    })
  } catch (error) {
    await stopChild(child)
    throw error
  }
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => stopChild(child),
  }
}

function contentType(path: string): string {
  if (path.endsWith(".js")) return "text/javascript"
  if (path.endsWith(".css")) return "text/css"
  if (path.endsWith(".svg")) return "image/svg+xml"
  if (path.endsWith(".json")) return "application/json"
  return "text/html; charset=utf-8"
}

async function startCompiledUi(apiOrigin: string) {
  const server = createServer((request, response) => {
    const requestUrl = request.url ?? "/"
    const pathname = new URL(requestUrl, "http://127.0.0.1").pathname
    if (pathname === "/health" || pathname.startsWith("/api/")) {
      const target = new URL(requestUrl, apiOrigin)
      const upstream = httpRequest(target, { method: request.method, headers: { ...request.headers, host: target.host } }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
        upstreamResponse.pipe(response)
      })
      upstream.on("error", (error) => {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" })
        response.end(error.message)
      })
      request.pipe(upstream)
      return
    }
    const candidate = resolve(COMPILED_UI, `.${pathname}`)
    const path = candidate.startsWith(`${COMPILED_UI}${sep}`) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(COMPILED_UI, "index.html")
    response.writeHead(200, { "content-type": contentType(path) })
    response.end(readFileSync(path))
  })
  const port = await listen(server)
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => closeServer(server),
  }
}

test.describe.configure({ mode: "serial" })

test("Q2/Q3 real API+UI shows the planned Playwright 0/7 while Next runs", async ({ page }) => {
  const detail = { kind: "cases", completed: 0, total: 7, passed: 0, failed: 0, running: 0, pending: 7, skipped: 0 }
  const api = await startCandidateApi({
    job: {
      id: "planned-demo", projectId: "demo", projectName: "Timing Demo", preset: "full",
      status: "running", createdAt: "2026-09-17T12:00:00Z", startedAt: "2026-09-17T12:00:01Z",
      branch: "dev", headSha: "d".repeat(40), flags: { progressEnabled: true },
    },
    progress: { schema: 1, updatedAt: "2026-09-17T12:00:02Z", nodes: [
      { id: "e2e", label: "E2E", kind: "stage", status: "running" },
      { id: "next", parentId: "e2e", label: "Next", kind: "stage", status: "running" },
      { id: "playwright", parentId: "e2e", label: "Playwright", kind: "stage", status: "pending", detail },
    ] },
  })
  try {
    const response = await page.request.get("/api/status?context=all&view=live")
    expect(response.status()).toBe(200)
    const payload = await response.json()
    expect(payload.running.progressSummary.planned).toMatchObject([{ rootId: "e2e", id: "playwright", detail }])
    await page.addInitScript(() => localStorage.setItem("ci-queue.lastProjectId", "demo"))
    await page.goto("/?projectId=demo")
    await expect(page.getByText("Next · Playwright: 0 de 7")).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: "full", exact: true }).click()
    await expect(page.getByRole("dialog").getByText("0 de 7")).toBeVisible()
  } finally {
    api.stop()
  }
})

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

test("C03 same ticket carries the real DietFlow producer from 0/7 live to 7/7 durable history in compiled UI", async ({ page }, testInfo) => {
  const producerRoot = process.env.C03_DIETFLOW_ROOT
  const expectedProducerHead = process.env.C03_DIETFLOW_HEAD
  const expectedConsumerHead = process.env.C03_CI_QUEUE_HEAD
  test.skip(!producerRoot || !expectedProducerHead || !expectedConsumerHead, "C03 exige roots e SHAs explícitos no ticket dedicado")
  if (!producerRoot || !expectedProducerHead || !expectedConsumerHead) return

  const producer = join(producerRoot, "scripts/__tests__/fixtures/pw-observe/c03-producer.sh")
  expect(existsSync(producer)).toBe(true)
  const producerHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: producerRoot, encoding: "utf8" }).trim()
  const consumerHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim()
  expect(producerHead).toBe(expectedProducerHead)
  expect(consumerHead).toBe(expectedConsumerHead)

  const temporaryRoot = mkdtempSync(join(tmpdir(), "ci-queue-c03-same-ticket-"))
  const state = join(temporaryRoot, "state")
  const gate = join(temporaryRoot, "release.fifo")
  const ready = join(temporaryRoot, "producer-ready")
  const previousGate = process.env.C03_GATE_PATH
  const previousReady = process.env.C03_READY_PATH
  let api: Awaited<ReturnType<typeof startApiForState>> | undefined
  let ui: Awaited<ReturnType<typeof startCompiledUi>> | undefined
  let worker: Promise<Awaited<ReturnType<typeof runWorker>>> | undefined
  let workerSettled = false
  let gateReleased = false
  let ticket: ReturnType<typeof enqueueExplicitTicket> | undefined
  const timeline: Record<string, string> = { createdAt: new Date().toISOString() }

  execFileSync("mkfifo", [gate])
  mkdirSync(join(state, "state"), { recursive: true })
  writeFileSync(
    join(state, "state", "projects.json"),
    JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      bootstrapProjectId: "dietflow-c03",
      projects: {
        "dietflow-c03": {
          id: "dietflow-c03",
          displayName: "DietFlow C03 producer",
          repositoryPath: producerRoot,
          gitCommonDir: null,
          configPath: null,
          archivedAt: null,
          revision: 1,
          createdAt: timeline.createdAt,
          updatedAt: timeline.createdAt,
        },
      },
    }),
  )
  process.env.C03_GATE_PATH = gate
  process.env.C03_READY_PATH = ready

  try {
    ticket = enqueueExplicitTicket({
      recipe: "c03-q2q3",
      argv: ["/bin/bash", producer],
      projectId: "dietflow-c03",
      projectName: "DietFlow C03 producer",
      cwd: producerRoot,
      stateRoot: state,
      flags: { progressEnabled: true },
      requestedBy: "c03-browser-proof",
    })
    timeline.enqueuedAt = new Date().toISOString()
    worker = runWorker(state).finally(() => { workerSettled = true })

    await waitFor(() => existsSync(ready), "discovery do produtor")
    timeline.discoveryReadyAt = statSync(ready).mtime.toISOString()
    const manifest = `${ready}.discovery.json`
    const discovery = JSON.parse(readFileSync(manifest, "utf8")) as { caseIds?: unknown[] }
    expect(discovery.caseIds).toHaveLength(7)

    api = await startApiForState(state, await reservePort())
    const bundleSha256 = compileCandidateUi()
    ui = await startCompiledUi(api.url)

    const liveResponse = await page.request.get(`${api.url}/api/status?context=all&view=live`)
    expect(liveResponse.status()).toBe(200)
    const live = await liveResponse.json() as {
      running?: { id?: string; progressSummary?: { planned?: Array<Record<string, unknown>> } }
    }
    expect(live.running?.id).toBe(ticket.id)
    expect(live.running?.progressSummary?.planned).toMatchObject([
      { rootId: "e2e", id: "playwright", detail: { completed: 0, total: 7, pending: 7 } },
    ])

    await page.addInitScript(() => localStorage.setItem("ci-queue.lastProjectId", "dietflow-c03"))
    await page.goto(`${ui.url}/?projectId=dietflow-c03`)
    await expect(page.getByText(/0 de 7/).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
    await expect(page.getByRole("dialog").getByText("0 de 7", { exact: true })).toBeVisible()

    await waitFor(() => releaseGate(gate), "leitor da barreira FIFO", 1_000)
    gateReleased = true
    timeline.releasedAt = new Date().toISOString()
    await expect(worker).resolves.toMatchObject({ processed: [ticket.id], busy: false })
    timeline.terminalAt = new Date().toISOString()

    const history = listHistoryJobs(state).find((job) => job.id === ticket.id)
    expect(history).toMatchObject({ id: ticket.id, status: "passed", exitCode: 0 })
    const playwright = history?.progress?.nodes?.find((node) => node.id === "playwright")
    expect(playwright?.detail).toMatchObject({ completed: 7, total: 7, passed: 7, failed: 0, pending: 0 })
    expect(existsSync(progressPath(state, ticket.id))).toBe(false)

    await page.reload()
    await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
    await expect(page.getByRole("dialog").getByText("7 de 7", { exact: true })).toBeVisible()

    await testInfo.attach("c03-same-ticket-receipt.json", {
      body: JSON.stringify({
        ticketId: ticket.id,
        producer: {
          root: producerRoot,
          headSha: producerHead,
          fixtureSha256: directorySha256(join(producerRoot, "scripts/__tests__/fixtures/pw-observe"), "fixture do produtor"),
          manifestSha256: sha256(readFileSync(manifest)),
        },
        consumer: {
          root: ROOT,
          headSha: consumerHead,
          compiledBundleSha256: bundleSha256,
        },
        state: "temporary",
        runtime: history?.runtime,
        command: ticket.argv,
        timeline,
      }, null, 2),
      contentType: "application/json",
    })
  } finally {
    if (worker && !workerSettled) {
      if (!gateReleased) {
        await waitFor(() => workerSettled || releaseGate(gate), "leitor da barreira FIFO no cleanup", 1_000)
        gateReleased = !workerSettled
      }
      try {
        await settleWithin(worker, "término do worker C03", 10_000)
      } catch {
        if (ticket) await cancelQueuedOrRunningTicket(state, ticket.id)
        await settleWithin(worker, "término cancelado do worker C03", 10_000)
      }
    }
    if (ui) await ui.stop()
    if (api) await api.stop()
    if (previousGate === undefined) delete process.env.C03_GATE_PATH
    else process.env.C03_GATE_PATH = previousGate
    if (previousReady === undefined) delete process.env.C03_READY_PATH
    else process.env.C03_READY_PATH = previousReady
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
