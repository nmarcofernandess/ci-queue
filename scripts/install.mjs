#!/usr/bin/env node
/**
 * Instala uma release já verificada sem apontar para checkout, symlink ou
 * `file:` de desenvolvimento. As operações são deliberadamente filesystem
 * only: o ativador real do LaunchAgent entra depois de a janela de cutover
 * provar que não há worker anterior disputando a mesma fila.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

import { verifyRelease } from "./release.mjs"

const here = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PREFIX = join(homedir(), ".local", "share", "ci-queue")
export const PRODUCT_STATE = join(homedir(), ".local", "state", "ci-queue")
export const COMPATIBILITY_STATE = join(
  homedir(),
  ".local",
  "state",
  "local-ci",
  "queue"
)
/**
 * Keep an existing queue in place for the first external release. This
 * preserves its history and the lock paths that prevent old/new workers from
 * competing during the cutover. New installations use the product root.
 */
export const DEFAULT_STATE = existsSync(COMPATIBILITY_STATE)
  ? COMPATIBILITY_STATE
  : PRODUCT_STATE
const INSTALLATION_FILENAME = "installation.json"

function inside(child, parent) {
  const relation = relative(resolve(parent), resolve(child))
  return relation !== "" && !relation.startsWith("..") && !relation.includes("../")
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, path)
}

function installationPath(prefix) {
  return join(resolve(prefix), INSTALLATION_FILENAME)
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function readInstallation(prefix) {
  const path = installationPath(prefix)
  if (!existsSync(path)) return undefined
  let value
  try { value = JSON.parse(readFileSync(path, "utf8")) } catch { throw new Error(`instalação ilegível: ${path}`) }
  if (!value || value.schemaVersion !== 1 || value.product !== "ci-queue" || typeof value.releasePath !== "string" || typeof value.stateRoot !== "string") {
    throw new Error(`instalação inválida: ${path}`)
  }
  return value
}

function assertQuietState(stateRoot) {
  const root = resolve(stateRoot)
  for (const path of [
    join(root, "running.json"),
    // The retained local-ci layout and clean product installs share this path.
    join(root, "locks", "runner.lock"),
    // Read an early pre-release layout conservatively rather than risking two workers.
    join(root, "runner.lock"),
  ]) {
    if (existsSync(path)) {
      throw new Error(`estado da fila incerto: ${path} existe; aguarde o executor terminar ou recupere-o antes da manutenção`)
    }
  }
}

function safeReleaseName(manifest) {
  const version = String(manifest.version)
  const revision = String(manifest.revision)
  if (!/^[0-9A-Za-z.+-]+$/.test(version) || !/^[0-9a-f]{12,64}$/i.test(revision)) {
    throw new Error("manifest tem versão ou revisão insegura")
  }
  return `${version}-${revision.slice(0, 12)}`
}

function servicePath(nodePath) {
  return [...new Set([
    dirname(nodePath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ])].join(":")
}

function copyBundle(bundle, prefix, manifest) {
  const releaseRoot = join(resolve(prefix), "releases")
  const releasePath = join(releaseRoot, safeReleaseName(manifest))
  if (existsSync(releasePath)) {
    verifyRelease(releasePath)
    return releasePath
  }
  mkdirSync(releaseRoot, { recursive: true, mode: 0o755 })
  const temporary = `${releasePath}.incoming-${process.pid}`
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
  try {
    cpSync(bundle, temporary, { recursive: true, force: false, errorOnExist: true, dereference: false })
    verifyRelease(temporary)
    renameSync(temporary, releasePath)
    return releasePath
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

function serviceDefinition({ releasePath, stateRoot, configPath, nodePath, pythonPath, manifestSha256 }) {
  if (!configPath) return []
  if (!nodePath || !pythonPath) throw new Error("--node e --python são obrigatórios ao gerar envelope de serviço")
  const launchRoot = join(releasePath, "launch-agents")
  const environment = { PATH: servicePath(nodePath) }
  return [
    {
      label: "com.nmarcofernandess.ci-queue.worker",
      file: join(launchRoot, "com.nmarcofernandess.ci-queue.worker.plist"),
      plist: {
        Label: "com.nmarcofernandess.ci-queue.worker",
        ProgramArguments: [nodePath, join(releasePath, "bin", "ci-queue.mjs"), "worker", "--state", stateRoot],
        EnvironmentVariables: environment,
        QueueDirectories: [join(stateRoot, "jobs")],
        ProcessType: "Background",
      },
    },
    {
      label: "com.nmarcofernandess.ci-queue.dashboard",
      file: join(launchRoot, "com.nmarcofernandess.ci-queue.dashboard.plist"),
      plist: {
        Label: "com.nmarcofernandess.ci-queue.dashboard",
        ProgramArguments: [pythonPath, "-m", "ci_queue_api", "--config", configPath, "--state", stateRoot, "--ui", join(releasePath, "ui", "dist"), "--manifest", join(releasePath, "manifest.json"), "--manifest-sha256", manifestSha256],
        EnvironmentVariables: { ...environment, PYTHONPATH: join(releasePath, "backend") },
        KeepAlive: true,
        ProcessType: "Background",
      },
    },
  ]
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function plistValue(value) {
  if (Array.isArray(value)) return `<array>${value.map(plistValue).join("")}</array>`
  if (typeof value === "object" && value) return `<dict>${Object.entries(value).map(([key, item]) => `<key>${xmlEscape(key)}</key>${plistValue(item)}`).join("")}</dict>`
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>"
  return `<string>${xmlEscape(value)}</string>`
}

function writeServiceEnvelope(services) {
  for (const service of services) {
    mkdirSync(dirname(service.file), { recursive: true, mode: 0o755 })
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plistValue(service.plist)}</plist>\n`
    writeFileSync(service.file, body, { encoding: "utf8", mode: 0o600 })
  }
}

function writeCommandLauncher(path, nodePath, releasePath) {
  if (!path) return undefined
  if (!nodePath) throw new Error("--node é obrigatório ao instalar o comando")
  const commandPath = resolve(path)
  const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`
  const body = `#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(join(releasePath, "bin", "ci-queue.mjs"))} "$@"\n`
  mkdirSync(dirname(commandPath), { recursive: true, mode: 0o755 })
  writeFileSync(commandPath, body, { encoding: "utf8", mode: 0o755 })
  chmodSync(commandPath, 0o755)
  return { path: commandPath, sha256: createHash("sha256").update(body).digest("hex") }
}

function launchDomain() {
  if (process.platform !== "darwin" || typeof process.getuid !== "function") {
    throw new Error("ativação automática está disponível somente no macOS")
  }
  return `gui/${process.getuid()}`
}

function deactivateServices(services) {
  const domain = launchDomain()
  for (const service of services) {
    try {
      execFileSync("launchctl", ["bootout", `${domain}/${service.label}`], { stdio: "ignore" })
    } catch {
      // Serviço ausente já é o estado desejado.
    }
  }
}

function activateServices(services) {
  if (!services.length) throw new Error("--activate requer --config, --node e --python")
  const domain = launchDomain()
  deactivateServices(services)
  const activated = []
  try {
    for (const service of services) {
      execFileSync("launchctl", ["bootstrap", domain, service.file], { stdio: "pipe" })
      activated.push(service)
    }
  } catch (error) {
    deactivateServices(activated)
    throw error
  }
}

export function installRelease(input) {
  const prefix = resolve(input.prefix ?? DEFAULT_PREFIX)
  const stateRoot = resolve(input.stateRoot ?? DEFAULT_STATE)
  const manifest = verifyRelease(input.bundle)
  assertQuietState(stateRoot)
  const existing = readInstallation(prefix)
  if (existing && resolve(existing.stateRoot) !== stateRoot) {
    throw new Error("instalação existente usa outro state root; recusei trocar a fila por atualização implícita")
  }
  const releasePath = copyBundle(resolve(input.bundle), prefix, manifest)
  const manifestPath = join(releasePath, "manifest.json")
  const manifestSha256 = sha256(manifestPath)
  mkdirSync(join(stateRoot, "jobs"), { recursive: true, mode: 0o700 })
  const services = serviceDefinition({
    releasePath,
    stateRoot,
    configPath: input.configPath,
    nodePath: input.nodePath,
    pythonPath: input.pythonPath,
    manifestSha256,
  })
  writeServiceEnvelope(services)
  const command = writeCommandLauncher(input.commandPath, input.nodePath, releasePath)
  const installation = {
    schemaVersion: 1,
    product: "ci-queue",
    version: manifest.version,
    revision: manifest.revision,
    installedAt: new Date().toISOString(),
    releasePath,
    stateRoot,
    manifestPath,
    manifestSha256,
    services: services.map(({ label, file }) => ({ label, file })),
    ...(command ? { command } : {}),
  }
  atomicJson(installationPath(prefix), installation)
  if (input.activate) activateServices(services)
  return installation
}

export function uninstallRelease(input) {
  const prefix = resolve(input.prefix ?? DEFAULT_PREFIX)
  const installation = readInstallation(prefix)
  if (!installation) return { removed: false, reason: "not-installed" }
  assertQuietState(installation.stateRoot)
  if (input.deactivate) deactivateServices(installation.services ?? [])
  for (const service of installation.services ?? []) {
    if (typeof service?.file !== "string" || !inside(service.file, installation.releasePath)) {
      throw new Error("manifest de instalação contém serviço fora da release")
    }
    if (existsSync(service.file)) rmSync(service.file, { force: true })
  }
  if (installation.command?.path && existsSync(installation.command.path) &&
      sha256(installation.command.path) !== installation.command.sha256) {
    throw new Error(`comando instalado foi alterado; preservei ${installation.command.path}`)
  }
  if (!inside(installation.releasePath, prefix)) throw new Error("release ativa fora do prefixo da instalação")
  if (existsSync(installation.releasePath)) rmSync(installation.releasePath, { recursive: true, force: true })
  if (installation.command?.path && existsSync(installation.command.path)) {
    rmSync(installation.command.path, { force: true })
  }
  if (input.purgeState) {
    if (resolve(installation.stateRoot) === resolve(prefix) || !installation.stateRoot) throw new Error("state root inválido para purge")
    if (existsSync(installation.stateRoot)) rmSync(installation.stateRoot, { recursive: true, force: true })
  }
  rmSync(installationPath(prefix), { force: true })
  return { removed: true, statePreserved: !input.purgeState }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

function main(argv = process.argv.slice(2)) {
  const [command] = argv
  if (command === "install" || command === "update") {
    const result = installRelease({
      bundle: option(argv, "--bundle"),
      prefix: option(argv, "--prefix"),
      stateRoot: option(argv, "--state"),
      configPath: option(argv, "--config"),
      nodePath: option(argv, "--node"),
      pythonPath: option(argv, "--python"),
      commandPath: option(argv, "--command"),
      activate: argv.includes("--activate"),
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  if (command === "uninstall") {
    const result = uninstallRelease({ prefix: option(argv, "--prefix"), purgeState: argv.includes("--purge-state"), deactivate: argv.includes("--deactivate") })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  throw new Error("uso: install.mjs install|update --bundle <release> [--prefix DIR] [--state DIR] [--config project/ci-queue.json --node PATH --python PATH --command PATH --activate] | uninstall [--prefix DIR] [--deactivate] [--purge-state]")
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
