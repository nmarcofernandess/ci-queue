#!/usr/bin/env node
/**
 * Instala uma release já verificada sem apontar para checkout, symlink ou
 * `file:` de desenvolvimento. Sem `--activate`, as operações são somente de
 * filesystem. A ativação publica LaunchAgents canônicos apenas durante uma
 * janela de cutover que já tenha provado a fila quieta.
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { hostname, homedir } from "node:os"
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
const STAGED_INSTALLATION_FILENAME = "staged-installation.json"
const SERVICE_LABELS = new Set([
  "com.nmarcofernandess.ci-queue.worker",
  "com.nmarcofernandess.ci-queue.dashboard",
])

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

function stagedInstallationPath(prefix) {
  return join(resolve(prefix), STAGED_INSTALLATION_FILENAME)
}

function isActiveInstallation(installation) {
  if (!installation || typeof installation !== "object") return false
  if (installation.activationStatus === "verified") return true
  if (installation.activationStatus === "staged") return false
  if (Array.isArray(installation.services) && installation.services.length > 0) return true
  return false
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function atomicFile(path, body, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, body, { encoding: "utf8", mode })
  renameSync(temporary, path)
  chmodSync(path, mode)
}

function snapshotFiles(paths) {
  return paths.map((path) => {
    if (!existsSync(path)) return { path, body: undefined, mode: undefined }
    const info = statSync(path)
    if (!info.isFile()) {
      throw new Error(`snapshot recusou caminho não-regular: ${path}`)
    }
    return { path, body: readFileSync(path), mode: info.mode & 0o777 }
  })
}

function restoreFiles(snapshots) {
  for (const snapshot of snapshots) {
    if (snapshot.body === undefined) rmSync(snapshot.path, { force: true })
    else atomicFile(snapshot.path, snapshot.body, snapshot.mode ?? 0o600)
  }
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
    join(root, "runner.lock"),
    join(root, "locks", "runner.lock"),
    join(root, "state", "maintenance.lock"),
    join(root, "state", "worker.json"),
    join(root, "state", "worker.pid"),
  ]) {
    if (existsSync(path)) {
      throw new Error(`estado da fila incerto: ${path} existe; aguarde o executor terminar ou recupere-o antes da manutenção`)
    }
  }
  // This is the private runtime owner, not a PID-only liveness shortcut.
  // Any unfinished/uncertain session protects the installation, even after
  // running.json is gone. Released records remain as durable recovery receipts.
  const sessions = join(root, "runtime-sessions")
  let hasSessions = false
  try { lstatSync(sessions); hasSessions = true } catch (error) {
    if (error?.code !== "ENOENT") throw new Error("runtime de sessão incerto; catálogo inacessível")
  }
  if (hasSessions) {
    const uncertain = () => { throw new Error("runtime de sessão ativo ou incerto; confirme release antes da manutenção") }
    const privateInfo = (path, directory = false) => {
      const info = lstatSync(path)
      if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || info.uid !== process.getuid?.() || (info.mode & 0o077)) uncertain()
      return info
    }
    const entryExists = path => {
      try { lstatSync(path); return true } catch (error) {
        if (error?.code === "ENOENT") return false
        uncertain()
      }
    }
    try {
      const owner = privateInfo(sessions, true)
      const same = identity => identity && identity.uid === owner.uid && identity.ino === owner.ino && identity.dev === owner.dev
      const group = g => g && g.hostname === hostname() && Number.isSafeInteger(g.leaderPid) && g.leaderPid > 0 && g.pgid === g.leaderPid && typeof g.startedAt === "string" && g.startedAt
      for (const name of readdirSync(sessions)) {
        if (!/^session-[A-Za-z0-9][A-Za-z0-9_-]{0,95}\.json$/.test(name)) uncertain()
        const path = join(sessions, name)
        if (privateInfo(path).size > 256 * 1024) uncertain()
        const r = JSON.parse(readFileSync(path, "utf8"))
        if (r.schemaVersion !== 1 || r.runtimeId + ".json" !== name || r.runtimeId !== "session-" + r.sessionId
          || typeof r.projectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(r.projectId)
          || ![r.token, r.bindingDigest, r.requirementDigest].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
          || !r.env || typeof r.env !== "object" || Array.isArray(r.env)
          || r.state !== "released" || !Number.isSafeInteger(r.stateRevision) || r.stateRevision < 1
          || !same(r.catalogIdentity) || !group(r.owner) || !group(r.producer) || !Array.isArray(r.groups) || r.groups.length > 512 || !r.groups.every(group)
          || !Number.isSafeInteger(r.evidenceOffset) || r.evidenceOffset < 0 || !r.directoryIdentity || r.directoryIdentity.uid !== owner.uid
          || ![r.directoryIdentity.uid, r.directoryIdentity.ino, r.directoryIdentity.dev].every(n => Number.isSafeInteger(n) && n >= 0)
          || lstatSync(join(root, "runtime")).isSymbolicLink()
          || r.directory !== join(realpathSync(root), "runtime", r.runtimeId) || entryExists(r.directory)) uncertain()
        const receipt = r.receipt, selected = receipt?.node
        if (receipt?.capability !== "node-runtime-guard-v1" || receipt.coverage !== "guarded-node-processes"
          || !["prepared", "verified", "preflight-only"].includes(receipt.state)
          || receipt.evidencePath !== join(r.directory, "processes.jsonl") || receipt.requirementDigest !== r.requirementDigest
          || !Array.isArray(receipt.observations) || receipt.observations.length > 64
          || !selected || typeof selected.executable !== "string" || !selected.executable.startsWith("/")
          || typeof selected.version !== "string" || typeof selected.sha256 !== "string"
          || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(selected.version)
          || !/^[a-f0-9]{64}$/.test(selected.sha256)) uncertain()
        if (r.recovery !== undefined) {
          const recovery = r.recovery, stamp = recovery?.recoveryOwnerStamp
          if (!recovery || typeof recovery.operationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(recovery.operationId)
            || !Number.isSafeInteger(recovery.originalStateRevision) || recovery.originalStateRevision < 1 || recovery.originalStateRevision >= r.stateRevision
            || !stamp || !Number.isSafeInteger(stamp.pid) || stamp.pid < 1 || stamp.pgid !== stamp.pid || typeof stamp.startedAt !== "string" || !stamp.startedAt) uncertain()
        }
      }
    } catch { uncertain() }
  }
  const jobLocks = join(root, "locks", "jobs")
  for (const directory of [join(root, "claims"), jobLocks]) {
    if (!existsSync(directory)) continue
    const stat = lstatSync(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`estado da fila incerto: ownership/recuperação pendente em ${directory}`)
    }
    for (const name of readdirSync(directory)) {
      const entry = lstatSync(join(directory, name))
      // Legacy proper-lockfile targets remain after release; reservations add .lock.
      const legacyTarget = directory === jobLocks
        && /^(?:[0-9]{8}-[0-9]{6}-[a-f0-9]{6}|validation-plan)\.state$/.test(name)
        && entry.isFile() && entry.size === 0 && entry.nlink === 1
        && typeof process.getuid === "function" && entry.uid === process.getuid()
      if (!legacyTarget) throw new Error(`estado da fila incerto: ownership/recuperação pendente em ${directory}`)
    }
  }
  // Historical finalization/source validity governs replay of that ticket, not
  // maintenance ownership. Preserve those bytes without traversing them here.
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

function serviceDefinition({ releasePath, stateRoot, configPath, nodePath, pythonPath, manifestSha256, homeDir, commandPath }) {
  if (!configPath) return []
  if (!nodePath || !pythonPath) throw new Error("--node e --python são obrigatórios ao gerar envelope de serviço")
  const launchRoot = join(releasePath, "launch-agents")
  const environment = { PATH: servicePath(nodePath), CI_QUEUE_MANIFEST_PATH: join(releasePath, "manifest.json"), CI_QUEUE_MANIFEST_SHA256: manifestSha256 }
  return [
    {
      label: "com.nmarcofernandess.ci-queue.worker",
      referenceFile: join(launchRoot, "com.nmarcofernandess.ci-queue.worker.plist"),
      file: join(homeDir, "Library", "LaunchAgents", "com.nmarcofernandess.ci-queue.worker.plist"),
      plist: {
        Label: "com.nmarcofernandess.ci-queue.worker",
        ProgramArguments: [nodePath, join(releasePath, "bin", "ci-queue.mjs"), "worker", "--state", stateRoot],
        EnvironmentVariables: environment,
        QueueDirectories: [join(stateRoot, "jobs")],
        ProcessType: "Standard",
      },
    },
    {
      label: "com.nmarcofernandess.ci-queue.dashboard",
      referenceFile: join(launchRoot, "com.nmarcofernandess.ci-queue.dashboard.plist"),
      file: join(homeDir, "Library", "LaunchAgents", "com.nmarcofernandess.ci-queue.dashboard.plist"),
      plist: {
        Label: "com.nmarcofernandess.ci-queue.dashboard",
        ProgramArguments: [pythonPath, "-m", "ci_queue_api", "--config", configPath, "--state", stateRoot, "--ui", join(releasePath, "ui", "dist"), "--manifest", join(releasePath, "manifest.json"), "--manifest-sha256", manifestSha256],
        EnvironmentVariables: { ...environment, PYTHONPATH: join(releasePath, "backend") },
        KeepAlive: true,
        ProcessType: "Interactive",
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

function serviceBody(service) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plistValue(service.plist)}</plist>\n`
}

function writeServiceReferences(services) {
  for (const service of services) {
    atomicFile(service.referenceFile, serviceBody(service))
  }
}

function writeCommandLauncher(path, nodePath, releasePath, stateRoot) {
  if (!path) return undefined
  if (!nodePath) throw new Error("--node é obrigatório ao instalar o comando")
  if (!stateRoot) throw new Error("stateRoot é obrigatório ao instalar o comando")
  const commandPath = resolve(path)
  const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`
  const body = [
    "#!/bin/sh",
    'if [ "$#" -eq 0 ] && [ "$(uname -s)" = "Darwin" ]; then',
    '  exec open "http://127.0.0.1:8765/dashboard"',
    "fi",
    `if [ -z "\${CI_QUEUE_STATE_DIR:-}" ]; then`,
    `  export CI_QUEUE_STATE_DIR=${shellQuote(resolve(stateRoot))}`,
    "fi",
    `export CI_QUEUE_MANIFEST_PATH=${shellQuote(join(releasePath, "manifest.json"))}`,
    `export CI_QUEUE_MANIFEST_SHA256=${shellQuote(sha256(join(releasePath, "manifest.json")))}`,
    `exec ${shellQuote(nodePath)} ${shellQuote(join(releasePath, "bin", "ci-queue.mjs"))} "$@"`,
    "",
  ].join("\n")
  mkdirSync(dirname(commandPath), { recursive: true, mode: 0o755 })
  writeFileSync(commandPath, body, { encoding: "utf8", mode: 0o755 })
  chmodSync(commandPath, 0o755)
  return { path: commandPath, sha256: createHash("sha256").update(body).digest("hex") }
}

function assertCommandOwnership(existing, requestedPath) {
  if (!existing?.command?.path || !existsSync(existing.command.path)) return
  if (!existing.command.sha256 || sha256(existing.command.path) !== existing.command.sha256) {
    throw new Error(`comando instalado foi alterado; preservei ${existing.command.path}`)
  }
  if (requestedPath && resolve(requestedPath) !== resolve(existing.command.path)) {
    throw new Error("instalação existente usa outro caminho de comando; recusei trocar o launcher implicitamente")
  }
}

function launchDomain(platform = process.platform, uid = typeof process.getuid === "function" ? process.getuid() : undefined) {
  if (platform !== "darwin" || uid === undefined) {
    throw new Error("ativação automática está disponível somente no macOS")
  }
  return `gui/${uid}`
}

function defaultLaunchctl(args, options = {}) {
  const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.trunc(options.timeoutMs)) : 10_000
  return execFileSync("launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout })
}

function defaultPortOwnerProbe(adapter) {
  let output
  try {
    output = execFileSync("/usr/sbin/lsof", ["-nP", "-iTCP:8765", "-sTCP:LISTEN", "-Fp"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  } catch (error) {
    if (error?.status === 1) return undefined
    throw new Error(`não consegui inspecionar a porta 8765: ${error?.message ?? error}`)
  }
  const listenerPids = [...output.matchAll(/^p(\d+)$/gm)].map((match) => match[1])
  if (!listenerPids.length) return undefined
  try {
    const current = adapter.run(["print", `${launchDomain(adapter.platform, adapter.uid)}/com.nmarcofernandess.ci-queue.dashboard`])
    const servicePid = /\bpid\s*=\s*(\d+)/.exec(current)?.[1]
    if (servicePid && listenerPids.length === 1 && listenerPids[0] === servicePid) return "com.nmarcofernandess.ci-queue.dashboard"
  } catch (error) {
    if (!isMissingService(error)) throw error
  }
  return `pid:${listenerPids.join(",")}`
}

function isMissingService(error) {
  const message = `${error?.stderr ?? ""}\n${error?.message ?? ""}`
  return /could not find service|no such process|service not found|113: could not find/i.test(message)
}

function deactivateServices(services, adapter, { tolerateMissing = true, timeoutMs = 2000 } = {}) {
  const domain = launchDomain(adapter.platform, adapter.uid)
  const deadline = Date.now() + Math.max(1, timeoutMs)
  const run = (args) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw new Error(`desativação excedeu o tempo limite antes de ${args[0]}`)
    }
    return adapter.run(args, { timeoutMs: Math.min(10_000, remaining) })
  }
  for (const service of services) {
    try {
      run(["bootout", `${domain}/${service.label}`])
    } catch (error) {
      if (!tolerateMissing || !isMissingService(error)) throw new Error(`bootout falhou para ${service.label}: ${error?.message ?? error}`)
    }
    let deactivated = false
    while (Date.now() < deadline) {
      try {
        run(["print", `${domain}/${service.label}`])
        if (typeof adapter.wait === "function") {
          const waitMs = Math.min(50, Math.max(0, deadline - Date.now()))
          if (waitMs <= 0) break
          adapter.wait(waitMs)
        }
      } catch (error) {
        if (isMissingService(error)) {
          deactivated = true
          break
        }
        throw new Error(`falha ao consultar estado de desativação para ${service.label}: ${error?.message ?? error}`)
      }
    }
    if (!deactivated) {
      throw new Error(`desativação de ${service.label} excedeu o tempo limite e o serviço continua carregado`)
    }
  }
}

function disabledLabels(adapter, services) {
  const domain = launchDomain(adapter.platform, adapter.uid)
  const output = adapter.run(["print-disabled", domain])
  return services.filter(({ label }) => new RegExp(`"?${label.replaceAll(".", "\\.")}"?\\s*=>\\s*true`).test(output)).map(({ label }) => label)
}

function verifyLoaded(adapter, service, attempts = 3) {
  const target = `${launchDomain(adapter.platform, adapter.uid)}/${service.label}`
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const output = adapter.run(["print", target])
      if (String(output).includes(service.label)) return
      lastError = new Error(`launchctl print não confirmou estado loaded para ${service.label}`)
    } catch (error) {
      lastError = error
    }
    adapter.wait(50)
  }
  throw new Error(`ativação de ${service.label} não confirmou estado carregado: ${lastError?.message ?? lastError}`)
}

function activateServices(services, adapter) {
  if (!services.length) throw new Error("--activate requer --config, --node e --python")
  const disabled = disabledLabels(adapter, services)
  if (disabled.length) throw new Error(`serviço desabilitado pelo usuário; preservei a escolha: ${disabled.join(", ")}`)
  const domain = launchDomain(adapter.platform, adapter.uid)
  deactivateServices(services, adapter)
  const activated = []
  try {
    for (const service of services) {
      if (adapter.run === defaultLaunchctl) {
        let lastBootstrapError
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          try {
            adapter.run(["bootstrap", domain, service.file])
            lastBootstrapError = undefined
            break
          } catch (error) {
            lastBootstrapError = error
            if (attempt < 5) adapter.wait(200)
          }
        }
        if (lastBootstrapError) throw lastBootstrapError
      } else {
        adapter.run(["bootstrap", domain, service.file])
      }
      activated.push(service)
      verifyLoaded(adapter, service)
    }
  } catch (error) {
    deactivateServices(activated, adapter)
    throw error
  }
}

function serviceReceipt(service) {
  return { label: service.label, file: service.file, sha256: sha256(service.file), referenceFile: service.referenceFile }
}

function validateOwnedCanonical(service, existing) {
  if (!SERVICE_LABELS.has(service.label)) throw new Error(`label de serviço não permitido: ${service.label}`)
  if (!existsSync(service.file)) return
  if (lstatSync(service.file).isSymbolicLink() || !lstatSync(service.file).isFile()) {
    throw new Error(`envelope canônico não é arquivo regular: ${service.file}`)
  }
  const owner = existing?.services?.find((candidate) => candidate?.label === service.label && resolve(candidate?.file ?? "") === resolve(service.file))
  if (owner?.sha256) {
    if (sha256(service.file) === owner.sha256) return
    throw new Error(`envelope canônico alheio ou alterado; preservei ${service.file}`)
  }
  if (owner && !owner.sha256 && owner.referenceFile && existsSync(owner.referenceFile)) {
    if (readFileSync(service.file).equals(readFileSync(owner.referenceFile))) return
  }
  throw new Error(`envelope canônico alheio ou alterado; preservei ${service.file}`)
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
  assertCommandOwnership(existing, input.commandPath)
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
    homeDir: resolve(input.homeDir ?? homedir()),
    commandPath: input.commandPath,
  })
  writeServiceReferences(services)
  const preservingActiveInstallation = !input.activate && isActiveInstallation(existing)
  let ownedServices = services.map(({ label, referenceFile }) => ({ label, file: referenceFile, sha256: sha256(referenceFile), referenceFile }))
  const command = preservingActiveInstallation ? undefined : (input.commandPath ? { path: resolve(input.commandPath), sha256: "" } : undefined)

  if (input.activate) {
    const adapter = {
      run: input.launchctl ?? defaultLaunchctl,
      platform: input.platform ?? process.platform,
      uid: input.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined),
      wait: input.wait ?? ((milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)),
    }
    for (const service of services) validateOwnedCanonical(service, existing)
    const portOwnerProbe = input.portOwnerProbe ?? (input.launchctl ? undefined : () => defaultPortOwnerProbe(adapter))
    if (portOwnerProbe) {
      const owner = portOwnerProbe()
      if (owner && owner !== "com.nmarcofernandess.ci-queue.dashboard") throw new Error(`porta do dashboard ocupada por processo desconhecido: ${owner}`)
    }

    const serviceFilesToSnapshot = new Set([
      ...services.map(({ file }) => file),
      ...(existing?.services?.map(({ file }) => file).filter(Boolean) ?? []),
    ])
    const existingServiceSnapshots = snapshotFiles([...serviceFilesToSnapshot])
    const existingLauncherSnapshot = input.commandPath ? snapshotFiles([resolve(input.commandPath)]) : []
    const existingReceiptSnapshot = snapshotFiles([installationPath(prefix)])
    const existingStagedSnapshot = snapshotFiles([stagedInstallationPath(prefix)])

    const activatedServices = []
    try {
      for (const service of services) atomicFile(service.file, serviceBody(service))
      activateServices(services, adapter)
      activatedServices.push(...services)
      ownedServices = services.map(serviceReceipt)

      const writtenCommand = writeCommandLauncher(input.commandPath, input.nodePath, releasePath, stateRoot)
      const installation = {
        schemaVersion: 1,
        product: "ci-queue",
        version: manifest.version,
        revision: manifest.revision,
        installedAt: new Date().toISOString(),
        activationStatus: "verified",
        releasePath,
        stateRoot,
        manifestPath,
        manifestSha256,
        services: ownedServices,
        launchAgentsRoot: join(resolve(input.homeDir ?? homedir()), "Library", "LaunchAgents"),
        ...(writtenCommand ? { command: writtenCommand } : {}),
      }
      atomicJson(installationPath(prefix), installation)
      if (existsSync(stagedInstallationPath(prefix))) {
        rmSync(stagedInstallationPath(prefix), { force: true })
      }
      return installation
    } catch (error) {
      let rollbackError
      try {
        if (activatedServices.length) {
          try {
            deactivateServices(activatedServices, adapter, { tolerateMissing: true })
          } catch (deactErr) {
            rollbackError = deactErr
          }
        }
        restoreFiles(existingServiceSnapshots)
        if (existingLauncherSnapshot.length) restoreFiles(existingLauncherSnapshot)
        if (existingReceiptSnapshot.length) restoreFiles(existingReceiptSnapshot)
        if (existingStagedSnapshot.length) restoreFiles(existingStagedSnapshot)
        if (existing?.services?.length) {
          activateServices(existing.services, adapter)
        }
      } catch (recoveryErr) {
        rollbackError = rollbackError ?? recoveryErr
      }
      if (rollbackError) {
        throw new Error(`ativação falhou e rollback ficou incerto: ${error?.message ?? error}; rollback: ${rollbackError?.message ?? rollbackError}`)
      }
      throw error
    }
  }

  const writtenCommand = preservingActiveInstallation ? undefined : writeCommandLauncher(input.commandPath, input.nodePath, releasePath, stateRoot)
  const installation = {
    schemaVersion: 1,
    product: "ci-queue",
    version: manifest.version,
    revision: manifest.revision,
    installedAt: new Date().toISOString(),
    activationStatus: "staged",
    releasePath,
    stateRoot,
    manifestPath,
    manifestSha256,
    services: ownedServices,
    ...(writtenCommand ? { command: writtenCommand } : {}),
  }
  if (preservingActiveInstallation) {
    atomicJson(stagedInstallationPath(prefix), installation)
  } else {
    atomicJson(installationPath(prefix), installation)
  }
  return installation
}

export function uninstallRelease(input) {
  const prefix = resolve(input.prefix ?? DEFAULT_PREFIX)
  const installation = readInstallation(prefix)
  if (!installation) return { removed: false, reason: "not-installed" }
  assertQuietState(installation.stateRoot)
  if (isActiveInstallation(installation) && !input.deactivate) {
    throw new Error("instalação ativa requer --deactivate para remoção segura")
  }
  const adapter = {
    run: input.launchctl ?? defaultLaunchctl,
    platform: input.platform ?? process.platform,
    uid: input.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined),
    wait: input.wait ?? ((milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)),
  }
  const serviceFiles = []
  for (const service of installation.services ?? []) {
    if (!SERVICE_LABELS.has(service?.label) || typeof service?.file !== "string") {
      throw new Error("manifest de instalação contém serviço sem ownership verificável")
    }
    const canonical = typeof installation.launchAgentsRoot === "string" && resolve(service.file) === join(resolve(installation.launchAgentsRoot), `${service.label}.plist`)
    const allowed = inside(service.file, installation.releasePath) || canonical
    if (!allowed) throw new Error("manifest de instalação contém serviço fora dos destinos permitidos")
    const legacyReleaseEnvelope = inside(service.file, installation.releasePath) && service.sha256 === undefined
    if (!legacyReleaseEnvelope && typeof service.sha256 !== "string") throw new Error("manifest de instalação contém serviço sem hash de ownership")
    if (existsSync(service.file) && !legacyReleaseEnvelope && sha256(service.file) !== service.sha256) throw new Error(`envelope instalado foi alterado; preservei ${service.file}`)
    serviceFiles.push(service.file)
  }
  if (installation.command?.path && existsSync(installation.command.path) &&
      sha256(installation.command.path) !== installation.command.sha256) {
    throw new Error(`comando instalado foi alterado; preservei ${installation.command.path}`)
  }
  if (!inside(installation.releasePath, prefix)) throw new Error("release ativa fora do prefixo da instalação")
  if (input.deactivate) deactivateServices(installation.services ?? [], adapter)
  for (const file of serviceFiles) {
    if (existsSync(file)) rmSync(file, { force: true })
  }
  if (existsSync(installation.releasePath)) rmSync(installation.releasePath, { recursive: true, force: true })
  if (installation.command?.path && existsSync(installation.command.path)) {
    rmSync(installation.command.path, { force: true })
  }
  if (input.purgeState) {
    if (resolve(installation.stateRoot) === resolve(prefix) || !installation.stateRoot) throw new Error("state root inválido para purge")
    if (existsSync(installation.stateRoot)) rmSync(installation.stateRoot, { recursive: true, force: true })
  }
  rmSync(installationPath(prefix), { force: true })
  rmSync(stagedInstallationPath(prefix), { force: true })
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
