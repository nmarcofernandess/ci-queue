#!/usr/bin/env node
/**
 * Produz uma distribuição autocontida do CI Queue. O bundle não aponta para o
 * checkout que o produziu: contém somente runtime compilado, backend stdlib e
 * UI estática, além de um manifesto verificável antes da instalação.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const productRoot = resolve(here, "..")
export const MANIFEST_FILENAME = "manifest.json"
const releasePaths = [
  "bin",
  "build-provenance",
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

function includeReleasePath(root, path) {
  const bundlePath = relative(root, path).split("\\").join("/")
  if (bundlePath.split("/").includes("__pycache__")) return false
  if (bundlePath.endsWith(".pyc") || bundlePath.endsWith(".pyo")) return false
  if (bundlePath === "docs/superpowers/specs" || bundlePath.startsWith("docs/superpowers/specs/")) return false
  return true
}

function gitRevision(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
  } catch {
    throw new Error("release exige um checkout Git com HEAD identificado")
  }
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function assertRegularTree(root, path) {
  if (!includeReleasePath(root, path)) return
  const entry = lstatSync(path)
  if (entry.isSymbolicLink()) throw new Error(`bundle não aceita symlink: ${path}`)
  if (!entry.isDirectory()) return
  for (const name of readdirSync(path)) assertRegularTree(root, join(path, name))
}

function collectFiles(root, current = root) {
  const output = []
  if (!includeReleasePath(root, current)) return output
  const entry = lstatSync(current)
  if (entry.isSymbolicLink()) throw new Error(`bundle não aceita symlink: ${current}`)
  if (entry.isFile()) {
    output.push({
      path: relative(root, current).split("\\").join("/"),
      bytes: statSync(current).size,
      sha256: hashFile(current),
    })
    return output
  }
  for (const name of readdirSync(current).sort()) output.push(...collectFiles(root, join(current, name)))
  return output
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, path)
}

function sourcePackage(root) {
  const path = join(root, "package.json")
  if (!existsSync(path)) throw new Error(`package.json ausente em ${root}`)
  const pkg = JSON.parse(readFileSync(path, "utf8"))
  if (!pkg.version || typeof pkg.version !== "string") throw new Error("package.json não declara version")
  return pkg
}

export const DISTRIBUTION_PROTOCOL = Object.freeze({ apiVersion: 1, ticketSchemaVersion: 4,
  capabilities: ["terminal-finalization-v1", "no-artifact-snapshots-v1", "recoverable-finalization-v1"] })
const componentRoots = { launcher: "bin", worker: "dist", api: "backend", ui: "ui/dist" }
const protocolMatches = value => value?.apiVersion === 1 && value?.ticketSchemaVersion === 4
  && Array.isArray(value.capabilities) && DISTRIBUTION_PROTOCOL.capabilities.every(item => value.capabilities.includes(item))
function componentFiles(root, component) {
  return collectFiles(root, join(root, componentRoots[component]))
}

/** Each build records its own inputs; packaging cannot relabel an older build. */
export function recordBuildProvenance({ root = productRoot, component, revision = gitRevision(root) }) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("build exige revisão Git completa")
  const names = component === "runtime" ? ["launcher", "worker", "api"] : [component]
  for (const name of names) {
    if (!Object.hasOwn(componentRoots, name)) throw new Error("componente de build inválido")
    const files = componentFiles(root, name)
    if (!files.length) throw new Error(`build vazio: ${name}`)
    atomicJson(join(root, "build-provenance", `${name}.json`), { schemaVersion: 1, component: name,
      revision, protocol: DISTRIBUTION_PROTOCOL, files })
  }
}

function verifyBuildProvenance(root, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) throw new Error("migração: release exige revisão Git completa")
  for (const component of Object.keys(componentRoots)) {
    const file = join(root, "build-provenance", `${component}.json`)
    if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error(`migração: refaça o build de ${component}; proveniência ausente`)
    const build = JSON.parse(readFileSync(file, "utf8"))
    if (build?.schemaVersion !== 1 || build.component !== component || build.revision !== revision) throw new Error(`migração: revisão do build ${component} diverge da release`)
    if (!protocolMatches(build.protocol)) throw new Error(`migração: protocolo de build incompatível em ${component}`)
    if (JSON.stringify(build.files) !== JSON.stringify(componentFiles(root, component))) throw new Error(`integridade inválida no build: ${component}`)
  }
}

export function buildRelease({ root = productRoot, outputDir, now = new Date(), revision = gitRevision(root) }) {
  const pkg = sourcePackage(root)
  verifyBuildProvenance(root, revision)
  if (!outputDir) throw new Error("--output é obrigatório")
  const destination = resolve(outputDir, `ci-queue-${pkg.version}-${revision.slice(0, 12)}`)
  if (existsSync(destination)) throw new Error(`destino de release já existe: ${destination}`)

  for (const source of releasePaths) {
    const sourcePath = join(root, source)
    if (!existsSync(sourcePath)) throw new Error(`release requer ${source}`)
    assertRegularTree(root, sourcePath)
  }

  mkdirSync(destination, { recursive: true, mode: 0o755 })
  try {
    for (const source of releasePaths) {
      const from = join(root, source)
      const to = join(destination, source)
      cpSync(from, to, {
        recursive: true,
        force: false,
        errorOnExist: true,
        dereference: false,
        filter: (path) => includeReleasePath(root, path),
      })
    }
    const manifest = {
      schemaVersion: 1,
      product: "ci-queue",
      version: pkg.version,
      revision,
      protocol: DISTRIBUTION_PROTOCOL,
      createdAt: now.toISOString(),
      files: collectFiles(destination),
    }
    atomicJson(join(destination, MANIFEST_FILENAME), manifest)
    return { destination, manifest }
  } catch (error) {
    rmSync(destination, { recursive: true, force: true })
    throw error
  }
}

export function verifyRelease(bundlePath) {
  const root = resolve(bundlePath)
  const manifestPath = join(root, MANIFEST_FILENAME)
  if (!existsSync(manifestPath)) throw new Error(`manifest ausente em ${root}`)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (manifest?.schemaVersion !== 1 || manifest?.product !== "ci-queue" || !Array.isArray(manifest.files)) {
    throw new Error("manifest inválido")
  }
  if (!protocolMatches(manifest.protocol)) throw new Error("migração: distribuição sem protocolo terminal-finalization-v1/no-artifact-snapshots-v1/recoverable-finalization-v1")
  verifyBuildProvenance(root, manifest.revision)
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || entry.path.startsWith("/") || entry.path.split("/").includes("..")) {
      throw new Error("manifest contém caminho inválido")
    }
    const path = resolve(root, entry.path)
    if (!path.startsWith(`${root}/`) || !existsSync(path)) throw new Error(`arquivo ausente: ${entry.path}`)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`arquivo inseguro: ${entry.path}`)
    if (stat.size !== entry.bytes || hashFile(path) !== entry.sha256) throw new Error(`integridade inválida: ${entry.path}`)
  }
  return manifest
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const value = (flag) => {
    const index = rest.indexOf(flag)
    return index === -1 ? undefined : rest[index + 1]
  }
  return { command, output: value("--output"), bundle: value("--bundle"), component: value("--component") }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (args.command === "stamp") {
    recordBuildProvenance({ component: args.component }); return
  }
  if (args.command === "build") {
    const result = buildRelease({ outputDir: args.output })
    process.stdout.write(`${JSON.stringify({ bundle: result.destination, manifest: result.manifest }, null, 2)}\n`)
    return
  }
  if (args.command === "verify" && args.bundle) {
    process.stdout.write(`${JSON.stringify(verifyRelease(args.bundle), null, 2)}\n`)
    return
  }
  throw new Error("uso: release.mjs build --output <diretório> | verify --bundle <diretório>")
}

function isMainModule(metaUrl) {
  const invoked = process.argv[1]
  if (!invoked) return false
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(invoked))
  } catch {
    return fileURLToPath(metaUrl) === resolve(invoked)
  }
}

if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
