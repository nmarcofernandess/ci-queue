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
  "dist",
  "backend",
  "ui/dist",
  "examples/local-project",
  "scripts/install.mjs",
  "scripts/release.mjs",
  "docs/INSTALL.md",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "README.md",
]

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

function assertRegularTree(path) {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink()) throw new Error(`bundle não aceita symlink: ${path}`)
  if (!entry.isDirectory()) return
  for (const name of readdirSync(path)) assertRegularTree(join(path, name))
}

function collectFiles(root, current = root) {
  const output = []
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

export function buildRelease({ root = productRoot, outputDir, now = new Date(), revision = gitRevision(root) }) {
  const pkg = sourcePackage(root)
  if (!outputDir) throw new Error("--output é obrigatório")
  const destination = resolve(outputDir, `ci-queue-${pkg.version}-${revision.slice(0, 12)}`)
  if (existsSync(destination)) throw new Error(`destino de release já existe: ${destination}`)

  for (const source of releasePaths) {
    const sourcePath = join(root, source)
    if (!existsSync(sourcePath)) throw new Error(`release requer ${source}`)
    assertRegularTree(sourcePath)
  }

  mkdirSync(destination, { recursive: true, mode: 0o755 })
  try {
    for (const source of releasePaths) {
      const from = join(root, source)
      const to = join(destination, source)
      cpSync(from, to, { recursive: true, force: false, errorOnExist: true, dereference: false })
    }
    const manifest = {
      schemaVersion: 1,
      product: "ci-queue",
      version: pkg.version,
      revision,
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
  return { command, output: value("--output"), bundle: value("--bundle") }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
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
