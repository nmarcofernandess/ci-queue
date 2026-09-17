import { spawnSync } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { CONFIG_FILENAME, parseQueueConfig } from "../contracts/config.js"
import { isValidPresetArgv, isValidProjectId, type QueueProjectConfig } from "../contracts/schema.js"
import { resolveRemoteBase } from "../core/spend-abort.js"

export type InitOptions = {
  force?: boolean
  name?: string
  workflow?: boolean
  baseRef?: string
  argv?: readonly string[]
  stateRoot: string
}

export type InitResult = {
  projectId: string
  configPath: string
  files: string[]
  state: "created" | "updated" | "already-initialized"
  dashboardRegistration: "existing" | "manual-binding-required"
}

export class InitError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "InitError"
    this.code = code
  }
}

const STRIP_GIT = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
] as const

type CatalogPresence =
  | { kind: "absent" }
  | { kind: "valid"; raw: Record<string, unknown>; config: QueueProjectConfig }
  | { kind: "invalid" }

type RegistryDocument = {
  schemaVersion: 1
  projects: Record<string, { id?: unknown; gitCommonDir?: unknown }>
}

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  }
  for (const key of STRIP_GIT) delete env[key]
  return env
}

function runGit(cwd: string, args: readonly string[]): { status: number; stdout: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
    env: gitEnv(),
  })
  return { status: result.status ?? 1, stdout: String(result.stdout ?? "").trim() }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function workflowTemplatePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "github", "ci-queue-verdict.yml")
}

function atomicWriteFile(path: string, text: string): void {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  writeFileSync(temporary, text, { encoding: "utf8", mode: 0o644 })
  renameSync(temporary, path)
}

function resolveWorktree(cwd: string): { root: string; commonDir: string } {
  const start = resolve(cwd)
  const inside = runGit(start, ["rev-parse", "--is-inside-work-tree"])
  if (inside.status !== 0 || inside.stdout !== "true") {
    throw new InitError("NOT_A_GIT_REPOSITORY", "pasta não é um repositório Git")
  }
  const toplevel = runGit(start, ["rev-parse", "--show-toplevel"])
  if (toplevel.status !== 0 || !toplevel.stdout) {
    throw new InitError("NOT_A_GIT_REPOSITORY", "pasta não é um repositório Git")
  }
  const root = realpathOrResolve(toplevel.stdout)
  const common = runGit(root, ["rev-parse", "--git-common-dir"])
  if (common.status !== 0 || !common.stdout) {
    throw new InitError("NOT_A_GIT_REPOSITORY", "pasta não é um repositório Git")
  }
  const commonDir = realpathOrResolve(isAbsolute(common.stdout) ? common.stdout : join(root, common.stdout))
  return { root, commonDir }
}

function listWorktrees(commonDir: string, fallback: string): string[] {
  const result = spawnSync("git", ["--git-dir", commonDir, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
    timeout: 10_000,
    env: gitEnv(),
  })
  const found = new Set<string>()
  if (result.status === 0) {
    for (const line of String(result.stdout).split("\n")) {
      if (line.startsWith("worktree ")) found.add(realpathOrResolve(line.slice("worktree ".length)))
    }
  }
  found.add(realpathOrResolve(fallback))
  return [...found]
}

function listRemotes(root: string): string[] {
  const listed = runGit(root, ["remote"])
  if (listed.status !== 0) return []
  return listed.stdout.split("\n").map((item) => item.trim()).filter(Boolean)
}

function readCatalog(path: string): CatalogPresence {
  if (!existsSync(path)) return { kind: "absent" }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return { kind: "invalid" }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { kind: "invalid" }
  try {
    return {
      kind: "valid",
      raw: raw as Record<string, unknown>,
      config: parseQueueConfig(raw as Record<string, unknown>, dirname(path)),
    }
  } catch {
    return { kind: "invalid" }
  }
}

function readRegistry(stateRoot: string): RegistryDocument {
  const path = join(stateRoot, "state", "projects.json")
  if (!existsSync(path)) return { schemaVersion: 1, projects: {} }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new InitError("REGISTRY_UNREADABLE", "cadastro de projetos ilegível; arquivo preservado")
  }
  if (
    !raw
    || typeof raw !== "object"
    || Array.isArray(raw)
    || (raw as { schemaVersion?: unknown }).schemaVersion !== 1
    || typeof (raw as { projects?: unknown }).projects !== "object"
    || (raw as { projects?: unknown }).projects === null
    || Array.isArray((raw as { projects: unknown }).projects)
  ) {
    throw new InitError("REGISTRY_UNREADABLE", "cadastro de projetos ilegível; arquivo preservado")
  }
  return raw as RegistryDocument
}

function dashboardRegistration(registry: RegistryDocument, projectId: string): InitResult["dashboardRegistration"] {
  return Object.prototype.hasOwnProperty.call(registry.projects, projectId) ? "existing" : "manual-binding-required"
}

function collectKnownIds(
  worktrees: readonly string[],
  commonDir: string,
  registry: RegistryDocument,
): string[] {
  const ids = new Set<string>()
  for (const tree of worktrees) {
    const catalog = readCatalog(join(tree, CONFIG_FILENAME))
    if (catalog.kind === "invalid") {
      throw new InitError("CONFIG_INVALID", "ci-queue.json inválido; arquivo preservado")
    }
    if (catalog.kind === "valid") ids.add(catalog.config.project.id)
  }
  for (const [key, entry] of Object.entries(registry.projects)) {
    const bound = typeof entry?.gitCommonDir === "string" ? entry.gitCommonDir : undefined
    if (!bound) continue
    if (realpathOrResolve(bound) !== commonDir) continue
    const id = typeof entry.id === "string" && isValidProjectId(entry.id) ? entry.id : key
    if (isValidProjectId(id)) ids.add(id)
  }
  return [...ids]
}

function npmCheckArgv(worktree: string): string[] | undefined {
  const path = join(worktree, "package.json")
  if (!existsSync(path)) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const scripts = (raw as Record<string, unknown>).scripts
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return undefined
  const check = (scripts as Record<string, unknown>).check
  if (typeof check !== "string" || !check.trim()) return undefined
  return ["npm", "run", "check"]
}

function resolveArgv(worktree: string, options: InitOptions, existing?: QueueProjectConfig): string[] {
  if (options.argv !== undefined) {
    if (!isValidPresetArgv(options.argv)) throw new InitError("ARGV_INVALID", "argv inválido")
    return [...options.argv]
  }
  const current = existing?.presets.check?.argv
  if (isValidPresetArgv(current)) return [...current]
  const npm = npmCheckArgv(worktree)
  if (npm) return npm
  throw new InitError("ARGV_REQUIRED", "informe --argv-json; npm run check só vale com scripts.check inequívoco")
}

function inferUpstream(root: string): string | undefined {
  const result = runGit(root, ["rev-parse", "--abbrev-ref", "@{upstream}"])
  if (result.status !== 0 || !result.stdout.includes("/")) return undefined
  return result.stdout
}

function resolveBaseRef(root: string, options: InitOptions, existing?: QueueProjectConfig): string {
  const candidate = options.baseRef
    ?? existing?.presets.check?.fetchBase
    ?? existing?.repository?.baseRef
    ?? inferUpstream(root)
  if (!candidate) {
    throw new InitError("BASE_REF_REQUIRED", "informe --base-ref; origin/dev não é padrão")
  }
  try {
    resolveRemoteBase(candidate, listRemotes(root))
  } catch {
    throw new InitError("BASE_REF_INVALID", "base-ref inválido")
  }
  return candidate
}

function resolveName(worktree: string, options: InitOptions, existing?: QueueProjectConfig): string {
  const name = options.name ?? existing?.project.name ?? basename(worktree)
  if (typeof name !== "string" || !name.trim()) throw new InitError("NAME_INVALID", "project.name é obrigatório")
  return name.trim()
}

function requestedChange(config: QueueProjectConfig, options: InitOptions): boolean {
  if (options.name !== undefined && options.name.trim() !== config.project.name) return true
  if (options.argv !== undefined && JSON.stringify([...options.argv]) !== JSON.stringify(config.presets.check?.argv ?? [])) {
    return true
  }
  if (options.baseRef !== undefined) {
    const current = config.presets.check?.fetchBase ?? config.repository?.baseRef
    if (options.baseRef !== current) return true
  }
  return false
}

function mergeAcceptedPresets(existing: unknown, presetNames: readonly string[]): string[] {
  const current = Array.isArray(existing) ? existing.filter((item): item is string => typeof item === "string") : []
  const names = new Set(presetNames)
  const merged: string[] = []
  for (const name of ["check", ...current]) {
    if (!names.has(name) || merged.includes(name)) continue
    merged.push(name)
  }
  return merged.length > 0 ? merged : ["check"]
}

function buildCatalog(
  existingRaw: Record<string, unknown> | undefined,
  input: {
    id: string
    name: string
    argv: string[]
    baseRef: string
  },
): Record<string, unknown> {
  const existingPresets = asObject(existingRaw?.presets)
  const existingCheck = asObject(existingPresets.check)
  const existingShip = asObject(existingRaw?.ship)
  const existingProject = asObject(existingRaw?.project)
  const existingRepository = asObject(existingRaw?.repository)
  const check = {
    ...existingCheck,
    argv: input.argv,
    progress: typeof existingCheck.progress === "boolean" ? existingCheck.progress : true,
    requireCleanTree: typeof existingCheck.requireCleanTree === "boolean" ? existingCheck.requireCleanTree : true,
    fetchBase: input.baseRef,
    requireGitStability: typeof existingCheck.requireGitStability === "boolean" ? existingCheck.requireGitStability : true,
    pinHeadSha: typeof existingCheck.pinHeadSha === "boolean" ? existingCheck.pinHeadSha : true,
    abortOnStaleBase: typeof existingCheck.abortOnStaleBase === "boolean" ? existingCheck.abortOnStaleBase : false,
  }
  const presets = { ...existingPresets, check }
  const acceptedPresets = mergeAcceptedPresets(existingShip.acceptedPresets, Object.keys(presets))
  const attestationContext = typeof existingShip.attestationContext === "string" && existingShip.attestationContext.trim()
    ? existingShip.attestationContext.trim()
    : "local/check"
  const ship = {
    ...existingShip,
    acceptedPresets,
    attestationContext,
  }
  return {
    ...existingRaw,
    schemaVersion: 1,
    project: { ...existingProject, id: input.id, name: input.name },
    repository: { ...existingRepository, path: ".", baseRef: input.baseRef },
    presets,
    ship,
  }
}

function finished(
  worktree: string,
  projectId: string,
  files: string[],
  state: InitResult["state"],
  registry: RegistryDocument,
): InitResult {
  return {
    projectId,
    configPath: join(worktree, CONFIG_FILENAME),
    files,
    state,
    dashboardRegistration: dashboardRegistration(registry, projectId),
  }
}

export async function initProject(cwd: string, options: InitOptions): Promise<InitResult> {
  if (options.workflow && !existsSync(workflowTemplatePath())) {
    throw new InitError("WORKFLOW_TEMPLATE_MISSING", "template de workflow ausente nesta distribuição")
  }

  const { root, commonDir } = resolveWorktree(cwd)
  const configPath = join(root, CONFIG_FILENAME)
  const catalog = readCatalog(configPath)
  if (catalog.kind === "invalid") {
    throw new InitError("CONFIG_INVALID", "ci-queue.json inválido; arquivo preservado")
  }

  const registry = readRegistry(options.stateRoot)
  if (catalog.kind === "valid" && !options.force) {
    if (requestedChange(catalog.config, options)) {
      throw new InitError("CONFIG_EXISTS", "ci-queue.json já existe; use --force para alterar")
    }
    return finished(root, catalog.config.project.id, [], "already-initialized", registry)
  }

  const existing = catalog.kind === "valid" ? catalog.config : undefined
  const argv = resolveArgv(root, options, existing)
  const baseRef = resolveBaseRef(root, options, existing)
  const name = resolveName(root, options, existing)

  let projectId: string
  if (existing) {
    projectId = existing.project.id
  } else {
    const known = collectKnownIds(listWorktrees(commonDir, root), commonDir, registry)
    if (known.length > 1) {
      throw new InitError("IDENTITY_CONFLICT", "identidades incompatíveis neste repositório")
    }
    projectId = known[0] ?? randomUUID()
  }

  const document = buildCatalog(catalog.kind === "valid" ? catalog.raw : undefined, {
    id: projectId,
    name,
    argv,
    baseRef,
  })
  parseQueueConfig(document, root)
  const text = `${JSON.stringify(document, null, 2)}\n`
  if (catalog.kind === "valid" && readFileSync(configPath, "utf8") === text) {
    return finished(root, projectId, [], "already-initialized", registry)
  }
  atomicWriteFile(configPath, text)
  return finished(root, projectId, [CONFIG_FILENAME], existing ? "updated" : "created", registry)
}
