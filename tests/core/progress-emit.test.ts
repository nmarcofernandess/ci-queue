import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"
import { parseProgressLine } from "../../src/core/progress.js"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const helper = join(repoRoot, "scripts/progress-emit.sh")
const wrapper = join(repoRoot, "scripts/ci/check-with-progress.sh")
const STAGES = ["build", "test:prepared", "check:ui", "test:browser"] as const

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(path)
  return path
}

function parseNodes(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((line) => parseProgressLine(line.trim()))
    .filter((event): event is NonNullable<typeof event> => event?.type === "node")
}

function fakeNpm(options: { failAt?: string; leakMarker?: boolean; recordVitest?: boolean } = {}) {
  const dir = tempDir("ci-queue-fake-npm-")
  const log = join(dir, "calls.log")
  const vitestLog = join(dir, "vitest.env")
  writeFileSync(log, "")
  const script = `#!/usr/bin/env bash
set -euo pipefail
log=${JSON.stringify(log)}
vitest_log=${JSON.stringify(vitestLog)}
if [ "\${1:-}" != "run" ] || [ -z "\${2:-}" ]; then
  echo "unexpected npm invocation: $*" >&2
  exit 2
fi
printf '%s\\n' "$2" >> "$log"
${options.recordVitest ? `printf '%s\\n' "\${VITEST_WORKER_ID-UNSET}" > "$vitest_log"` : ""}
${options.leakMarker ? `printf '%s\\n' $'@@ci-queue-progress\\t1\\tnode\\tnested-fixture\\t-\\tstage\\trunning\\t-\\tLeaked'` : ""}
if [ "$2" = "check" ]; then
  echo "must not recurse into npm run check" >&2
  exit 3
fi
fail_at=${JSON.stringify(options.failAt ?? "")}
if [ -n "$fail_at" ] && [ "$2" = "$fail_at" ]; then
  exit 7
fi
exit 0
`
  writeFileSync(join(dir, "npm"), script)
  chmodSync(join(dir, "npm"), 0o755)
  return { dir, log, vitestLog }
}

function guardState() {
  const state = tempDir("ci-queue-progress-guard-")
  writeFileSync(join(state, "running.json"), JSON.stringify({
    id: "fixture-check",
    status: "running",
    projectId: "070e4c47-709b-4fe1-9f98-d80d313a87f4",
    cwd: repoRoot,
    preset: "check",
    argv: ["npm", "run", "check"],
  }))
  return state
}

function wrapperEnv(pathDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extra,
    PATH: [pathDir, process.env.PATH ?? ""].filter(Boolean).join(":"),
    CI_QUEUE_STATE_DIR: guardState(),
    CI_QUEUE_JOB_ID: "fixture-check",
  }
  delete env.CHECK_WITH_PROGRESS_CMD
  return env
}

function runWrapper(pathDir: string, extra: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", [wrapper], {
    encoding: "utf8",
    cwd: tempDir("ci-queue-wrapper-cwd-"),
    env: wrapperEnv(pathDir, extra),
  })
}

it("prints a protocol node line the collector accepts", () => {
  const out = execFileSync("bash", [
    helper,
    "build", "-", "stage", "running", "-", "Build",
  ], { encoding: "utf8" })
  expect(parseProgressLine(out.trim())).toMatchObject({
    type: "node",
    id: "build",
    kind: "stage",
    status: "running",
    label: "Build",
  })
})

it("replaces tabs and newlines in the label so the line stays valid", () => {
  const out = execFileSync("bash", [
    helper,
    "build",
    "-",
    "stage",
    "running",
    "-",
    "Build\twith\r\nnewline",
  ], { encoding: "utf8" })
  const parsed = parseProgressLine(out.trim())
  expect(parsed).toMatchObject({ type: "node", id: "build", kind: "stage" })
  expect(parsed && "label" in parsed ? parsed.label : undefined).toBe("Build with  newline")
  expect(out).not.toMatch(/\tBuild\twith/)
})

it("runs build, test, check-ui and browser in order and never npm run check", () => {
  const npm = fakeNpm()
  const result = runWrapper(npm.dir)
  expect(result.status).toBe(0)
  expect(readFileSync(npm.log, "utf8").trim().split("\n")).toEqual([...STAGES])
  expect(parseNodes(result.stdout).map((event) => [event.id, event.status])).toEqual([
    ["build", "running"],
    ["build", "passed"],
    ["test", "running"],
    ["test", "passed"],
    ["check-ui", "running"],
    ["check-ui", "passed"],
    ["browser", "running"],
    ["browser", "passed"],
  ])
})

it("emits failed for the broken stage, keeps that exit code, and skips later stages", () => {
  for (const failAt of STAGES) {
    const npm = fakeNpm({ failAt })
    const result = runWrapper(npm.dir)
    expect(result.status, failAt).toBe(7)
    const ran = readFileSync(npm.log, "utf8").trim().split("\n")
    const expectedRan = STAGES.slice(0, STAGES.indexOf(failAt) + 1)
    expect(ran, failAt).toEqual(expectedRan)
    const nodes = parseNodes(result.stdout)
    const failedId = failAt === "test:prepared" ? "test" : failAt === "check:ui" ? "check-ui" : failAt === "test:browser" ? "browser" : failAt
    expect(nodes.filter((event) => event.id === failedId).map((event) => event.status), failAt).toEqual([
      "running",
      "failed",
    ])
    const later = STAGES.slice(STAGES.indexOf(failAt) + 1)
    for (const script of later) {
      const laterId = script === "test:prepared" ? "test" : script === "check:ui" ? "check-ui" : script === "test:browser" ? "browser" : script
      expect(nodes.some((event) => event.id === laterId), `${failAt} leaked ${laterId}`).toBe(false)
    }
  }
})

it("does not forward nested fixture protocol lines from child npm", () => {
  const npm = fakeNpm({ leakMarker: true })
  const result = runWrapper(npm.dir)
  expect(result.status).toBe(0)
  const nodes = parseNodes(`${result.stdout}\n${result.stderr}`)
  expect(nodes.some((event) => event.id === "nested-fixture")).toBe(false)
  expect(nodes.filter((event) => event.id === "test").map((event) => event.status)).toEqual([
    "running",
    "passed",
  ])
})

it("clears inherited Vitest worker identity before spawning npm", () => {
  const npm = fakeNpm({ recordVitest: true })
  const result = runWrapper(npm.dir, { VITEST_WORKER_ID: "nested-leak" })
  expect(result.status).toBe(0)
  expect(readFileSync(npm.vitestLog, "utf8").trim()).toBe("UNSET")
})

it("points npm run check at the wrapper, keeps catalog argv, and ships both scripts", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts: { check: string } }
  expect(pkg.scripts.check).toBe("bash scripts/ci/check-with-progress.sh")
  const catalog = JSON.parse(readFileSync(join(repoRoot, "ci-queue.json"), "utf8")) as {
    presets: { check: { argv: string[] } }
  }
  expect(catalog.presets.check.argv).toEqual(["npm", "run", "check"])
  const release = readFileSync(join(repoRoot, "scripts/release.mjs"), "utf8")
  expect(release).toContain('"scripts/progress-emit.sh"')
  expect(release).toContain('"scripts/ci/check-with-progress.sh"')
  expect(release).toContain('"scripts/ci/test-suite.sh"')
  expect(readFileSync(wrapper, "utf8")).not.toMatch(/CHECK_WITH_PROGRESS_CMD/)
  expect(readFileSync(join(repoRoot, "package.json"), "utf8")).not.toMatch(/CHECK_WITH_PROGRESS_CMD/)
})
