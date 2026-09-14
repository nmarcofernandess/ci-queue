import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { initialExecutionDeadline } from "../../src/core/deadline.js"
import { enqueueTicket } from "../../src/core/enqueue.js"
import { probeProcessGroupIdentity } from "../../src/core/process.js"
import { cancelQueuedOrRunningTicket, parseTicket, reconcileInterruptedJob } from "../../src/core/runner.js"
import { atomicWriteJson, listHistoryJobs, listQueuedJobs, queuePaths, readRunningJob } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"
import { runCli } from "../../src/cli.js"
import type { QueueTicket } from "../../src/contracts/schema.js"

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(presets: Record<string, object>): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  writeFileSync(join(project, "ci-queue.json"), `${JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture project" },
    presets,
  }, null, 2)}\n`)
  return { project, state }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("tempo esgotado aguardando condição")
}

describe("queue lifecycle", () => {
  it("keeps a submitted job queued until the explicit worker drains it", async () => {
    const { project, state } = fixture({ ok: { argv: [process.execPath, "-e", "process.exit(0)"] } })
    const ticket = enqueueTicket({ preset: "ok", cwd: project, stateRoot: state })

    expect(listQueuedJobs(state).map((job) => job.id)).toEqual([ticket.id])
    expect(listHistoryJobs(state)).toEqual([])

    const report = await runWorker(state)
    expect(report.processed).toEqual([ticket.id])
    expect(listQueuedJobs(state)).toEqual([])
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed", exitCode: 0 })
  })

  it("records a failing recipe as terminal failure without stopping future queue operation", async () => {
    const { project, state } = fixture({ bad: { argv: [process.execPath, "-e", "process.exit(7)"] } })
    const ticket = enqueueTicket({ preset: "bad", cwd: project, stateRoot: state })

    await runWorker(state)

    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "failed", exitCode: 7 })
    expect(readRunningJob(state)).toBeUndefined()
  })

  it("persists a v3 deadline expiry before terminating the process group", async () => {
    const { project, state } = fixture({
      timeout: { argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"], executionTimeoutMs: 180 },
    })
    const ticket = enqueueTicket({ preset: "timeout", cwd: project, stateRoot: state })

    await runWorker(state)

    expect(listHistoryJobs(state)[0]).toMatchObject({
      id: ticket.id,
      status: "failed",
      failureReason: "prazo de execução excedido",
      executionDeadline: { state: "expired", timeoutMs: 180 },
    })
  }, 15_000)

  it("preserves structured progress emitted by a recipe in the terminal ticket", async () => {
    const marker = ["@@ci-queue-progress", "1", "node", "bootstrap", "-", "stage", "passed", "12", "Bootstrap"].join("\t")
    const { project, state } = fixture({
      progress: { argv: [process.execPath, "-e", `console.log(${JSON.stringify(marker)})`] },
    })
    enqueueTicket({ preset: "progress", cwd: project, stateRoot: state })

    await runWorker(state)

    expect(listHistoryJobs(state)[0].progress?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bootstrap", kind: "stage", status: "passed", durationMs: 12 }),
    ]))
  })

  it("cancels a running detached process group and keeps its terminal record", async () => {
    const { project, state } = fixture({ slow: { argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"] } })
    const ticket = enqueueTicket({ preset: "slow", cwd: project, stateRoot: state })
    const worker = runWorker(state)
    await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity))

    const cancelled = await cancelQueuedOrRunningTicket(state, ticket.id)
    expect(cancelled.kind).toBe("running")
    const report = await worker
    expect(report.processed).toEqual([ticket.id])
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "cancelled", exitCode: null })
    expect(readRunningJob(state)).toBeUndefined()
  }, 15_000)

  it("reconciles a dead worker by terminating its verified child group before marking interrupted", async () => {
    const { project, state } = fixture({ noop: { argv: [process.execPath, "-e", "process.exit(0)"] } })
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: project, detached: true, stdio: "ignore" })
    child.unref()
    await waitFor(() => Boolean(child.pid && probeProcessGroupIdentity(child.pid)))
    const identity = probeProcessGroupIdentity(child.pid!)!
    const id = "interrupted-fixture"
    const paths = queuePaths(state)
    const ticket: QueueTicket = {
      id,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      status: "running",
      preset: "noop",
      cwd: project,
      branch: "HEAD-detached",
      headSha: "unknown",
      requestedBy: "test",
      command: "node fixture",
      logPath: join(paths.logs, `${id}.log`),
      schemaVersion: 3,
      argv: [process.execPath, "-e", "process.exit(0)"],
      flags: {},
      executionDeadline: initialExecutionDeadline(undefined),
      workerPid: 999_999,
      childPid: child.pid,
      processGroupIdentity: identity,
      projectId: "fixture-project",
      projectName: "Fixture project",
    }
    atomicWriteJson(paths.running, ticket)

    const reconciliation = await reconcileInterruptedJob(state)
    expect(reconciliation.state).toBe("reconciled")
    expect(listHistoryJobs(state)[0]).toMatchObject({ id, status: "interrupted" })
    expect(readRunningJob(state)).toBeUndefined()
  }, 15_000)
})

describe("ticket compatibility", () => {
  const base = (): QueueTicket => ({
    id: "compat-ticket",
    createdAt: new Date().toISOString(),
    status: "queued",
    preset: "smoke",
    cwd: process.cwd(),
    branch: "HEAD-detached",
    headSha: "unknown",
    requestedBy: "test",
    command: "node -e process.exit(0)",
    logPath: join(tmpdir(), "compat-ticket.log"),
  })

  it("accepts legacy v1 command tickets, v2 argv tickets and validates v3 deadlines", () => {
    const v1 = parseTicket(base())
    expect(v1).toMatchObject({ argv: ["node", "-e", "process.exit(0)"] })

    const v2 = parseTicket({ ...base(), schemaVersion: 2, argv: [process.execPath, "-e", "process.exit(0)"], flags: {} })
    expect(v2).toMatchObject({ argv: [process.execPath, "-e", "process.exit(0)"] })

    const v3 = parseTicket({ ...base(), schemaVersion: 3, argv: [process.execPath, "-e", "process.exit(0)"], flags: { executionTimeoutMs: 100 }, executionDeadline: initialExecutionDeadline(100) })
    expect(v3).toMatchObject({ argv: [process.execPath, "-e", "process.exit(0)"] })

    const invalid = parseTicket({ ...base(), schemaVersion: 3, argv: [process.execPath], flags: { executionTimeoutMs: 100 }, executionDeadline: { state: "disabled" } })
    expect(invalid).toMatchObject({ rejectReason: expect.stringContaining("coerente") })
  })
})

describe("CLI JSON v1", () => {
  it("accepts a consumer-provided argv without rerouting it through project configuration", async () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-adapter-project-"))
    const state = mkdtempSync(join(tmpdir(), "ci-queue-adapter-state-"))
    cleanup.push(project, state)
    const enqueued = await runCli([
      "enqueue",
      "--recipe", "consumer-smoke",
      "--argv-json", JSON.stringify([process.execPath, "-e", "process.exit(0)"]),
      "--project-id", "consumer-project",
      "--project-name", "Consumer project",
      "--cwd", project,
      "--state", state,
      "--json",
    ])
    expect(enqueued).toMatchObject({ apiVersion: 1, ok: true })
    if (!enqueued.ok) throw new Error(enqueued.error.message)
    const ticket = (enqueued.result as { ticket: QueueTicket }).ticket
    expect(ticket).toMatchObject({ preset: "consumer-smoke", projectId: "consumer-project", argv: [process.execPath, "-e", "process.exit(0)"] })

    const ran = await runCli(["worker", "--state", state, "--json"])
    expect(ran).toMatchObject({ apiVersion: 1, ok: true })
    const status = await runCli(["status", "--state", state, "--json"])
    expect(status).toMatchObject({ apiVersion: 1, ok: true, result: { latest: { id: ticket.id, status: "passed" } } })
  })
})
