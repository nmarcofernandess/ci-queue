import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"
import { spawnSync } from "node:child_process"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const wrapper = join(repoRoot, "scripts/ci/check-with-progress.sh")
const testSuite = join(repoRoot, "scripts/ci/test-suite.sh")
const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

type FixtureOptions = {
  buildFails?: boolean
  coreFails?: boolean
  runtimeFails?: boolean
  omitBuildOutput?: boolean
  source?: string
  initialDist?: string
}

function fixture(options: FixtureOptions = {}) {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-check-composition-"))
  cleanup.push(root)
  const bin = join(root, "bin")
  const calls = join(root, "calls.log")
  const runners = join(root, "runners.log")
  const source = join(root, "source.txt")
  const dist = join(root, "dist.txt")
  const fakeNpm = join(bin, "npm")
  const fakeNode = join(bin, "node")
  const sourceValue = options.source ?? "source-v2"
  const initialDist = options.initialDist ?? "source-v1"

  mkdirSync(bin)
  writeFileSync(calls, "")
  writeFileSync(runners, "")
  writeFileSync(source, sourceValue)
  if (initialDist !== "missing") writeFileSync(dist, initialDist)
  writeFileSync(fakeNpm, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\${2:-}" >> ${JSON.stringify(calls)}
case "\${2:-}" in
  build)
    ${options.buildFails ? "exit 17" : options.omitBuildOutput ? "exit 0" : `cp ${JSON.stringify(source)} ${JSON.stringify(dist)}`}
    ;;
  test)
    # This is the pre-P04 public aggregate; P04 must stop the wrapper from using it.
    exit 0
    ;;
  test:prepared)
    exec bash ${JSON.stringify(testSuite)} prepared
    ;;
  test:core)
    ${options.coreFails ? "exit 19" : "exit 0"}
    ;;
  test:ui|test:backend|test:examples|test:release|test:install|check:ui|test:browser)
    exit 0
    ;;
  *)
    echo "unexpected npm script: \${2:-}" >&2
    exit 31
    ;;
esac
`)
  writeFileSync(fakeNode, `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "--test" ]; then
  printf 'runtime-runner\\n' >> ${JSON.stringify(runners)}
  test -f ${JSON.stringify(dist)} || exit 41
  test "$(cat ${JSON.stringify(dist)})" = "$(cat ${JSON.stringify(source)})" || exit 42
  ${options.runtimeFails ? "exit 23" : "printf '%s\\n' $'@@ci-queue-progress\\t1\\tnode\\tnested-runtime-fixture\\t-\\tstage\\trunning\\t-\\tLeaked'"}
  exit 0
fi
exec ${JSON.stringify(process.execPath)} "$@"
`)
  chmodSync(fakeNpm, 0o755)
  chmodSync(fakeNode, 0o755)
  return { root, bin, calls, runners, source, dist }
}

function envFor(f: ReturnType<typeof fixture>): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${f.bin}:${process.env.PATH ?? ""}` }
}

function runCheck(f: ReturnType<typeof fixture>) {
  return spawnSync("bash", [wrapper], { cwd: f.root, encoding: "utf8", env: envFor(f) })
}

function calls(f: ReturnType<typeof fixture>) {
  return readFileSync(f.calls, "utf8").trim().split("\\n").filter(Boolean)
}

it("uses one fresh build in check while its prepared test body runs the runtime runner", () => {
  const f = fixture()
  const result = runCheck(f)

  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(calls(f)).toEqual([
    "build",
    "test:prepared",
    "test:core",
    "test:ui",
    "test:backend",
    "test:examples",
    "test:release",
    "test:install",
    "check:ui",
    "test:browser",
  ])
  expect(readFileSync(f.runners, "utf8")).toBe("runtime-runner\\n")
  expect(readFileSync(f.dist, "utf8")).toBe("source-v2")
  expect(`${result.stdout}\\n${result.stderr}`).not.toContain("nested-runtime-fixture")
})

it("keeps the standalone test entry fresh before it runs the same runtime runner", () => {
  const f = fixture()
  const result = spawnSync("npm", ["run", "test"], { cwd: f.root, encoding: "utf8", env: envFor(f) })

  expect(result.status).toBe(0)
  expect(calls(f)).toEqual([
    "test",
    "build",
    "test:core",
    "test:ui",
    "test:backend",
    "test:examples",
    "test:release",
    "test:install",
  ])
  expect(readFileSync(f.runners, "utf8")).toBe("runtime-runner\\n")
})

it("fails the aggregate before runners when the only build fails", () => {
  const f = fixture({ buildFails: true })
  const result = runCheck(f)

  expect(result.status).toBe(17)
  expect(calls(f)).toEqual(["build"])
  expect(readFileSync(f.runners, "utf8")).toBe("")
})

it("does not consume absent build output and propagates the runtime failure", () => {
  const f = fixture({ initialDist: "missing", omitBuildOutput: true })
  const result = runCheck(f)

  expect(result.status).toBe(41)
  expect(calls(f)).toEqual(["build", "test:prepared", "test:core"])
  expect(readFileSync(f.runners, "utf8")).toBe("runtime-runner\\n")
  expect(existsSync(f.dist)).toBe(false)
})

it("propagates core and runtime failures without running later test populations", () => {
  const core = fixture({ coreFails: true })
  const coreResult = runCheck(core)
  expect(coreResult.status).toBe(19)
  expect(calls(core)).toEqual(["build", "test:prepared", "test:core"])
  expect(readFileSync(core.runners, "utf8")).toBe("")

  const runtime = fixture({ runtimeFails: true })
  const runtimeResult = runCheck(runtime)
  expect(runtimeResult.status).toBe(23)
  expect(calls(runtime)).toEqual(["build", "test:prepared", "test:core"])
  expect(readFileSync(runtime.runners, "utf8")).toBe("runtime-runner\\n")
})
