import { execFileSync, spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { hostname, tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type { FinalizationRecord, FinalizationSpec, QueueTicket, WorkerIdentity } from "../../src/contracts/schema.js"
import { enqueueExplicitTicket } from "../../src/core/enqueue.js"
import { cancelQueuedOrRunningTicket, claimQueuedTicket, closeRunningTicket, parseTicket } from "../../src/core/runner.js"
import { reconcileFinalizations, runFinalization } from "../../src/core/finalization.js"
import { observeWorkerIdentity, probeProcessGroupIdentity, probeWorkerIdentity, terminateVerifiedProcessGroup } from "../../src/core/process.js"
import { registerProjectRuntime } from "../../src/core/runtime.js"
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
    { name: "non-string cleanup", code: `${readInput}; fs.writeFileSync(input.resultPath, JSON.stringify({schemaVersion:1,cleanup:['confirmed'],outputs:[]}))`, reason: "resultado" },
    { name: "oversized result", code: `${readInput}; fs.writeFileSync(input.resultPath, ' '.repeat(65537))`, reason: "64 KiB" },
    { name: "escaping output", code: `${readInput}; fs.writeFileSync(input.resultPath, JSON.stringify({schemaVersion:1,cleanup:'confirmed',outputs:[{path:'../foreign',sha256:'a'.repeat(64),role:'proof'}]}))`, reason: "path" },
    { name: "symlink output", code: `${readInput}; fs.writeFileSync('../foreign','owned fixture'); fs.symlinkSync('../foreign','linked'); fs.writeFileSync(input.resultPath, JSON.stringify({schemaVersion:1,cleanup:'confirmed',outputs:[{path:'linked',sha256:'a'.repeat(64),role:'proof'}]}))`, reason: "symlink" },
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

  it("accepts a valid relative output result through the shared protocol parser", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput}; fs.writeFileSync('published','owned receipt'); fs.writeFileSync(input.resultPath,JSON.stringify({schemaVersion:1,cleanup:'confirmed',outputs:[{path:'published',sha256:require('node:crypto').createHash('sha256').update('owned receipt').digest('hex'),role:'receipt'}]}))`))
    await runWorker(f.state)
    expect(record(f.state, ticket.id)).toMatchObject({phase:"passed",result:{cleanup:"confirmed",outputs:[{path:"published",sha256:sha256("owned receipt"),role:"receipt"}]}})
    expect(readJsonFile<QueueTicket>(historyPath(f.state,ticket.id))).toMatchObject({status:"passed",exitCode:0})
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
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},JSON.stringify({ advertised:JSON.parse(process.env.CI_QUEUE_WORKER_IDENTITY || 'null'), native:JSON.parse(require('node:fs').readFileSync(process.env.CI_QUEUE_STATE_DIR+'/running.json','utf8')).producerIdentity }))`, hook(`${readInput}; fs.writeFileSync(${JSON.stringify(f.hashes)},JSON.stringify(input.workerIdentity)); ${writeResult()}`))
    await runWorker(f.state)
    const observed = JSON.parse(readFileSync(f.events, "utf8"))
    expect(observed.native).toEqual(observed.advertised)
    expect(observed.native).toEqual(JSON.parse(readFileSync(f.hashes, "utf8")))
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))?.producerIdentity).toEqual(observed.native)
    expect(record(f.state, ticket.id)?.supervisorIdentity).toEqual(observed.native)
    expect(observed.native).toMatchObject({ schemaVersion: 1, pid: process.pid, capabilities: expect.arrayContaining(["terminal-finalization-v1", "no-artifact-snapshots-v1"]) })
    expect(existsSync(join(f.state, "state", "worker.json"))).toBe(false)
  })

  it("refuses a non-native claimant before moving the queued ticket", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)")
    await expect(claimQueuedTicket(f.state, ticket.id, 2_147_483_647)).rejects.toThrow(/identidade|claim/)
    expect(existsSync(jobPath(f.state, ticket.id))).toBe(true)
    expect(readRunningJob(f.state)).toBeUndefined()
  })

  it("reads legacy tickets without producer identity but rejects malformed bindings", () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)")
    expect(parseTicket(ticket)).not.toHaveProperty("rejectReason")
    expect(parseTicket({ ...ticket, producerIdentity: { schemaVersion: 1, hostname: "", pid: process.pid, startedAt: "", capabilities: [] } })).toHaveProperty("rejectReason")
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

  it.each(["future schema", "invalid finalization digest"])("never executes a rejected %s ticket's hook during recovery", async kind => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput};fs.writeFileSync(${JSON.stringify(f.events)},'hook');${writeResult()}`))
    atomicWriteJson(jobPath(f.state, ticket.id), { ...ticket, ...(kind === "future schema" ? { schemaVersion: 5 } : { finalizationDigest: "0".repeat(64) }) })
    const next = enqueue(f, "process.exit(0)", undefined, undefined, 1)
    await runWorker(f.state)
    const report = await runWorker(f.state)
    expect(existsSync(f.events)).toBe(false)
    expect(report.reconciliation).not.toBe("blocked")
    expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))).toMatchObject({ status: "failed", failureReason: expect.stringContaining("ticket rejeitado") })
    expect(readJsonFile<QueueTicket>(historyPath(f.state, next.id))).toMatchObject({ status: "passed" })
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

  it("does not remove a worker identity or legacy PID replaced by another owner", async () => {
    const f = fixture()
    const replacement = { schemaVersion: 1, hostname: "other-host.invalid", pid: 999_999, startedAt: "foreign-birth", capabilities: [] }
    enqueue(f, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(f.state, "state", "worker.json"))},${JSON.stringify(JSON.stringify(replacement))});fs.writeFileSync(${JSON.stringify(join(f.state, "state", "worker.pid"))},'999999\\n')`)
    await runWorker(f.state)
    expect(readJsonFile(join(f.state, "state", "worker.json"))).toEqual(replacement)
    expect(readFileSync(join(f.state, "state", "worker.pid"), "utf8")).toBe("999999\n")
    expect(await runWorker(f.state)).toMatchObject({ reconciliation: "blocked" })
    expect(readFileSync(join(f.state, "state", "worker.pid"), "utf8")).toBe("999999\n")
  })

  it("preserves an unreadable worker owner instead of overwriting it or claiming jobs", async () => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'claimed')`)
    writeFileSync(join(f.state, "state", "worker.json"), "{")
    writeFileSync(join(f.state, "state", "worker.pid"), "999999\n")
    const report = await runWorker(f.state)
    expect(report).toMatchObject({ reconciliation: "blocked", busy: true, processed: [] })
    expect(readFileSync(join(f.state, "state", "worker.json"), "utf8")).toBe("{")
    expect(readFileSync(join(f.state, "state", "worker.pid"), "utf8")).toBe("999999\n")
    expect(existsSync(jobPath(f.state, ticket.id))).toBe(true)
    expect(existsSync(f.events)).toBe(false)
  })

  it("rejects a FIFO result without blocking the supervisor", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)", hook(`${readInput};require('node:child_process').execFileSync('mkfifo',[input.resultPath])`))
    const worker = spawnWorker(f)
    try {
      await waitFor(() => Boolean(record(f.state, ticket.id)?.finishedAt), 2_000)
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "failed", failureReason: expect.stringContaining("regular") })
    } finally {
      if (worker.exitCode === null && worker.signalCode === null) {
        const closed = new Promise<void>(resolve => worker.once("close", () => resolve()))
        worker.kill("SIGKILL")
        await closed
      }
    }
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
      expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))?.producerIdentity).toEqual(owned)
      const closed = new Promise<void>(resolve => worker.once("close", () => resolve()))
      worker.kill("SIGKILL")
      await closed
      await new Promise(resolve => setTimeout(resolve, 220))

      await runWorker(f.state)

      expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(["test"])
      expect(readFileSync(published, "utf8")).toBe(before)
      expect(sha256(readFileSync(historyPath(f.state, ticket.id)))).toBe(before)
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", attempt: 2 })
      expect(record(f.state, ticket.id)?.supervisorIdentity).toEqual(probeWorkerIdentity())
      expect(readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))?.producerIdentity).toEqual(owned)
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

describe("Task2 fix round 1", () => {
  it.each([false, true])("finalizes a queued cancellation arriving during an active test before next claim or exit (next=%s)", async next => {
    const f = fixture()
    const first = enqueue(f, `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test-A\\n');setTimeout(()=>process.exit(0),250)`)
    const cancelled = enqueue(f, "process.exit(9)", hook(`${readInput};fs.appendFileSync(${JSON.stringify(f.events)},'finalizer-B\\n');${writeResult("not-required")}`), undefined, 1)
    const third = next ? enqueue(f, `const fs=require('node:fs');if(!fs.readFileSync(${JSON.stringify(f.events)},'utf8').includes('finalizer-B'))process.exit(8);fs.appendFileSync(${JSON.stringify(f.events)},'test-C\\n')`, undefined, undefined, 2) : undefined
    const worker = runWorker(f.state)
    try {
      await waitFor(() => readRunningJob(f.state)?.id === first.id && existsSync(f.events))
      await cancelQueuedOrRunningTicket(f.state, cancelled.id)
      await worker
      expect(record(f.state, cancelled.id)).toMatchObject({ phase: "passed", result: { cleanup: "not-required" } })
      expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(next ? ["test-A", "finalizer-B", "test-C"] : ["test-A", "finalizer-B"])
      expect(readJsonFile<QueueTicket>(historyPath(f.state, cancelled.id))).toMatchObject({ status: "cancelled", exitCode: null })
      if (third) expect(readJsonFile<QueueTicket>(historyPath(f.state, third.id))).toMatchObject({ status: "passed" })
    } finally { await worker }
  })

  it.each(["startup", "finally"])("preserves a FIFO worker owner without blocking at %s", async phase => {
    const f = fixture()
    const ownerPath = join(f.state, "state", "worker.json")
    const pidPath = join(f.state, "state", "worker.pid")
    const reportPath = join(f.root, "worker-report.json")
    const ticket = enqueue(f, phase === "finally" ? `const fs=require('node:fs');fs.unlinkSync(${JSON.stringify(ownerPath)});require('node:child_process').execFileSync('mkfifo',[${JSON.stringify(ownerPath)}])` : "process.exit(0)")
    const next = phase === "finally" ? enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'claimed-next')`, undefined, undefined, 1) : undefined
    if (phase === "startup") {
      execFileSync("mkfifo", [ownerPath])
      writeFileSync(pidPath, "999999\n")
    }
    const worker = spawnWorker(f, reportPath)
    try {
      await waitFor(() => existsSync(reportPath), 2_000)
      expect(readJsonFile(reportPath)).toMatchObject({ reconciliation: "blocked", blockingReason: expect.any(String) })
      expect(lstatSync(ownerPath).isFIFO()).toBe(true)
      expect(readFileSync(pidPath, "utf8")).toBe(`${phase === "startup" ? 999999 : worker.pid}\n`)
      if (phase === "startup") expect(existsSync(jobPath(f.state, ticket.id))).toBe(true)
      if (next) {
        expect(existsSync(jobPath(f.state, next.id))).toBe(true)
        expect(existsSync(f.events)).toBe(false)
      }
    } finally { await stopFixtureChild(worker) }
  })

  it.each(["worker.json", "worker.pid", "state component"])("refuses symlink ownership at %s before related writes", async kind => {
    const f = fixture()
    const ticket = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'claimed')`)
    const state = join(f.state, "state")
    const foreign = join(f.root, "foreign")
    const deadOwner = { schemaVersion: 1, hostname: hostname(), pid: 999999, startedAt: "dead-owner", capabilities: [] }
    let sentinel: string
    let bytes: string
    if (kind === "state component") {
      mkdirSync(foreign)
      sentinel = join(foreign, "worker.pid")
      bytes = "preserve"
      writeFileSync(sentinel, bytes)
      rmSync(state, { recursive: true })
      symlinkSync(foreign, state)
    } else {
      sentinel = foreign
      bytes = kind === "worker.json" ? JSON.stringify(deadOwner) : "preserve"
      writeFileSync(sentinel, bytes)
      symlinkSync(foreign, join(state, kind))
    }
    const report = await runWorker(f.state)
    expect(report).toMatchObject({ reconciliation: "blocked", blockingReason: expect.stringContaining("symlink") })
    expect(readFileSync(sentinel, "utf8")).toBe(bytes)
    expect(existsSync(jobPath(f.state, ticket.id))).toBe(true)
    expect(existsSync(f.events)).toBe(false)
  })

  it("bounds a regular worker ownership file without replacing its uncertain owner", async () => {
    const f = fixture()
    const ticket = enqueue(f, "process.exit(0)")
    const bytes = JSON.stringify({ schemaVersion: 1, hostname: hostname(), pid: 999999, startedAt: "dead-owner", capabilities: ["x".repeat(65536)] })
    writeFileSync(join(f.state, "state", "worker.json"), bytes)
    const report = await runWorker(f.state)
    expect(report).toMatchObject({ reconciliation: "blocked", blockingReason: expect.stringContaining("limite") })
    expect(readFileSync(join(f.state, "state", "worker.json"), "utf8")).toBe(bytes)
    expect(existsSync(jobPath(f.state, ticket.id))).toBe(true)
  })

  it("keeps completed finalization immutable when an original PID is later reused", async () => {
    const f = fixture()
    const foreign = await ownProcess(f.cwd)
    try {
      const queued = enqueue(f, "process.exit(0)", hook(`${readInput};fs.writeFileSync(${JSON.stringify(f.events)},'rerun');${writeResult()}`))
      rmSync(jobPath(f.state, queued.id))
      const terminal: QueueTicket = { ...queued, status: "passed", exitCode: 0, finishedAt: new Date().toISOString(), childPid: foreign.child.pid, processGroupIdentity: { ...foreign.group, startedAt: "historical-birth" } }
      await closeRunningTicket(f.state, terminal)
      saveRecord(f, terminal, { phase: "passed", attempt: 1, finishedAt: new Date().toISOString(), result: { schemaVersion: 1, cleanup: "confirmed", outputs: [] } })
      const before = readFileSync(recordPath(f.state, terminal.id), "utf8")
      expect(await reconcileFinalizations(f.state)).toEqual({ reconciled: [], blocked: [] })
      expect(readFileSync(recordPath(f.state, terminal.id), "utf8")).toBe(before)
      expect(existsSync(f.events)).toBe(false)
      expect(foreign.child.signalCode).toBeNull()
    } finally { await foreign.stop() }
  })

  it("preserves original producer reservation and runtime while a descendant outlives its test leader", async () => {
    const f = fixture()
    const ownerPath = join(f.root, "descendant-owner.json")
    const nextMarker = join(f.root, "next-job")
    const cancelledMarker = join(f.root, "cancelled-hook")
    const descendant = [
      "const fs=require('node:fs')",
      "const ps=require('node:child_process').spawnSync('ps',['-o','lstart=','-p',String(process.pid)],{encoding:'utf8',env:{...process.env,LC_ALL:'C',LANG:'C'}})",
      "if(ps.status!==0)process.exit(3)",
      `fs.writeFileSync(${JSON.stringify(ownerPath)},JSON.stringify({schemaVersion:1,hostname:require('node:os').hostname(),pid:process.pid,startedAt:ps.stdout.trim(),capabilities:[]}))`,
      "setInterval(()=>{},1000)",
    ].join(";")
    registerProjectRuntime(f.state, { projectId: "fixture", node: process.execPath })
    const ticket = enqueue(f, `require('node:fs').appendFileSync(${JSON.stringify(f.events)},'test\\n');const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});child.unref();setTimeout(()=>process.exit(0),150)`, hook(`${readInput};fs.writeFileSync(${JSON.stringify(f.hashes)},'hook');${writeResult()}`))
    const cancelled = enqueue(f, "process.exit(9)", hook(`${readInput};fs.writeFileSync(${JSON.stringify(cancelledMarker)},'cleanup');${writeResult("not-required")}`), undefined, 1)
    const next = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(nextMarker)},'next')`, undefined, undefined, 2)
    const worker = runWorker(f.state)
    let identity: WorkerIdentity | undefined
    try {
      await waitFor(() => existsSync(ownerPath))
      identity = readJsonFile<WorkerIdentity>(ownerPath)!
      expect(observeWorkerIdentity(identity).state).toBe("alive")
      const report = await worker
      const before = sha256(readFileSync(historyPath(f.state, ticket.id)))
      const terminal = readJsonFile<QueueTicket>(historyPath(f.state, ticket.id))!
      expect(report).toMatchObject({ reconciliation: "blocked" })
      expect(readRunningJob(f.state)).toMatchObject({ id: ticket.id, cleanupBlockedReason: expect.any(String) })
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "interrupted", attempt: 0, failureReason: expect.stringContaining("produtor do teste") })
      expect(existsSync(terminal.runtime!.evidencePath!)).toBe(true)
      expect(existsSync(f.hashes)).toBe(false)
      expect(existsSync(nextMarker)).toBe(false)
      expect(existsSync(jobPath(f.state, next.id))).toBe(true)
      await cancelQueuedOrRunningTicket(f.state, cancelled.id)
      await runFinalization(f.state, readJsonFile<QueueTicket>(historyPath(f.state, cancelled.id))!)
      expect(existsSync(cancelledMarker)).toBe(false)
      expect((await reconcileFinalizations(f.state)).blocked).toContain(ticket.id)
      expect(await runWorker(f.state)).toMatchObject({ reconciliation: "blocked" })
      expect(existsSync(f.hashes)).toBe(false)
      await stopFixtureDescendant(identity)
      await runWorker(f.state)
      expect(record(f.state, ticket.id)).toMatchObject({ phase: "passed", attempt: 1 })
      expect(readFileSync(f.hashes, "utf8")).toBe("hook")
      expect(readFileSync(nextMarker, "utf8")).toBe("next")
      expect(readFileSync(cancelledMarker, "utf8")).toBe("cleanup")
      expect(readFileSync(f.events, "utf8").trim().split("\n")).toEqual(["test"])
      expect(sha256(readFileSync(historyPath(f.state, ticket.id)))).toBe(before)
      expect(existsSync(terminal.runtime!.evidencePath!)).toBe(false)
    } finally {
      identity ??= readJsonFile<WorkerIdentity>(ownerPath)
      if (identity) await stopFixtureDescendant(identity)
      await worker
    }
  }, 10_000)
})

describe("Task2 fix round 2", () => {
  it.each([1, 2, 3])("recovers a local v%s producer without hostname or hook and preserves its terminal", async version => {
    const f = fixture()
    const owner = await ownProcess(f.cwd)
    const { hostname: _hostname, ...legacyGroup } = owner.group
    await owner.stop()
    expect(observeWorkerIdentity(owner.worker).state).toBe("dead")
    const queued = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'rerun')`)
    rmSync(jobPath(f.state, queued.id))
    const running: QueueTicket = { ...queued, schemaVersion: version === 1 ? undefined : version, status: "running", startedAt: queued.createdAt, workerPid: owner.worker.pid, childPid: owner.child.pid, processGroupIdentity: legacyGroup }
    if (version === 1) delete running.argv
    if (version < 3) delete running.executionDeadline
    atomicWriteJson(queuePaths(f.state).running, running)
    const next = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.hashes)},'next')`, undefined, undefined, 1)

    const report = await runWorker(f.state)

    expect(report).toMatchObject({ reconciliation: "reconciled", processed: [next.id] })
    expect(readRunningJob(f.state)).toBeUndefined()
    expect(readFileSync(f.hashes, "utf8")).toBe("next")
    expect(existsSync(f.events)).toBe(false)
    expect(record(f.state, queued.id)).toBeUndefined()
    const terminal = readJsonFile<QueueTicket>(historyPath(f.state, queued.id))!
    expect(terminal).toMatchObject({ status: "interrupted", exitCode: null, processGroupIdentity: legacyGroup })
    expect(terminal.processGroupIdentity?.hostname).toBeUndefined()
    const before = sha256(readFileSync(historyPath(f.state, queued.id)))
    // A crash after history publication can leave this terminal reservation.
    atomicWriteJson(queuePaths(f.state).running, terminal)
    expect(await runWorker(f.state)).toMatchObject({ reconciliation: "reconciled", processed: [] })
    expect(readRunningJob(f.state)).toBeUndefined()
    expect(sha256(readFileSync(historyPath(f.state, queued.id)))).toBe(before)
    expect(existsSync(f.events)).toBe(false)
  })

  it.each(["foreign host", "missing identity"])("keeps a legacy %s producer blocked instead of inferring local authority", async kind => {
    const f = fixture()
    const owner = await ownProcess(f.cwd)
    await owner.stop()
    const queued = enqueue(f, "process.exit(0)")
    rmSync(jobPath(f.state, queued.id))
    atomicWriteJson(queuePaths(f.state).running, { ...queued, schemaVersion: 3, status: "running", workerPid: owner.worker.pid, childPid: owner.child.pid, processGroupIdentity: kind === "missing identity" ? undefined : { ...owner.group, hostname: "other-host.invalid" } })
    const next = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.events)},'next')`, undefined, undefined, 1)

    expect(await runWorker(f.state)).toMatchObject({ reconciliation: "blocked", processed: [] })
    expect(readRunningJob(f.state)).toMatchObject({ id: queued.id, status: "running", cleanupBlockedReason: expect.any(String) })
    expect(existsSync(historyPath(f.state, queued.id))).toBe(false)
    expect(existsSync(jobPath(f.state, next.id))).toBe(true)
    expect(existsSync(f.events)).toBe(false)
  })

  it.each(["test producer", "previous hook"])("keeps a new finalization blocked when its %s has no hostname", async phase => {
    const f = fixture()
    const producer = await ownProcess(f.cwd)
    const { hostname: _hostname, ...noHostGroup } = producer.group
    const owner = await ownProcess(f.cwd)
    await owner.stop()
    try {
      const queued = enqueue(f, "process.exit(0)", hook(`${readInput};fs.writeFileSync(${JSON.stringify(f.events)},'hook');${writeResult()}`))
      rmSync(jobPath(f.state, queued.id))
      const terminal: QueueTicket = { ...queued, status: "passed", exitCode: 0, finishedAt: new Date().toISOString(), ...(phase === "test producer" ? { childPid: producer.child.pid, processGroupIdentity: noHostGroup } : {}) }
      await closeRunningTicket(f.state, terminal)
      if (phase === "previous hook") saveRecord(f, terminal, { phase: "running", attempt: 1, startedAt: new Date().toISOString(), processGroupIdentity: noHostGroup, supervisorIdentity: owner.worker })
      const before = sha256(readFileSync(historyPath(f.state, terminal.id)))
      const next = enqueue(f, `require('node:fs').writeFileSync(${JSON.stringify(f.hashes)},'next')`, undefined, undefined, 1)

      expect(await runWorker(f.state)).toMatchObject({ reconciliation: "blocked", processed: [] })
      expect(record(f.state, terminal.id)?.failureReason).toContain("host/identidade")
      expect(existsSync(jobPath(f.state, next.id))).toBe(true)
      expect(existsSync(f.events)).toBe(false)
      expect(existsSync(f.hashes)).toBe(false)
      expect(producer.child.signalCode).toBeNull()
      expect(observeWorkerIdentity(producer.worker).state).toBe("alive")
      expect(sha256(readFileSync(historyPath(f.state, terminal.id)))).toBe(before)
    } finally { await producer.stop() }
  })
})

async function stopFixtureChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()))
  child.kill("SIGKILL")
  await closed
}

async function stopFixtureDescendant(identity: WorkerIdentity) {
  const state = observeWorkerIdentity(identity)
  if (state.state === "dead") return
  if (state.state !== "alive") throw new Error(`own descendant identity uncertain: ${state.reason}`)
  process.kill(identity.pid, "SIGTERM")
  await waitFor(() => observeWorkerIdentity(identity).state === "dead")
}

function spawnWorker(f: ReturnType<typeof fixture>, reportPath?: string) {
  const worker = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `const {runWorker}=await import('./src/core/worker.ts'); const report=await runWorker(${JSON.stringify(f.state)});${reportPath ? `const fs=await import('node:fs');fs.writeFileSync(${JSON.stringify(reportPath)},JSON.stringify(report))` : ""}`], { cwd: process.cwd(), stdio: "ignore" })
  children.push(worker)
  return worker
}
