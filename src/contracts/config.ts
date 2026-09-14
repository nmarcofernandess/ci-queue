import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

import { isValidPresetArgv, isValidProjectId, type ProjectPreset, type QueueProjectConfig } from "./schema.js"

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
    presets[name] = {
      argv: [...item.argv],
      ...(typeof item.note === "string" ? { note: item.note } : {}),
      ...(typeof timeout === "number" ? { executionTimeoutMs: timeout } : {}),
      ...(typeof item.requireCleanTree === "boolean" ? { requireCleanTree: item.requireCleanTree } : {}),
      ...(typeof item.fetchBase === "string" ? { fetchBase: item.fetchBase } : {}),
      ...(typeof item.requireGitStability === "boolean" ? { requireGitStability: item.requireGitStability } : {}),
      ...(typeof item.pinHeadSha === "boolean" ? { pinHeadSha: item.pinHeadSha } : {}),
    }
  }
  if (Object.keys(presets).length === 0) throw new Error('campo "presets" não pode estar vazio')
  return presets
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
  const nestedPresets = projectRaw?.presets
  const presets = readPresets(raw.presets ?? nestedPresets)
  const repositoryRaw = raw.repository && typeof raw.repository === "object" && !Array.isArray(raw.repository)
    ? raw.repository as Record<string, unknown>
    : undefined
  const repositoryPath = typeof repositoryRaw?.path === "string" ? repositoryRaw.path : undefined
  const baseRef = typeof repositoryRaw?.baseRef === "string" ? repositoryRaw.baseRef : undefined
  const artifacts = Array.isArray(raw.artifacts) && raw.artifacts.every((item) => typeof item === "string")
    ? [...raw.artifacts] as string[]
    : undefined
  return {
    schemaVersion: 1,
    project: { id: projectId, name: projectName.trim() },
    ...(repositoryPath || baseRef ? { repository: { ...(repositoryPath ? { path: repositoryPath } : {}), ...(baseRef ? { baseRef } : {}) } } : {}),
    presets,
    ...(artifacts ? { artifacts } : {}),
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
