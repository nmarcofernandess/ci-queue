import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs"
import { hostname, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { buildRelease, releaseEnvironment } from "../helpers/release-fixture.mjs"
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

function releasedRuntime(state, sessions) {
  const {uid,ino,dev}=lstatSync(sessions)
  mkdirSync(join(state,"runtime"),{mode:0o700})
  const directory=join(realpathSync(state),"runtime","session-fixture")
  const group={hostname:hostname(),leaderPid:999999,pgid:999999,startedAt:"fixture"}
  return {schemaVersion:1,runtimeId:"session-fixture",sessionId:"fixture",projectId:"example",ticketId:"fixture",
    token:"a".repeat(64),bindingDigest:"b".repeat(64),requirementDigest:"c".repeat(64),
    directory,directoryIdentity:{uid,ino:1,dev},catalogIdentity:{uid,ino,dev},owner:group,producer:group,groups:[group],
    evidenceOffset:0,state:"released",stateRevision:3,env:{},receipt:{capability:"node-runtime-guard-v1",coverage:"guarded-node-processes",state:"prepared",observations:[],
    evidencePath:join(directory,"processes.jsonl"),requirementDigest:"c".repeat(64),node:{executable:process.execPath,version:process.versions.node,sha256:"d".repeat(64)}}}
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

    const env = releaseEnvironment(destination, { ...process.env, HOME: home })
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


test("installer-refuses-active-or-uncertain-session-runtime including broken released bundle symlink", () => {
  const root = sourceFixture()
  try {
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "e".repeat(40) })
    const state = join(root, "state")
    const sessions = join(state, "runtime-sessions")
    mkdirSync(sessions, { recursive: true, mode: 0o700 })
    const input = { bundle: destination, stateRoot: state, prefix: join(root, "prefix"), nodePath: process.execPath, pythonPath: "/usr/bin/python3" }
    for (const record of [{ state: "active" }, { state: "closing" }, { state: "released" }, { token: "private" }]) {
      writeFileSync(join(sessions, "session-fixture.json"), JSON.stringify(record), { mode: 0o600 })
      assert.throws(() => installRelease(input), /runtime.*sessão|sessão.*runtime/)
    }
    const released = releasedRuntime(state, sessions)
    const directory = released.directory
    writeFileSync(join(sessions,"session-fixture.json"),JSON.stringify(released),{mode:0o600})
    assert.equal(installRelease(input).activationStatus,"staged")
    symlinkSync(join(root,"missing-bundle-target"),directory)
    try {
      assert.equal(existsSync(directory),false)
      assert.equal(lstatSync(directory).isSymbolicLink(),true)
      assert.throws(()=>installRelease(input),/runtime.*sessão/)
      assert.equal(lstatSync(directory).isSymbolicLink(),true)
    } finally {rmSync(directory,{force:true})}
    assert.equal(installRelease(input).activationStatus,"staged")
    for(const corrupted of [{...released,recovery:{operationId:"incomplete"}},{...released,receipt:{...released.receipt,evidencePath:"/private/foreign"}}]) {
      writeFileSync(join(sessions,"session-fixture.json"),JSON.stringify(corrupted),{mode:0o600})
      assert.throws(()=>installRelease(input),/runtime.*sessão/)
    }
    const recovery={operationId:"recovery-a",originalStateRevision:1,recoveryOwnerStamp:{pid:999999,pgid:999999,startedAt:"fixture"}}
    writeFileSync(join(sessions,"session-fixture.json"),JSON.stringify({...released,recovery}),{mode:0o600})
    assert.equal(installRelease(input).activationStatus,"staged")
    for(const operationId of [["recovery-a"],123]) {
      const bytes=JSON.stringify({...released,recovery:{...recovery,operationId}})
      writeFileSync(join(sessions,"session-fixture.json"),bytes,{mode:0o600})
      assert.throws(()=>installRelease(input),/runtime.*sessão/)
      assert.equal(readFileSync(join(sessions,"session-fixture.json"),"utf8"),bytes)
    }
    rmSync(sessions, { recursive: true })
    mkdirSync(join(state, "reserved-data"))
    writeFileSync(join(state, "reserved-data", "reservation.json"), "{}")
    assert.equal(installRelease(input).activationStatus, "staged")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("released receipt with historical catalog identity permits stage and update without changing bytes", () => {
  const root = sourceFixture()
  try {
    const state = join(root, "state")
    const sessions = join(state, "runtime-sessions")
    mkdirSync(sessions, { recursive: true, mode: 0o700 })
    const released = releasedRuntime(state, sessions)
    const current = released.catalogIdentity
    released.catalogIdentity = { uid: current.uid + 1, ino: current.ino + 1, dev: current.dev + 1 }
    const receiptPath = join(sessions, "session-fixture.json")
    const bytes = JSON.stringify(released) + "\n"
    writeFileSync(receiptPath, bytes, { mode: 0o600 })
    const options = { stateRoot: state, prefix: join(root, "prefix"), nodePath: process.execPath, pythonPath: "/usr/bin/python3" }
    for (const revision of ["a".repeat(40), "b".repeat(40)]) {
      const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision })
      const installed = installRelease({ ...options, bundle: destination })
      assert.equal(installed.revision, revision)
      assert.equal(installed.activationStatus, "staged")
      assert.equal(readFileSync(receiptPath, "utf8"), bytes)
    }
    const { destination } = buildRelease({ root, outputDir: join(root, "bundles"), revision: "c".repeat(40) })
    const input = { ...options, bundle: destination }
    for (const currentState of ["active", "closing"]) {
      const currentBytes = JSON.stringify({ ...released, state: currentState })
      writeFileSync(receiptPath, currentBytes)
      assert.throws(() => installRelease(input), /runtime.*sessão/)
      assert.equal(readFileSync(receiptPath, "utf8"), currentBytes)
    }
    writeFileSync(receiptPath, bytes)
    for (const kind of ["bundle", "broken symlink", "claim", "lock"]) {
      const path = kind === "claim" ? join(state, "claims", "fixture.json")
        : kind === "lock" ? join(state, "locks", "runner.lock") : released.directory
      if (kind === "bundle") mkdirSync(path)
      else if (kind === "broken symlink") symlinkSync(join(root, "missing-target"), path)
      else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, "reserved") }
      assert.throws(() => installRelease(input), /runtime.*sessão|incerto/)
      assert.equal(readFileSync(receiptPath, "utf8"), bytes)
      assert.equal(lstatSync(path).isSymbolicLink(), kind === "broken symlink")
      if (kind === "claim" || kind === "lock") assert.equal(readFileSync(path, "utf8"), "reserved")
      rmSync(path, { recursive: kind === "bundle" })
    }
    for (const catalogIdentity of [null, { ...current, ino: -1 }, { ...current, dev: "old" }]) {
      const invalid = JSON.stringify({ ...released, catalogIdentity })
      writeFileSync(receiptPath, invalid)
      assert.throws(() => installRelease(input), /runtime.*sessão/)
      assert.equal(readFileSync(receiptPath, "utf8"), invalid)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
