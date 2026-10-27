import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, onTestFinished } from "vitest"

import { runCli } from "../../src/cli.js"
import type { JobProgress, QueueTicket } from "../../src/contracts/schema.js"
import { enqueueTicket } from "../../src/core/enqueue.js"
import { pauseEligibility, pauseRunningJob, resumeRunningJob, runningLeafLabels } from "../../src/core/pause.js"
import type { TreeProcess } from "../../src/core/process.js"
import { readProgressSnapshot } from "../../src/core/progress.js"
import { cancelQueuedOrRunningTicket } from "../../src/core/runner.js"
import { listHistoryJobs, readRunningJob } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(presets: Record<string, object>): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-pause-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-pause-state-"))
  cleanup.push(project, state)
  writeFileSync(join(project, "ci-queue.json"), `${JSON.stringify({ schemaVersion: 1, project: { id: "pause-fixture", name: "Pause fixture" }, presets }, null, 2)}\n`)
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
const ticks = (project: string, name = "ticks") => {
  try { return Number(readFileSync(join(project, name), "utf8")) } catch { return 0 }
}

/** A recipe step that only advances while its process runs: each 50 ms tick is one unit of work. */
function stepScript(label: string, target: number, extra: string[] = []): string {
  return [
    "const fs = require('node:fs')",
    `const mark = (status) => console.log(['@@ci-queue-progress', '1', 'node', 'step', '-', 'stage', status, '-', ${JSON.stringify(label)}].join('\\t'))`,
    ...extra,
    "mark('running')",
    "let count = 0",
    `const timer = setInterval(() => { count += 1; fs.writeFileSync('ticks', String(count)); if (count >= ${target}) { clearInterval(timer); mark('passed'); process.exit(0) } }, 50)`,
  ].join("; ")
}

const progressRunning = (state: string, id: string) =>
  readProgressSnapshot(state, id)?.nodes.some(node => node.status === "running") === true

function node(id: string, label: string, status: "running" | "passed", parentId: string | null = null) {
  return { id, parentId, kind: "stage", status, label } as unknown as JobProgress["nodes"][number]
}

const row = (command: string): TreeProcess => ({ pid: 10, ppid: 1, pgid: 10, stat: "S", startedAt: "Mon Oct 26 22:15:47 2026", command })

describe("pause eligibility", () => {
  const ticket = (safe?: string[]) => ({ flags: safe ? { pauseSafeNodes: safe } : {} }) as unknown as QueueTicket
  const progress = { nodes: [node("smoke", "Smoke", "running"), node("tc", "Typecheck", "running", "smoke"), node("lint", "Lint", "passed", "smoke")] } as unknown as JobProgress

  it("reads only the running leaves, never their running parents", () => {
    expect(runningLeafLabels(progress)).toEqual(["Typecheck"])
  })

  it.each([
    { scenario: "the recipe declares no safe step", safe: undefined, tree: [row("node")], reason: "não declara" },
    { scenario: "the running step is not declared safe", safe: ["Lint"], tree: [row("node")], reason: "Typecheck" },
    { scenario: "the process tree cannot be read", safe: ["Typecheck"], tree: undefined, reason: "árvore" },
    { scenario: "git is running in the tree", safe: ["Typecheck"], tree: [row("node"), row("git")], reason: "git" },
    { scenario: "a git helper is running in the tree", safe: ["Typecheck"], tree: [row("node"), row("git-remote-https")], reason: "git" },
  ])("refuses when $scenario", ({ safe, tree, reason }) => {
    const result = pauseEligibility(ticket(safe), progress, tree)
    expect(result).toMatchObject({ eligible: false, reason: expect.stringContaining(reason) })
  })

  it("refuses when nothing runs and accepts a declared safe step", () => {
    expect(pauseEligibility(ticket(["Typecheck"]), { nodes: [] } as unknown as JobProgress, [row("node")]).eligible).toBe(false)
    expect(pauseEligibility(ticket(["Typecheck"]), progress, [row("node")])).toEqual({ eligible: true })
  })
})

describe("manual pause and resume", () => {
  it("freezes the job, keeps its deadline for active time and reports active duration", async () => {
    const { project, state } = fixture({
      typecheck: { argv: [process.execPath, "-e", stepScript("Typecheck", 20)], progress: true, pauseSafeNodes: ["Typecheck"], executionTimeoutMs: 3_000 },
    })
    const ticket = enqueueTicket({ preset: "typecheck", cwd: project, stateRoot: state })
    const worker = runWorker(state)
    await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity) && progressRunning(state, ticket.id) && ticks(project) > 0)
    const armedAt = Date.parse((readRunningJob(state)?.executionDeadline as { expiresAt: string }).expiresAt)

    const paused = await runCli(["pause", ticket.id, "--reason", "disco cheio no teste", "--state", state, "--json"])
    expect(paused).toMatchObject({ ok: true, result: { kind: "paused" } })
    const frozenAt = ticks(project)
    await sleep(2_500)
    expect(ticks(project) - frozenAt).toBeLessThanOrEqual(1)
    expect(readRunningJob(state)?.pause).toMatchObject({ state: "paused", windows: [{ source: "manual", reason: "disco cheio no teste" }] })
    // The guard cannot lift a manual pause.
    expect((await resumeRunningJob(state, ticket.id, { source: "auto" })).kind).toBe("refused")

    const resumed = await runCli(["resume", ticket.id, "--state", state, "--json"])
    expect(resumed).toMatchObject({ ok: true, result: { kind: "resumed" } })
    const shifted = Date.parse((readRunningJob(state)?.executionDeadline as { expiresAt: string }).expiresAt)
    expect(shifted - armedAt).toBeGreaterThanOrEqual(2_400)
    await worker

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed", executionDeadline: { state: "completed" } })
    expect(terminal.pause).toMatchObject({ state: "running", frozen: [], windows: [{ source: "manual", resumedBy: "manual" }] })
    expect(terminal.pause!.pausedMsTotal).toBeGreaterThanOrEqual(2_400)
    const wall = Date.parse(terminal.finishedAt!) - Date.parse(terminal.startedAt!)
    expect(terminal.durationMs).toBe(wall - terminal.pause!.pausedMsTotal)
    expect(readFileSync(terminal.logPath, "utf8")).toMatch(/pausa \(manual\)[\s\S]*retomada \(manual\)/)
  }, 20_000)

  it("refuses a step the recipe did not declare safe", async () => {
    const { project, state } = fixture({
      jest: { argv: [process.execPath, "-e", stepScript("Jest", 30)], progress: true, pauseSafeNodes: ["Typecheck"] },
      plain: { argv: [process.execPath, "-e", stepScript("Typecheck", 30)], progress: true },
    })
    const jest = enqueueTicket({ preset: "jest", cwd: project, stateRoot: state })
    const plain = enqueueTicket({ preset: "plain", cwd: project, stateRoot: state })
    const worker = runWorker(state)

    await waitFor(() => readRunningJob(state)?.id === jest.id && Boolean(readRunningJob(state)?.processGroupIdentity) && progressRunning(state, jest.id))
    expect(await runCli(["pause", jest.id, "--reason", "teste", "--state", state, "--json"]))
      .toMatchObject({ ok: false, error: { code: "PAUSE_REFUSED", message: expect.stringContaining("Jest") } })
    await waitFor(() => readRunningJob(state)?.id === plain.id && Boolean(readRunningJob(state)?.processGroupIdentity) && progressRunning(state, plain.id))
    expect(await runCli(["pause", plain.id, "--reason", "teste", "--state", state, "--json"]))
      .toMatchObject({ ok: false, error: { code: "PAUSE_REFUSED", message: expect.stringContaining("não declara") } })
    await worker

    expect(listHistoryJobs(state).map(job => [job.id, job.status, job.pause])).toEqual(expect.arrayContaining([
      [jest.id, "passed", undefined],
      [plain.id, "passed", undefined],
    ]))
  }, 20_000)

  it("freezes a descendant that left the process group and thaws it on resume", async () => {
    const child = "const fs = require('node:fs'); let n = 0; setInterval(() => { n += 1; fs.writeFileSync('child-ticks', String(n)); if (n >= 200) process.exit(0) }, 50)"
    const { project, state } = fixture({
      escaped: {
        argv: [process.execPath, "-e", stepScript("Typecheck", 40, [
          `const escaped = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], { detached: true, stdio: 'ignore' })`,
          "fs.writeFileSync('child.pid', String(escaped.pid))",
          "escaped.unref()",
        ])],
        progress: true,
        pauseSafeNodes: ["Typecheck"],
      },
    })
    const ticket = enqueueTicket({ preset: "escaped", cwd: project, stateRoot: state })
    const worker = runWorker(state)
    await waitFor(() => existsSync(join(project, "child.pid")) && ticks(project, "child-ticks") > 0 && progressRunning(state, ticket.id) && Boolean(readRunningJob(state)?.processGroupIdentity))
    const escapedPid = Number(readFileSync(join(project, "child.pid"), "utf8"))
    onTestFinished(() => { try { process.kill(escapedPid, "SIGKILL") } catch { /* already gone */ } })

    expect((await pauseRunningJob(state, ticket.id, { reason: "teste", source: "manual" })).kind).toBe("paused")
    expect(readRunningJob(state)?.pause?.frozen.map(item => item.pid)).toContain(escapedPid)
    const before = { leader: ticks(project), child: ticks(project, "child-ticks") }
    await sleep(600)
    expect(ticks(project) - before.leader).toBeLessThanOrEqual(1)
    expect(ticks(project, "child-ticks") - before.child).toBeLessThanOrEqual(1)

    expect((await resumeRunningJob(state, ticket.id, { source: "manual" })).kind).toBe("resumed")
    const resumedChild = ticks(project, "child-ticks")
    await waitFor(() => ticks(project, "child-ticks") > resumedChild + 2)
    await worker
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed", pause: { state: "running", frozen: [] } })
  }, 20_000)

  it("thaws a paused job before cancelling it so its cleanup trap runs", async () => {
    const { project, state } = fixture({
      trapped: {
        argv: [process.execPath, "-e", stepScript("Typecheck", 400, [
          "process.on('SIGTERM', () => { fs.writeFileSync('trapped', 'yes'); process.exit(143) })",
        ])],
        progress: true,
        pauseSafeNodes: ["Typecheck"],
      },
    })
    const ticket = enqueueTicket({ preset: "trapped", cwd: project, stateRoot: state })
    const worker = runWorker(state)
    await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity) && progressRunning(state, ticket.id) && ticks(project) > 0)
    expect((await pauseRunningJob(state, ticket.id, { reason: "teste", source: "manual" })).kind).toBe("paused")

    expect((await cancelQueuedOrRunningTicket(state, ticket.id)).kind).toBe("running")
    await worker

    expect(readFileSync(join(project, "trapped"), "utf8")).toBe("yes")
    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "cancelled", pause: { state: "running", frozen: [] } })
    // The window still open at the finish closes there and counts as paused time.
    expect(terminal.pause!.windows[0].resumedAt).toBe(terminal.finishedAt)
  }, 20_000)
})
