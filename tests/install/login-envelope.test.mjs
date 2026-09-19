import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import assert from "node:assert/strict"

import { installRelease, uninstallRelease } from "../../scripts/install.mjs"
import { buildRelease } from "../../scripts/release.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-login-envelope-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ci-queue", version: "0.1.0" }))
  writeFileSync(join(root, "package-lock.json"), "{}\n")
  writeFileSync(join(root, "LICENSE"), "MIT\n")
  writeFileSync(join(root, "README.md"), "# CI Queue\n")
  for (const path of [
    "bin/ci-queue.mjs", "dist/cli.js", "backend/ci_queue_api/__main__.py",
    "ui/dist/index.html", "examples/local-project/ci-queue.json", "docs/INSTALL.md",
    "scripts/ci/verify-local-attestation.sh", "scripts/ci/check-with-progress.sh",
    "scripts/progress-emit.sh", "templates/github/ci-queue-verdict.yml",
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

function setup(revision = "f".repeat(40)) {
  const root = fixture()
  const prefix = join(root, "prefix")
  const state = join(root, "state")
  const homeDir = join(root, "home")
  const configPath = join(root, "consumer", "ci-queue.json")
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, "{}\n")
  const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision })
  return { root, prefix, state, homeDir, configPath, destination }
}

function fakeLaunchctl({ failBootstrapAt, disabled = false, bootoutFailure = false, unconfirmed = false } = {}) {
  const calls = []
  let bootstraps = 0
  const run = (args) => {
    calls.push(args)
    if (args[0] === "print-disabled") return disabled ? '{ "com.nmarcofernandess.ci-queue.dashboard" => true }' : "{}"
    if (args[0] === "print") return unconfirmed ? "state = waiting" : `label = ${args[1].split("/").at(-1)}`
    if (args[0] === "bootout") {
      if (bootoutFailure) throw Object.assign(new Error("permission denied"), { stderr: "Operation not permitted" })
      throw Object.assign(new Error("missing"), { stderr: "Could not find service" })
    }
    if (args[0] === "bootstrap") {
      bootstraps += 1
      if (bootstraps === failBootstrapAt) throw new Error("injected bootstrap failure")
      return ""
    }
    return ""
  }
  return { run, calls }
}

function activationInput(paths, launchctl) {
  return {
    bundle: paths.destination,
    prefix: paths.prefix,
    stateRoot: paths.state,
    homeDir: paths.homeDir,
    configPath: paths.configPath,
    nodePath: "/opt/ci/node/bin/node",
    pythonPath: "/usr/bin/python3",
    activate: true,
    platform: "darwin",
    uid: 501,
    launchctl: launchctl.run,
  }
}

test("activation publishes owned regular canonical envelopes in an isolated HOME", () => {
  const paths = setup()
  const launchctl = fakeLaunchctl()
  try {
    const installation = installRelease(activationInput(paths, launchctl))
    assert.equal(installation.activationStatus, "verified")
    assert.equal(installation.services.length, 2)
    for (const service of installation.services) {
      assert.equal(service.file.startsWith(join(paths.homeDir, "Library", "LaunchAgents")), true)
      assert.match(service.sha256, /^[0-9a-f]{64}$/)
      assert.equal(existsSync(service.referenceFile), true)
      const envelope = readFileSync(service.file, "utf8")
      assert.match(envelope, new RegExp(installation.releasePath.replaceAll("/", "\\/")))
      assert.doesNotMatch(envelope, new RegExp(productRoot.replaceAll("/", "\\/")))
    }
    const worker = readFileSync(installation.services.find(({ label }) => label.endsWith("worker")).file, "utf8")
    const dashboard = readFileSync(installation.services.find(({ label }) => label.endsWith("dashboard")).file, "utf8")
    assert.match(worker, /<key>QueueDirectories<\/key>/)
    assert.doesNotMatch(worker, /<key>KeepAlive<\/key>/)
    assert.match(dashboard, /<key>KeepAlive<\/key><true\/>/)
    assert.equal(launchctl.calls.filter(([command]) => command === "bootstrap").length, 2)
  } finally { rmSync(paths.root, { recursive: true, force: true }) }
})

test("filesystem-only install never publishes into canonical LaunchAgents", () => {
  const paths = setup()
  try {
    const installation = installRelease({
      ...activationInput(paths, fakeLaunchctl()),
      activate: false,
    })
    assert.equal(existsSync(join(paths.homeDir, "Library", "LaunchAgents")), false)
    assert.equal(installation.activationStatus, "staged")
    assert.equal(installation.services.every(({ file }) => file.startsWith(installation.releasePath)), true)
  } finally { rmSync(paths.root, { recursive: true, force: true }) }
})

test("filesystem-only update stages a candidate without replacing the active receipt", () => {
  const paths = setup("1".repeat(40))
  try {
    installRelease(activationInput(paths, fakeLaunchctl()))
    const activeReceipt = readFileSync(join(paths.prefix, "installation.json"), "utf8")
    const secondBundle = buildRelease({ root: paths.root, outputDir: join(paths.root, "bundles-2"), revision: "2".repeat(40) }).destination
    const staged = installRelease({
      ...activationInput({ ...paths, destination: secondBundle }, fakeLaunchctl()),
      activate: false,
    })
    assert.equal(staged.activationStatus, "staged")
    assert.equal(readFileSync(join(paths.prefix, "installation.json"), "utf8"), activeReceipt)
    assert.equal(JSON.parse(readFileSync(join(paths.prefix, "staged-installation.json"), "utf8")).revision, "2".repeat(40))
  } finally { rmSync(paths.root, { recursive: true, force: true }) }
})

test("partial bootstrap restores prior envelopes and keeps the prior receipt", () => {
  const paths = setup("a".repeat(40))
  try {
    const first = installRelease(activationInput(paths, fakeLaunchctl()))
    const oldBodies = new Map(first.services.map(({ file }) => [file, readFileSync(file, "utf8")]))
    const oldReceipt = readFileSync(join(paths.prefix, "installation.json"), "utf8")
    const secondBundle = buildRelease({ root: paths.root, outputDir: join(paths.root, "bundles-2"), revision: "b".repeat(40) }).destination
    const failing = fakeLaunchctl({ failBootstrapAt: 2 })
    assert.throws(() => installRelease({ ...activationInput({ ...paths, destination: secondBundle }, failing) }), /injected bootstrap failure/)
    assert.equal(readFileSync(join(paths.prefix, "installation.json"), "utf8"), oldReceipt)
    for (const [file, body] of oldBodies) assert.equal(readFileSync(file, "utf8"), body)
    assert.equal(failing.calls.filter(([command]) => command === "bootstrap").length, 4)
  } finally { rmSync(paths.root, { recursive: true, force: true }) }
})

test("refuses edited ownership, disabled overrides, unknown port owners, and unknown bootout failures", () => {
  const cases = [
    { mutate: ({ first }) => writeFileSync(first.services[0].file, "foreign\n"), fake: fakeLaunchctl(), expected: /alheio ou alterado/ },
    { fake: fakeLaunchctl({ disabled: true }), expected: /desabilitado pelo usuário/ },
    { fake: fakeLaunchctl(), portOwnerProbe: () => "pid:999", expected: /porta do dashboard ocupada/ },
    { fake: fakeLaunchctl({ bootoutFailure: true }), expected: /bootout falhou/ },
    { fake: fakeLaunchctl({ unconfirmed: true }), expected: /não confirmou estado loaded/ },
  ]
  for (const entry of cases) {
    const paths = setup("c".repeat(40))
    try {
      const first = installRelease(activationInput(paths, fakeLaunchctl()))
      entry.mutate?.({ first })
      const secondBundle = buildRelease({ root: paths.root, outputDir: join(paths.root, "bundles-2"), revision: "d".repeat(40) }).destination
      assert.throws(() => installRelease({
        ...activationInput({ ...paths, destination: secondBundle }, entry.fake),
        portOwnerProbe: entry.portOwnerProbe,
      }), entry.expected)
    } finally { rmSync(paths.root, { recursive: true, force: true }) }
  }
})

test("uninstall removes only unchanged owned canonical envelopes and preserves state", () => {
  const paths = setup()
  try {
    const installation = installRelease(activationInput(paths, fakeLaunchctl()))
    const result = uninstallRelease({
      prefix: paths.prefix, deactivate: true, platform: "darwin", uid: 501,
      launchctl: fakeLaunchctl().run,
    })
    assert.deepEqual(result, { removed: true, statePreserved: true })
    assert.equal(existsSync(paths.state), true)
    assert.equal(installation.services.every(({ file }) => !existsSync(file)), true)
  } finally { rmSync(paths.root, { recursive: true, force: true }) }
})
