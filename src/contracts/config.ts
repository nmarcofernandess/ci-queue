import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

import {
  isValidPresetArgv,
  normalizeFinalization,
  rejectArtifactSnapshots,
  isValidProjectId,
  type ProjectPreset,
  type QueueProjectConfig,
  type ShipConfig,
} from "./schema.js"

export const CONFIG_FILENAME = "ci-queue.json"

export type ResolvedQueueConfig = {
  config: QueueProjectConfig
  configPath: string
  projectRoot: string
  executionCwd: string
}

function findUp(start: string, name: string): string | undefined {
  let current = resolve(start)
  for (;;) {
    const candidate = join(current, name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function readObject(path: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("objeto esperado")
    return value as Record<string, unknown>
  } catch (error) {
    throw new Error(`configuração inválida em ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readPresets(value: unknown): Record<string, ProjectPreset> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error('campo "presets" ausente')
  const presets: Record<string, ProjectPreset> = {}
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isValidProjectId(name) || !raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`preset inválido: ${name}`)
    }
    const item = raw as Record<string, unknown>
    if (!isValidPresetArgv(item.argv)) throw new Error(`preset ${name} precisa declarar argv não vazio`)
    const timeout = item.executionTimeoutMs
    if (timeout !== undefined && (!Number.isSafeInteger(timeout) || (timeout as number) <= 0 || (timeout as number) > 2_147_483_647)) {
      throw new Error(`preset ${name} tem executionTimeoutMs inválido`)
    }
    if (item.progress !== undefined && typeof item.progress !== "boolean") {
      throw new Error(`preset ${name} tem progress inválido`)
    }
    rejectArtifactSnapshots(item.artifacts, `preset ${name}.artifacts`)
    const finalization = normalizeFinalization(item.finalization)
    if (item.abortOnStaleBase !== undefined && typeof item.abortOnStaleBase !== "boolean") {
      throw new Error(`preset ${name} tem abortOnStaleBase inválido`)
    }
    const fetchBase = typeof item.fetchBase === "string" ? item.fetchBase : undefined
    const abortOnStaleBase = typeof item.abortOnStaleBase === "boolean" ? item.abortOnStaleBase : undefined
    if (abortOnStaleBase === true && !fetchBase) {
      throw new Error(`preset ${name} exige fetchBase quando abortOnStaleBase é true`)
    }
    presets[name] = {
      argv: [...item.argv],
      ...(typeof item.note === "string" ? { note: item.note } : {}),
      ...(typeof timeout === "number" ? { executionTimeoutMs: timeout } : {}),
      ...(typeof item.requireCleanTree === "boolean" ? { requireCleanTree: item.requireCleanTree } : {}),
      ...(fetchBase ? { fetchBase } : {}),
      ...(typeof item.requireGitStability === "boolean" ? { requireGitStability: item.requireGitStability } : {}),
      ...(typeof item.pinHeadSha === "boolean" ? { pinHeadSha: item.pinHeadSha } : {}),
      ...(abortOnStaleBase !== undefined ? { abortOnStaleBase } : {}),
      ...(typeof item.progress === "boolean" ? { progress: item.progress } : {}),
      ...(item.artifacts !== undefined ? { artifacts: [] } : {}),
      ...(finalization ? { finalization } : {}),
    }
  }
  if (Object.keys(presets).length === 0) throw new Error('campo "presets" não pode estar vazio')
  return presets
}

function readShip(value: unknown, presets: Record<string, ProjectPreset>): ShipConfig | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ship inválido")
  const raw = value as Record<string, unknown>
  const acceptedPresetsRaw = raw.acceptedPresets
  if (!Array.isArray(acceptedPresetsRaw) || acceptedPresetsRaw.length === 0) {
    throw new Error("ship.acceptedPresets não pode estar vazio")
  }
  const seen = new Set<string>()
  const acceptedPresets: string[] = []
  for (const item of acceptedPresetsRaw) {
    if (typeof item !== "string" || !item.trim() || !isValidProjectId(item)) {
      throw new Error("ship.acceptedPresets inválido")
    }
    if (seen.has(item)) throw new Error("ship.acceptedPresets deve ser único")
    seen.add(item)
    const preset = presets[item]
    if (!preset) throw new Error(`ship.acceptedPresets referencia preset desconhecido: ${item}`)
    if (
      preset.requireCleanTree !== true
      || preset.requireGitStability !== true
      || preset.pinHeadSha !== true
      || !preset.fetchBase
    ) {
      throw new Error(`ship.acceptedPresets ${item} precisa requireCleanTree, requireGitStability, pinHeadSha e fetchBase`)
    }
    acceptedPresets.push(item)
  }
  const attestationContext = raw.attestationContext
  if (
    typeof attestationContext !== "string" ||
    !attestationContext.trim() ||
    attestationContext.length > 100 ||
    attestationContext.includes("\n")
  ) {
    throw new Error("ship.attestationContext inválido")
  }
  let remoteVerdict: ShipConfig["remoteVerdict"]
  if (raw.remoteVerdict !== undefined) {
    if (!raw.remoteVerdict || typeof raw.remoteVerdict !== "object" || Array.isArray(raw.remoteVerdict)) {
      throw new Error("ship.remoteVerdict inválido")
    }
    const verdict = raw.remoteVerdict as Record<string, unknown>
    const workflow = verdict.workflow
    const job = verdict.job
    if (
      typeof workflow !== "string" ||
      !workflow.startsWith(".github/workflows/") ||
      workflow.includes("..") ||
      !(workflow.endsWith(".yml") || workflow.endsWith(".yaml"))
    ) {
      throw new Error("ship.remoteVerdict.workflow inválido")
    }
    if (typeof job !== "string" || !job.trim()) {
      throw new Error("ship.remoteVerdict.job inválido")
    }
    remoteVerdict = { workflow, job: job.trim() }
  }
  return {
    acceptedPresets,
    attestationContext: attestationContext.trim(),
    ...(remoteVerdict ? { remoteVerdict } : {}),
  }
}

function readExecution(value: unknown): QueueProjectConfig["execution"] {
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("execution inválido")
  }
  const raw = value as Record<string, unknown>
  if (raw.executor !== "queue") {
    throw new Error('execution.executor suportado: "queue"')
  }
  let queue: { command?: string } | undefined
  if (raw.queue !== undefined) {
    if (!raw.queue || typeof raw.queue !== "object" || Array.isArray(raw.queue)) {
      throw new Error("execution.queue inválido")
    }
    const command = (raw.queue as { command?: unknown }).command
    if (command !== undefined && (typeof command !== "string" || !command.trim())) {
      throw new Error("execution.queue.command inválido")
    }
    queue = typeof command === "string" ? { command: command.trim() } : {}
  }
  return { executor: "queue", ...(queue ? { queue } : {}) }
}

/**
 * Normaliza aliases planos apenas para uma transição assistida. Arquivos novos
 * devem escrever o formato documentado `project` + `presets` na raiz.
 */
export function parseQueueConfig(raw: Record<string, unknown>, projectRoot: string): QueueProjectConfig {
  if (raw.schemaVersion !== 1) throw new Error("schemaVersion 1 é obrigatório")
  const projectRaw = raw.project && typeof raw.project === "object" && !Array.isArray(raw.project)
    ? raw.project as Record<string, unknown>
    : undefined
  const projectId = projectRaw?.id ?? raw.projectId
  const projectName = projectRaw?.name ?? raw.projectName
  if (!isValidProjectId(projectId)) throw new Error("project.id deve ser um identificador estável")
  if (typeof projectName !== "string" || !projectName.trim()) throw new Error("project.name é obrigatório")
  rejectArtifactSnapshots(raw.artifacts)
  const artifacts = raw.artifacts === undefined ? undefined : []
  const nestedPresets = projectRaw?.presets
  const presets = readPresets(raw.presets ?? nestedPresets)
  const repositoryRaw = raw.repository && typeof raw.repository === "object" && !Array.isArray(raw.repository)
    ? raw.repository as Record<string, unknown>
    : undefined
  const repositoryPath = typeof repositoryRaw?.path === "string" ? repositoryRaw.path : undefined
  const baseRef = typeof repositoryRaw?.baseRef === "string" ? repositoryRaw.baseRef : undefined
  const ship = readShip(raw.ship, presets)
  const execution = readExecution(raw.execution)
  return {
    schemaVersion: 1,
    project: { id: projectId, name: projectName.trim() },
    ...(repositoryPath || baseRef ? { repository: { ...(repositoryPath ? { path: repositoryPath } : {}), ...(baseRef ? { baseRef } : {}) } } : {}),
    presets,
    ...(artifacts ? { artifacts } : {}),
    ...(ship ? { ship } : {}),
    ...(execution ? { execution } : {}),
  }
}

export function readQueueConfig(cwd = process.cwd(), explicitPath?: string): ResolvedQueueConfig {
  const configPath = explicitPath
    ? resolve(cwd, explicitPath)
    : findUp(cwd, CONFIG_FILENAME)
  if (!configPath) throw new Error(`${CONFIG_FILENAME} não encontrado a partir de ${cwd}`)
  const projectRoot = dirname(configPath)
  const config = parseQueueConfig(readObject(configPath), projectRoot)
  const configuredPath = config.repository?.path
  const executionCwd = configuredPath
    ? isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath)
    : projectRoot
  return { config, configPath, projectRoot, executionCwd }
}
