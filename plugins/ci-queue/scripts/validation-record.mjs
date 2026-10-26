import { createHash, randomUUID } from "node:crypto"
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PRESET = /^[a-z0-9][a-z0-9-]{0,63}$/

function readJson(path) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path)))
}

function text(value, label, limit = 2000) {
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > limit) throw new Error(`${label} inválido`)
  return value
}

function timestamp(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("createdAt inválido")
}

export function fingerprint(item) {
  // Fixed scalar order keeps the Node/Python projection byte-compatible.
  return createHash("sha256").update(JSON.stringify([
    item.id, item.preset, item.headSha, item.scope, item.reason, item.createdAt, item.pr ?? null,
  ])).digest("hex")
}

export function validateRecord(raw, projectId) {
  if (!raw || raw.kind !== "ci-queue-validations" || raw.schemaVersion !== 1 || raw.projectId !== projectId || !Array.isArray(raw.requirements)) throw new Error("registro de validações inválido")
  const ids = new Set()
  for (const item of raw.requirements) {
    if (!item || !ID.test(text(item.id, "id", 128)) || ids.has(item.id)
      || !PRESET.test(text(item.preset, "preset", 64)) || !SHA.test(text(item.headSha, "headSha", 64))) throw new Error("identidade de validação inválida ou duplicada")
    ids.add(item.id)
    text(item.scope, "scope")
    text(item.reason, "reason", 500)
    timestamp(item.createdAt)
    if (item.pr !== undefined && (!Number.isSafeInteger(item.pr) || item.pr <= 0)) throw new Error("pr inválida")
    if (item.resolution !== undefined) {
      const result = item.resolution
      if (!result || !/^[a-f0-9]{64}$/.test(text(result.fingerprint, "resolution.fingerprint", 64))
        || !SHA.test(text(result.headSha, "resolution.headSha", 64))) throw new Error("fechamento inválido")
      text(result.scope, "resolution.scope")
      text(result.evidence, "resolution.evidence")
      timestamp(result.createdAt)
    }
  }
  return raw
}

export function isResolved(item) {
  return item.resolution?.fingerprint === fingerprint(item) && item.resolution.scope === item.scope
}

function contained(root, path) {
  const rel = relative(root, path)
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function location(cwd) {
  const root = realpathSync(resolve(cwd))
  const config = readJson(resolve(root, "ci-queue.json"))
  const projectId = config.project?.id
  if (typeof projectId !== "string" || !ID.test(projectId)) throw new Error("project.id inválido")
  const path = config.validationRecord
  if (path === undefined || path === null) return { root, config, projectId, path: null }
  if (typeof path !== "string" || !path.trim() || isAbsolute(path) || /[\\\0\r\n]/.test(path)
    || path.split("/").includes("..")) throw new Error("validationRecord deve ser path relativo dentro do consumidor")
  const absolute = resolve(root, path)
  if (absolute === root || !contained(root, absolute)) throw new Error("validationRecord fora do consumidor")
  let ancestor = absolute
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const effective = resolve(realpathSync(ancestor), relative(ancestor, absolute))
  if (!contained(root, effective)) throw new Error("validationRecord escapa por symlink")
  try {
    if (lstatSync(absolute).isSymbolicLink() && !existsSync(absolute)) throw new Error("validationRecord é symlink sem alvo; preservado")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  return { root, config, projectId, path: effective }
}

export function listRecord(cwd) {
  const loc = location(cwd)
  if (!loc.path) return { status: "unconfigured", path: null, pending: [] }
  if (!existsSync(loc.path)) return { status: "missing", path: loc.path, pending: [] }
  const record = validateRecord(readJson(loc.path), loc.projectId)
  return {
    status: "ready", path: loc.path,
    pending: record.requirements.filter(item => !isResolved(item)).map(item => ({ ...item, fingerprint: fingerprint(item) })),
    resolved: record.requirements.filter(isResolved).map(item => item.id),
  }
}

function mutate(cwd, action, initialize = false) {
  const loc = location(cwd)
  if (!loc.path) throw new Error("configure validationRecord explicitamente no catálogo antes de escrever")
  if (!initialize && !existsSync(loc.path)) throw new Error("registro ausente; init pertence à adoção/configuração explícita")
  mkdirSync(dirname(loc.path), { recursive: true })
  const lockPath = `${loc.path}.lock`
  const lock = openSync(lockPath, "wx", 0o600)
  const temporary = `${loc.path}.${randomUUID()}.tmp`
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, operation: "validation-record" }))
    if (initialize && existsSync(loc.path)) throw new Error("registro já existe; preservado")
    const raw = initialize ? { kind: "ci-queue-validations", schemaVersion: 1, projectId: loc.projectId, requirements: [] }
      : readJson(loc.path)
    const record = validateRecord(raw, loc.projectId)
    const result = action(record, loc)
    validateRecord(record, loc.projectId)
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" })
    renameSync(temporary, loc.path)
    return { path: loc.path, ...result }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
    closeSync(lock)
    unlinkSync(lockPath)
  }
}

export function initRecord(cwd) {
  return mutate(cwd, () => ({ initialized: true }), true)
}

export function addRequirement(cwd, input) {
  return mutate(cwd, (record, loc) => {
    if (!Object.hasOwn(loc.config.presets ?? {}, input.preset)) throw new Error(`preset não declarado: ${input.preset}`)
    const item = {
      id: randomUUID(), preset: input.preset, headSha: input.headSha,
      scope: input.scope, reason: input.reason, createdAt: new Date().toISOString(),
      ...(input.pr !== undefined ? { pr: input.pr } : {}),
    }
    record.requirements.push(item)
    return { requirement: item, fingerprint: fingerprint(item) }
  })
}

export function resolveRequirement(cwd, input) {
  return mutate(cwd, record => {
    const item = record.requirements.find(entry => entry.id === input.id)
    if (!item) throw new Error("id não encontrado; nenhuma obrigação alterada")
    if (input.expected !== fingerprint(item)) throw new Error("obrigação mudou; releia revisão e escopo antes de reconciliar")
    if (input.scope !== item.scope) throw new Error("evidência de outro escopo não fecha esta obrigação")
    item.resolution = {
      fingerprint: input.expected, headSha: input.headSha, scope: input.scope,
      evidence: input.evidence, createdAt: new Date().toISOString(),
    }
    return { resolved: item.id }
  })
}

export function run(argv) {
  const [action, ...args] = argv
  const allowed = {
    list: ["cwd"], init: ["cwd"],
    add: ["cwd", "preset", "head-sha", "scope", "reason", "pr"],
    resolve: ["cwd", "id", "expected", "head-sha", "scope", "evidence"],
  }
  if (action === "--help" || action === "help") return { usage: "validation-record.mjs list|init|add|resolve --cwd CONSUMER [options]; see references/validations.md" }
  if (!Object.hasOwn(allowed, action)) throw new Error("ação esperada: list, init, add ou resolve")
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2)
    if (!args[i].startsWith("--") || !allowed[action].includes(key) || options[key] !== undefined || args[i + 1] === undefined) throw new Error(`opção inválida: ${args[i]}`)
    options[key] = args[i + 1]
  }
  const cwd = text(options.cwd, "--cwd")
  if (action === "list") return listRecord(cwd)
  if (action === "init") return initRecord(cwd)
  if (action === "add") return addRequirement(cwd, {
    preset: text(options.preset, "--preset"), headSha: text(options["head-sha"], "--head-sha"),
    scope: text(options.scope, "--scope"), reason: text(options.reason, "--reason"),
    ...(options.pr !== undefined ? { pr: Number(options.pr) } : {}),
  })
  return resolveRequirement(cwd, {
    id: text(options.id, "--id"), expected: text(options.expected, "--expected"),
    headSha: text(options["head-sha"], "--head-sha"), scope: text(options.scope, "--scope"),
    evidence: text(options.evidence, "--evidence"),
  })
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ ok: true, result: run(process.argv.slice(2)) })) }
  catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 }
}
