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
    "ui/dist/index.html",
    "examples/local-project/ci-queue.json",
    "scripts/install.mjs",
    "scripts/release.mjs",
    "scripts/legacy-projects.mjs",
    "scripts/ci/verify-local-attestation.sh",
    "templates/github/ci-queue-verdict.yml",
    "docs/INSTALL.md",
  ]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, path)
  }
  return root
}

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
    assert.equal(verifyRelease(destination).revision, "a".repeat(40))
    writeFileSync(join(destination, "dist/cli.js"), "alterado")
    assert.throws(() => verifyRelease(destination), /integridade inválida/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
