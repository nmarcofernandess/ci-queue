import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { runCli } from "../../src/cli.js"
import { diskGuardLogPath, DiskGuardMonitor, writeDiskGuardMode, type DiskGuardPolicy } from "../../src/core/disk-guard.js"
import type { DiskGuardHooks } from "../../src/core/disk-guard-runtime.js"
import { enqueueTicket } from "../../src/core/enqueue.js"
import { readProgressSnapshot } from "../../src/core/progress.js"
import { listHistoryJobs, listQueuedJobs, readRunningJob } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(presets: Record<string, object>): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-disk-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-disk-state-"))
  cleanup.push(project, state)
  writeFileSync(join(project, "ci-queue.json"), `${JSON.stringify({ schemaVersion: 1, project: { id: "disk-fixture", name: "Disk fixture" }, presets }, null, 2)}\n`)
  return { project, state }
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error("tempo esgotado aguardando condição")
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const ticks = (project: string) => {
  try { return Number(readFileSync(join(project, "ticks"), "utf8")) } catch { return 0 }
}
const guardLog = (state: string) => {
  try { return readFileSync(diskGuardLogPath(state), "utf8") } catch { return "" }
}

function stepScript(label: string, target: number): string {
  return [
    "const fs = require('node:fs')",
    `const mark = (status) => console.log(['@@ci-queue-progress', '1', 'node', 'step', '-', 'stage', status, '-', ${JSON.stringify(label)}].join('\\t'))`,
    "mark('running')",
    "let count = 0",
    `const timer = setInterval(() => { count += 1; fs.writeFileSync('ticks', String(count)); if (count >= ${target}) { clearInterval(timer); mark('passed'); process.exit(0) } }, 50)`,
  ].join("; ")
}

const started = (state: string, id: string) => {
  const running = readRunningJob(state)
  return running?.id === id && Boolean(running.processGroupIdentity)
    && readProgressSnapshot(state, id)?.nodes.some(node => node.status === "running") === true
}

// Bytes stand for the real floors: critical < 100, low < 1000, release > 400.
const policy: DiskGuardPolicy = { warnBelowBytes: 1_000, holdBelowBytes: 100, holdAfterMs: 0, resumeAboveBytes: 400, resumeAfterMs: 0, sampleEveryMs: 50 }

describe("disk guard monitor", () => {
  it("holds only after the low floor lasts and releases only above the higher floor", () => {
    const monitor = new DiskGuardMonitor({ ...policy, holdAfterMs: 20, resumeAfterMs: 60, sampleEveryMs: 5 })
    expect(monitor.sample(2_000, 0)).toEqual({ freeBytes: 2_000, level: "ok", holding: false })
    expect(monitor.sample(500, 5)).toEqual({ freeBytes: 500, level: "low", holding: false })
    expect(monitor.sample(50, 10)).toMatchObject({ level: "critical", holding: false })
    expect(monitor.sample(50, 29)).toMatchObject({ holding: false })
    expect(monitor.sample(50, 30)).toMatchObject({ holding: true, change: "hold" })
    // Between the two floors a hold stays as it is.
    expect(monitor.sample(300, 200)).toMatchObject({ level: "low", holding: true })
    expect(monitor.sample(500, 210)).toMatchObject({ holding: true })
    // Dropping back resets the release timer.
    expect(monitor.sample(300, 260)).toMatchObject({ holding: true })
    expect(monitor.sample(500, 270)).toMatchObject({ holding: true })
    expect(monitor.sample(500, 329)).toMatchObject({ holding: true })
    expect(monitor.sample(500, 330)).toMatchObject({ holding: false, change: "release" })
  })
})

describe("disk guard in the worker", () => {
  it("keeps the next job queued while enforcing a full disk and starts it after release", async () => {
    const { project, state } = fixture({ quick: { argv: [process.execPath, "-e", "process.exit(0)"] } })
    const ticket = enqueueTicket({ preset: "quick", cwd: project, stateRoot: state })
    writeDiskGuardMode(state, "enforce")
    let free = 50
    let clock = 0
    let sleeps = 0
    const queuedDuringHold: number[] = []
    const hooks: DiskGuardHooks = {
      policy: { ...policy, holdAfterMs: 20, resumeAfterMs: 60, sampleEveryMs: 10 },
      readFreeBytes: () => free,
      nowMs: () => clock,
      sleep: async ms => {
        clock += ms
        sleeps += 1
        queuedDuringHold.push(listQueuedJobs(state).length + listHistoryJobs(state).length * 10)
        if (sleeps === 5) free = 500
      },
    }

    const report = await runWorker(state, { diskGuard: hooks })

    expect(report.processed).toEqual([ticket.id])
    // Every wait saw the job still queued and nothing finished.
    expect(queuedDuringHold.length).toBeGreaterThanOrEqual(10)
    expect(new Set(queuedDuringHold)).toEqual(new Set([1]))
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed" })
    expect(guardLog(state)).toMatch(/enforce: fila retida; os jobs continuam enfileirados[\s\S]*enforce: fila liberada/)
  }, 15_000)

  it("only records what it would do while observing", async () => {
    const { project, state } = fixture({
      typecheck: { argv: [process.execPath, "-e", stepScript("Typecheck", 20)], progress: true, pauseSafeNodes: ["Typecheck"] },
    })
    const ticket = enqueueTicket({ preset: "typecheck", cwd: project, stateRoot: state })

    await runWorker(state, { diskGuard: { policy, readFreeBytes: () => 50 } })

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed" })
    expect(terminal.pause).toBeUndefined()
    expect(terminal.resourceEvents?.map(event => [event.kind, event.mode])).toEqual(expect.arrayContaining([
      ["disk-critical", "observe"],
      ["would-pause", "observe"],
    ]))
    expect(guardLog(state)).toContain("observação: a fila teria retido o próximo job")
    expect(guardLog(state)).toContain(`observação: o job ${ticket.id} teria sido pausado`)
  }, 15_000)

  it("pauses an eligible job below the floor and resumes it when space returns", async () => {
    const { project, state } = fixture({
      typecheck: { argv: [process.execPath, "-e", stepScript("Typecheck", 30)], progress: true, pauseSafeNodes: ["Typecheck"] },
    })
    const ticket = enqueueTicket({ preset: "typecheck", cwd: project, stateRoot: state })
    writeDiskGuardMode(state, "enforce")
    let free = 500
    const worker = runWorker(state, { diskGuard: { policy, readFreeBytes: () => free } })
    await waitFor(() => started(state, ticket.id) && ticks(project) > 0)

    free = 50
    await waitFor(() => readRunningJob(state)?.pause?.state === "paused")
    const frozenAt = ticks(project)
    await sleep(400)
    expect(ticks(project) - frozenAt).toBeLessThanOrEqual(1)
    free = 500
    await worker

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed", pause: { state: "running", windows: [{ source: "auto", resumedBy: "auto" }] } })
    expect(terminal.resourceEvents?.map(event => event.kind)).toEqual(expect.arrayContaining(["disk-critical", "paused", "disk-recovered", "resumed"]))
    expect(guardLog(state)).toContain(`enforce: job ${ticket.id} pausado`)
  }, 15_000)

  it("lets an ineligible job continue with an alert", async () => {
    const { project, state } = fixture({
      jest: { argv: [process.execPath, "-e", stepScript("Jest", 20)], progress: true, pauseSafeNodes: ["Typecheck"] },
    })
    const ticket = enqueueTicket({ preset: "jest", cwd: project, stateRoot: state })
    writeDiskGuardMode(state, "enforce")
    let free = 500
    const worker = runWorker(state, { diskGuard: { policy, readFreeBytes: () => free } })
    await waitFor(() => started(state, ticket.id))
    free = 50
    await worker

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed" })
    expect(terminal.pause).toBeUndefined()
    expect(terminal.resourceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "not-eligible", mode: "enforce", detail: expect.stringContaining("Jest") }),
    ]))
    expect(guardLog(state)).toContain(`enforce: job ${ticket.id} segue com alerta`)
  }, 15_000)
})

describe("disk guard command", () => {
  it("starts observing, switches mode and rejects unknown modes", async () => {
    const state = mkdtempSync(join(tmpdir(), "ci-queue-disk-cli-"))
    cleanup.push(state)
    expect(await runCli(["disk-guard", "--state", state, "--json"])).toMatchObject({ ok: true, result: { mode: "observe" } })
    expect(await runCli(["disk-guard", "enforce", "--state", state, "--json"])).toMatchObject({ ok: true, result: { mode: "enforce" } })
    expect(await runCli(["status", "--state", state, "--json"])).toMatchObject({ ok: true, result: { diskGuard: { mode: "enforce" } } })
    expect(await runCli(["disk-guard", "always", "--state", state, "--json"])).toMatchObject({ ok: false, error: { code: "USAGE" } })
  })
})
