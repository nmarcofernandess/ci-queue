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

function compileCandidateUi(output: string): string {
  const result = spawnSync("npm", ["--prefix", join(ROOT, "ui"), "run", "build", "--", "--outDir", output, "--emptyOutDir"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  })
  if (result.status !== 0) {
    throw new Error(`build da UI candidata falhou: ${result.stderr || result.stdout}`)
  }
  return compiledUiHash(output)
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

async function waitForChildExit(child: ChildProcess, label: string, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", done)
      reject(new Error(`tempo esgotado aguardando ${label}`))
    }, timeoutMs)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    child.once("exit", done)
    if (child.exitCode !== null) {
      child.removeListener("exit", done)
      clearTimeout(timer)
      resolve()
    }
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  if (!child.kill("SIGTERM") && child.exitCode === null) {
    throw new Error("SIGTERM recusado pela API C03")
  }
  try {
    await waitForChildExit(child, "API C03 após SIGTERM", 3_000)
    return
  } catch (termError) {
    if (child.exitCode !== null) return
    if (!child.kill("SIGKILL") && child.exitCode === null) {
      throw new Error(`API C03 não encerrou após SIGTERM e recusou SIGKILL: ${termError instanceof Error ? termError.message : String(termError)}`)
    }
    try {
      await waitForChildExit(child, "API C03 após SIGKILL", 3_000)
    } catch (killError) {
      throw new Error(`API C03 permanece ativa após SIGKILL: ${killError instanceof Error ? killError.message : String(killError)}`)
    }
  }
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

async function startCompiledUi(bundleRoot: string, apiOrigin: string) {
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
    const candidate = resolve(bundleRoot, `.${pathname}`)
    const path = candidate.startsWith(`${bundleRoot}${sep}`) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(bundleRoot, "index.html")
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
  const dedicatedRunner = process.env.C03_DEDICATED === "1"
  const producerRoot = process.env.C03_DIETFLOW_ROOT
  const expectedProducerHead = process.env.C03_DIETFLOW_HEAD
  const expectedConsumerHead = process.env.C03_CI_QUEUE_HEAD
  test.skip(!dedicatedRunner, "C03 só executa pelo runner dedicado")
  if (!dedicatedRunner) return
  if (!producerRoot || !expectedProducerHead || !expectedConsumerHead) {
    throw new Error("runner C03 dedicado exige C03_DIETFLOW_ROOT, C03_DIETFLOW_HEAD e C03_CI_QUEUE_HEAD")
  }

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
  const artifacts = join(temporaryRoot, "playwright-output")
  const bundle = join(temporaryRoot, "compiled-ui")
  const previousGate = process.env.C03_GATE_PATH
  const previousReady = process.env.C03_READY_PATH
  const previousArtifacts = process.env.C03_ARTIFACT_DIR
  let api: Awaited<ReturnType<typeof startApiForState>> | undefined
  let ui: Awaited<ReturnType<typeof startCompiledUi>> | undefined
  let worker: Promise<Awaited<ReturnType<typeof runWorker>>> | undefined
  let workerSettled = false
  let apiStopped = false
  let gateReleased = false
  let ticket: ReturnType<typeof enqueueExplicitTicket> | undefined
  const timeline: Record<string, string> = { createdAt: new Date().toISOString() }
  let testBodyFailed = false

  try {
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
    process.env.C03_ARTIFACT_DIR = artifacts

    const c03Ticket = enqueueExplicitTicket({
      recipe: "c03-q2q3",
      argv: ["/bin/bash", producer],
      projectId: "dietflow-c03",
      projectName: "DietFlow C03 producer",
      cwd: producerRoot,
      stateRoot: state,
      flags: { progressEnabled: true },
      requestedBy: "c03-browser-proof",
    })
    ticket = c03Ticket
    timeline.enqueuedAt = new Date().toISOString()
    worker = runWorker(state).finally(() => { workerSettled = true })

    await waitFor(() => existsSync(ready), "discovery do produtor")
    timeline.discoveryReadyAt = statSync(ready).mtime.toISOString()
    const manifest = `${ready}.discovery.json`
    const discovery = JSON.parse(readFileSync(manifest, "utf8")) as { caseIds?: unknown[] }
    expect(discovery.caseIds).toHaveLength(7)

    api = await startApiForState(state, await reservePort())
    const bundleSha256 = compileCandidateUi(bundle)
    ui = await startCompiledUi(bundle, api.url)

    const liveResponse = await page.request.get(`${api.url}/api/status?context=all&view=live`)
    expect(liveResponse.status()).toBe(200)
    const live = await liveResponse.json() as {
      running?: { id?: string; progressSummary?: { planned?: Array<Record<string, unknown>> } }
    }
    expect(live.running?.id).toBe(c03Ticket.id)
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
    await expect(worker).resolves.toMatchObject({ processed: [c03Ticket.id], busy: false })
    timeline.terminalAt = new Date().toISOString()

    const history = listHistoryJobs(state).find((job) => job.id === c03Ticket.id)
    expect(history).toMatchObject({ id: c03Ticket.id, status: "passed", exitCode: 0 })
    const playwright = history?.progress?.nodes?.find((node) => node.id === "playwright")
    expect(playwright?.detail).toMatchObject({ completed: 7, total: 7, passed: 7, failed: 0, pending: 0 })
    expect(existsSync(progressPath(state, c03Ticket.id))).toBe(false)

    // Persiste a cadeia já observada antes da última asserção visual, para que
    // uma falha de navegação no drawer não apague o ticket/worker/timeline reais.
    const partialReceiptPath = testInfo.outputPath("c03-same-ticket-receipt.json")
    writeFileSync(partialReceiptPath, JSON.stringify({
      ticketId: c03Ticket.id,
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
      testExecuted: true,
      terminalUi: "pending-verification",
      runtime: history?.runtime,
      command: c03Ticket.argv,
      timeline,
    }, null, 2))
    await testInfo.attach("c03-same-ticket-receipt.json", {
      path: partialReceiptPath,
      contentType: "application/json",
    })

    await page.reload()
    await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
    const expandE2e = page.getByRole("button", { name: "Expandir E2E", exact: true })
    await expect(expandE2e).toBeVisible()
    await expandE2e.click()
    await expect(page.getByText("Playwright", { exact: true })).toBeVisible()
    await expect(page.getByRole("dialog").getByText("7 de 7", { exact: true })).toBeVisible()
    const terminalUiPath = testInfo.outputPath("c03-terminal-ui.json")
    writeFileSync(terminalUiPath, JSON.stringify({
      ticketId: c03Ticket.id,
      testExecuted: true,
      terminalUi: "verified",
      timeline,
    }, null, 2))
    await testInfo.attach("c03-terminal-ui.json", {
      path: terminalUiPath,
      contentType: "application/json",
    })
  } catch (error) {
    testBodyFailed = true
    throw error
  } finally {
    const cleanupErrors: Error[] = []
    const rememberCleanupError = (step: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      cleanupErrors.push(new Error(`${step}: ${message}`))
    }

    if (worker && !workerSettled) {
      if (!gateReleased) {
        try {
          await waitFor(() => workerSettled || releaseGate(gate), "leitor da barreira FIFO no cleanup", 1_000)
          gateReleased = !workerSettled
        } catch (error) {
          rememberCleanupError("liberação da barreira FIFO", error)
        }
      }
      try {
        await settleWithin(worker, "término do worker C03", 10_000)
      } catch (error) {
        rememberCleanupError("término inicial do worker C03", error)
        if (ticket) {
          try {
            await cancelQueuedOrRunningTicket(state, ticket.id)
          } catch (cancelError) {
            rememberCleanupError("cancelamento do worker C03", cancelError)
          }
        }
        try {
          await settleWithin(worker, "término cancelado do worker C03", 10_000)
        } catch (settleError) {
          rememberCleanupError("término cancelado do worker C03", settleError)
        }
      }
    }
    if (ui) {
      try {
        await ui.stop()
      } catch (error) {
        rememberCleanupError("encerramento da UI C03", error)
      }
    }
    if (api) {
      try {
        await api.stop()
        apiStopped = true
      } catch (error) {
        rememberCleanupError("encerramento da API C03", error)
      }
    }
    if (previousGate === undefined) delete process.env.C03_GATE_PATH
    else process.env.C03_GATE_PATH = previousGate
    if (previousReady === undefined) delete process.env.C03_READY_PATH
    else process.env.C03_READY_PATH = previousReady
    if (previousArtifacts === undefined) delete process.env.C03_ARTIFACT_DIR
    else process.env.C03_ARTIFACT_DIR = previousArtifacts
    if ((!worker || workerSettled) && (!api || apiStopped)) {
      try {
        rmSync(temporaryRoot, { recursive: true, force: true })
      } catch (error) {
        rememberCleanupError("remoção do estado temporário C03", error)
      }
    } else {
      cleanupErrors.push(new Error(`processo C03 permanece ativo; estado temporário preservado em ${temporaryRoot}`))
    }
    if (cleanupErrors.length > 0 && !testBodyFailed) {
      throw new AggregateError(cleanupErrors, "cleanup C03 incompleto")
    }
  }
})
