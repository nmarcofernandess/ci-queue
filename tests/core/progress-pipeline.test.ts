import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { enqueueTicket } from "../../src/core/enqueue.js"
import { progressPath, ensureQueueDirs, listHistoryJobs, queuePaths, acquireDirectoryLock } from "../../src/core/state.js"
import { closeRunningTicket } from "../../src/core/runner.js"
import { writeProgressSnapshot } from "../../src/core/progress.js"
import { runWorker } from "../../src/core/worker.js"
import { runCli } from "../../src/cli.js"
import type { QueueTicket } from "../../src/contracts/schema.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(
  presets: Record<string, object>,
  options: { artifacts?: string[] } = {},
): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  writeFileSync(
    join(project, "ci-queue.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      project: { id: "fixture-project", name: "Fixture project" },
      presets,
      ...(options.artifacts ? { artifacts: options.artifacts } : {}),
    }, null, 2)}\n`,
  )
  return { project, state }
}

describe("progress pipeline R01/R04/R06", () => {
  it("emitter → runner → history keeps measured durations and drops sidecar after publish", async () => {
    const { project, state } = fixture({
      emit: { argv: [process.execPath, "emit-progress.mjs"], progress: true },
    })
    writeFileSync(
      join(project, "emit-progress.mjs"),
      [
        "const line = (id, status, duration, label) =>",
        '  ["@@ci-queue-progress", "1", "node", id, "-", "gate", status, duration, label].join("\\t");',
        'process.stdout.write(line("g1", "running", "-", "Gate") + "\\n");',
        "await new Promise((r) => setTimeout(r, 40));",
        'process.stdout.write(line("g1", "passed", "123", "Gate") + "\\n");',
      ].join("\n"),
    )
    const ticket = enqueueTicket({ preset: "emit", cwd: project, stateRoot: state })
    await runWorker(state)
    const history = listHistoryJobs(state)[0]
    expect(history).toMatchObject({ id: ticket.id, status: "passed" })
    expect(history.progress?.nodes?.find((n) => n.id === "g1")).toMatchObject({
      durationMs: 123,
      durationSource: "emitter",
    })
    expect(existsSync(progressPath(state, ticket.id))).toBe(false)
  })

  it("measures artifacts copy as running→terminal on the same collector", async () => {
    const { project, state } = fixture(
      {
        withArt: {
          argv: [process.execPath, "make-artifact.mjs"],
          progress: true,
        },
      },
      { artifacts: ["test-results"] },
    )
    writeFileSync(
      join(project, "make-artifact.mjs"),
      [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'mkdirSync("test-results", { recursive: true });',
        'writeFileSync("test-results/result.txt", "ok");',
      ].join("\n"),
    )
    const ticket = enqueueTicket({ preset: "withArt", cwd: project, stateRoot: state })
    await runWorker(state)
    const history = listHistoryJobs(state)[0]
    expect(history.id).toBe(ticket.id)
    const artifacts = history.progress?.nodes?.find((n) => n.id === "artifacts")
    expect(artifacts).toMatchObject({ status: "passed", durationSource: "collector" })
    expect(typeof artifacts?.durationMs).toBe("number")
    expect(artifacts!.durationMs!).toBeGreaterThanOrEqual(0)
    expect(artifacts).not.toHaveProperty("durationUnavailableReason")
  })

  it("keeps sidecar when closeRunningTicket cannot take the lock", async () => {
    const state = mkdtempSync(join(tmpdir(), "ci-queue-lock-"))
    cleanup.push(state)
    ensureQueueDirs(state)
    const id = "20260917120000-aaaaaaaa"
    writeProgressSnapshot(state, id, {
      schema: 1,
      updatedAt: "2026-09-17T12:00:00.000Z",
      nodes: [{ id: "g1", label: "G", status: "passed", durationMs: 9, durationSource: "emitter" }],
    })
    expect(existsSync(progressPath(state, id))).toBe(true)
    const lockPath = join(queuePaths(state).jobLocks, `${basename(id)}.state`)
    const held = acquireDirectoryLock(lockPath)
    expect(held).toBeTruthy()
    try {
      const candidate = {
        id,
        preset: "x",
        status: "passed",
        createdAt: "2026-09-17T12:00:00.000Z",
        finishedAt: "2026-09-17T12:00:01.000Z",
        exitCode: 0,
        cwd: state,
        branch: "main",
        headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        requestedBy: "test",
        argv: ["true"],
        command: "true",
        logPath: join(state, "logs", `${id}.log`),
        progress: {
          schema: 1,
          updatedAt: "2026-09-17T12:00:00.000Z",
          nodes: [{ id: "g1", label: "G", status: "passed", durationMs: 9, durationSource: "emitter" }],
        },
      } as QueueTicket
      const result = await closeRunningTicket(state, candidate)
      expect(result.authoritative).toBe(false)
      expect(existsSync(progressPath(state, id))).toBe(true)
      expect(existsSync(join(queuePaths(state).history, `${id}.json`))).toBe(false)
    } finally {
      held?.release()
    }
  }, 15_000)

  it("D15/D19: history keeps memory progress if sidecar unwritable; CLI echoes tuple", async () => {
    const { project, state } = fixture({
      emit: { argv: [process.execPath, "emit-progress.mjs"], progress: true },
    })
    writeFileSync(
      join(project, "emit-progress.mjs"),
      [
        "const line = (id, status, duration, label) =>",
        '  ["@@ci-queue-progress", "1", "node", id, "-", "gate", status, duration, label].join("\\t");',
        'process.stdout.write(line("g1", "running", "-", "Gate") + "\\n");',
        "await new Promise((r) => setTimeout(r, 20));",
        'process.stdout.write(line("g1", "passed", "55", "Gate") + "\\n");',
      ].join("\n"),
    )
    ensureQueueDirs(state)
    const progressDir = queuePaths(state).progress
    chmodSync(progressDir, 0o555)
    try {
      const ticket = enqueueTicket({ preset: "emit", cwd: project, stateRoot: state })
      await runWorker(state)
      const history = listHistoryJobs(state)[0]
      expect(history).toMatchObject({ id: ticket.id, status: "passed" })
      expect(history.progress?.nodes?.find((n) => n.id === "g1")).toMatchObject({
        durationMs: 55,
        durationSource: "emitter",
      })
      const cli = await runCli(["history", "--state", state, "--json"])
      expect(cli).toMatchObject({ ok: true })
      if (!cli.ok) throw new Error(cli.error.message)
      const jobs = (cli.result as { jobs: Array<{ id: string; progress?: { nodes: Array<Record<string, unknown>> } }> }).jobs
      const job = jobs.find((j) => j.id === ticket.id)
      const node = job?.progress?.nodes?.find((n) => n.id === "g1")
      expect(node).toMatchObject({ durationMs: 55, durationSource: "emitter" })
    } finally {
      chmodSync(progressDir, 0o755)
    }
  })
})
