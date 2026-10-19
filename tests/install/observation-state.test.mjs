import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { buildRelease } from "../helpers/release-fixture.mjs"
import { installRelease } from "../../scripts/install.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const fixture = JSON.parse(
  readFileSync(join(productRoot, "tests/fixtures/execution-observation-v1.json"), "utf8"),
)

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-observe-install-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0", type: "module" }))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of [
    "bin/ci-queue.mjs",
    "dist/cli.js",
    "backend/ci_queue_api/__main__.py",
    "ui/dist/index.html",
    "examples/local-project/ci-queue.json",
    "docs/INSTALL.md",
    "scripts/ci/verify-local-attestation.sh",
    "scripts/ci/check-with-progress.sh",
    "scripts/ci/test-suite.sh",
    "scripts/progress-emit.sh",
    "templates/github/ci-queue-verdict.yml",
  ]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${path}\n`)
  }
  for (const script of ["install.mjs", "release.mjs", "legacy-projects.mjs"]) {
    const target = join(root, "scripts", script)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(productRoot, "scripts", script), "utf8"))
  }
  return root
}

test("launcher defaults CI_QUEUE_STATE_DIR; observe lands in custom state", () => {
  const root = sourceFixture()
  const prefix = join(root, "prefix with space")
  const state = join(root, "state's custom")
  const command = join(root, "bin", "ci-queue")
  const home = join(root, "home")
  const compatibility = join(home, ".local", "state", "local-ci", "queue")
  try {
    cpSync(join(productRoot, "dist"), join(root, "dist"), { recursive: true })
    cpSync(join(productRoot, "bin"), join(root, "bin"), { recursive: true })
    mkdirSync(compatibility, { recursive: true })
    writeFileSync(join(compatibility, "sentinel.json"), "{}\n")
    const { destination } = buildRelease({
      root,
      outputDir: join(root, "bundles"),
      revision: "d".repeat(40),
    })
    const config = join(root, "consumer", "ci-queue.json")
    mkdirSync(dirname(config), { recursive: true })
    writeFileSync(config, "{}\n")
    const installed = installRelease({
      bundle: destination,
      prefix,
      stateRoot: state,
      configPath: config,
      nodePath: process.execPath,
      pythonPath: "/usr/bin/python3",
      commandPath: command,
    })

    const launcher = readFileSync(command, "utf8")
    assert.match(launcher, /export CI_QUEUE_STATE_DIR=/)
    assert.match(launcher, /state'"'"'s custom/)
    assert.equal(
      installed.command.sha256,
      createHash("sha256").update(launcher).digest("hex"),
    )

    const env = { ...process.env, HOME: home }
    delete env.CI_QUEUE_STATE_DIR
    const observed = spawnSync(command, ["observe", "--stdin", "--json"], {
      env,
      input: JSON.stringify(fixture),
      encoding: "utf8",
    })
    assert.equal(observed.status, 0, `${observed.stderr}\n${observed.stdout}`)
    const payload = JSON.parse(observed.stdout)
    assert.equal(payload.ok, true)
    assert.equal(readdirSync(join(state, "observations")).filter((n) => n.endsWith(".json")).length, 1)
    assert.equal(existsSync(join(compatibility, "observations")), false)

    const other = join(root, "other-state")
    mkdirSync(other, { recursive: true })
    const empty = spawnSync(command, ["history", "--include-observed", "--json"], {
      env: { ...env, CI_QUEUE_STATE_DIR: other },
      encoding: "utf8",
    })
    assert.equal(empty.status, 0, empty.stderr)
    assert.deepEqual(JSON.parse(empty.stdout).result.executions, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
