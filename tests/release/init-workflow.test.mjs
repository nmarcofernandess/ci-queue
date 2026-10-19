import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

import { buildRelease } from "../helpers/release-fixture.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const ARGV = ["python", "-m", "pytest", "-q"]

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

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function copyProductFile(root, relative) {
  const from = join(productRoot, relative)
  const to = join(root, relative)
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}

function productishSource(root) {
  writeFileSync(join(root, "package.json"), readFileSync(join(productRoot, "package.json")))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of [
    "bin",
    "dist",
    "templates",
    "scripts/ci/verify-local-attestation.sh",
    "scripts/ci/check-with-progress.sh",
    "scripts/ci/test-suite.sh",
    "scripts/progress-emit.sh",
    "scripts/install.mjs",
    "scripts/release.mjs",
    "scripts/legacy-projects.mjs",
  ]) {
    assert.equal(existsSync(join(productRoot, path)), true, `release source missing ${path}`)
    copyProductFile(root, path)
  }
  for (const path of [
    "backend/ci_queue_api/__main__.py",
    "ui/dist/index.html",
    "examples/local-project/ci-queue.json",
    "docs/INSTALL.md",
  ]) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, path)
  }
}

function initConsumer(cwd) {
  git(cwd, ["init", "-b", "dev"])
  git(cwd, ["config", "user.email", "ci-queue@example.invalid"])
  git(cwd, ["config", "user.name", "CI Queue test"])
  git(cwd, ["config", "gc.auto", "0"])
  writeFileSync(join(cwd, "README.md"), "fixture\n")
  git(cwd, ["add", "README.md"])
  git(cwd, ["commit", "-m", "init"])
  git(cwd, ["remote", "add", "dest", cwd])
}

test("bundled init --workflow writes verifier bytes without the producer checkout", () => {
  const staging = mkdtempSync(join(tmpdir(), "ci-queue-bundle-init-"))
  try {
    const source = join(staging, "source")
    mkdirSync(source)
    productishSource(source)
    const { destination } = buildRelease({
      root: source,
      outputDir: join(staging, "releases"),
      revision: "f".repeat(40),
    })
    const isolated = join(staging, "isolated")
    cpSync(destination, isolated, { recursive: true })
    const consumer = join(staging, "consumer")
    mkdirSync(consumer)
    initConsumer(consumer)
    const state = join(staging, "state")
    const home = join(staging, "home")
    mkdirSync(home)
    const env = { ...GIT_ENV, HOME: home }
    const output = execFileSync(
      process.execPath,
      [
        join(isolated, "bin", "ci-queue.mjs"),
        "init",
        "--cwd",
        consumer,
        "--state",
        state,
        "--workflow",
        "--name",
        "Bundled",
        "--argv-json",
        JSON.stringify(ARGV),
        "--base-ref",
        "dest/dev",
        "--json",
      ],
      { encoding: "utf8", env, cwd: consumer },
    )
    const payload = JSON.parse(output)
    assert.equal(payload.ok, true)
    const workflow = join(consumer, ".github", "workflows", "ci-queue-verdict.yml")
    const script = join(consumer, ".github", "scripts", "verify-local-attestation.sh")
    const yaml = readFileSync(workflow, "utf8")
    assert.equal(yaml.includes("local/check"), true)
    assert.equal(yaml.includes("branches: ['dev']"), true)
    assert.equal(yaml.includes("npm ci"), false)
    assert.equal(yaml.includes(productRoot), false)
    assert.equal(yaml.includes(source), false)
    assert.equal(readFileSync(script, "utf8").includes(productRoot), false)
    assert.equal(realpathSync(workflow).startsWith(realpathSync(consumer)), true)
    assert.equal(JSON.stringify(payload).includes(productRoot), false)
    assert.equal(existsSync(join(consumer, ".github", "workflows", "ci.yml")), false)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
})
