import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import { decideSpendAbort, observeRemoteBase, resolveRemoteBase } from "../../src/core/spend-abort.js"

const cleanup: string[] = []
afterEach(() => {
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
