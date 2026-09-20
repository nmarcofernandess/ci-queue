import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, test } from "node:test"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "../..")
const cliEntry = join(repoRoot, "dist/cli.js")
const fixture = JSON.parse(
  readFileSync(join(repoRoot, "tests/fixtures/execution-observation-v1.json"), "utf8"),
)

const roots = []
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

function tempState() {
  const root = mkdtempSync(join(tmpdir(), "ci-observe-cli-"))
  roots.push(root)
  return root
}

function runCli(args, { state, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliEntry, ...args, "--state", state, "--json"], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("close", (code) => {
      let parsed
      try {
        parsed = JSON.parse(stdout)
      } catch {
        parsed = null
      }
      resolve({ code, stdout, stderr, parsed })
    })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

test("two concurrent observes leave one valid file", async () => {
  const state = tempState()
  const payload = JSON.stringify(fixture)
  const [a, b] = await Promise.all([
    runCli(["observe", "--stdin"], { state, input: payload }),
    runCli(["observe", "--stdin"], { state, input: payload }),
  ])
  const outcomes = [a, b].map((item) => item.parsed?.result?.outcome).sort()
  assert.deepEqual(outcomes, ["already-present", "created"])
  assert.equal(a.parsed?.ok && b.parsed?.ok, true)
  const files = readdirSync(join(state, "observations")).filter((name) => name.endsWith(".json"))
  assert.equal(files.length, 1)
  const body = JSON.parse(readFileSync(join(state, "observations", files[0]), "utf8"))
  assert.equal(body.executionId, fixture.executionId)
})

test("conflicting concurrent observes keep one winner and one conflict", async () => {
  const state = tempState()
  const first = { ...fixture, executionId: "20260920090000-conflict" }
  const second = { ...first, status: "failed", exitCode: 2 }
  const [a, b] = await Promise.all([
    runCli(["observe", "--stdin"], { state, input: JSON.stringify(first) }),
    runCli(["observe", "--stdin"], { state, input: JSON.stringify(second) }),
  ])
  const codes = [a, b].map((item) => (item.parsed?.ok ? "ok" : item.parsed?.error?.code)).sort()
  assert.ok(codes.includes("ok"))
  assert.ok(codes.includes("OBSERVATION_CONFLICT"))
  const files = readdirSync(join(state, "observations")).filter((name) => name.endsWith(".json"))
  assert.equal(files.length, 1)
})

test("history without flag omits observations; include-observed returns them", async () => {
  const state = tempState()
  const observed = await runCli(["observe", "--stdin"], {
    state,
    input: JSON.stringify(fixture),
  })
  assert.equal(observed.parsed?.ok, true)
  const native = await runCli(["history"], { state })
  assert.equal(native.parsed?.ok, true)
  assert.deepEqual(native.parsed.result.jobs, [])
  assert.equal(native.parsed.result.executions, undefined)

  const unified = await runCli(["history", "--include-observed"], { state })
  assert.equal(unified.parsed?.ok, true)
  assert.equal(unified.parsed.result.executions.length, 1)
  assert.equal(unified.parsed.result.executions[0].recordKind, "observed-execution")
  assert.equal(unified.parsed.result.executions[0].executionId, fixture.executionId)
})

test("version announces execution-observe-v1", async () => {
  const state = tempState()
  const version = await runCli(["version"], { state })
  assert.equal(version.parsed?.ok, true)
  assert.ok(version.parsed.result.capabilities.includes("execution-observe-v1"))
})

test("stdin above 32KiB is rejected", async () => {
  const state = tempState()
  const huge = `${"x".repeat(33 * 1024)}`
  const result = await runCli(["observe", "--stdin"], { state, input: huge })
  assert.equal(result.parsed?.ok, false)
  assert.equal(result.parsed?.error?.code, "OBSERVATION_TOO_LARGE")
})

// silence unused in case tree-shake
