import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type { FinalizationRecord, FinalizationSpec, QueueTicket, WorkerIdentity } from "../../src/contracts/schema.js"
import { enqueueExplicitTicket } from "../../src/core/enqueue.js"
import { cancelQueuedOrRunningTicket, closeRunningTicket } from "../../src/core/runner.js"
import { reconcileFinalizations } from "../../src/core/finalization.js"
import { probeProcessGroupIdentity, probeWorkerIdentity, terminateVerifiedProcessGroup } from "../../src/core/process.js"
import { atomicWriteJson, historyPath, jobPath, queuePaths, readJsonFile, readRunningJob } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const roots: string[] = []
const children: ChildProcess[] = []
afterEach(async () => {
  // These handles belong to this fixture; never search/signall by a guessed PID.
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL")
    await new Promise<void>(resolve => child.once("close", () => resolve()))
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "queue-finalization-"))
  roots.push(root)
  const cwd = join(root, "project")
  mkdirSync(cwd)
  return { root, cwd, state: join(root, "queue"), events: join(root, "events"), hashes: join(root, "hashes") }
}

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
const recordPath = (state: string, id: string) => join(state, "state", "finalization", `${id}.json`)
const record = (state: string, id: string) => readJsonFile<FinalizationRecord>(recordPath(state, id))
const node = (code: string) => [process.execPath, "-e", code]
const writeResult = (cleanup = "confirmed") => `const result = {schemaVersion:1,cleanup:${JSON.stringify(cleanup)},outputs:[]}; fs.writeFileSync(input.resultPath+'.tmp', JSON.stringify(result)); fs.renameSync(input.resultPath+'.tmp', input.resultPath)`
const readInput = 'const fs=require("node:fs"); const input=JSON.parse(fs.readFileSync(process.env.CI_QUEUE_FINALIZATION_INPUT,"utf8"))'

function hook(code: string, timeoutMs = 2_000): FinalizationSpec {
  return { schemaVersion: 1, argv: node(code), timeoutMs, contract: {}, contractDigest: sha256("{}") }
}

function enqueue(f: ReturnType<typeof fixture>, code: string, finalization?: FinalizationSpec, flags?: QueueTicket["flags"], offset = 0) {
  return enqueueExplicitTicket({ recipe: "fixture", argv: node(code), cwd: f.cwd, stateRoot: f.state, projectId: "fixture", projectName: "Fixture", finalization, flags, now: new Date(1_700_000_000_000 + offset) })
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000) {
  const until = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= until) throw new Error("fixture condition timed out")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe("post-terminal finalization", () => {
  it("publishes after immutable Git postflight and before the next job", async () => {
    const f = fixture()
    writeFileSync(join(f.cwd, "source"), "original")
    const git = (args: string[]) => execFileSync("git", args, { cwd: f.cwd, stdio: "pipe" })
    git(["init"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"])
    git(["add", "source"]); git(["commit", "-m", "fixture"])
    const first = enqueue(f, `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test\\n')`, hook([
      readInput,
      'const terminalBytes=fs.readFileSync(input.ticketPath); const terminal=JSON.parse(terminalBytes)',
      'if(terminal.status!=="passed" || !terminal.postflight || terminal.postflight.statusShort!=="") process.exit(9)',
      `fs.appendFileSync(${JSON.stringify(f.events)},'terminal-visible\\nfinalizer\\n')`,
      `fs.writeFileSync(${JSON.stringify(f.hashes)}, require('node:crypto').createHash('sha256').update(terminalBytes).digest('hex'))`,
      'fs.writeFileSync("published", "approved")',
      writeResult(),
    ].join("; ")), { requireCleanTree: true, requireGitStability: true, pinHeadSha: true })
    const second = enqueue(f, `const fs=require('node:fs'); if(!fs.existsSync('published')) process.exit(8); fs.appendFileSync(${JSON.stringify(f.events)},'second-job\\n')`, undefined, undefined, 1)

    const report = await runWorker(f.state)

    expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(["test", "terminal-visible", "finalizer", "second-job"])
    expect(sha256(readFileSync(historyPath(f.state, first.id)))).toBe(readFileSync(f.hashes, "utf8"))
    expect(readJsonFile<QueueTicket>(historyPath(f.state, second.id))?.status).toBe("passed")
    expect(record(f.state, first.id)).toMatchObject({ phase: "passed", attempt: 1, result: { cleanup: "confirmed" } })
    expect(report.processed).toEqual([first.id, second.id])
    expect(existsSync(join(f.state, "state", "finalization", `${first.id}.input.json`))).toBe(false)
    expect(existsSync(join(f.state, "state", "finalization", `${first.id}.result.json`))).toBe(false)
  })

  it.each([
    { name: "passed", code: "process.exit(0)", flags: {}, exitCode: 0, status: "passed", cleanup: "confirmed" },
    { name: "failed", code: "process.exit(7)", flags: {}, exitCode: 7, status: "failed", cleanup: "confirmed" },
    { name: "refused preflight", code: "process.exit(0)", flags: { requireGitStability: true }, exitCode: 1, status: "failed", cleanup: "not-required" },
  ])("runs cleanup for $name without replacing the test verdict", async ({ code, flags, exitCode, status, cleanup }) => {
    const f = fixture()
    const ticket = enqueue(f, code, hook(`${readInput}; ${writeResult(cleanup)}`), flags)
    await runWorker(f.state)
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status, exitCode })
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup } })
  })

  it.each([
    { name: "cleanup uncertain", code: `${readInput}; ${writeResult("uncertain")}`, reason: "cleanup" },
    { name: "missing result", code: "process.exit(0)", reason: "resultado" },
    { name: "invalid result", code: `${readInput}; fs.writeFileSync(input.resultPath, '{')`, reason: "resultado" },
    { name: "oversized result", code: `${readInput}; fs.writeFileSync(input.resultPath, ' '.repeat(65537))`, reason: "64 KiB" },
    { name: "escaping output", code: `${readInput}; fs.writeFileSync(input.resultPath, JSON.stringify({schemaVersion:1,cleanup:'confirmed',outputs:[{path:'../foreign',sha256:'a'.repeat(64),role:'proof'}]}))`, reason: "path" },
    { name: "nonzero hook", code: `${readInput}; ${writeResult()}; process.exit(4)`, reason: "código 4" },
    { name: "reported publication failure", code: `${readInput}; fs.writeFileSync(input.resultPath, JSON.stringify({schemaVersion:1,cleanup:'confirmed',outputs:[],error:'publication failed'}))`, reason: "publication failed" },
    { name: "timeout", code: "setInterval(()=>{},1000)", reason: "prazo" },
  ])("reports $name separately and releases the queue", async ({ name, code, reason }) => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(code, name === "timeout" ? 100 : 2_000))
    const next = enqueue(f, "process.exit(0)", undefined, undefined, 1)
    const report = await runWorker(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining(reason) })
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "passed", exitCode: 0 })
    expect(report.processed).toEqual([ticket.id, next.id])
  })

  it("reports spawn failure without rewriting a failed test", async () => {
    const f = fixture()
    const spec = hook("unused")
    spec.argv = [join(f.root, "missing-executable")]
    const ticket = enqueue(f, "process.exit(7)", spec)
    await runWorker(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("spawn") })
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "failed", exitCode: 7 })
  })

  it("cleans a cancelled queued test without launching its test command", async () => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'test')`, hook(`${readInput}; ${writeResult("not-required")}`))
    await cancelQueuedOrRunningTicket(f.state, ticket.id)
    await runWorker(f.state)
    expect(existsSync(f.events)).toBe(false)
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "cancelled", exitCode: null })
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup: "not-required" } })
  })

  it("binds job and hook to the actual supervisor identity", async () => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},process.env.CI_QUEUE_WORKER_IDENTITY || 'missing')`, hook(`${readInput}; fs.writeFileSync(${JSON.stringify(f.hashes)},JSON.stringify(input.workerIdentity)); ${writeResult()}`))
    await runWorker(f.state)
    const actual = readFileSync(f.events, "utf8")
    expect(actual).not.toBe("missing")
    expect(JSON.parse(actual)).toEqual(JSON.parse(readFileSync(f.hashes, "utf8")))
    expect(record(f.state, ticket.id)?.supervisorIdentity).toEqual(JSON.parse(actual))
    expect(JSON.parse(actual)).toMatchObject({ schemaVersion: 1, pid: process.pid, capabilities: expect.arrayContaining(["terminal-finalization-v1", "no-artifact-snapshots-v1"]) })
    expect(existsSync(join(f.state, "state", "worker.json"))).toBe(false)
  })

  it("refuses a hook that changes its sealed terminal source", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput}; fs.appendFileSync(input.ticketPath,' '); ${writeResult()}`))
    await runWorker(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("digest") })
  })

  it("refuses symlinks during transient cleanup and preserves their foreign target", async () => {
    const f = fixture()
    const foreign = join(f.root, "foreign-sentinel")
    writeFileSync(foreign, "preserve")
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput}; fs.unlinkSync(process.env.CI_QUEUE_FINALIZATION_INPUT); fs.symlinkSync(${JSON.stringify(foreign)},process.env.CI_QUEUE_FINALIZATION_INPUT); ${writeResult()}`))
    await runWorker(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("symlink") })
    expect(readFileSync(foreign, "utf8")).toBe("preserve")
  })

  it("runs cleanup after cancellation of the test group", async () => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'running'); setInterval(()=>{},1000)`, hook(`${readInput}; ${writeResult()}`))
    const worker = runWorker(f.state)
    try {
      await waitFor(() => Boolean(readRunningJob(f.state)?.processGroupIdentity) && existsSync(f.events))
      await cancelQueuedOrRunningTicket(f.state, ticket.id)
      await worker
      expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "cancelled", exitCode: null })
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup: "confirmed" } })
    } finally {
      const running = readRunningJob(f.state)
      if (running?.processGroupIdentity) await terminateVerifiedProcessGroup(running.processGroupIdentity)
      await worker
    }
  })

  it("does not create finalization files without a declared consumer", async () => {
    const f = fixture()
    enqueue(f, "process.exit(0)")
    await runWorker(f.state)
    expect(existsSync(join(f.state, "state", "finalization"))).toBe(false)
  })

  it("refuses a symlinked history before writing terminal bytes outside its state", async () => {
    const f = fixture()
    enqueue(f, "process.exit(0)", hook(`${readInput}; ${writeResult()}`))
    const foreign = join(f.root, "foreign-directory")
    mkdirSync(foreign)
    rmSync(queuePaths(f.state).history, { recursive: true })
    symlinkSync(foreign, queuePaths(f.state).history)
    await expect(runWorker(f.state)).rejects.toThrow("symlink")
    expect(readdirSync(foreign)).toEqual([])
  })
})

async function ownProcess(cwd: string) {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { cwd, detached: true, stdio: "ignore" })
  children.push(child)
  await waitFor(() => Boolean(child.pid && probeProcessGroupIdentity(child.pid)))
  const group = probeProcessGroupIdentity(child.pid!)!
  const worker = probeWorkerIdentity(child.pid!)!
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const closed = new Promise<void>(resolve => child.once("close", () => resolve()))
    child.kill("SIGKILL")
    await closed
  }
  return { child, group, worker, stop }
}

async function terminalFixture(f: ReturnType<typeof fixture>, spec: FinalizationSpec) {
  const ticket = enqueue(f, "process.exit(0)", spec)
  rmSync(jobPath(f.state, ticket.id))
  const terminal: QueueTicket = { ...ticket, status: "passed", exitCode: 0, finishedAt: new Date().toISOString() }
  await closeRunningTicket(f.state, terminal)
  return terminal
}

function saveRecord(f: ReturnType<typeof fixture>, ticket: QueueTicket, value: Partial<FinalizationRecord>) {
  const path = recordPath(f.state, ticket.id)
  mkdirSync(dirname(path), { recursive: true })
  atomicWriteJson(path, { schemaVersion: 1, ticketId: ticket.id, ticketDigest: existsSync(historyPath(f.state, ticket.id)) ? sha256(readFileSync(historyPath(f.state, ticket.id))) : "0".repeat(64), finalizationDigest: ticket.finalizationDigest, phase: "pending", attempt: 0, ...value })
}

describe("finalization recovery and ownership", () => {
  it.each([{ phase: "unrecognized" }, { attempt: "not-a-number" }])("blocks a malformed persisted record %j without invoking its hook", async invalid => {
    const f = fixture()
    const ticket = await terminalFixture(f, hook(`${readInput}; fs.writeFileSync(${JSON.stringify(f.events)},'hook'); ${writeResult()}`))
    atomicWriteJson(recordPath(f.state, ticket.id), { ...record(f.state, ticket.id), ...invalid })
    const recovery = await reconcileFinalizations(f.state)
    expect(recovery.blocked).toContain(ticket.id)
    expect(existsSync(f.events)).toBe(false)
  })
  it.each(["before pending", "between pending and history", "after history"])("preserves the already observed verdict after crash %s", async point => {
    const f = fixture()
    const code = `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test\\n')`
    const ticket = enqueue(f, code, hook(`${readInput}; ${writeResult()}`))
    execFileSync(process.execPath, ["-e", code], { cwd: f.cwd })
    const terminal: QueueTicket = { ...ticket, status: "passed", exitCode: 0, workerPid: 999_999, finishedAt: new Date().toISOString() }
    rmSync(jobPath(f.state, ticket.id))
    atomicWriteJson(queuePaths(f.state).running, terminal)
    if (point !== "before pending") saveRecord(f, terminal, {})
    if (point === "after history") atomicWriteJson(historyPath(f.state, ticket.id), terminal)

    const report = await runWorker(f.state)

    expect(report.reconciliation).toBe("reconciled")
    expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(["test"])
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "passed", exitCode: 0 })
    expect(readRunningJob(f.state)).toBeUndefined()
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup: "confirmed" } })
    expect(record(f.state, ticket.id)?.ticketDigest).toBe(sha256(readFileSync(historyPath(f.state, ticket.id))))
  })

  it.each([false, true])("recovers a cancelled terminal claim without rerunning it (pending=%s)", async pending => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'test')`, hook(`${readInput}; ${writeResult("not-required")}`))
    const terminal: QueueTicket = { ...ticket, status: "cancelled", exitCode: null, cancelledAt: new Date().toISOString(), finishedAt: new Date().toISOString() }
    atomicWriteJson(join(queuePaths(f.state).claims, `${ticket.id}.json`), terminal)
    if (pending) saveRecord(f, terminal, {})
    // The queued source may remain if the cancellation writer died before unlink.
    const worker = spawnWorker(f)
    try {
      await waitFor(() => Boolean(record(f.state, ticket.id)?.finishedAt), 2_000)
      expect(existsSync(f.events)).toBe(false)
      expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "cancelled", exitCode: null })
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup: "not-required" } })
      expect(existsSync(jobPath(f.state, ticket.id))).toBe(false)
      expect(readRunningJob(f.state)).toBeUndefined()
    } finally {
      if (worker.exitCode === null && worker.signalCode === null) {
        const closed = new Promise<void>(resolve => worker.once("close", () => resolve()))
        worker.kill("SIGKILL")
        await closed
      }
    }
  })

  it("replays a dead hook idempotently after publication before ACK without rerunning tests", async () => {
    const f = fixture()
    writeFileSync(join(f.cwd, "source"), "original-source")
    const originalSourceDigest = sha256("original-source")
    const ticket = enqueue(f, `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test\\n')`, hook([
      readInput,
      'const bytes=fs.readFileSync("source"); const digest=require("node:crypto").createHash("sha256").update(bytes).digest("hex")',
      'if(fs.existsSync("published") && fs.readFileSync("published","utf8")!==digest) process.exit(9)',
      'fs.writeFileSync("published",digest)',
      writeResult(),
    ].join("; ")))
    await runWorker(f.state)
    const before = sha256(readFileSync(historyPath(f.state, ticket.id)))
    const owner = await ownProcess(f.cwd)
    await owner.stop()
    saveRecord(f, ticket, { phase: "running", attempt: 1, startedAt: new Date().toISOString(), processGroupIdentity: owner.group, supervisorIdentity: owner.worker })

    const recovery = await reconcileFinalizations(f.state)

    expect(recovery).toEqual({ blocked: [], reconciled: [ticket.id] })
    expect(readFileSync(f.events, "utf8").trim().split("\n")).toHaveLength(1)
    expect(readFileSync(join(f.cwd, "published"), "utf8")).toBe(originalSourceDigest)
    expect(sha256(readFileSync(historyPath(f.state, ticket.id)))).toBe(before)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", attempt: 2 })
  })

  it.each(["alive", "PID reused", "foreign host", "missing identity"])("preserves reservation and never signals an %s process", async kind => {
    const f = fixture()
    const foreignSentinel = join(f.cwd, "foreign")
    writeFileSync(foreignSentinel, "preserve")
    const ticket = await terminalFixture(f, hook(`${readInput}; fs.writeFileSync(${JSON.stringify(foreignSentinel)},'touched'); ${writeResult()}`, 5_000))
    const foreign = await ownProcess(f.cwd)
    const owner = await ownProcess(f.cwd)
    await owner.stop()
    const identity = kind === "missing identity" ? undefined : { ...foreign.group, ...(kind === "PID reused" ? { startedAt: "different-birth" } : {}), ...(kind === "foreign host" ? { hostname: "other-host.invalid" } : {}) }
    saveRecord(f, ticket, { phase: "running", attempt: 1, startedAt: new Date().toISOString(), processGroupIdentity: identity, supervisorIdentity: owner.worker })
    const next = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.hashes)},'claimed')`, undefined, undefined, 1)

    try {
      const blocked = await reconcileFinalizations(f.state)
      expect(blocked.blocked).toContain(ticket.id)
      expect(record(f.state, ticket.id)?.failureReason).toEqual(expect.any(String))
      if (kind !== "alive") expect((await terminateVerifiedProcessGroup(identity)).terminated).toBe(false)
      const report = await runWorker(f.state)
      expect(report.reconciliation).toBe("blocked")
      expect(existsSync(jobPath(f.state, next.id))).toBe(true)
      expect(existsSync(f.hashes)).toBe(false)
      expect(readFileSync(foreignSentinel, "utf8")).toBe("preserve")
      expect(foreign.child.signalCode).toBeNull()
    } finally { await foreign.stop() }
  })

  it("fails closed on changed terminal bytes after an attempt started", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput}; ${writeResult()}`))
    await runWorker(f.state)
    writeFileSync(historyPath(f.state, ticket.id), readFileSync(historyPath(f.state, ticket.id), "utf8") + " ")
    await reconcileFinalizations(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("digest") })
  })

  it("records cancellation during the hook and holds the runner lock until its atomic end", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput}; fs.writeFileSync(${JSON.stringify(f.events)},'started'); setTimeout(()=>{${writeResult()}; fs.writeFileSync(${JSON.stringify(f.events)},'published')},350)`))
    const worker = runWorker(f.state)
    try {
      await waitFor(() => existsSync(f.events))
      const before = sha256(readFileSync(historyPath(f.state, ticket.id)))
      expect(await runWorker(f.state)).toMatchObject({ busy: true })
      await cancelQueuedOrRunningTicket(f.state, ticket.id)
      expect(record(f.state, ticket.id)?.cancelRequestedAt).toEqual(expect.any(String))
      await worker
      expect(readFileSync(f.events, "utf8")).toBe("published")
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed" })
      expect(sha256(readFileSync(historyPath(f.state, ticket.id)))).toBe(before)
    } finally { await worker }
  })

  it("continues cleanup after a real worker SIGKILL and publication without ACK", async () => {
    const f = fixture()
    const published = join(f.cwd, "published")
    const ticket = enqueue(f, `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test\\n')`, hook([
      readInput,
      `if(fs.existsSync(${JSON.stringify(published)})){${writeResult()}} else {fs.writeFileSync(${JSON.stringify(published)},input.ticketDigest);setInterval(()=>{},1000)}`,
    ].join("; "), 200))
    const worker = spawnWorker(f)
    try {
      await waitFor(() => existsSync(published))
      const before = sha256(readFileSync(historyPath(f.state, ticket.id)))
      const owned = probeWorkerIdentity(worker.pid!)!
      expect(record(f.state, ticket.id)?.supervisorIdentity).toEqual(owned)
      const closed = new Promise<void>(resolve => worker.once("close", () => resolve()))
      worker.kill("SIGKILL")
      await closed
      await new Promise(resolve => setTimeout(resolve, 220))

      await runWorker(f.state)

      expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(["test"])
      expect(readFileSync(published, "utf8")).toBe(before)
      expect(sha256(readFileSync(historyPath(f.state, ticket.id)))).toBe(before)
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", attempt: 2 })
    } finally {
      const identity = record(f.state, ticket.id)?.processGroupIdentity
      if (identity) await terminateVerifiedProcessGroup(identity)
    }
  }, 10_000)

  it("finalizes an interrupted test after the worker receives SIGTERM", async () => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'test');setInterval(()=>{},1000)`, hook(`${readInput}; ${writeResult()}`))
    const worker = spawnWorker(f)
    try {
      await waitFor(() => existsSync(f.events) && Boolean(readRunningJob(f.state)?.processGroupIdentity))
      const closed = new Promise<void>(resolve => worker.once("close", () => resolve()))
      worker.kill("SIGTERM")
      await closed
      expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "interrupted", exitCode: null })
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", result: { cleanup: "confirmed" } })
    } finally {
      const identity = readRunningJob(f.state)?.processGroupIdentity
      if (identity) await terminateVerifiedProcessGroup(identity)
    }
  }, 10_000)
})

function spawnWorker(f: ReturnType<typeof fixture>) {
  const worker = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `const {runWorker}=await import('./src/core/worker.ts'); await runWorker(${JSON.stringify(f.state)})`], { cwd: process.cwd(), stdio: "ignore" })
  children.push(worker)
  return worker
}
