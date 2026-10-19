import { execFileSync } from "node:child_process"
import { existsSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

import { buildRelease } from "../helpers/release-fixture.mjs"
import { installRelease, uninstallRelease } from "../../scripts/install.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-install-source-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0" }))
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
    writeFileSync(target, path)
  }
  for (const script of ["install.mjs", "release.mjs", "legacy-projects.mjs"]) {
    const target = join(root, "scripts", script)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(productRoot, "scripts", script), "utf8"))
  }
  return root
}

test("installs a verified immutable release and preserves state on uninstall", () => {
  const root = sourceFixture()
  const prefix = join(root, "prefix")
  const state = join(root, "state")
  try {
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "b".repeat(40) })
    const config = join(root, "consumer", "ci-queue.json")
    const command = join(root, "bin", "ci-queue")
    mkdirSync(dirname(config), { recursive: true })
    writeFileSync(config, "{}\n")
    const installed = installRelease({
      bundle: destination, prefix, stateRoot: state, configPath: config,
      nodePath: "/opt/homebrew/bin/node", pythonPath: "/usr/bin/python3",
      commandPath: command,
    })
    assert.equal(installed.revision, "b".repeat(40))
    assert.equal(installed.releasePath.includes("releases/0.1.0-bbbbbbbbbbbb"), true)
    assert.equal(installed.releasePath.startsWith(destination), false)
    assert.match(installed.manifestSha256, /^[0-9a-f]{64}$/)
    const workerEnvelope = readFileSync(join(installed.releasePath, "launch-agents", "com.nmarcofernandess.ci-queue.worker.plist"), "utf8")
    const dashboardEnvelope = readFileSync(join(installed.releasePath, "launch-agents", "com.nmarcofernandess.ci-queue.dashboard.plist"), "utf8")
    for (const envelope of [workerEnvelope, dashboardEnvelope]) {
      assert.match(envelope, /<key>PATH<\/key>/)
      assert.match(envelope, /\/opt\/homebrew\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin/)
    }
    assert.match(dashboardEnvelope, /--manifest-sha256/)
    assert.match(dashboardEnvelope, new RegExp(installed.manifestSha256))
    assert.match(readFileSync(command, "utf8"), /ci-queue\.mjs/)
    const removed = uninstallRelease({ prefix })
    assert.deepEqual(removed, { removed: true, statePreserved: true })
    assert.equal(existsSync(command), false)
    assert.equal(mkdirSync(join(state, "jobs"), { recursive: true }) === undefined, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})


test("macOS launcher opens the dashboard only without arguments and preserves CLI forwarding", () => {
  const root = sourceFixture()
  try {
    const tools = join(root, "fake-tools")
    mkdirSync(tools)
    for (const [name, body] of Object.entries({
      uname: 'echo Darwin',
      open: 'printf "%s\\n" "$@"; exit "${OPEN_EXIT_CODE:-0}"',
      node: 'printf "%s\\n" "$CI_QUEUE_STATE_DIR" "$@"',
    })) writeFileSync(join(tools, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "a".repeat(40) })
    const command = join(root, "command")
    const state = join(root, "operator state")
    const installed = installRelease({
      bundle: destination, prefix: join(root, "prefix"), stateRoot: state,
      nodePath: join(tools, "node"), commandPath: command,
    })
    const env = { ...process.env, PATH: `${tools}:${process.env.PATH}` }
    delete env.CI_QUEUE_STATE_DIR
    const run = (args, overrides = {}) => execFileSync(command, args, { env: { ...env, ...overrides }, encoding: "utf8", cwd: tmpdir() })
    assert.equal(run([]), "http://127.0.0.1:8765/dashboard\n")
    assert.equal(run(["status", "--json"]), `${state}\n${join(installed.releasePath, "bin", "ci-queue.mjs")}\nstatus\n--json\n`)
    assert.equal(run(["logs", "a ticket"], { CI_QUEUE_STATE_DIR: "/custom state" }), `/custom state\n${join(installed.releasePath, "bin", "ci-queue.mjs")}\nlogs\na ticket\n`)
    assert.throws(() => run([], { OPEN_EXIT_CODE: "7" }), (error) => error.status === 7)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("refuses update and uninstall when a queue owner is uncertain", () => {
  const root = sourceFixture()
  const prefix = join(root, "prefix")
  const state = join(root, "state")
  try {
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "c".repeat(40) })
    installRelease({ bundle: destination, prefix, stateRoot: state })
    writeFileSync(join(state, "running.json"), "{}\n")
    assert.throws(() => installRelease({ bundle: destination, prefix, stateRoot: state }), /estado da fila incerto/)
    assert.throws(() => uninstallRelease({ prefix }), /estado da fila incerto/)
    rmSync(join(state, "running.json"))
    mkdirSync(join(state, "locks", "runner.lock"), { recursive: true })
    assert.throws(() => installRelease({ bundle: destination, prefix, stateRoot: state }), /estado da fila incerto/)
    assert.throws(() => uninstallRelease({ prefix }), /estado da fila incerto/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("the copied release installs and uninstalls itself without a source checkout", () => {
  const root = sourceFixture()
  const prefix = join(root, "prefix")
  const state = join(root, "state")
  try {
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "d".repeat(40) })
    const installer = join(destination, "scripts", "install.mjs")
    const install = JSON.parse(execFileSync(process.execPath, [installer, "install", "--bundle", destination, "--prefix", prefix, "--state", state], { encoding: "utf8" }))

    assert.equal(install.releasePath.startsWith(destination), false)
    assert.equal(install.releasePath.startsWith(prefix), true)
    assert.equal(readFileSync(join(install.releasePath, "scripts", "install.mjs"), "utf8").length > 0, true)

    const uninstall = JSON.parse(execFileSync(process.execPath, [join(install.releasePath, "scripts", "install.mjs"), "uninstall", "--prefix", prefix], { encoding: "utf8" }))
    assert.deepEqual(uninstall, { removed: true, statePreserved: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})


test("installed CLI reports its own manifest independently of source and cwd", () => {
  const root = sourceFixture()
  try {
    cpSync(join(productRoot, "dist"), join(root, "dist"), { recursive: true })
    cpSync(join(productRoot, "bin"), join(root, "bin"), { recursive: true })
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "e".repeat(40) })
    const installed = installRelease({ bundle: destination, prefix: join(root, "installed"), stateRoot: join(root, "state") })
    rmSync(join(root, "dist"), { recursive: true })
    rmSync(join(root, "bin"), { recursive: true })
    const result = JSON.parse(execFileSync(process.execPath, [join(installed.releasePath, "bin", "ci-queue.mjs"), "version", "--json"], { cwd: tmpdir(), encoding: "utf8" }))
    assert.equal(result.ok, true)
    assert.equal(result.result.revision, "e".repeat(40))
    assert.equal(result.result.manifestSha256, installed.manifestSha256)
    assert.equal(result.result.distribution.revision, installed.revision)
    assert.equal(result.result.distribution.protocol.ticketSchemaVersion, 4)
    writeFileSync(join(installed.releasePath, "dist", "cli.js"), "older worker")
    assert.throws(() => execFileSync(process.execPath, [join(installed.releasePath, "bin", "ci-queue.mjs"), "version", "--json"], { cwd: tmpdir(), encoding: "utf8", stdio: "pipe" }), /integridade/)

  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
