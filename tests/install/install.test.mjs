import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import { buildRelease } from "../../scripts/release.mjs"
import { installRelease, uninstallRelease } from "../../scripts/install.mjs"

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-install-source-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0" }))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of ["bin/ci-queue.mjs", "dist/cli.js", "backend/ci_queue_api/__main__.py", "ui/dist/index.html", "examples/local-project/ci-queue.json"]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, path)
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
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
