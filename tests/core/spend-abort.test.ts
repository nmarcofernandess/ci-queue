import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runCli } from "../../src/cli.js"
import type { QueueTicket } from "../../src/contracts/schema.js"
import { enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import {
  cancelQueuedOrRunningTicket,
  claimQueuedTicket,
  parseTicket,
  runJob,
  startSpendAbortObserver,
} from "../../src/core/runner.js"
import {
  decideSpendAbort,
  observeRemoteBase,
  resolveRemoteBase,
  STALE_BASE_FAILURE_REASON,
  type RemoteObservation,
} from "../../src/core/spend-abort.js"
import { atomicWriteJson, listHistoryJobs, queuePaths, readRunningJob } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const cleanup: string[] = []
const observers: Array<{ stop(): Promise<void> }> = []
afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.stop().catch(() => undefined)
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

const GIT_ENV = { ...process.env, LC_ALL: "C", LANG: "C", GIT_CONFIG_NOSYSTEM: "1" }

function catalog(project: string, extra: object) {
  writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture" },
    presets: {
      check: {
        argv: [process.execPath, "-e", "process.exit(0)"],
        fetchBase: "dest/dev",
        ...extra,
      },
    },
  }))
}

it("persists abortOnStaleBase from ci-queue.json onto the ticket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  catalog(project, { abortOnStaleBase: true })
  const ticket = enqueueTicket({ preset: "check", cwd: project, stateRoot: state })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
  expect(ticket.argv).toEqual([process.execPath, "-e", "process.exit(0)"])
})

it("persists abortOnStaleBase on enqueueExplicitTicket", () => {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  const ticket = enqueueExplicitTicket({
    recipe: "check",
    argv: [process.execPath, "-e", "process.exit(0)"],
    projectId: "fixture-project",
    projectName: "Fixture",
    cwd: project,
    stateRoot: state,
    flags: { abortOnStaleBase: true, fetchBase: "dest/dev" },
  })
  expect(ticket.flags?.abortOnStaleBase).toBe(true)
})

it("continues when the flag is off", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: false,
    remoteBaseSha: "aa".repeat(20),
    isRemoteAncestorOfHead: false,
  })).toEqual({ action: "continue", reason: "flag-off" })
})

it("continues when remote is unreadable", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: true,
    remoteBaseSha: null,
    isRemoteAncestorOfHead: null,
  })).toEqual({ action: "continue", reason: "remote-unreadable" })
})

it("aborts when remote moved off the ticket HEAD ancestry", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: true,
    remoteBaseSha: "bb".repeat(20),
    isRemoteAncestorOfHead: false,
  })).toEqual({
    action: "abort",
    reason: "stale-base",
    remoteSha: "bb".repeat(20),
  })
})

it("continues when remote is an ancestor of HEAD", () => {
  expect(decideSpendAbort({
    abortOnStaleBase: true,
    remoteBaseSha: "aa".repeat(20),
    isRemoteAncestorOfHead: true,
  })).toEqual({ action: "continue", reason: "remote-is-ancestor" })
})

it("splits dest/release/x without defaulting to origin/dev", () => {
  expect(resolveRemoteBase("dest/release/x", ["dest"])).toEqual({
    remote: "dest",
    branch: "release/x",
    headsRef: "refs/heads/release/x",
  })
})

it("splits dest/release/2026-09 using the named remote", () => {
  expect(resolveRemoteBase("dest/release/2026-09", ["dest"])).toEqual({
    remote: "dest",
    branch: "release/2026-09",
    headsRef: "refs/heads/release/2026-09",
  })
})

it("rejects empty fetchBase instead of defaulting to refs/heads/dev", () => {
  expect(() => resolveRemoteBase("", ["origin", "dest"])).toThrow()
})

it("throws when fetchBase has no slash", () => {
  expect(() => resolveRemoteBase("dev", ["dest"])).toThrow()
})

it("throws when the remote is not in the clone remotes", () => {
  expect(() => resolveRemoteBase("origin/dev", ["dest"])).toThrow()
})

type FileIdentity = { exists: false } | { exists: true; bytes: Buffer; mtimeMs: number }

function fileIdentity(path: string): FileIdentity {
  if (!existsSync(path)) return { exists: false }
  const stats = statSync(path)
  return { exists: true, bytes: readFileSync(path), mtimeMs: stats.mtimeMs }
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function gitStatus(cwd: string, args: string[]): number {
  try {
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      env: GIT_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    })
    return 0
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
      return error.status
    }
    throw error
  }
}

function configureRepo(cwd: string) {
  git(cwd, ["config", "user.email", "ci-queue@example.invalid"])
  git(cwd, ["config", "user.name", "CI Queue test"])
  git(cwd, ["config", "gc.auto", "0"])
}

function materializeLooseRef(cwd: string, ref: string) {
  const sha = git(cwd, ["rev-parse", ref])
  const path = join(cwd, ".git", ref)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${sha}\n`)
}

function snapshotWorkerIdentity(cwd: string) {
  return {
    head: fileIdentity(join(cwd, ".git", "HEAD")),
    localDev: fileIdentity(join(cwd, ".git", "refs", "heads", "dev")),
    remoteDev: fileIdentity(join(cwd, ".git", "refs", "remotes", "dest", "dev")),
    index: fileIdentity(join(cwd, ".git", "index")),
    fetchHead: fileIdentity(join(cwd, ".git", "FETCH_HEAD")),
    headSha: git(cwd, ["rev-parse", "HEAD"]),
    remoteDevSha: git(cwd, ["rev-parse", "refs/remotes/dest/dev"]),
  }
}

function buildBareAuthorWorker(options: { extraBaseCommits?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-spend-abort-"))
  cleanup.push(root)
  const bare = join(root, "bare.git")
  const author = join(root, "author")
  const worker = join(root, "worker")
  git(root, ["init", "--bare", "-b", "dev", bare])
  git(root, ["clone", "-q", bare, author])
  configureRepo(author)
  writeFileSync(join(author, "file.txt"), "b0\n")
  git(author, ["add", "file.txt"])
  git(author, ["commit", "-m", "B0"])
  const firstSha = git(author, ["rev-parse", "HEAD"])
  for (let index = 0; index < (options.extraBaseCommits ?? 0); index += 1) {
    writeFileSync(join(author, "file.txt"), `b0-${index}\n`, { flag: "a" })
    git(author, ["add", "file.txt"])
    git(author, ["commit", "-m", `B0-${index}`])
  }
  git(author, ["push", "-q", "-u", "origin", "dev"])
  const b0 = git(author, ["rev-parse", "HEAD"])
  git(root, ["clone", "-q", "--origin", "dest", bare, worker])
  configureRepo(worker)
  return { root, bare, author, worker, b0, firstSha }
}

describe("observeRemoteBase", () => {
  it("fetches a missing remote object privately and aborts when it left HEAD ancestry", async () => {
    const { author, worker, b0 } = buildBareAuthorWorker()
    writeFileSync(join(worker, "ticket.txt"), "ticket\n")
    git(worker, ["add", "ticket.txt"])
    git(worker, ["commit", "-m", "ticket"])
    const headSha = git(worker, ["rev-parse", "HEAD"])
    materializeLooseRef(worker, "refs/remotes/dest/dev")
    const before = snapshotWorkerIdentity(worker)

    writeFileSync(join(author, "file.txt"), "b1\n", { flag: "a" })
    git(author, ["add", "file.txt"])
    git(author, ["commit", "-m", "B1"])
    git(author, ["push", "-q", "origin", "dev"])
    const b1 = git(author, ["rev-parse", "HEAD"])

    const remoteLine = git(worker, ["ls-remote", "--exit-code", "dest", "refs/heads/dev"])
    expect(remoteLine.startsWith(b1)).toBe(true)
    expect(gitStatus(worker, ["cat-file", "-e", b1])).toBe(1)
    expect(gitStatus(worker, ["merge-base", "--is-ancestor", b1, "HEAD"])).toBe(128)
    expect(headSha).not.toBe(b0)

    const observation = await observeRemoteBase({
      cwd: worker,
      base: { remote: "dest", branch: "dev", headsRef: "refs/heads/dev" },
      headSha,
      ticketId: "20260917180000-deadbeef",
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })

    expect(observation).toEqual({ kind: "known", sha: b1, isAncestor: false })
    expect(gitStatus(worker, ["cat-file", "-e", b1])).toBe(0)
    expect(gitStatus(worker, ["merge-base", "--is-ancestor", b1, headSha])).toBe(1)
    expect(decideSpendAbort({
      abortOnStaleBase: true,
      remoteBaseSha: observation.kind === "known" ? observation.sha : null,
      isRemoteAncestorOfHead: observation.kind === "known" ? observation.isAncestor : null,
    })).toEqual({ action: "abort", reason: "stale-base", remoteSha: b1 })
    expect(snapshotWorkerIdentity(worker)).toEqual(before)
  })

  it("returns unknown on timeout and continues", async () => {
    const { worker } = buildBareAuthorWorker()
    const headSha = git(worker, ["rev-parse", "HEAD"])
    const observation = await observeRemoteBase({
      cwd: worker,
      base: { remote: "dest", branch: "dev", headsRef: "refs/heads/dev" },
      headSha,
      ticketId: "ticket-timeout",
      signal: AbortSignal.abort(),
      timeoutMs: 10_000,
    })
    expect(observation).toEqual({ kind: "unknown", reason: "timeout" })
    expect(decideSpendAbort({
      abortOnStaleBase: true,
      remoteBaseSha: null,
      isRemoteAncestorOfHead: null,
    })).toEqual({ action: "continue", reason: "remote-unreadable" })
  })

  it("returns unknown on shallow incomplete history and continues", async () => {
    const { root, bare, author, firstSha } = buildBareAuthorWorker({ extraBaseCommits: 2 })
    git(author, ["push", "-q", "origin", `${firstSha}:refs/heads/old`])
    const shallow = join(root, "shallow")
    git(root, ["clone", "-q", "--origin", "dest", "--depth", "1", `file://${bare}`, shallow])
    configureRepo(shallow)
    expect(git(shallow, ["rev-parse", "--is-shallow-repository"])).toBe("true")
    const headSha = git(shallow, ["rev-parse", "HEAD"])
    expect(gitStatus(shallow, ["cat-file", "-e", firstSha])).toBe(1)

    const observation = await observeRemoteBase({
      cwd: shallow,
      base: { remote: "dest", branch: "old", headsRef: "refs/heads/old" },
      headSha,
      ticketId: "ticket-shallow",
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })

    expect(observation).toEqual({ kind: "unknown", reason: "incomplete-history" })
    expect(decideSpendAbort({
      abortOnStaleBase: true,
      remoteBaseSha: observation.kind === "known" ? observation.sha : null,
      isRemoteAncestorOfHead: observation.kind === "known" ? observation.isAncestor : null,
    })).toEqual({ action: "continue", reason: "remote-unreadable" })
  })

  it("returns unknown when ls-remote cannot see the configured ref", async () => {
    const { worker } = buildBareAuthorWorker()
    const headSha = git(worker, ["rev-parse", "HEAD"])
    const observation = await observeRemoteBase({
      cwd: worker,
      base: { remote: "dest", branch: "missing", headsRef: "refs/heads/missing" },
      headSha,
      ticketId: "ticket-invalid-ref",
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })
    expect(observation).toEqual({ kind: "unknown", reason: "invalid-ref" })
    expect(decideSpendAbort({
      abortOnStaleBase: true,
      remoteBaseSha: null,
      isRemoteAncestorOfHead: null,
    })).toEqual({ action: "continue", reason: "remote-unreadable" })
  })

  it("returns unknown on network failure and continues", async () => {
    const { worker } = buildBareAuthorWorker()
    git(worker, ["remote", "set-url", "dest", "https://127.0.0.1:1/ci-queue.git"])
    const headSha = git(worker, ["rev-parse", "HEAD"])
    const observation = await observeRemoteBase({
      cwd: worker,
      base: { remote: "dest", branch: "dev", headsRef: "refs/heads/dev" },
      headSha,
      ticketId: "ticket-network",
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })
    expect(observation).toEqual({ kind: "unknown", reason: "network" })
    expect(decideSpendAbort({
      abortOnStaleBase: true,
      remoteBaseSha: null,
      isRemoteAncestorOfHead: null,
    })).toEqual({ action: "continue", reason: "remote-unreadable" })
  })
})

const KNOWN_ANCESTOR: RemoteObservation = {
  kind: "known",
  sha: "aa".repeat(20),
  isAncestor: true,
}
const KNOWN_STALE: RemoteObservation = {
  kind: "known",
  sha: "bb".repeat(20),
  isAncestor: false,
}
const UNKNOWN_NETWORK: RemoteObservation = { kind: "unknown", reason: "network" }

const PROGRESS_RUNNING = [
  "@@ci-queue-progress",
  "1",
  "node",
  "bootstrap",
  "-",
  "stage",
  "running",
  "-",
  "Bootstrap",
].join("\t")
const HANG_WITH_PROGRESS = `console.log(${JSON.stringify(PROGRESS_RUNNING)}); setInterval(() => {}, 1000)`

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("tempo esgotado aguardando condição")
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function createFakeSleep() {
  const pending: Array<{ ms: number; resolve: () => void }> = []
  const calls: number[] = []
  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve()
        return
      }
      const entry = { ms, resolve }
      calls.push(ms)
      pending.push(entry)
      signal.addEventListener(
        "abort",
        () => {
          const index = pending.indexOf(entry)
          if (index >= 0) pending.splice(index, 1)
          resolve()
        },
        { once: true },
      )
    })
  const releaseOne = (ms: number) => {
    const index = pending.findIndex((entry) => entry.ms === ms)
    if (index < 0) throw new Error(`nenhum sleep pendente de ${ms}ms`)
    pending.splice(index, 1)[0].resolve()
  }
  return { sleep, calls, pending, releaseOne }
}

function repoWithDestRemote(): string {
  const cwd = mkdtempSync(join(tmpdir(), "ci-queue-observer-"))
  cleanup.push(cwd)
  git(cwd, ["init", "-b", "dev"])
  configureRepo(cwd)
  writeFileSync(join(cwd, "file.txt"), "x\n")
  git(cwd, ["add", "file.txt"])
  git(cwd, ["commit", "-m", "init"])
  git(cwd, ["remote", "add", "dest", cwd])
  return cwd
}

function observerTicket(cwd: string, id = "ticket-observer"): QueueTicket {
  return {
    id,
    createdAt: "2026-09-17T18:00:00.000Z",
    status: "running",
    preset: "check",
    cwd,
    branch: "dev",
    headSha: "aa".repeat(20),
    requestedBy: "test",
    command: "node",
    logPath: join(cwd, `${id}.log`),
    flags: { abortOnStaleBase: true, fetchBase: "dest/dev" },
  }
}

function killDetached(pid: number | undefined): void {
  if (!pid) return
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGKILL")
    } catch {
      /* already gone */
    }
  }
}

async function claimParsed(state: string, ticket: QueueTicket) {
  const claimed = await claimQueuedTicket(state, ticket.id)
  if (!claimed) throw new Error("claim falhou")
  const parsed = parseTicket(claimed)
  if ("rejectReason" in parsed) throw new Error(parsed.rejectReason)
  return parsed
}

describe("startSpendAbortObserver", () => {
  it("never overlaps observations and waits 15s after each finish", async () => {
    const cwd = repoWithDestRemote()
    const fake = createFakeSleep()
    let inFlight = 0
    let maxInFlight = 0
    let observations = 0
    let holdFirst = true
    let releaseFirst!: () => void
    const firstHold = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const observer = startSpendAbortObserver({
      ticket: observerTicket(cwd),
      observe: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        observations += 1
        if (holdFirst) await firstHold
        inFlight -= 1
        return KNOWN_ANCESTOR
      },
      sleep: fake.sleep,
      onStale: async () => {
        throw new Error("não deveria abortar no caminho saudável")
      },
      nowMs: () => 0,
    })
    observers.push(observer)

    await waitFor(() => observations === 1)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(inFlight).toBe(1)
    expect(maxInFlight).toBe(1)
    expect(fake.calls).toEqual([])

    holdFirst = false
    releaseFirst()
    await waitFor(() => fake.calls[0] === 15_000)
    expect(observations).toBe(1)
    expect(maxInFlight).toBe(1)

    fake.releaseOne(15_000)
    await waitFor(() => observations === 2)
    expect(maxInFlight).toBe(1)
    await observer.stop()
  })

  it("backs off 30s then 60s after consecutive errors", async () => {
    const cwd = repoWithDestRemote()
    const fake = createFakeSleep()
    const observer = startSpendAbortObserver({
      ticket: observerTicket(cwd),
      observe: async () => UNKNOWN_NETWORK,
      sleep: fake.sleep,
      onStale: async () => {
        throw new Error("unknown não aborta")
      },
      nowMs: () => 0,
    })
    observers.push(observer)

    await waitFor(() => fake.calls[0] === 30_000)
    fake.releaseOne(30_000)
    await waitFor(() => fake.calls[1] === 60_000)
    fake.releaseOne(60_000)
    await waitFor(() => fake.calls[2] === 120_000)
    expect(fake.calls).toEqual([30_000, 60_000, 120_000])
    await observer.stop()
  })

  it("deletes only this job private observe ref on stop", async () => {
    const cwd = repoWithDestRemote()
    const sha = git(cwd, ["rev-parse", "HEAD"])
    git(cwd, ["update-ref", "refs/ci-queue/observed/ticket-observer", sha])
    git(cwd, ["update-ref", "refs/ci-queue/observed/ticket-other", sha])
    const observer = startSpendAbortObserver({
      ticket: observerTicket(cwd),
      observe: async (input) => {
        await new Promise<void>((resolve) => {
          if (input.signal.aborted) {
            resolve()
            return
          }
          input.signal.addEventListener("abort", () => resolve(), { once: true })
        })
        return UNKNOWN_NETWORK
      },
      sleep: abortableSleep,
      onStale: async () => undefined,
      nowMs: () => Date.now(),
    })
    await observer.stop()
    expect(gitStatus(cwd, ["show-ref", "--verify", "refs/ci-queue/observed/ticket-observer"])).not.toBe(0)
    expect(gitStatus(cwd, ["show-ref", "--verify", "refs/ci-queue/observed/ticket-other"])).toBe(0)
  })
})

describe("runner spend-abort", () => {
  it("aborts a live child when dest/dev moves off HEAD and leaves tracking untouched", async () => {
    const { author, worker } = buildBareAuthorWorker()
    const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
    cleanup.push(state)
    catalog(worker, {
      abortOnStaleBase: true,
      argv: [process.execPath, "-e", HANG_WITH_PROGRESS],
      progress: true,
    })
    const ticket = enqueueTicket({ preset: "check", cwd: worker, stateRoot: state })
    const workerRun = runWorker(state)
    try {
      await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity), 10_000)
      const before = snapshotWorkerIdentity(worker)

      writeFileSync(join(author, "file.txt"), "b1\n", { flag: "a" })
      git(author, ["add", "file.txt"])
      git(author, ["commit", "-m", "B1"])
      git(author, ["push", "-q", "origin", "dev"])

      await waitFor(() => listHistoryJobs(state).some((job) => job.id === ticket.id), 25_000)
      const report = await workerRun
      expect(report.processed).toEqual([ticket.id])
      const history = listHistoryJobs(state)[0]
      expect(history).toMatchObject({
        id: ticket.id,
        status: "failed",
        exitCode: 1,
        failureReason: STALE_BASE_FAILURE_REASON,
      })
      expect(history.progress?.nodes).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "bootstrap", kind: "stage" })]),
      )
      expect(snapshotWorkerIdentity(worker)).toEqual(before)
      expect(gitStatus(worker, ["show-ref", "--verify", `refs/ci-queue/observed/${ticket.id}`])).not.toBe(0)
    } finally {
      killDetached(readRunningJob(state)?.childPid)
      await workerRun.catch(() => undefined)
    }
  }, 40_000)

  it("does not signal a raw pid without processGroupIdentity and keeps occupancy", async () => {
    const { worker } = buildBareAuthorWorker()
    const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
    cleanup.push(state)
    catalog(worker, {
      abortOnStaleBase: true,
      argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    })
    const ticket = enqueueTicket({ preset: "check", cwd: worker, stateRoot: state })
    const parsed = await claimParsed(state, ticket)
    let release!: () => void
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    let observeFinished = false
    const killed: number[] = []
    const originalKill = process.kill.bind(process)
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      killed.push(pid)
      return originalKill(pid, signal)
    }) as typeof process.kill

    const job = runJob(state, parsed, {
      spendAbort: {
        observe: async () => {
          await hold
          observeFinished = true
          return KNOWN_STALE
        },
        sleep: abortableSleep,
        nowMs: () => Date.now(),
      },
    })
    try {
      await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity), 10_000)
      const running = readRunningJob(state)
      if (!running?.childPid) throw new Error("childPid ausente")
      atomicWriteJson(queuePaths(state).running, { ...running, processGroupIdentity: undefined })
      release()
      await waitFor(() => observeFinished)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(readRunningJob(state)?.id).toBe(ticket.id)
      expect(() => originalKill(running.childPid, 0)).not.toThrow()
      expect(killed.some((pid) => pid === running.childPid || pid === -running.childPid)).toBe(false)
      killDetached(running.childPid)
      await job
    } finally {
      killDetached(readRunningJob(state)?.childPid)
      process.kill = originalKill
      await job.catch(() => undefined)
    }
  }, 20_000)

  it("keeps stale-base when a later deadline fires before the child closes", async () => {
    const { worker } = buildBareAuthorWorker()
    const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
    cleanup.push(state)
    catalog(worker, {
      abortOnStaleBase: true,
      executionTimeoutMs: 180,
      argv: [process.execPath, "-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    })
    const ticket = enqueueTicket({ preset: "check", cwd: worker, stateRoot: state })
    let staleBeforeExpiry = false
    const parsed = await claimParsed(state, ticket)
    const job = runJob(state, parsed, {
      spendAbort: {
        observe: async () => {
          await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity), 10_000)
          staleBeforeExpiry = readRunningJob(state)?.executionDeadline?.state !== "expired"
          return KNOWN_STALE
        },
        sleep: abortableSleep,
        nowMs: () => Date.now(),
      },
    })
    try {
      await waitFor(() => staleBeforeExpiry)
      await waitFor(() => {
        const running = readRunningJob(state)
        if (!running || running.id !== ticket.id) return false
        const deadline = running.executionDeadline
        if (!deadline || !("expiresAt" in deadline)) return false
        return Date.parse(deadline.expiresAt) + 50 <= Date.now()
      }, 10_000)
      expect(readRunningJob(state)?.id).toBe(ticket.id)
      const terminal = await job
      expect(staleBeforeExpiry).toBe(true)
      expect(terminal).toMatchObject({
        id: ticket.id,
        status: "failed",
        exitCode: 1,
        failureReason: STALE_BASE_FAILURE_REASON,
      })
    } finally {
      killDetached(readRunningJob(state)?.childPid)
      await job.catch(() => undefined)
    }
  }, 20_000)

  it("keeps cancelled when a stale callback arrives after cancel", async () => {
    const { worker } = buildBareAuthorWorker()
    const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
    cleanup.push(state)
    catalog(worker, {
      abortOnStaleBase: true,
      argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    })
    const ticket = enqueueTicket({ preset: "check", cwd: worker, stateRoot: state })
    const parsed = await claimParsed(state, ticket)
    const job = runJob(state, parsed, {
      spendAbort: {
        observe: async () => {
          await waitFor(() => Boolean(readRunningJob(state)?.processGroupIdentity), 10_000)
          await cancelQueuedOrRunningTicket(state, ticket.id)
          return KNOWN_STALE
        },
        sleep: abortableSleep,
        nowMs: () => Date.now(),
      },
    })
    try {
      const terminal = await job
      expect(terminal).toMatchObject({ id: ticket.id, status: "cancelled", exitCode: null })
      expect(terminal.failureReason).not.toBe(STALE_BASE_FAILURE_REASON)
    } finally {
      killDetached(readRunningJob(state)?.childPid)
      await job.catch(() => undefined)
    }
  }, 20_000)
})

it("announces spend-abort-v1 on version --json", async () => {
  const version = await runCli(["version", "--json"])
  expect(version).toMatchObject({ ok: true })
  if (!version.ok) throw new Error(version.error.message)
  expect((version.result as { capabilities: string[] }).capabilities).toContain("spend-abort-v1")
})

