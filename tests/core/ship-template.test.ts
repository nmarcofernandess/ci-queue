import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { readQueueConfig } from "../../src/contracts/config.js"
import { initProject, renderCiQueueVerdictWorkflow } from "../../src/ship/init.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

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

const ARGV = ["python", "-m", "pytest", "-q"]
const H = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const B0 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const B1 = "cccccccccccccccccccccccccccccccccccccccc"
const REPO = "acme/widget"
const PR = "42"
const CONTEXT = "team/proof"
const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "ci", "verify-local-attestation.sh")
const WORKFLOW_DEST = ".github/workflows/ci-queue-verdict.yml"
const SCRIPT_DEST = ".github/scripts/verify-local-attestation.sh"

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(path)
  return path
}

function initGitRepo(): string {
  const cwd = tempDir("ci-queue-template-repo-")
  git(cwd, ["init", "-b", "dev"])
  git(cwd, ["config", "user.email", "ci-queue@example.invalid"])
  git(cwd, ["config", "user.name", "CI Queue test"])
  git(cwd, ["config", "gc.auto", "0"])
  writeFileSync(join(cwd, "README.md"), "fixture\n")
  git(cwd, ["add", "README.md"])
  git(cwd, ["commit", "-m", "init"])
  git(cwd, ["remote", "add", "dest", cwd])
  return cwd
}

function assertPortableWorkflow(yaml: string, input: { context: string; branch: string }) {
  expect(yaml).toMatch(/run-name:/)
  expect(yaml).toContain("github.event.pull_request.number || inputs.pr")
  expect(yaml).toContain("github.event.pull_request.head.sha || inputs.head")
  expect(yaml).toContain("github.event.pull_request.base.sha || inputs.base")
  expect(yaml).toMatch(/types:\s*\[ready_for_review,\s*synchronize,\s*reopened\]/)
  expect(yaml).not.toMatch(/types:\s*\[[^\]]*\bopened\b/)
  expect(yaml).toMatch(/workflow_dispatch:/)
  expect(yaml).toMatch(/^\s+pr:/m)
  expect(yaml).toMatch(/^\s+head:/m)
  expect(yaml).toMatch(/^\s+base:/m)
  expect(yaml).toMatch(/requestId:/)
  expect(yaml).not.toMatch(/\bargv\b/)
  expect(yaml).toMatch(/^  ci-verdict:/m)
  expect(yaml).toContain(SCRIPT_DEST)
  expect(yaml).toMatch(/contents:\s*read/)
  expect(yaml).toMatch(/statuses:\s*read/)
  expect(yaml).toMatch(/pull-requests:\s*read/)
  expect(yaml).not.toMatch(/contents:\s*write/)
  expect(yaml).not.toMatch(/statuses:\s*write/)
  expect(yaml).not.toMatch(/npm ci/)
  expect(yaml).not.toMatch(/playwright/i)
  expect(yaml).not.toMatch(/setup-node/)
  expect(yaml).not.toMatch(/npm run check/)
  expect(yaml).toMatch(/ref:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha \|\| github\.sha\s*\}\}/)
  expect(yaml).not.toMatch(/ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha/)
  expect(yaml).toContain(`context: '${input.context}'`)
  expect(yaml).toContain(`branches: ['${input.branch}']`)
  expect(yaml).toMatch(new RegExp(`^\\s+context:\\s+'${input.context}'`, "m"))
}

function writeFakeGh(bin: string, fixtures: Record<string, unknown>) {
  mkdirSync(bin, { recursive: true })
  const fixturesPath = join(bin, "fixtures.json")
  writeFileSync(fixturesPath, `${JSON.stringify(fixtures)}\n`)
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs")
const fixtures = JSON.parse(readFileSync(${JSON.stringify(fixturesPath)}, "utf8"))
const args = process.argv.slice(2)
const record = process.env.GH_RECORD
if (record) appendFileSync(record, JSON.stringify(args) + "\\n")
if (args[0] !== "api") {
  process.stderr.write("unsupported gh command\\n")
  process.exit(2)
}
const endpoint = args.slice(1).find((arg) => arg && !arg.startsWith("-"))
if (fixtures.fail) {
  process.stderr.write(String(fixtures.fail.message || "HTTP 500") + "\\n")
  process.exit(Number(fixtures.fail.status || 1))
}
const body = fixtures.routes?.[endpoint]
if (body === undefined) {
  process.stderr.write("gh mock: no fixture for " + endpoint + "\\n")
  process.exit(1)
}
process.stdout.write(typeof body === "string" ? body : JSON.stringify(body) + "\\n")
`,
  )
  chmodSync(join(bin, "gh"), 0o755)
}

function status(input: { context: string; state: string; description: string; id: number; updatedAt: string }) {
  return {
    context: input.context,
    state: input.state,
    description: input.description,
    id: input.id,
    updated_at: input.updatedAt,
    created_at: input.updatedAt,
  }
}

function runVerifier(fixtures: Record<string, unknown>, extraEnv: Record<string, string> = {}) {
  const bin = tempDir("ci-queue-gh-bin-")
  const record = join(bin, "record.log")
  writeFakeGh(bin, fixtures)
  const result = spawnSync("bash", [VERIFIER], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      GH_RECORD: record,
      repo: REPO,
      H,
      B0,
      context: CONTEXT,
      pr: PR,
      ...extraEnv,
    },
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    record: existsSync(record) ? readFileSync(record, "utf8") : "",
  }
}

describe("portable verdict workflow renderer", () => {
  it("renders a different context and default branch than this product", () => {
    const yaml = renderCiQueueVerdictWorkflow({
      attestationContext: "team/proof",
      defaultBranch: "trunk",
    })
    assertPortableWorkflow(yaml, { context: "team/proof", branch: "trunk" })
    expect(yaml).not.toContain("local/check")
    expect(yaml).not.toMatch(/branches:\s*\['(main|dev)'\]/)
  })
})

describe("init --workflow", () => {
  it("copies the rendered verifier and never copies or overwrites ci.yml", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-template-state-")
    mkdirSync(join(repo, ".github", "workflows"), { recursive: true })
    writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "name: consumer\n")

    const created = await initProject(repo, {
      stateRoot: state,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/trunk",
      workflow: true,
    })

    expect(created.files).toEqual(
      expect.arrayContaining(["ci-queue.json", WORKFLOW_DEST, SCRIPT_DEST]),
    )
    const yaml = readFileSync(join(repo, WORKFLOW_DEST), "utf8")
    assertPortableWorkflow(yaml, { context: "local/check", branch: "trunk" })
    expect(readFileSync(join(repo, ".github", "workflows", "ci.yml"), "utf8")).toBe("name: consumer\n")
    expect(readQueueConfig(repo).config.ship).toEqual({
      acceptedPresets: ["check"],
      attestationContext: "local/check",
      remoteVerdict: { workflow: WORKFLOW_DEST, job: "ci-verdict" },
    })
    expect(existsSync(join(repo, SCRIPT_DEST))).toBe(true)
    expect(readFileSync(join(repo, SCRIPT_DEST), "utf8")).toBe(readFileSync(VERIFIER, "utf8"))
  })

  it("renders an existing custom context on --force and never overwrites destinations", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-template-state-")
    await initProject(repo, {
      stateRoot: state,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/dev",
    })
    const raw = JSON.parse(readFileSync(join(repo, "ci-queue.json"), "utf8")) as Record<string, unknown>
    raw.ship = { ...(raw.ship as object), attestationContext: "team/proof" }
    writeFileSync(join(repo, "ci-queue.json"), `${JSON.stringify(raw, null, 2)}\n`)
    mkdirSync(join(repo, ".github", "workflows"), { recursive: true })
    mkdirSync(join(repo, ".github", "scripts"), { recursive: true })
    writeFileSync(join(repo, WORKFLOW_DEST), "EXISTING WORKFLOW\n")
    writeFileSync(join(repo, SCRIPT_DEST), "EXISTING SCRIPT\n")
    writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "name: consumer\n")

    const updated = await initProject(repo, {
      stateRoot: state,
      force: true,
      workflow: true,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/trunk",
    })

    expect(updated.state).toBe("updated")
    expect(readFileSync(join(repo, WORKFLOW_DEST), "utf8")).toBe("EXISTING WORKFLOW\n")
    expect(readFileSync(join(repo, SCRIPT_DEST), "utf8")).toBe("EXISTING SCRIPT\n")
    expect(readFileSync(join(repo, ".github", "workflows", "ci.yml"), "utf8")).toBe("name: consumer\n")
    expect(updated.files).not.toContain(WORKFLOW_DEST)
    expect(updated.files).not.toContain(SCRIPT_DEST)
    expect(readQueueConfig(repo).config.ship).toMatchObject({
      attestationContext: "team/proof",
      remoteVerdict: { workflow: WORKFLOW_DEST, job: "ci-verdict" },
    })
  })
})

describe("verify-local-attestation.sh", () => {
  const pr = {
    state: "open",
    draft: false,
    head: { sha: H },
    base: { sha: B0 },
  }
  const okStatus = status({
    context: CONTEXT,
    state: "success",
    description: `base:${B0}`,
    id: 10,
    updatedAt: "2026-09-17T12:00:00Z",
  })
  const routes = {
    [`repos/${REPO}/pulls/${PR}`]: pr,
    [`repos/${REPO}/commits/${H}/statuses`]: [okStatus],
  }

  it("accepts a matching open PR and latest success tuple", () => {
    const result = runVerifier({ routes })
    expect(result.status).toBe(0)
    expect(result.record).toContain(`repos/${REPO}/pulls/${PR}`)
    expect(result.record).toContain(`repos/${REPO}/commits/${H}/statuses`)
    expect(result.record).not.toContain(`repos/${REPO}/statuses/${H}`)
  })

  it("fails closed when the live base moved", () => {
    const result = runVerifier({
      routes: {
        ...routes,
        [`repos/${REPO}/pulls/${PR}`]: { ...pr, base: { sha: B1 } },
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/base moved/i)
  })

  it("fails closed on the wrong context even when another context is green", () => {
    const result = runVerifier({
      routes: {
        ...routes,
        [`repos/${REPO}/commits/${H}/statuses`]: [
          status({
            context: "local/check",
            state: "success",
            description: `base:${B0}`,
            id: 11,
            updatedAt: "2026-09-17T12:00:00Z",
          }),
        ],
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/attestation missing|wrong context/i)
  })

  it("fails closed when a later failure outranks an older success", () => {
    const result = runVerifier({
      routes: {
        ...routes,
        [`repos/${REPO}/commits/${H}/statuses`]: [
          status({
            context: CONTEXT,
            state: "success",
            description: `base:${B0}`,
            id: 1,
            updatedAt: "2026-09-17T11:00:00Z",
          }),
          status({
            context: CONTEXT,
            state: "failure",
            description: `base:${B0}`,
            id: 2,
            updatedAt: "2026-09-17T12:00:00Z",
          }),
        ],
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/later failure|latest attestation is failure/i)
  })

  it("fails closed when the pull request attempt is skipped as draft", () => {
    const result = runVerifier({
      routes: {
        ...routes,
        [`repos/${REPO}/pulls/${PR}`]: { ...pr, draft: true },
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/skipped|draft/i)
  })

  it("fails closed on a GitHub API error", () => {
    const result = runVerifier({ fail: { message: "HTTP 502", status: 1 }, routes })
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/HTTP 502|GitHub API error/i)
  })
})
