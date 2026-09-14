import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

import { buildRelease } from "../../scripts/release.mjs"
import { installRelease, uninstallRelease } from "../../scripts/install.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-install-source-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0" }))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of ["bin/ci-queue.mjs", "dist/cli.js", "backend/ci_queue_api/__main__.py", "ui/dist/index.html", "examples/local-project/ci-queue.json", "docs/INSTALL.md"]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, path)
  }
  for (const script of ["install.mjs", "release.mjs"]) {
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
    mkdirSync(dirname(config), { recursive: true })
    writeFileSync(config, "{}\n")
    const installed = installRelease({
      bundle: destination, prefix, stateRoot: state, configPath: config,
      nodePath: "/opt/homebrew/bin/node", pythonPath: "/usr/bin/python3",
    })
    assert.equal(installed.revision, "b".repeat(40))
    assert.equal(installed.releasePath.includes("releases/0.1.0-bbbbbbbbbbbb"), true)
    assert.equal(installed.releasePath.startsWith(destination), false)
    assert.match(installed.manifestSha256, /^[0-9a-f]{64}$/)
    const dashboardEnvelope = readFileSync(join(installed.releasePath, "launch-agents", "com.nmarcofernandess.ci-queue.dashboard.plist"), "utf8")
    assert.match(dashboardEnvelope, /--manifest-sha256/)
    assert.match(dashboardEnvelope, new RegExp(installed.manifestSha256))
    const removed = uninstallRelease({ prefix })
    assert.deepEqual(removed, { removed: true, statePreserved: true })
    assert.equal(mkdirSync(join(state, "jobs"), { recursive: true }) === undefined, true)
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
