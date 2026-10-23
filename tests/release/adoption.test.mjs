import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { buildRelease, verifyRelease, releaseEnvironment } from "../helpers/release-fixture.mjs"

const productRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const releaseInputs = [
  "bin",
  "dist",
  "backend",
  "ui/dist",
  "examples/local-project",
  "scripts/install.mjs",
  "scripts/legacy-projects.mjs",
  "scripts/release.mjs",
  "scripts/ci/verify-local-attestation.sh",
  "scripts/ci/check-with-progress.sh",
  "scripts/ci/test-suite.sh",
  "scripts/progress-emit.sh",
  "templates",
  "docs",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "README.md",
]

function copyIfPresent(source, destination) {
  if (existsSync(source)) cpSync(source, destination, { recursive: true })
}

function releaseSourceFixture(root) {
  for (const path of releaseInputs) {
    const source = join(productRoot, path)
    const destination = join(root, path)
    if (existsSync(source)) {
      cpSync(source, destination, { recursive: true })
    } else if (path.endsWith("/dist")) {
      mkdirSync(destination, { recursive: true })
    } else {
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, "fixture\n")
    }
  }

  mkdirSync(join(root, "ui/dist"), { recursive: true })
  writeFileSync(join(root, "ui/dist/index.html"), "<!doctype html><title>fixture</title>\n")

  for (const path of ["CONSUMER-QUICKSTART.md", "CONTRACTS.md", "INSTALL.md", "TESTING-METHOD.md"]) {
    copyIfPresent(join(productRoot, "docs", path), join(root, "docs", path))
  }
  for (const path of ["AGENTS.fragment.md", "ci.yaml", "SKILL.md"]) {
    copyIfPresent(join(productRoot, "templates/adoption", path), join(root, "templates/adoption", path))
  }
  return root
}

function invoke(cli, args, cwd) {
  const output = execFileSync(process.execPath, [cli, ...args, "--json"], {
    cwd,
    encoding: "utf8",
    env: releaseEnvironment(dirname(dirname(cli)), { ...process.env, CI: "1" }),
  })
  return JSON.parse(output)
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim()
}

test("adoption templates resolve from consumer root", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ci-queue-adoption-paths-"))
  const consumer = join(temporaryRoot, "unrelated", "nested", "consumer")
  try {
    const copies = [
      ["AGENTS.fragment.md", "AGENTS.md"],
      ["SKILL.md", ".agents/skills/testing/SKILL.md"],
      ["ci.yaml", ".context/patterns/ci.yaml"],
    ]
    for (const [source, destination] of copies) {
      mkdirSync(dirname(join(consumer, destination)), { recursive: true })
      cpSync(join(productRoot, "templates/adoption", source), join(consumer, destination))
    }
    // Default procedure and an existing owner chosen by a consumer.
    for (const owner of ["docs/ci/TESTING-METHOD.md", "docs/ci/FEEDBACK-LOOP.md"]) {
      mkdirSync(dirname(join(consumer, owner)), { recursive: true })
      writeFileSync(join(consumer, owner), "# Consumer procedure\n")
    }
    const mapPath = join(consumer, ".context/patterns/ci.yaml")
    const originalMap = readFileSync(mapPath, "utf8")
    for (const owner of ["docs/ci/TESTING-METHOD.md", "docs/ci/FEEDBACK-LOOP.md"]) {
      const configuredMap = owner.endsWith("FEEDBACK-LOOP.md")
        ? originalMap.replace(/^method:.*$/m, `method: ${owner}`)
        : originalMap
      writeFileSync(mapPath, configuredMap)
      for (const file of ["AGENTS.md", ".agents/skills/testing/SKILL.md"]) {
        const source = readFileSync(join(consumer, file), "utf8")
        const links = [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
        const resolvedMaps = []
        for (const [, target] of links) {
          if (/^https?:/.test(target)) continue
          const destination = join(consumer, target.split("#")[0])
          assert.equal(existsSync(destination), true, `${file}: missing consumer-root target ${target}`)
          if (target.endsWith(".yaml")) resolvedMaps.push(destination)
        }
        assert.deepEqual(resolvedMaps, [mapPath], `${file}: resolve the consumer method map`)
        const procedure = readFileSync(resolvedMaps[0], "utf8").match(/^method: (.+)$/m)?.[1]
        assert.equal(readFileSync(join(consumer, procedure), "utf8"), "# Consumer procedure\n")
      }
      const declaredOwner = configuredMap.match(/^method: (.+)$/m)?.[1]
      assert.equal(declaredOwner, owner)
      assert.equal(existsSync(join(consumer, declaredOwner)), true, `missing declared owner ${declaredOwner}`)
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test("the release bundle serves a minimal Node Git consumer, not a product E2E, without its source fixture", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ci-queue-adoption-"))
  const sourceRoot = releaseSourceFixture(join(temporaryRoot, "source-checkout"))
  const bundleParent = join(temporaryRoot, "bundle-output")

  try {
    const { destination: bundle, manifest } = buildRelease({
      root: sourceRoot,
      outputDir: bundleParent,
      revision: "a".repeat(40),
      now: new Date("2026-09-23T12:00:00.000Z"),
    })
    const verified = verifyRelease(bundle)
    const manifestPaths = new Set(verified.files.map(({ path }) => path))
    const required = [
      "docs/TESTING-METHOD.md",
      "templates/adoption/AGENTS.fragment.md",
      "templates/adoption/ci.yaml",
      "templates/adoption/SKILL.md",
    ]

    assert.equal(manifest.revision, "a".repeat(40))
    for (const path of required) {
      assert.equal(manifestPaths.has(path), true, `release manifest must contain ${path}`)
      assert.equal(existsSync(join(bundle, path)), true, `release bundle must contain ${path}`)
    }

    const adoptionMap = readFileSync(join(bundle, "templates/adoption/ci.yaml"), "utf8")
    assert.match(adoptionMap, /^schema: ci-method-v1$/m)
    assert.match(adoptionMap, /^runtime_contract: ci-queue\.json$/m)
    assert.match(adoptionMap, /^  available: false$/m)
    assert.match(adoptionMap, /^  authority: contrato_do_consumidor__ship\.acceptedPresets_se_ship_adotado$/m)
    assert.doesNotMatch(adoptionMap, /^\s*(command|argv|run):/m)

    const method = readFileSync(join(bundle, "docs/TESTING-METHOD.md"), "utf8")
    assert.match(method, /feedback/i)
    assert.match(method, /proof|prova/i)
    assert.match(method, /templates\/adoption\/ci\.yaml/)

    rmSync(sourceRoot, { recursive: true, force: true })
    assert.equal(existsSync(sourceRoot), false)

    const consumer = join(temporaryRoot, "plain-node-consumer")
    const remote = join(temporaryRoot, "plain-node-consumer.git")
    const state = join(temporaryRoot, "temporary-queue-state")
    mkdirSync(consumer, { recursive: true })
    git(consumer, "init", "--initial-branch=main")
    git(temporaryRoot, "init", "--bare", remote)
    git(consumer, "config", "user.name", "CI Queue fixture")
    git(consumer, "config", "user.email", "ci-queue-fixture@example.invalid")

    mkdirSync(join(consumer, "scripts"), { recursive: true })
    writeFileSync(join(consumer, "package.json"), JSON.stringify({
      name: "plain-node-consumer",
      private: true,
      scripts: { check: "node scripts/check.mjs" },
    }, null, 2) + "\n")
    writeFileSync(join(consumer, "scripts/check.mjs"), "process.stdout.write('check passed\\n')\n")
    writeFileSync(join(consumer, "scripts/review.mjs"), [
      "import { createServer } from 'node:http'",
      "",
      "const server = createServer((request, response) => {",
      "  const healthy = request.url === '/health'",
      "  response.writeHead(healthy ? 200 : 404)",
      "  response.end(healthy ? 'ok' : 'not found')",
      "})",
      "await new Promise((resolve, reject) => {",
      "  server.once('error', reject)",
      "  server.listen(0, '127.0.0.1', resolve)",
      "})",
      "try {",
      "  const address = server.address()",
      "  if (!address || typeof address === 'string') throw new Error('fake server address unavailable')",
      "  const response = await fetch(`http://127.0.0.1:${address.port}/health`)",
      "  if (!response.ok || await response.text() !== 'ok') throw new Error('fake server health check failed')",
      "  process.stdout.write('review recipe passed\\n')",
      "} finally {",
      "  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))",
      "}",
      "",
    ].join("\n"))
    git(consumer, "add", ".")
    git(consumer, "commit", "-m", "fixture consumer")
    git(consumer, "remote", "add", "origin", remote)
    git(consumer, "push", "--set-upstream", "origin", "main")

    const cli = join(bundle, "bin/ci-queue.mjs")
    const initialized = invoke(cli, [
      "init", "--cwd", consumer, "--state", state, "--name", "Plain Node consumer",
      "--base-ref", "origin/main", "--argv-json", '["npm","run","check"]',
    ], consumer)
    assert.equal(initialized.ok, true, JSON.stringify(initialized))

    const configPath = join(consumer, "ci-queue.json")
    const config = JSON.parse(readFileSync(configPath, "utf8"))
    config.presets.review = { argv: ["node", "scripts/review.mjs"] }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    assert.equal(config.ship.acceptedPresets.includes("review"), false)

    const queued = invoke(cli, [
      "enqueue", "review", "--cwd", consumer, "--config", configPath, "--state", state,
    ], consumer)
    assert.equal(queued.ok, true, JSON.stringify(queued))
    assert.equal(queued.result.ticket.status, "queued")

    const worker = invoke(cli, ["worker", "--state", state], consumer)
    assert.equal(worker.ok, true, JSON.stringify(worker))
    assert.deepEqual(worker.result.processed, [queued.result.ticket.id])

    const history = invoke(cli, [
      "history", "--project", config.project.id, "--state", state,
    ], consumer)
    assert.equal(history.ok, true, JSON.stringify(history))
    assert.equal(history.result.jobs.length, 1)
    assert.equal(history.result.jobs[0].preset, "review")
    assert.equal(history.result.jobs[0].status, "passed")
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
