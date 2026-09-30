import { spawn, spawnSync, execFileSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const cli = join(productRoot, "bin", "ci-queue.mjs")
const OPERATOR_QUEUE = join(process.env.HOME ?? "", ".local", "state", "local-ci", "queue")
const REPO = "acme/app"
const PR = 12
const OTHER = "c".repeat(40)
let buildEnsured = false

const GIT_ENV = (() => {
  const env = {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  }
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete env[key]
  }
  return env
})()

function git(cwd, args, env = GIT_ENV) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function configureRepo(cwd, env) {
  git(cwd, ["config", "user.email", "ci-queue@example.invalid"], env)
  git(cwd, ["config", "user.name", "CI Queue test"], env)
  git(cwd, ["config", "gc.auto", "0"], env)
}

function ensureBuild() {
  if (buildEnsured) return
  execFileSync("npm", ["run", "build"], { cwd: productRoot, stdio: "pipe" })
  buildEnsured = true
}

function parseGhInvocation(argv, stdin) {
  let method = "GET"
  let path = ""
  const fields = {}
  const query = {}
  let inputText
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "api") continue
    if (arg === "--method" || arg === "-X") {
      method = String(argv[++index] ?? "GET").toUpperCase()
      continue
    }
    if (arg === "-f" || arg === "-F" || arg === "--raw-field" || arg === "--field") {
      const spec = String(argv[++index] ?? "")
      const eq = spec.indexOf("=")
      if (eq !== -1) fields[spec.slice(0, eq)] = spec.slice(eq + 1)
      continue
    }
    if (arg === "--input") {
      const file = String(argv[++index] ?? "")
      inputText = file === "-" ? stdin : ""
      continue
    }
    if (!arg.startsWith("-") && !path) {
      const raw = arg.replace(/^\//, "")
      const qIndex = raw.indexOf("?")
      path = qIndex === -1 ? raw : raw.slice(0, qIndex)
      const search = qIndex === -1 ? "" : raw.slice(qIndex + 1)
      for (const part of search.split("&").filter(Boolean)) {
        const eq = part.indexOf("=")
        const key = decodeURIComponent(eq === -1 ? part : part.slice(0, eq))
        const value = decodeURIComponent(eq === -1 ? "" : part.slice(eq + 1))
        query[key] = value
      }
    }
  }
  const body = inputText ? JSON.parse(inputText) : fields
  return { method, path, body, argv, query }
}

function writeFakeGh(bin) {
  mkdirSync(bin, { recursive: true })
  const script = join(bin, "gh")
  writeFileSync(
    script,
    `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync, writeSync } = require("node:fs")
const statePath = process.env.GH_STATE
const recordPath = process.env.GH_RECORD
const argv = process.argv.slice(2)
let stdin = ""
if (!process.stdin.isTTY) {
  try { stdin = readFileSync(0, "utf8") } catch { stdin = "" }
}
const invocation = (${parseGhInvocation.toString()})(argv, stdin)
if (recordPath) appendFileSync(recordPath, JSON.stringify(invocation) + "\\n")
if (argv.includes("--admin")) {
  process.stderr.write("--admin is forbidden\\n")
  process.exit(2)
}
const state = JSON.parse(readFileSync(statePath, "utf8"))

function send(value, status = 0) {
  writeSync(1, typeof value === "string" ? value : JSON.stringify(value) + "\\n")
  process.exit(status)
}

function prPayload() {
  const baseSha = state.baseSha
  return {
    id: 100,
    number: state.pr,
    node_id: "PR_kwDOAfixture",
    draft: state.draft === true,
    merged: state.merged === true,
    mergeable: true,
    mergeable_state: "clean",
    merge_commit_sha: state.merged ? state.mergeSha : null,
    head: {
      ref: state.headBranch,
      sha: state.headSha,
      repo: { id: state.repositoryId, full_name: state.repo, clone_url: state.cloneUrl },
    },
    base: {
      ref: state.baseBranch,
      sha: baseSha,
      repo: { id: state.repositoryId, full_name: state.repo, clone_url: state.cloneUrl },
    },
  }
}

function markReadyEffects() {
  state.draft = false
  if (state.baseMovesAfterAttest === true) state.deferBaseMove = true
  state.runs = [...(state.runs ?? []), {
    id: 77,
    run_attempt: 1,
    event: "pull_request",
    head_sha: state.headSha,
    name: "CI Queue verdict",
    display_title: "ci-verdict PR " + state.pr + " H " + state.headSha + " B0 " + state.originalBaseSha,
    path: ".github/workflows/ci-queue-verdict.yml",
    status: "completed",
    conclusion: "success",
    pull_requests: [{
      number: state.pr,
      head: { sha: state.headSha },
      base: { sha: state.originalBaseSha },
    }],
  }]
  state.jobs = [{ name: "ci-verdict", status: "completed", conclusion: "success" }]
  writeFileSync(statePath, JSON.stringify(state) + "\\n")
}

if (argv[0] === "pr") {
  if (argv[1] === "ready") {
    markReadyEffects()
    send("")
  }
  process.stderr.write("gh pr is forbidden in this fake\\n")
  process.exit(2)
}
if (argv[0] !== "api") {
  process.stderr.write("unsupported gh command\\n")
  process.exit(2)
}
const method = invocation.method
const path = invocation.path
const body = invocation.body && typeof invocation.body === "object" ? invocation.body : {}

if (method === "GET" && path === "repos/" + state.repo) {
  send({
    id: state.repositoryId,
    name: "app",
    full_name: state.repo,
    clone_url: state.cloneUrl,
    default_branch: state.baseBranch,
    allow_merge_commit: true,
  })
}

if (method === "GET" && (path === "repos/" + state.repo + "/pulls/" + state.pr || path === "repos/" + state.repo + "/pulls")) {
  if (state.deferBaseMove === true) {
    if (state.seenPullAfterReady === true) {
      state.baseSha = state.movedBaseSha
      state.deferBaseMove = false
      writeFileSync(statePath, JSON.stringify(state) + "\\n")
    } else {
      state.seenPullAfterReady = true
      writeFileSync(statePath, JSON.stringify(state) + "\\n")
    }
  }
  if (path.endsWith("/pulls")) send([prPayload()])
  send(prPayload())
}

if (method === "GET" && path === "repos/" + state.repo + "/commits/" + state.headSha + "/status") {
  send({ statuses: state.statuses ?? [] })
}

if (method === "GET" && path === "repos/" + state.repo + "/commits/" + state.headSha + "/statuses") {
  send(state.statuses ?? [])
}

if (method === "POST" && path === "repos/" + state.repo + "/statuses/" + state.headSha) {
  const status = {
    context: body.context,
    state: body.state,
    description: body.description,
    id: (state.statuses?.length ?? 0) + 1,
    updated_at: "2026-09-17T00:00:00Z",
    created_at: "2026-09-17T00:00:00Z",
  }
  state.statuses = [...(state.statuses ?? []), status]
  writeFileSync(statePath, JSON.stringify(state) + "\\n")
  send(status)
}

if (method === "PATCH" && path === "repos/" + state.repo + "/pulls/" + state.pr) {
  // Draft conversion via REST PATCH is unsupported; keep draft unchanged.
  writeFileSync(statePath, JSON.stringify(state) + "\\n")
  send(prPayload())
}

if (method === "GET" && /\\/actions\\/runs\\/\\d+\\/jobs$/.test(path)) {
  send({ jobs: state.jobs ?? [] })
}

if (method === "GET" && path.startsWith("repos/" + state.repo + "/actions/runs")) {
  const query = invocation.query ?? {}
  let runs = state.runs ?? []
  if (query.head_sha) runs = runs.filter((item) => item.head_sha === query.head_sha)
  if (query.event) runs = runs.filter((item) => item.event === query.event)
  send({ workflow_runs: runs })
}

if (method === "POST" && /\\/actions\\/workflows\\/.+\\/dispatches$/.test(path)) {
  state.runs = [...(state.runs ?? []), {
    id: 88,
    run_attempt: 1,
    event: "workflow_dispatch",
    head_sha: state.originalBaseSha,
    name: "CI Queue verdict",
    display_title: "ci-verdict PR " + state.pr + " H " + state.headSha + " B0 " + state.originalBaseSha + " req dispatch",
    path: ".github/workflows/ci-queue-verdict.yml",
    status: "completed",
    conclusion: "success",
    pull_requests: [],
  }]
  state.jobs = [{ name: "ci-verdict", status: "completed", conclusion: "success" }]
  writeFileSync(statePath, JSON.stringify(state) + "\\n")
  send("", 0)
}

if (method === "PUT" && path === "repos/" + state.repo + "/pulls/" + state.pr + "/merge") {
  state.mergeRequest = body
  state.merged = true
  writeFileSync(statePath, JSON.stringify(state) + "\\n")
  send({ sha: state.mergeSha, merged: true, message: "Pull Request successfully merged" })
}

if (method === "GET" && path === "repos/" + state.repo + "/git/commits/" + state.mergeSha) {
  send({
    sha: state.mergeSha,
    parents: (state.mergeParents ?? [state.originalBaseSha, state.headSha]).map((sha) => ({ sha })),
    tree: { sha: state.headTree },
  })
}

if (method === "GET" && path === "repos/" + state.repo + "/git/commits/" + state.headSha) {
  send({ sha: state.headSha, tree: { sha: state.headTree }, parents: [{ sha: state.originalBaseSha }] })
}

process.stderr.write("gh mock: no fixture for " + method + " " + path + "\\n")
process.exit(1)
`,
  )
  chmodSync(script, 0o755)
}

function readRecords(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function invoke(args, env, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args, "--json"], {
    encoding: "utf8",
    env,
    cwd,
    timeout: 30_000,
  })
  let payload
  try {
    payload = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(
      `CLI JSON inválido (status=${result.status}): stdout=${result.stdout} stderr=${result.stderr} parse=${error}`,
    )
  }
  return { payload, status: result.status ?? 1, stderr: result.stderr }
}

function invokeAsync(args, env, cwd) {
  const child = spawn(process.execPath, [cli, ...args, "--json"], {
    env,
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  let closed = false
  const completion = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("close", (status) => {
      closed = true
      let payload
      try {
        payload = JSON.parse(stdout)
      } catch {
        payload = undefined
      }
      resolve({ payload, status: status ?? 1, stderr })
    })
  })
  return {
    child,
    completion,
    get closed() {
      return closed
    },
    get stderr() {
      return stderr
    },
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("tempo esgotado aguardando condição")
    await sleep(10)
  }
}

function createFixture(options = {}) {
  ensureBuild()
  const staging = mkdtempSync(join(tmpdir(), "ci-queue-init-ship-"))
  assert.notEqual(staging, OPERATOR_QUEUE)
  const dest = join(staging, "dest.git")
  const seed = join(staging, "seed")
  const clone = join(staging, "clone")
  const state = join(staging, "state")
  const home = join(staging, "home")
  const bin = join(staging, "bin")
  mkdirSync(home)
  mkdirSync(state)
  mkdirSync(seed)
  writeFakeGh(bin)

  execFileSync("git", ["init", "--bare", dest], { encoding: "utf8", env: GIT_ENV })
  git(seed, ["init", "-b", "dev"])
  configureRepo(seed, GIT_ENV)
  writeFileSync(join(seed, "README.md"), "seed\n")
  git(seed, ["add", "README.md"])
  git(seed, ["commit", "-m", "seed"])
  git(seed, ["remote", "add", "dest", dest])
  git(seed, ["push", "dest", "HEAD:dev"])
  execFileSync("git", ["--git-dir", dest, "symbolic-ref", "HEAD", "refs/heads/dev"], {
    encoding: "utf8",
    env: GIT_ENV,
  })

  execFileSync("git", ["clone", "-b", "dev", dest, clone], { encoding: "utf8", env: GIT_ENV })
  git(clone, ["remote", "rename", "origin", "dest"])
  configureRepo(clone, GIT_ENV)

  const destUrl = pathToFileURL(realpathSync(dest)).href
  writeFileSync(
    join(home, ".gitconfig"),
    `[url "${destUrl}"]\n\tinsteadOf = https://github.com/acme/app.git\n`,
  )
  const env = {
    ...GIT_ENV,
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    GH_RECORD: join(staging, "gh-record.ndjson"),
    GH_STATE: join(staging, "gh-state.json"),
  }
  git(clone, ["remote", "set-url", "dest", "https://github.com/acme/app.git"], env)
  git(clone, ["checkout", "-b", "feature/ship"], env)
  writeFileSync(join(clone, "check.mjs"), "process.exit(0)\n")
  git(clone, ["add", "check.mjs"], env)
  git(clone, ["commit", "-m", "recipe"], env)

  const init = invoke(
    [
      "init",
      "--cwd",
      clone,
      "--state",
      state,
      "--name",
      "Fixture",
      "--base-ref",
      "dest/dev",
      "--argv-json",
      JSON.stringify(["node", "./check.mjs"]),
      "--workflow",
    ],
    env,
    clone,
  )
  assert.equal(init.payload.ok, true, JSON.stringify(init.payload))
  git(clone, ["add", "ci-queue.json", ".github"], env)
  git(clone, ["commit", "-m", "catalog"], env)
  assert.equal(git(clone, ["status", "--short"], env), "")

  const headSha = git(clone, ["rev-parse", "HEAD"], env)
  const baseSha = git(clone, ["rev-parse", "dest/dev"], env)
  const headTree = git(clone, ["rev-parse", "HEAD^{tree}"], env)
  const yaml = readFileSync(join(clone, ".github", "workflows", "ci-queue-verdict.yml"), "utf8")
  assert.equal(yaml.includes("npm ci"), false)
  assert.equal(yaml.includes("playwright"), false)

  writeFileSync(
    env.GH_STATE,
    `${JSON.stringify({
      repo: REPO,
      cloneUrl: "https://github.com/acme/app.git",
      repositoryId: 42,
      pr: PR,
      draft: options.draft === false ? false : true,
      merged: false,
      headBranch: "feature/ship",
      headSha,
      headTree,
      baseBranch: "dev",
      baseSha,
      originalBaseSha: baseSha,
      movedBaseSha: OTHER,
      mergeSha: "f".repeat(40),
      mergeParents: options.mergeParents ?? [baseSha, headSha],
      baseMovesAfterAttest: options.baseMovesAfterAttest === true,
      statuses: [],
      runs: [],
      jobs: [],
    })}\n`,
  )

  let ticket
  if (options.enqueueInitial !== false) {
    const enqueue = invoke(["enqueue", "check", "--cwd", clone, "--state", state], env, clone)
    assert.equal(enqueue.payload.ok, true, JSON.stringify(enqueue.payload))
    if (options.runWorker !== false) {
      const worker = invoke(["worker", "--state", state], env, clone)
      assert.equal(worker.payload.ok, true, JSON.stringify(worker.payload))
      const history = invoke(["history", "--state", state], env, clone)
      assert.equal(history.payload.ok, true, JSON.stringify(history.payload))
      const tickets = history.payload.result.jobs
      assert.equal(tickets.length, 1)
      ticket = tickets[0]
      assert.equal(ticket.status, "passed", JSON.stringify(ticket))
      assert.equal(ticket.exitCode, 0)
      assert.deepEqual(ticket.argv, ["node", "./check.mjs"])
      assert.equal(ticket.headSha, headSha)
      assert.equal(ticket.preflight?.headSha, headSha)
      assert.equal(ticket.preflight?.baseSha, baseSha)
      assert.equal(ticket.preflight?.statusShort, "")
      assert.equal(ticket.postflight?.headSha, headSha)
      assert.equal(ticket.postflight?.baseSha, baseSha)
    }
  }
  assert.notEqual(state, OPERATOR_QUEUE)
  assert.equal(state.startsWith(staging), true)

  return {
    staging,
    clone,
    state,
    env,
    headSha,
    baseSha,
    ticket,
    invokeShip(flags) {
      return invoke(
        ["ship", "--cwd", clone, "--state", state, "--repo", REPO, "--pr", String(PR), "--timeout-ms", "15000", ...flags],
        env,
        clone,
      )
    },
    records() {
      return readRecords(env.GH_RECORD)
    },
  }
}

test("init-to-dry-run reuses the ticket the compiled worker actually wrote", { timeout: 60_000 }, () => {
  const fixture = createFixture()
  try {
    const ship = fixture.invokeShip(["--dry-run", "--no-remote"])
    assert.equal(ship.payload.ok, true, `${JSON.stringify(ship.payload)} stderr=${ship.stderr}`)
    assert.equal(ship.payload.result.effects.reused, true)
    assert.equal(ship.payload.result.effects.ticketId, fixture.ticket.id)
    assert.equal(ship.payload.result.dryRun, true)
    const records = fixture.records()
    assert.equal(records.some((item) => item.method === "PUT" && item.path.endsWith("/merge")), false)
    assert.equal(records.some((item) => item.argv.includes("pr")), false)
  } finally {
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("ship keeps its real CLI process alive while waiting for the check it enqueues", { timeout: 60_000 }, async () => {
  const fixture = createFixture({ enqueueInitial: false, runWorker: false })
  const ship = invokeAsync(
    ["ship", "--cwd", fixture.clone, "--state", fixture.state, "--repo", REPO, "--pr", String(PR), "--timeout-ms", "15000", "--no-remote"],
    fixture.env,
    fixture.clone,
  )
  try {
    await waitFor(() => ship.stderr.includes("[ship] modo=skipped"))
    await waitFor(() => {
      const queued = invoke(["status", "--state", fixture.state], fixture.env, fixture.clone)
      return queued.payload.ok === true && queued.payload.result.queued.length === 1
    })
    await sleep(100)
    assert.equal(ship.closed, false, `ship encerrou enquanto aguardava o ticket: ${ship.stderr}`)

    const worker = invoke(["worker", "--state", fixture.state], fixture.env, fixture.clone)
    assert.equal(worker.payload.ok, true, JSON.stringify(worker.payload))

    const completed = await ship.completion
    assert.equal(completed.status, 0, `ship não aguardou o ticket: ${completed.stderr}`)
    assert.equal(completed.payload?.ok, true, JSON.stringify(completed.payload))
  } finally {
    if (!ship.closed) ship.child.kill("SIGTERM")
    await ship.completion
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("ship reports WAIT_TIMEOUT from its real CLI process without cancelling the queued check", { timeout: 60_000 }, async () => {
  const fixture = createFixture({ enqueueInitial: false, runWorker: false })
  const ship = invokeAsync(
    ["ship", "--cwd", fixture.clone, "--state", fixture.state, "--repo", REPO, "--pr", String(PR), "--timeout-ms", "2000", "--no-remote"],
    fixture.env,
    fixture.clone,
  )
  try {
    await waitFor(() => ship.stderr.includes("[ship] modo=skipped"))
    await waitFor(() => {
      const status = invoke(["status", "--state", fixture.state], fixture.env, fixture.clone)
      return status.payload.ok === true && status.payload.result.queued.length === 1
    })
    const completed = await ship.completion
    assert.equal(completed.status, 1, `ship retornou status inesperado: ${completed.stderr}`)
    assert.equal(completed.payload?.ok, false, JSON.stringify(completed.payload))
    assert.equal(completed.payload?.error?.code, "WAIT_TIMEOUT", JSON.stringify(completed.payload))

    const status = invoke(["status", "--state", fixture.state], fixture.env, fixture.clone)
    assert.equal(status.payload.ok, true, JSON.stringify(status.payload))
    assert.equal(status.payload.result.running, null)
    assert.equal(status.payload.result.queued.length, 1, JSON.stringify(status.payload.result))
  } finally {
    if (!ship.closed) ship.child.kill("SIGTERM")
    await ship.completion
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("ship wait after draft uses the pull_request run and does not dispatch", { timeout: 60_000 }, () => {
  const fixture = createFixture()
  try {
    const ship = fixture.invokeShip([])
    assert.equal(ship.payload.ok, true, JSON.stringify(ship.payload))
    assert.equal(ship.payload.result.effects.ticketId, fixture.ticket.id)
    assert.equal(ship.payload.result.effects.reused, true)
    assert.equal(ship.payload.result.effects.attested, true)
    assert.equal(ship.payload.result.effects.markedReady, true)
    assert.equal(ship.payload.result.effects.merged, true)
    assert.equal(ship.payload.result.effects.mergeVerified, true)
    assert.equal(ship.payload.result.guarantee, "head-pinned-base-observed")

    const records = fixture.records()
    assert.equal(records.some((item) => item.argv[0] === "pr" && item.argv[1] === "merge"), false)
    assert.equal(records.some((item) => item.argv[0] === "pr" && item.argv[1] === "ready"), true)
    assert.equal(records.some((item) => item.argv.includes("--admin")), false)
    assert.equal(records.some((item) => item.method === "POST" && String(item.path).includes("/dispatches")), false)
    const merge = records.find((item) => item.method === "PUT" && item.path === `repos/${REPO}/pulls/${PR}/merge`)
    assert.ok(merge, JSON.stringify(records, null, 2))
    assert.equal(merge.body.sha, fixture.headSha)
    assert.equal(merge.body.merge_method, "merge")
    const inspect = records.find((item) => item.method === "GET" && item.path === `repos/${REPO}/git/commits/${"f".repeat(40)}`)
    assert.ok(inspect, "inspectMerge must read the merge commit")
  } finally {
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("already-ready wait dispatches on the base ref and correlates by run-name", { timeout: 60_000 }, () => {
  const fixture = createFixture({ draft: false })
  try {
    const ship = fixture.invokeShip([])
    assert.equal(ship.payload.ok, true, JSON.stringify(ship.payload))
    assert.equal(ship.payload.result.effects.markedReady, false)
    assert.equal(ship.payload.result.effects.merged, true)
    const records = fixture.records()
    const dispatch = records.find((item) => item.method === "POST" && String(item.path).includes("/dispatches"))
    assert.ok(dispatch, JSON.stringify(records, null, 2))
    assert.equal(dispatch.body.ref, "dev")
    assert.equal(dispatch.body.inputs.head, fixture.headSha)
    assert.equal(dispatch.body.inputs.base, fixture.baseSha)
    assert.equal(records.some((item) => item.query?.event === "workflow_dispatch"), true)
    const listedDispatch = records.filter((item) => item.method === "GET" && String(item.path).includes("/actions/runs"))
    assert.ok(listedDispatch.length > 0)
    const merge = records.find((item) => item.method === "PUT" && item.path.endsWith("/merge"))
    assert.ok(merge)
    assert.equal(merge.body.sha, fixture.headSha)
  } finally {
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("BASE_MOVED before merge POST does not PUT merge", { timeout: 60_000 }, () => {
  const fixture = createFixture({ baseMovesAfterAttest: true })
  try {
    const ship = fixture.invokeShip([])
    assert.equal(ship.payload.ok, false, JSON.stringify(ship.payload))
    assert.equal(ship.payload.error.code, "BASE_MOVED")
    const records = fixture.records()
    assert.equal(records.some((item) => item.method === "PUT" && String(item.path).endsWith("/merge")), false)
  } finally {
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})

test("first parent other than B0 after POST reports merged true and mergeVerified false", { timeout: 60_000 }, () => {
  const fixture = createFixture({ mergeParents: [OTHER, undefined] })
  try {
    const state = JSON.parse(readFileSync(fixture.env.GH_STATE, "utf8"))
    state.mergeParents = [OTHER, fixture.headSha]
    writeFileSync(fixture.env.GH_STATE, `${JSON.stringify(state)}\n`)
    const ship = fixture.invokeShip([])
    assert.equal(ship.payload.ok, false, JSON.stringify(ship.payload))
    assert.equal(ship.payload.error.code, "MERGED_BASE_CHANGED")
    assert.equal(ship.payload.error.details.effects.merged, true)
    assert.equal(ship.payload.error.details.effects.mergeVerified, false)
    const records = fixture.records()
    const merge = records.find((item) => item.method === "PUT" && item.path.endsWith("/merge"))
    assert.ok(merge)
    assert.equal(merge.body.sha, fixture.headSha)
  } finally {
    rmSync(fixture.staging, { recursive: true, force: true })
  }
})
