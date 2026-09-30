import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

import { buildRelease, verifyRelease } from "../../scripts/release.mjs"

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-release-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0" }))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of [
    "bin/ci-queue.mjs",
    "dist/cli.js",
    "backend/ci_queue_api/__main__.py",
    "backend/ci_queue_api/__pycache__/__main__.cpython-314.pyc",
    "ui/dist/index.html",
    "examples/local-project/ci-queue.json",
    "scripts/install.mjs",
    "scripts/release.mjs",
    "scripts/legacy-projects.mjs",
    "scripts/ci/verify-local-attestation.sh",
    "scripts/ci/check-with-progress.sh",
    "scripts/ci/test-suite.sh",
    "scripts/progress-emit.sh",
    "templates/github/ci-queue-verdict.yml",
    "docs/INSTALL.md",
    "docs/CONSUMER-QUICKSTART.md",
    "docs/GUIA-INTEGRACAO-CI-QUEUE.html",
    "docs/superpowers/specs/2026-09-22-fase-4-5-handoff/PLAN.md",
  ]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, path)
  }
  return root
}

test("release bundles omit Python caches and historical specs while retaining product docs and templates", () => {
  const root = fixture()
  try {
    const { destination, manifest } = buildRelease({
      root,
      outputDir: join(root, "releases"),
      revision: "b".repeat(40),
      now: new Date("2026-09-23T12:00:00.000Z"),
    })
    const paths = manifest.files.map((entry) => entry.path)

    assert.equal(paths.some((path) => path.split("/").includes("__pycache__")), false)
    assert.equal(paths.some((path) => path.endsWith(".pyc") || path.endsWith(".pyo")), false)
    assert.equal(paths.some((path) => path.startsWith("docs/superpowers/specs/")), false)
    assert.equal(paths.includes("docs/CONSUMER-QUICKSTART.md"), true)
    assert.equal(paths.includes("docs/GUIA-INTEGRACAO-CI-QUEUE.html"), true)
    assert.equal(paths.includes("docs/INSTALL.md"), true)
    assert.equal(paths.includes("templates/github/ci-queue-verdict.yml"), true)
    assert.equal(verifyRelease(destination).revision, "b".repeat(40))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("builds a self-contained manifest and detects tampering", () => {
  const root = fixture()
  try {
    const { destination, manifest } = buildRelease({
      root,
      outputDir: join(root, "releases"),
      revision: "a".repeat(40),
      now: new Date("2026-09-13T12:00:00.000Z"),
    })
    assert.equal(manifest.product, "ci-queue")
    assert.equal(manifest.files.some((entry) => entry.path === "ui/dist/index.html"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "examples/local-project/ci-queue.json"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/install.mjs"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/legacy-projects.mjs"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "templates/github/ci-queue-verdict.yml"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/ci/verify-local-attestation.sh"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/ci/check-with-progress.sh"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/ci/test-suite.sh"), true)
    assert.equal(manifest.files.some((entry) => entry.path === "scripts/progress-emit.sh"), true)
    assert.equal(verifyRelease(destination).revision, "a".repeat(40))
    writeFileSync(join(destination, "dist/cli.js"), "alterado")
    assert.throws(() => verifyRelease(destination), /integridade inválida/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
