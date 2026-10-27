import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import type { FinalizationRecord, FinalizationSpec, QueueTicket } from "../../src/contracts/schema.js"

// The queue's own writes go through atomicWriteJson; a full volume makes them fail with ENOSPC.
const disk = vi.hoisted(() => ({ full: (_path: string) => false }))
vi.mock("../../src/core/state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/state.js")>()
  return {
    ...actual,
    atomicWriteJson: (path: string, value: unknown) => {
      if (disk.full(path)) throw Object.assign(new Error(`ENOSPC: no space left on device, write '${path}'`), { code: "ENOSPC" })
      return actual.atomicWriteJson(path, value)
    },
  }
})

const { executionCompletion } = await import("../../src/core/completion.js")
const { enqueueExplicitTicket } = await import("../../src/core/enqueue.js")
const { historyPath, listQueuedJobs, readJsonFile, readRunningJob } = await import("../../src/core/state.js")
const { runWorker } = await import("../../src/core/worker.js")

const roots: string[] = []
afterEach(() => {
  disk.full = () => false
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "queue-disk-full-"))
  roots.push(root)
  const cwd = join(root, "project")
  mkdirSync(cwd)
  return { cwd, state: join(root, "queue") }
}

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const node = (code: string) => [process.execPath, "-e", code]
const hook = (code: string): FinalizationSpec => ({ schemaVersion: 1, argv: node(code), timeoutMs: 2_000, contract: {}, contractDigest: sha256("{}") })
const record = (state: string, id: string) => readJsonFile<FinalizationRecord>(join(state, "state", "finalization", `${id}.json`))
const terminal = (state: string, id: string) => readJsonFile<QueueTicket>(historyPath(state, id))

function enqueue(f: ReturnType<typeof fixture>, code: string, finalization?: FinalizationSpec, offset = 0) {
  return enqueueExplicitTicket({ recipe: "fixture", argv: node(code), cwd: f.cwd, stateRoot: f.state, projectId: "fixture", projectName: "Fixture", finalization, now: new Date(1_700_000_000_000 + offset) })
}

function completion(state: string, id: string) {
  const path = historyPath(state, id)
  return executionCompletion(JSON.parse(readFileSync(path, "utf8")) as QueueTicket, record(state, id), sha256(readFileSync(path)))
}

describe("full disk during mandatory results", () => {
  it("never turns green when the queue cannot hand the result contract to its hook, and the next job runs", async () => {
    const f = fixture()
    const first = enqueue(f, "process.exit(0)", hook("process.exit(0)"))
    const second = enqueue(f, "process.exit(0)", undefined, 1)
    disk.full = path => path.endsWith(`${first.id}.input.json`)

    const report = await runWorker(f.state)

    expect(report.processed).toEqual([first.id, second.id])
    expect(record(f.state, first.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("ENOSPC") })
    expect(completion(f.state, first.id)).toMatchObject({ state: "failed", eligible: false })
    expect(terminal(f.state, second.id)).toMatchObject({ status: "passed" })
  })

  it("never turns green when the hook cannot write its result, and the next job runs", async () => {
    const f = fixture()
    const first = enqueue(f, "process.exit(0)", hook("console.error(\"ENOSPC: no space left on device\"); process.exit(28)"))
    const second = enqueue(f, "process.exit(0)", undefined, 1)

    const report = await runWorker(f.state)

    expect(report.processed).toEqual([first.id, second.id])
    expect(record(f.state, first.id)).toMatchObject({ phase: "failed", failureReason: "finalização terminou com código 28" })
    expect(completion(f.state, first.id)).toMatchObject({ state: "failed", eligible: false })
    expect(terminal(f.state, second.id)).toMatchObject({ status: "passed" })
  })

  it("keeps an unrecorded verdict out of history and resumes the queue once space returns", async () => {
    const f = fixture()
    const first = enqueue(f, "process.exit(1)")
    const second = enqueue(f, "process.exit(0)", undefined, 1)
    disk.full = path => path === historyPath(f.state, first.id)

    await expect(runWorker(f.state)).rejects.toThrow(/ENOSPC/)
    // Nothing reads as finished: the verdict waits in the reservation, the next job stays queued.
    expect(terminal(f.state, first.id)).toBeUndefined()
    expect(readRunningJob(f.state)).toMatchObject({ id: first.id, status: "failed", exitCode: 1 })
    expect(listQueuedJobs(f.state).map(job => job.id)).toEqual([second.id])

    disk.full = () => false
    const report = await runWorker(f.state)

    expect(report.reconciliation).toBe("reconciled")
    expect(report.processed).toEqual([second.id])
    expect(terminal(f.state, first.id)).toMatchObject({ status: "failed", exitCode: 1 })
    expect(terminal(f.state, second.id)).toMatchObject({ status: "passed" })
    expect(readRunningJob(f.state)).toBeUndefined()
  })
})
