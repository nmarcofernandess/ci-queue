import { execFileSync, spawn } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { initialExecutionDeadline } from "../../src/core/deadline.js"
import { enqueueTicket } from "../../src/core/enqueue.js"
import { probeProcessGroupIdentity } from "../../src/core/process.js"
import { cancelQueuedOrRunningTicket, parseTicket } from "../../src/core/runner.js"
import {
  atomicWriteJson,
  claimPath,
  compatibilityStateRoot,
  ensureQueueDirs,
  listHistoryJobs,
  listQueuedJobs,
  productStateRoot,
  queuePaths,
  readRunningJob,
  resolveStateRoot,
} from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"
import { runCli } from "../../src/cli.js"
import { isShipEligibleTicket } from "../../src/ship/eligibility.js"
import type { QueueTicket } from "../../src/contracts/schema.js"

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(
  presets: Record<string, object>,
  options: { artifacts?: string[] } = {}
): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-state-"))
  cleanup.push(project, state)
  writeFileSync(join(project, "ci-queue.json"), `${JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture project" },
    presets,
    ...(options.artifacts ? { artifacts: options.artifacts } : {}),
  }, null, 2)}\n`)
  return { project, state }
}

function commitFixture(project: string): void {
  execFileSync("git", ["init"], { cwd: project })
  execFileSync("git", ["config", "user.email", "ci-queue@example.invalid"], { cwd: project })
  execFileSync("git", ["config", "user.name", "CI Queue test"], { cwd: project })
  execFileSync("git", ["add", "ci-queue.json"], { cwd: project })
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: project })
}

async function withFailingGitStatus(
  failureAt: number,
  run: () => Promise<void>,
  mode: "exit" | "timeout" = "exit",
): Promise<void> {
  const proxyDir = mkdtempSync(join(tmpdir(), "ci-queue-git-proxy-"))
  cleanup.push(proxyDir)
  const statusCount = join(proxyDir, "status-count")
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim()
  const proxy = join(proxyDir, "git")
  writeFileSync(proxy, [
    "#!/bin/sh",
    'if [ "$1" = "status" ] && [ "$2" = "--short" ]; then',
    '  count=$(cat "$CQ_TEST_STATUS_COUNT" 2>/dev/null || printf 0)',
    '  count=$((count + 1))',
    '  printf "%s" "$count" > "$CQ_TEST_STATUS_COUNT"',
    '  if [ "$count" -eq "$CQ_TEST_STATUS_FAILURE_AT" ]; then',
    '    if [ "$CQ_TEST_STATUS_MODE" = "timeout" ]; then exec sleep 11; fi',
    '    exit 17',
    '  fi',
    "fi",
    'exec "$CQ_TEST_REAL_GIT" "$@"',
    "",
  ].join("\n"))
  chmodSync(proxy, 0o755)
  const previous = {
    PATH: process.env.PATH,
    CQ_TEST_STATUS_COUNT: process.env.CQ_TEST_STATUS_COUNT,
    CQ_TEST_STATUS_FAILURE_AT: process.env.CQ_TEST_STATUS_FAILURE_AT,
    CQ_TEST_STATUS_MODE: process.env.CQ_TEST_STATUS_MODE,
    CQ_TEST_REAL_GIT: process.env.CQ_TEST_REAL_GIT,
  }
  process.env.PATH = `${proxyDir}:${process.env.PATH ?? ""}`
  process.env.CQ_TEST_STATUS_COUNT = statusCount
  process.env.CQ_TEST_STATUS_FAILURE_AT = String(failureAt)
  process.env.CQ_TEST_STATUS_MODE = mode
  process.env.CQ_TEST_REAL_GIT = realGit
  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
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
  it("rejects a canonical job when preflight Git status cannot be observed", async () => {
    const { project, state } = fixture({
      guarded: {
        argv: [process.execPath, "-e", "require('node:fs').writeFileSync(require('node:path').join(process.env.CI_QUEUE_STATE_DIR, 'child-started'), 'yes')"],
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
      },
    })
    commitFixture(project)
    const ticket = enqueueTicket({ preset: "guarded", cwd: project, stateRoot: state })

    await withFailingGitStatus(1, async () => { await runWorker(state) })

    expect(existsSync(join(state, "child-started"))).toBe(false)
    expect(listHistoryJobs(state)[0]).toMatchObject({
      id: ticket.id,
      status: "failed",
      failureReason: expect.stringContaining("preflight git indisponível"),
    })
    expect(listHistoryJobs(state)[0].preflight).toBeUndefined()
    expect(isShipEligibleTicket(listHistoryJobs(state)[0], {
      projectId: "fixture-project",
      executionCwd: project,
      headSha: ticket.headSha,
      baseSha: "",
      acceptedRecipes: [{ name: "guarded", argv: ticket.argv ?? [], flags: ticket.flags ?? {} }],
    })).toBe(false)
  })

  it("rejects a canonical job when preflight Git status times out", async () => {
    const { project, state } = fixture({
      guarded: {
        argv: [process.execPath, "-e", "require('node:fs').writeFileSync(require('node:path').join(process.env.CI_QUEUE_STATE_DIR, 'child-started'), 'yes')"],
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
      },
    })
    commitFixture(project)
    enqueueTicket({ preset: "guarded", cwd: project, stateRoot: state })

    await withFailingGitStatus(1, async () => { await runWorker(state) }, "timeout")

    expect(existsSync(join(state, "child-started"))).toBe(false)
    expect(listHistoryJobs(state)[0]).toMatchObject({
      status: "failed",
      failureReason: expect.stringContaining("preflight git indisponível"),
    })
  }, 15_000)

  it("does not certify a child that exited zero when postflight Git status fails", async () => {
    const { project, state } = fixture({
      guarded: {
        argv: [process.execPath, "-e", "require('node:fs').writeFileSync(require('node:path').join(process.env.CI_QUEUE_STATE_DIR, 'child-finished'), 'yes')"],
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
      },
    })
    commitFixture(project)
    const ticket = enqueueTicket({ preset: "guarded", cwd: project, stateRoot: state })

    await withFailingGitStatus(2, async () => { await runWorker(state) })

    expect(existsSync(join(state, "child-finished"))).toBe(true)
    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({
      id: ticket.id,
      status: "failed",
      failureReason: expect.stringContaining("não foi possível ler o estado Git pós-job"),
      preflight: expect.objectContaining({ statusShort: "" }),
    })
    expect(terminal.postflight).toBeUndefined()
  })

  it("rejects a genuinely dirty tree before the child starts", async () => {
    const { project, state } = fixture({
      guarded: {
        argv: [process.execPath, "-e", "require('node:fs').writeFileSync(require('node:path').join(process.env.CI_QUEUE_STATE_DIR, 'child-started'), 'yes')"],
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
      },
    })
    commitFixture(project)
    writeFileSync(join(project, "untracked.txt"), "dirty")
    enqueueTicket({ preset: "guarded", cwd: project, stateRoot: state })

    await runWorker(state)

    expect(existsSync(join(state, "child-started"))).toBe(false)
    expect(listHistoryJobs(state)[0]).toMatchObject({
      status: "failed",
      failureReason: "árvore de trabalho não está limpa",
    })
  })

  it("passes the preflight-observed base to a newly enqueued child", async () => {
    const script = 'require("node:fs").writeFileSync(require("node:path").join(process.env.CI_QUEUE_STATE_DIR, "child-git-env.json"), JSON.stringify({head: process.env.DIETFLOW_CI_QUEUE_HEAD_SHA, base: process.env.DIETFLOW_CI_BASE_SHA, alias: process.env.LOCAL_CI_BASE_SHA}))'
    const { project, state } = fixture({
      guarded: {
        argv: [process.execPath, "-e", script],
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
        fetchBase: "origin/dev",
      },
    })
    commitFixture(project)
    const remote = mkdtempSync(join(tmpdir(), "ci-queue-remote-"))
    cleanup.push(remote)
    execFileSync("git", ["init", "--bare"], { cwd: remote })
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: project })
    execFileSync("git", ["push", "-u", "origin", "HEAD:refs/heads/dev"], { cwd: project })
    const ticket = enqueueTicket({ preset: "guarded", cwd: project, stateRoot: state })
    expect(ticket.preflight).toBeUndefined()

    await runWorker(state)

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed" })
    const actualBase = execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim()
    expect(terminal.preflight?.baseSha).toBe(actualBase)
    expect(terminal.postflight?.baseSha).toBe(actualBase)
    expect(JSON.parse(readFileSync(join(state, "child-git-env.json"), "utf8"))).toEqual({
      head: actualBase,
      base: actualBase,
      alias: actualBase,
    })
  })

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

  it("redacts command and streamed secrets before they reach the on-disk log", async () => {
    const secret = "runner-secret-value"
    const script = [
      `const secret = ${JSON.stringify(secret)}`,
      'process.stdout.write("token=" + secret.slice(0, 7))',
      'setTimeout(() => {',
      '  process.stdout.write(secret.slice(7) + "\\n")',
      '  process.stderr.write("password=" + secret + "\\n")',
      '}, 10)',
    ].join("; ")
    const { project, state } = fixture({
      redacted: { argv: [process.execPath, "-e", script] },
    })
    const ticket = enqueueTicket({ preset: "redacted", cwd: project, stateRoot: state })

    await runWorker(state)

    const log = readFileSync(ticket.logPath, "utf8")
    expect(log).not.toContain(secret)
    expect(log).toContain("token=[REDACTED]")
    expect(log).toContain("password=[REDACTED]")
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed" })
  })

  it("retains declared artifacts from a failed recipe without changing its verdict", async () => {
    const { project, state } = fixture(
      {
        badWithArtifact: {
          argv: [
            process.execPath,
            "-e",
            [
              'const fs = require("node:fs")',
              'fs.mkdirSync("test-results", { recursive: true })',
              'fs.writeFileSync("test-results/result.txt", "failure evidence")',
              "process.exit(7)",
            ].join("; "),
          ],
        },
      },
      { artifacts: ["test-results"] }
    )
    const ticket = enqueueTicket({
      preset: "badWithArtifact",
      cwd: project,
      stateRoot: state,
    })

    await runWorker(state)

    const artifactsPath = join(state, "artifacts", ticket.id)
    expect(listHistoryJobs(state)[0]).toMatchObject({
      id: ticket.id,
      status: "failed",
      exitCode: 7,
      artifactsPath,
    })
    expect(readFileSync(join(artifactsPath, "test-results", "result.txt"), "utf8")).toBe(
      "failure evidence"
    )
  })

  it("passes job-env-v1 aliases to the child and enables only declared progress", async () => {
    const keys = [
      "CI_QUEUE_JOB_ENV_VERSION",
      "DIETFLOW_CI_QUEUE_DIR",
      "DIETFLOW_CI_QUEUE_JOB_ID",
      "DIETFLOW_CI_QUEUE_HEAD_SHA",
      "DIETFLOW_CI_BASE_SHA",
      "LOCAL_CI_QUEUE_DIR",
      "LOCAL_CI_JOB_ID",
      "LOCAL_CI_PRESET",
      "LOCAL_CI_PROGRESS_ENABLED",
      "LOCAL_CI_HEAD_SHA",
      "LOCAL_CI_BASE_SHA",
    ]
    const environmentScript = (path: string) => [
      'const fs = require("node:fs")',
      `const keys = ${JSON.stringify(keys)}`,
      `fs.writeFileSync(${JSON.stringify(path)}, JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key] ?? null]))))`,
    ].join("; ")
    const { project, state } = fixture({
      declaredProgress: {
        argv: [process.execPath, "-e", environmentScript("job-env.json")],
        progress: true,
      },
      undeclaredProgress: {
        argv: [process.execPath, "-e", environmentScript("job-env-neutral.json")],
      },
    })
    const ticket = enqueueTicket({
      preset: "declaredProgress",
      cwd: project,
      stateRoot: state,
    })
    enqueueTicket({ preset: "undeclaredProgress", cwd: project, stateRoot: state })
    const inheritedProgress = process.env.LOCAL_CI_PROGRESS_ENABLED
    process.env.LOCAL_CI_PROGRESS_ENABLED = "1"
    try {
      await runWorker(state)
    } finally {
      if (inheritedProgress === undefined) delete process.env.LOCAL_CI_PROGRESS_ENABLED
      else process.env.LOCAL_CI_PROGRESS_ENABLED = inheritedProgress
    }

    const childEnvironment = JSON.parse(readFileSync(join(project, "job-env.json"), "utf8"))
    expect(childEnvironment).toEqual({
      CI_QUEUE_JOB_ENV_VERSION: "1",
      DIETFLOW_CI_QUEUE_DIR: state,
      DIETFLOW_CI_QUEUE_JOB_ID: ticket.id,
      DIETFLOW_CI_QUEUE_HEAD_SHA: ticket.headSha,
      DIETFLOW_CI_BASE_SHA: "",
      LOCAL_CI_QUEUE_DIR: state,
      LOCAL_CI_JOB_ID: ticket.id,
      LOCAL_CI_PRESET: "declaredProgress",
      LOCAL_CI_PROGRESS_ENABLED: "1",
      LOCAL_CI_HEAD_SHA: ticket.headSha,
      LOCAL_CI_BASE_SHA: "",
    })
    expect(
      JSON.parse(readFileSync(join(project, "job-env-neutral.json"), "utf8"))
        .LOCAL_CI_PROGRESS_ENABLED
    ).toBe("")
  })

  it("invalidates a green recipe when its required Git snapshot changes", async () => {
    const { project, state } = fixture({
      stable: {
        argv: [
          process.execPath,
          "-e",
          "require('node:fs').writeFileSync('changed-during-job.txt', 'x')",
        ],
        requireGitStability: true,
      },
    })
    execFileSync("git", ["init"], { cwd: project })
    execFileSync("git", ["config", "user.email", "ci-queue@example.invalid"], {
      cwd: project,
    })
    execFileSync("git", ["config", "user.name", "CI Queue test"], {
      cwd: project,
    })
    execFileSync("git", ["add", "ci-queue.json"], { cwd: project })
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: project })

    const ticket = enqueueTicket({ preset: "stable", cwd: project, stateRoot: state })
    await runWorker(state)

    expect(listHistoryJobs(state)[0]).toMatchObject({
      id: ticket.id,
      status: "failed",
      exitCode: 1,
      failureReason: expect.stringContaining("estado Git mudou durante o job (statusShort)"),
      preflight: expect.any(Object),
      postflight: expect.any(Object),
    })
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
    const marker = ["failed", "running", "passed"].map(status => ["@@ci-queue-progress", "1", "node", "bootstrap", "-", "stage", status, "12", "Bootstrap"].join("\t")).join("\n")
    const { project, state } = fixture({
      progress: { argv: [process.execPath, "-e", `console.log(${JSON.stringify(marker)})`] },
    })
    enqueueTicket({ preset: "progress", cwd: project, stateRoot: state })

    await runWorker(state)

    expect(listHistoryJobs(state)[0].progress?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bootstrap", kind: "stage", status: "passed", durationMs: 12, retryCount: 1 }),
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

  it("reconciles a dead worker without restoring its residual claim", async () => {
    const { project, state } = fixture({ noop: { argv: [process.execPath, "-e", "process.exit(0)"] } })
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { cwd: project, detached: true, stdio: "ignore" })
    child.unref()
    await waitFor(() => Boolean(child.pid && probeProcessGroupIdentity(child.pid)))
    const identity = probeProcessGroupIdentity(child.pid!)!
    const id = "interrupted-fixture"
    const paths = ensureQueueDirs(state)
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
    atomicWriteJson(claimPath(state, id), {
      ...ticket,
      status: "queued",
      startedAt: undefined,
    })

    const report = await runWorker(state)
    expect(report.reconciliation).toBe("reconciled")
    expect(report.processed).toEqual([])
    expect(listHistoryJobs(state)[0]).toMatchObject({ id, status: "interrupted" })
    expect(readRunningJob(state)).toBeUndefined()
    expect(existsSync(claimPath(state, id))).toBe(false)
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

describe("state-root compatibility", () => {
  it("keeps an existing local-ci state root and its lock layout", async () => {
    const home = mkdtempSync(join(tmpdir(), "ci-queue-home-"))
    cleanup.push(home)
    const compatibilityRoot = compatibilityStateRoot(home)
    mkdirSync(compatibilityRoot, { recursive: true })

    expect(resolveStateRoot(undefined, {}, home)).toBe(compatibilityRoot)
    expect(resolveStateRoot(undefined, {}, join(home, "clean"))).toBe(
      productStateRoot(join(home, "clean"))
    )

    const paths = ensureQueueDirs(compatibilityRoot)
    expect(paths.workerPid).toBe(join(compatibilityRoot, "state", "worker.pid"))
    expect(paths.runnerLock).toBe(join(compatibilityRoot, "locks", "runner.lock"))
    expect(paths.jobLocks).toBe(join(compatibilityRoot, "locks", "jobs"))

    mkdirSync(paths.runnerLock)
    writeFileSync(
      join(paths.runnerLock, "owner.json"),
      JSON.stringify({ pid: process.pid })
    )
    await expect(runWorker(compatibilityRoot)).resolves.toMatchObject({
      busy: true,
      reconciliation: "active",
    })
  })
})

describe("CLI JSON v1", () => {
  it("announces the execution flags and job environment contract together", async () => {
    const version = await runCli(["version", "--json"])

    expect(version).toMatchObject({
      apiVersion: 1,
      ok: true,
      result: {
        capabilities: expect.arrayContaining([
          "enqueue",
          "execution-flags-v1",
          "job-env-v1",
          "spend-abort-v1",
          "node-runtime-guard-v1",
        ]),
      },
    })
  })

  it("registers an absolute Node into the operator runtime registry", async () => {
    const state = mkdtempSync(join(tmpdir(), "ci-queue-runtime-registry-"))
    cleanup.push(state)
    const node = realpathSync(process.execPath)
    const registered = await runCli([
      "runtime", "register",
      "--project", "example",
      "--node", node,
      "--state", state,
      "--json",
    ])
    expect(registered).toMatchObject({
      apiVersion: 1,
      ok: true,
      result: {
        projectId: "example",
        node: { executable: node, version: process.versions.node },
      },
    })
    const shown = await runCli(["runtime", "show", "--state", state, "--json"])
    expect(shown).toMatchObject({
      apiVersion: 1,
      ok: true,
      result: {
        registry: {
          schemaVersion: 1,
          projects: { example: { node: { executable: node, version: process.versions.node } } },
        },
      },
    })
  })

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
