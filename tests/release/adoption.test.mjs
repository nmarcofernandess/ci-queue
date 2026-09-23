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

import { buildRelease, verifyRelease } from "../../scripts/release.mjs"

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
    env: { ...process.env, CI: "1" },
  })
  return JSON.parse(output)
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim()
}

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

    const fragment = readFileSync(join(bundle, "templates/adoption/AGENTS.fragment.md"), "utf8")
    assert.equal(fragment, [
      "## Testes e CI",
      "Antes de executar testes, leia `.context/patterns/ci.yaml` e siga o perfil ali",
      "indicado para este host e esta tarefa. Feedback não é prova final: reutilize",
      "somente ambiente compatível e submeta a tentativa pelo executor configurado.",
      "Ao retomar, confira cwd, sessão e ticket existentes antes de iniciar outro.",
      "Não execute o lifecycle de prova a cada edição nem substitua um ticket por",
      "observação posterior. Encerre os recursos próprios pelo comando documentado.",
      "",
    ].join("\n"))

    const adoptionMap = readFileSync(join(bundle, "templates/adoption/ci.yaml"), "utf8")
    assert.match(adoptionMap, /^schema: ci-method-v1$/m)
    assert.match(adoptionMap, /^runtime_contract: ci-queue\.json$/m)
    assert.match(adoptionMap, /^  available: false$/m)
    assert.match(adoptionMap, /^  authority: ship\.acceptedPresets no catálogo$/m)
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
