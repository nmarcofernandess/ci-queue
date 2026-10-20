import { spawnSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { lstatSync, readdirSync, accessSync, closeSync, constants, openSync, readSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

import { RUNTIME_CAPABILITY, type RuntimeRequirement as Requirement, type RuntimeReceipt, type RuntimeObservation, type SessionRuntimePrepare, type SessionRuntimeHandle, type SessionRuntimeRecovery, type SessionRuntimeStatus } from "../contracts/runtime.js"
import { canonicalJson, isValidProjectId, type QueueTicket } from "../contracts/schema.js"
import { hostname } from "node:os"
import { observeProcessGroup, probeProcessGroupIdentity } from "./process.js"
import { acquireDirectoryLock, readRunningJob, readBoundedFile, assertNoSymlinkPaths, atomicWriteJson } from "./state.js"
import { runtimeGuard, shellPolicyError, type GuardConfig } from "./runtime-guard.js"

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RESERVED = /^(PATH|NODE|NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|BASH_ENV|ENV|ZDOTDIR|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|IFS|npm_node_execpath|npm_execpath|npm_config_(script_shell|node_options|prefix|userconfig|globalconfig)|BASH_FUNC_.*|NVM_.*|VOLTA_.*|ASDF_.*|DYLD_.*|LD_.*)$/i

export type RuntimeSession = {
  argv: string[]
  env: NodeJS.ProcessEnv
  receipt: RuntimeReceipt
  directory?: string
  finish(): RuntimeReceipt
}
export class RuntimeError extends Error {
  constructor(readonly code: string, detail: string) { super(`${code}: ${detail}`) }
}
const fail = (code: string, detail: string): never => { throw new RuntimeError(code, detail) }
const digest = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex")
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))

export function runtimeRegistryPath(root: string): string {
  return join(root, "runtimes.json")
}

function digestFile(path: string): string {
  const hash = createHash("sha256")
  const fd = openSync(path, "r")
  try {
    const buf = Buffer.alloc(64 * 1024)
    let n = 0
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n))
  } finally { closeSync(fd) }
  return hash.digest("hex")
}

export function sanitizeRuntimeEnv(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(inherited).filter(([key]) => !RESERVED.test(key)))
}

function readObject(file: string, content = readFileSync(file, "utf8")): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(content)
    if (!object(value)) throw new Error("object expected")
    return value
  } catch { return fail("RUNTIME_CONFIG_INVALID", file) }
}

/** Reads all ancestor constraints within the checkout, never outside its .git boundary. */
function requirements(cwd: string): Requirement[] {
  const found: Requirement[] = []
  for (let directory = resolve(cwd); ;) {
    for (const name of ["package.json", ".nvmrc", ".node-version"]) {
      const file = join(directory, name)
      if (!existsSync(file)) continue
      const content = readFileSync(file, "utf8")
      let range: unknown
      if (name === "package.json") {
        const parsed = readObject(file, content)
        if (object(parsed.engines)) range = parsed.engines.node
      } else {
        range = content.trim().replace(/^v(?=\d)/, "")
        if (!range) fail("RUNTIME_REQUIREMENT_INVALID", file)
      }
      if (range === undefined) continue
      if (typeof range !== "string" || !range.trim()) fail("RUNTIME_REQUIREMENT_INVALID", file)
      found.push({ source: file, range: range as string, sha256: digest(content) })
    }
    if (existsSync(join(directory, ".git")) || dirname(directory) === directory) break
    directory = dirname(directory)
  }
  return found
}

function absoluteFile(value: unknown, label: string, executable = false): string {
  if (typeof value !== "string" || !isAbsolute(value) || /[\0\r\n]/.test(value)) return fail("RUNTIME_CONFIG_INVALID", `${label} must be absolute`)
  try {
    const file = realpathSync(value)
    if (!statSync(file).isFile()) throw new Error("not a file")
    accessSync(file, executable ? constants.X_OK | constants.R_OK : constants.R_OK)
    return file
  } catch { return fail("RUNTIME_NOT_INSTALLED", `${label}: ${value}`) }
}

function shellName(command: string): string | undefined {
  const name = basename(command)
  return ["bash", "sh", "zsh"].includes(name) ? name : undefined
}

/** Validate only structured argv; shell program strings are not statically parsed. */
export function validateRuntimeArgv(argv: string[]): void {
  if (!argv.length || argv.some(arg => typeof arg !== "string" || /[\0\r\n]/.test(arg))) fail("RUNTIME_ARGV_INVALID", "invalid argv")
  if (basename(argv[0]) === "env") {
    let i = 1
    if (argv[i] === "--") i++
    while (i < argv.length && /^[A-Za-z_][A-Za-z_0-9]*=/.test(argv[i])) {
      if (RESERVED.test(argv[i].split("=", 1)[0])) fail("RUNTIME_ENV_OVERRIDE", "env overrides runtime control")
      i++
    }
    if (i >= argv.length || argv[i].startsWith("-")) fail("RUNTIME_ENV_OVERRIDE", "env options are not admitted")
    validateRuntimeArgv(argv.slice(i))
  }
  if (shellName(argv[0])) {
    const error = shellPolicyError(argv.slice(1))
    if (error) fail(error, argv[0])
  }
}

function validateShebang(file: string): void {
  const fd = openSync(file, "r")
  try {
    const header = Buffer.alloc(4096)
    const size = readSync(fd, header, 0, header.length, 0)
    const firstLine = header.subarray(0, size).toString("utf8").split("\n", 1)[0]
    if (firstLine.startsWith("#!")) validateRuntimeArgv(firstLine.slice(2).trim().split(/\s+/))
  } finally { closeSync(fd) }
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'` }

/** A wrapper has an absolute /bin/sh bootstrap and never uses env node. */
function writeShim(path: string, executable: string, args: string[]): void {
  writeFileSync(path, `#!/bin/sh\nexec ${[executable, ...args].map(shellQuote).join(" ")} "$@"\n`, { mode: 0o700 })
}

function resolveCommand(command: string, cwd: string, env: NodeJS.ProcessEnv): string {
  if (command.includes("/")) return absoluteFile(resolve(cwd, command), "job executable", true)
  for (const directory of (env.PATH ?? "").split(":")) {
    const candidate = join(directory, command)
    try { accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return candidate } catch { /* next */ }
  }
  return fail("RUNTIME_COMMAND_NOT_FOUND", command)
}

function unconfigured(argv: string[], inherited: NodeJS.ProcessEnv): RuntimeSession {
  const receipt: RuntimeReceipt = { capability: RUNTIME_CAPABILITY, coverage: "unconfigured", state: "unconfigured", observations: [] }
  return { argv, env: inherited, receipt, finish: () => receipt }
}

export type RuntimeRegistry = { schemaVersion: 1; projects: Record<string, unknown> }

export function readRuntimeRegistry(root: string): RuntimeRegistry | undefined {
  const path = runtimeRegistryPath(root)
  if (!existsSync(path)) return undefined
  const registry = readObject(path, readFileSync(path, "utf8"))
  if (Object.keys(registry).some(key => !["schemaVersion", "projects"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown registry field")
  if (registry.schemaVersion !== 1) fail("RUNTIME_CONFIG_INVALID", path)
  const projects = object(registry.projects) ? registry.projects : fail("RUNTIME_CONFIG_INVALID", path)
  return { schemaVersion: 1, projects }
}

function parseToolPaths(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string" && isAbsolute(item) && !/[:\0\r\n]/.test(item))) {
    return fail("RUNTIME_CONFIG_INVALID", "toolPaths must contain absolute directories")
  }
  return value
}

function discoverNpmCli(nodeExecutable: string, name: "npm" | "npx"): string {
  return absoluteFile(join(dirname(nodeExecutable), name), name)
}

export function registerProjectRuntime(root: string, input: {
  projectId: string
  node: string
  version?: string
  npmCli?: string
  npxCli?: string
  toolPaths?: string[]
}): { registryPath: string; projectId: string; node: { executable: string; version: string }; npmCli: string; npxCli: string } {
  if (!isValidProjectId(input.projectId)) fail("RUNTIME_CONFIG_INVALID", "projectId inválido")
  const executable = absoluteFile(input.node, "node", true)
  const npmCli = input.npmCli ? absoluteFile(input.npmCli, "npmCli") : discoverNpmCli(executable, "npm")
  const npxCli = input.npxCli ? absoluteFile(input.npxCli, "npxCli") : discoverNpmCli(executable, "npx")
  const probe = spawnSync(executable, ["-p", "process.versions.node"], { encoding: "utf8", timeout: 10_000, env: { PATH: SYSTEM_PATH } })
  if (probe.status !== 0 || probe.error) fail("RUNTIME_PROBE_FAILED", "cannot read Node version")
  const version = probe.stdout.trim()
  if (!EXACT_VERSION.test(version)) fail("RUNTIME_PROBE_FAILED", "invalid Node version")
  if (input.version && input.version !== version) fail("RUNTIME_VERSION_MISMATCH", `required ${input.version}; effective ${version}`)
  if (input.toolPaths && (!Array.isArray(input.toolPaths) || !input.toolPaths.every(value => typeof value === "string" && isAbsolute(value) && !/[:\0\r\n]/.test(value)))) {
    fail("RUNTIME_CONFIG_INVALID", "toolPaths must contain absolute directories")
  }
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const existing = existsSync(runtimeRegistryPath(root)) ? readRuntimeRegistry(root) : undefined
  const projects = { ...(existing?.projects ?? {}) }
  projects[input.projectId] = {
    node: { executable, version },
    npmCli,
    npxCli,
    ...(input.toolPaths?.length ? { toolPaths: input.toolPaths } : {}),
  }
  const registryPath = runtimeRegistryPath(root)
  atomicWriteJson(registryPath, { schemaVersion: 1, projects })
  return { registryPath, projectId: input.projectId, node: { executable, version }, npmCli, npxCli }
}

/**
 * Local, operator-owned registry: no global PATH/nvm lookup, no recipe re-entry.
 * Binding is opt-in: without a project entry the job keeps the inherited environment.
 */
export function prepareJobRuntime(root: string, ticket: QueueTicket, argv: string[], inherited: NodeJS.ProcessEnv): RuntimeSession {
  return buildRuntime(root, ticket, argv, inherited)
}

function buildRuntime(root: string, ticket: QueueTicket, argv: string[], inherited: NodeJS.ProcessEnv, sessionId?: string): RuntimeSession {
  if (!argv.length || argv.some(arg => typeof arg !== "string" || /[\0\r\n]/.test(arg))) fail("RUNTIME_ARGV_INVALID", "invalid argv")
  const registryPath = runtimeRegistryPath(root)
  let binding: Record<string, unknown> | undefined
  let registrySha256: string | undefined
  if (existsSync(registryPath)) {
    const bytes = readFileSync(registryPath)
    const registry = readRuntimeRegistry(root)
    const raw = registry?.projects[ticket.projectId ?? ""]
    if (raw !== undefined && !object(raw)) fail("RUNTIME_CONFIG_INVALID", "project binding")
    binding = raw as Record<string, unknown> | undefined
    registrySha256 = digest(bytes)
  }
  if (!binding) return unconfigured(argv, inherited)

  validateRuntimeArgv(argv)
  const required = requirements(ticket.cwd)
  if (Object.keys(binding).some(key => !["node", "npmCli", "npxCli", "toolPaths"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown project runtime field")
  if (!object(binding.node)) fail("RUNTIME_CONFIG_INVALID", "node binding is required")
  const nodeBinding = binding.node as Record<string, unknown>
  if (Object.keys(nodeBinding).some(key => !["executable", "version"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown node binding field")
  const executable = absoluteFile(nodeBinding.executable, "node.executable", true)
  const version = typeof nodeBinding.version === "string" && EXACT_VERSION.test(nodeBinding.version)
    ? nodeBinding.version
    : fail("RUNTIME_CONFIG_INVALID", "node.version must be exact x.y.z")
  const npmCli = absoluteFile(binding.npmCli, "npmCli")
  const npxCli = absoluteFile(binding.npxCli, "npxCli")
  const toolPaths = parseToolPaths(binding.toolPaths)
  const clean = sanitizeRuntimeEnv(inherited)
  const probe = spawnSync(executable, ["-e", `
    const {createRequire} = require('node:module');
    const fs = require('node:fs');
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const semver = createRequire(input.npmCli)('semver');
    console.log(JSON.stringify({execPath: fs.realpathSync(process.execPath), version: process.versions.node,
      constraints: input.ranges.map(range => ({valid: Boolean(semver.validRange(range)), satisfies: semver.satisfies(process.versions.node, range)}))}));
  `], { cwd: ticket.cwd, env: { ...clean, PATH: SYSTEM_PATH }, input: JSON.stringify({ npmCli, ranges: required.map(item => item.range) }), encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024 })
  if (probe.status !== 0 || probe.error) fail("RUNTIME_PROBE_FAILED", "cannot verify selected Node with the configured npm semver library")
  let actual: { execPath: string; version: string; constraints: { valid: boolean; satisfies: boolean }[] }
  try { actual = JSON.parse(probe.stdout) } catch { return fail("RUNTIME_PROBE_FAILED", "invalid probe response") }
  if (actual.execPath !== executable || actual.version !== version) fail("RUNTIME_VERSION_MISMATCH", `required ${version}; effective ${actual.version}`)
  if (!Array.isArray(actual.constraints) || actual.constraints.length !== required.length) fail("RUNTIME_PROBE_FAILED", "constraint probe incomplete")
  actual.constraints.forEach((item, i) => {
    if (!item.valid) fail("RUNTIME_REQUIREMENT_INVALID", required[i].source)
    if (!item.satisfies) fail("RUNTIME_REQUIREMENT_MISMATCH", `${required[i].source} requires ${required[i].range}, selected ${version}`)
  })
  const runtimeRoot = join(root, "runtime")
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 })
  const directory = sessionId ? join(runtimeRoot, sessionId) : mkdtempSync(join(runtimeRoot, "job-"))
  if (sessionId) mkdirSync(directory, { mode: 0o700 })
  try {
    mkdirSync(join(directory, "bin"), { mode: 0o700 })
    const shimDir = realpathSync(join(directory, "bin"))
    const guardPath = join(directory, "guard.cjs")
    const evidencePath = join(directory, "processes.jsonl")
    writeFileSync(evidencePath, "", { mode: 0o600 })
    const config: GuardConfig = { executable, version, npmCli, npxCli, shimDir, evidencePath, guardPath, ...(sessionId ? { session: true } : {}) }
    writeFileSync(guardPath, `(${runtimeGuard.toString()})(${JSON.stringify(config)});\n`, { mode: 0o600 })
    writeShim(join(shimDir, "node"), executable, ["--require", guardPath])
    writeShim(join(shimDir, "npm"), executable, ["--require", guardPath, npmCli])
    writeShim(join(shimDir, "npx"), executable, ["--require", guardPath, npxCli])
    const shellLauncher = join(directory, "shell.cjs")
    writeFileSync(shellLauncher, `
    const fs = require('node:fs'); const {spawn} = require('node:child_process');
    const error = (${shellPolicyError.toString()})(process.argv.slice(3));
    if (error) {
      fs.appendFileSync(${JSON.stringify(evidencePath)}, JSON.stringify({pid:process.pid,ppid:process.ppid,at:new Date().toISOString(),execPath:process.execPath,version:process.versions.node,entry:'shell',status:'rejected',reason:error})+'\\n');
      console.error(error); process.exit(78);
    }
    const name=process.argv[2];
    const prefix=name==='bash'?['--noprofile','--norc']:name==='zsh'?['-f']:[];
    const child=spawn('/bin/'+name,[...prefix,...process.argv.slice(3)],{stdio:'inherit',env:process.env});
    child.on('error',()=>process.exit(78));
    child.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??78)});
  `, { mode: 0o600 })
    for (const shell of ["bash", "sh", "zsh"]) writeShim(join(shimDir, shell), executable, ["--require", guardPath, shellLauncher, shell])
    const userconfig = join(directory, "user.npmrc")
    const globalconfig = join(directory, "global.npmrc")
    writeFileSync(userconfig, "", { mode: 0o600 }); writeFileSync(globalconfig, "", { mode: 0o600 })
    const env: NodeJS.ProcessEnv = { ...clean,
      PATH: [shimDir, dirname(executable), SYSTEM_PATH, ...toolPaths].join(":"),
      NODE: executable, npm_node_execpath: executable, npm_execpath: npmCli,
      NODE_OPTIONS: `--require ${JSON.stringify(guardPath)}`,
      npm_config_script_shell: join(shimDir, "sh"), npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig,
      ZDOTDIR: directory,
    }
    let command = [...argv]
    if (shellName(command[0])) command[0] = join(shimDir, shellName(command[0])!)
    else if (["node", "npm", "npx"].includes(command[0])) command[0] = join(shimDir, command[0])
    command[0] = resolveCommand(command[0], ticket.cwd, env)
    validateShebang(command[0])
    if (["node", "npm", "npx"].includes(basename(command[0]))) {
      const allowed = [executable, npmCli, npxCli, ...["node", "npm", "npx"].map(name => realpathSync(join(shimDir, name)))]
      if (!allowed.includes(realpathSync(command[0]))) fail("RUNTIME_EXECUTABLE_MISMATCH", command[0])
    }
    const receipt: RuntimeReceipt = {
      capability: RUNTIME_CAPABILITY, coverage: "guarded-node-processes", state: "prepared",
      node: { executable, version, sha256: digestFile(executable) },
      requirementDigest: digest(canonicalJson(required)), npmCli, npxCli, bindingSource: "project-registry", environmentPolicy: "reconstructed", requirements: required, registrySha256, evidencePath, observations: [],
    }
    const finish = (): RuntimeReceipt => checkpointReceipt(receipt)
    return { argv: command, env, receipt, directory, finish }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

export function discardRuntimeDirectory(directory: string | undefined): void {
  if (!directory) return
  rmSync(directory, { recursive: true, force: true })
}

/** The job receipt exposes this digest before the launcher requests a session. */
export function runtimeRequirementDigest(cwd: string): string { return digest(canonicalJson(requirements(cwd))) }

function checkpointReceipt(receipt: RuntimeReceipt): RuntimeReceipt {
  try {
    const evidencePath = receipt.evidencePath!
    const info = lstatSync(evidencePath)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024 * 1024) throw new Error("invalid evidence")
    const observations: RuntimeObservation[] = readFileSync(evidencePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
    if (!observations.every(item => Number.isSafeInteger(item.pid) && typeof item.execPath === "string" && typeof item.version === "string" && ["verified", "rejected"].includes(item.status))) throw new Error("malformed evidence")
    const rejected = observations.find(item => item.status === "rejected" || item.execPath !== receipt.node!.executable || item.version !== receipt.node!.version)
    const changed = digestFile(receipt.node!.executable) !== receipt.node!.sha256
    return { ...receipt, observations, state: rejected || changed ? "rejected" : observations.length ? "verified" : "preflight-only",
      ...(rejected || changed ? { failureCode: rejected?.reason ?? "RUNTIME_BINARY_CHANGED" } : {}) }
  } catch { return { ...receipt, observations: [], state: "rejected", failureCode: "RUNTIME_EVIDENCE_INVALID" } }
}

type Group = NonNullable<ReturnType<typeof probeProcessGroupIdentity>>
type FileIdentity = { uid: number; ino: number; dev: number }
type SessionRecord = {
  schemaVersion: 1; runtimeId: string; projectId: string; sessionId: string; ticketId: string
  token: string; bindingDigest: string; requirementDigest: string; producer: Group; owner: Group
  directory: string; directoryIdentity: FileIdentity; catalogIdentity: FileIdentity
  groups: Group[]; evidenceOffset: number
  state: "active" | "closing" | "released"; stateRevision: number; lastCheckpointAt?: string
  env: NodeJS.ProcessEnv; receipt: RuntimeReceipt
  recovery?: { operationId: string; originalStateRevision: number; recoveryOwnerStamp: SessionRuntimeRecovery["recoveryOwnerStamp"] }
}
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/
const HASH = /^[a-f0-9]{64}$/
const privateText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && !/[\0\r\n]/.test(value)
const sessionIdValue = (value: unknown): value is string => typeof value === "string" && SESSION_ID.test(value)
const hashValue = (value: unknown): value is string => typeof value === "string" && HASH.test(value)
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
function sessionStampValue(value: unknown): boolean {
  return object(value) && positiveInteger(value.pid) && privateText(value.startedAt)
}
function assertPrepareInput(input: unknown): asserts input is SessionRuntimePrepare {
  if (!object(input) || !isValidProjectId(input.projectId) || !privateText(input.ticketId)
    || !sessionIdValue(input.sessionId) || !hashValue(input.requirementDigest) || !hashValue(input.launchBindingDigest)
    || !sessionStampValue(input.producerStamp) || !sessionStampValue(input.sessionStamp)) fail("RUNTIME_SESSION_INVALID", "invalid private prepare input")
}
function assertHandleInput(input: unknown): asserts input is SessionRuntimeHandle {
  if (!object(input) || "mode" in input || input.schemaVersion !== 1 || !privateText(input.root) || !isAbsolute(input.root)
    || !privateText(input.runtimeId) || !input.runtimeId.startsWith("session-") || !sessionIdValue(input.runtimeId.slice(8))
    || !isValidProjectId(input.projectId) || !sessionIdValue(input.sessionId) || !hashValue(input.token) || !hashValue(input.bindingDigest)
    || !privateText(input.directory) || !isAbsolute(input.directory) || !object(input.env)) fail("RUNTIME_SESSION_INVALID", "invalid private handle input")
}
function assertReleaseInput(input: unknown): asserts input is SessionRuntimeHandle | SessionRuntimeRecovery {
  if (!object(input) || !("mode" in input)) { assertHandleInput(input); return }
  const original = input.original
  const stamp = input.recoveryOwnerStamp
  if (input.mode !== "recover" || !privateText(input.root) || !isAbsolute(input.root) || !sessionIdValue(input.operationId)
    || !object(original) || !privateText(original.runtimeId) || !original.runtimeId.startsWith("session-") || !sessionIdValue(original.runtimeId.slice(8))
    || !isValidProjectId(original.projectId) || !sessionIdValue(original.sessionId) || !hashValue(original.bindingDigest) || !positiveInteger(original.expectedStateRevision)
    || !sessionStampValue(stamp) || !object(stamp) || stamp.pgid !== stamp.pid) fail("RUNTIME_SESSION_INVALID", "invalid private recovery input")
}
const catalog = (root: string): string => join(root, "runtime-sessions")
const fileIdentity = (path: string): FileIdentity => { const { uid, ino, dev } = lstatSync(path); return { uid, ino, dev } }
const sameIdentity = (a: FileIdentity, b: FileIdentity): boolean => a.uid === b.uid && a.ino === b.ino && a.dev === b.dev
function runtimeIdCheck(id: unknown): asserts id is string {
  if (typeof id !== "string" || !id.startsWith("session-") || !SESSION_ID.test(id.slice(8))) fail("RUNTIME_SESSION_INVALID", "runtime identity")
}
function privatePath(path: string, directory = false): void {
  const info = lstatSync(path)
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) fail("RUNTIME_SESSION_UNCERTAIN", "private owner/path invalid")
}
function sessionPaths(root: string, id: string): { record: string; directory: string; lock: string } {
  runtimeIdCheck(id)
  root = realpathSync(root)
  const directory = join(root, "runtime", id)
  assertNoSymlinkPaths([root, join(root, "runtime"), catalog(root), directory])
  return { record: join(catalog(root), id + ".json"), directory, lock: join(catalog(root), id + ".lock") }
}
function readSession(root: string, id: string): SessionRecord {
  const paths = sessionPaths(root, id)
  privatePath(catalog(root), true); privatePath(paths.record)
  const r = JSON.parse(readBoundedFile(paths.record, 256 * 1024).toString("utf8")) as SessionRecord
  if (r.schemaVersion !== 1 || r.runtimeId !== id || typeof r.sessionId !== "string" || !SESSION_ID.test(r.sessionId) || id !== "session-" + r.sessionId
    || !isValidProjectId(r.projectId) || ![r.bindingDigest, r.requirementDigest, r.token].every(value => typeof value === "string" && HASH.test(value))
    || !["active", "closing", "released"].includes(r.state) || !Number.isSafeInteger(r.stateRevision) || r.stateRevision < 1
    || r.directory !== paths.directory || !validFileIdentity(r.directoryIdentity) || !validFileIdentity(r.catalogIdentity) || !sameIdentity(r.catalogIdentity, fileIdentity(catalog(root)))
    || !Number.isSafeInteger(r.evidenceOffset) || r.evidenceOffset < 0
    || !validReceipt(r) || (r.recovery !== undefined && !validRecovery(r))
    || !Array.isArray(r.groups) || r.groups.length > 512 || !r.groups.every(validGroup) || !validGroup(r.owner) || !validGroup(r.producer) || !object(r.env) || !object(r.receipt)) fail("RUNTIME_SESSION_UNCERTAIN", "private record invalid")
  return r
}
function validReceipt(r: SessionRecord): boolean {
  const receipt = r.receipt
  return Boolean(object(receipt) && receipt.capability === RUNTIME_CAPABILITY && receipt.coverage === "guarded-node-processes"
    && ["prepared", "verified", "preflight-only"].includes(receipt.state)
    && receipt.evidencePath === join(r.directory, "processes.jsonl") && receipt.requirementDigest === r.requirementDigest
    && Array.isArray(receipt.observations) && receipt.observations.length <= 64 && object(receipt.node)
    && typeof receipt.node.executable === "string" && isAbsolute(receipt.node.executable) && typeof receipt.node.version === "string" && EXACT_VERSION.test(receipt.node.version) && typeof receipt.node.sha256 === "string" && HASH.test(receipt.node.sha256))
}
function validRecovery(r: SessionRecord): boolean {
  const recovery = r.recovery
  const stamp = recovery?.recoveryOwnerStamp
  return Boolean(recovery && typeof recovery.operationId === "string" && SESSION_ID.test(recovery.operationId) && Number.isSafeInteger(recovery.originalStateRevision)
    && recovery.originalStateRevision >= 1 && recovery.originalStateRevision < r.stateRevision && r.state !== "active"
    && stamp && Number.isSafeInteger(stamp.pid) && stamp.pid > 0 && stamp.pgid === stamp.pid && typeof stamp.startedAt === "string" && stamp.startedAt)
}
function validFileIdentity(value: FileIdentity): boolean {
  return Boolean(value && [value.uid, value.ino, value.dev].every(n => Number.isSafeInteger(n) && n >= 0) && value.uid === process.getuid?.())
}
function validGroup(g: Group): boolean {
  return Boolean(g && g.hostname === hostname() && Number.isSafeInteger(g.leaderPid) && g.leaderPid > 0 && g.pgid === g.leaderPid && typeof g.startedAt === "string" && g.startedAt)
}
function assertBundle(r: SessionRecord): void {
  privatePath(r.directory, true)
  if (!sameIdentity(r.directoryIdentity, fileIdentity(r.directory))) fail("RUNTIME_SESSION_UNCERTAIN", "bundle identity changed")
  for (const name of ["guard.cjs", "processes.jsonl", "shell.cjs", "user.npmrc", "global.npmrc"]) privatePath(join(r.directory, name))
}
function withSessionLock<T>(root: string, id: string, fn: () => T): T {
  const paths = sessionPaths(root, id)
  const lock = acquireDirectoryLock(paths.lock)
  if (!lock) return fail("RUNTIME_SESSION_BUSY", "record locked")
  try { return fn() } finally { lock.release() }
}
function handleFor(root: string, r: SessionRecord): SessionRuntimeHandle {
  return { schemaVersion: 1, root, runtimeId: r.runtimeId, token: r.token, projectId: r.projectId, sessionId: r.sessionId,
    bindingDigest: r.bindingDigest, directory: r.directory, env: r.env }
}
function assertHandle(h: SessionRuntimeHandle, r: SessionRecord): void {
  if (h.schemaVersion !== 1 || h.token !== r.token || h.projectId !== r.projectId || h.sessionId !== r.sessionId
    || h.bindingDigest !== r.bindingDigest || h.directory !== r.directory) fail("RUNTIME_SESSION_AUTHORITY", "private handle mismatch")
}
function persistSession(root: string, r: SessionRecord): void { atomicWriteJson(sessionPaths(root, r.runtimeId).record, r) }
function sessionReceipt(r: SessionRecord): RuntimeReceipt {
  return { ...r.receipt, observations: r.receipt.observations.slice(-64), session: { runtimeId: r.runtimeId, bindingDigest: r.bindingDigest,
    stateRevision: r.stateRevision, ...(r.state === "released" ? { disposition: "released" as const } : {}), ...(r.recovery ? { recovery: r.recovery } : {}) } }
}
function processRows(): { pid: number; ppid: number; pgid: number; uid: number }[] {
  const ps = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,uid="], { encoding: "utf8", timeout: 2000, env: { ...process.env, LC_ALL: "C" } })
  if (ps.status !== 0) return fail("RUNTIME_SESSION_UNCERTAIN", "process observation unavailable")
  return ps.stdout.split("\n").flatMap(line => { const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line); return m ? [{ pid: +m[1], ppid: +m[2], pgid: +m[3], uid: +m[4] }] : [] }).filter(row => row.pid !== ps.pid)
}
function isDescendant(pid: number, ancestor: number, rows: ReturnType<typeof processRows>): boolean {
  const seen = new Set<number>()
  while (pid > 0 && !seen.has(pid)) { if (pid === ancestor) return true; seen.add(pid); pid = rows.find(r => r.pid === pid)?.ppid ?? 0 }
  return false
}
export function prepareSessionRuntime(root: string, input: SessionRuntimePrepare): SessionRuntimeHandle {
  assertPrepareInput(input)
  root = realpathSync(root)
  const candidate = readRunningJob(root)
  if (!candidate) return fail("RUNTIME_SESSION_ORIGIN", "native running ticket required")
  const ticket = candidate
  if (process.env.CI_QUEUE_JOB_ENV_VERSION !== "1" || process.env.CI_QUEUE_JOB_ID !== input.ticketId || process.env.CI_QUEUE_PROJECT_ID !== input.projectId
    || !process.env.CI_QUEUE_STATE_DIR || realpathSync(process.env.CI_QUEUE_STATE_DIR) !== root
    || !ticket || ticket.id !== input.ticketId || ticket.status !== "running" || ticket.projectId !== input.projectId) fail("RUNTIME_SESSION_ORIGIN", "native running ticket required")
  const producer = ticket.processGroupIdentity
  const owner = probeProcessGroupIdentity(input.sessionStamp.pid)
  if (!producer || !owner) return fail("RUNTIME_SESSION_ORIGIN", "native group required")
  const rows = processRows()
  if (!producer || producer.leaderPid !== input.producerStamp.pid || producer.startedAt !== input.producerStamp.startedAt
    || observeProcessGroup(producer).state !== "alive" || !owner || owner.startedAt !== input.sessionStamp.startedAt
    || !rows.some(p => p.pid === owner.leaderPid && p.uid === process.getuid?.())
    || !rows.some(p => p.pid === producer.leaderPid && p.uid === process.getuid?.())
    || !isDescendant(owner.leaderPid, producer.leaderPid, rows)
    || !isDescendant(process.pid, owner.leaderPid, rows)) fail("RUNTIME_SESSION_ORIGIN", "producer/session stamps or lineage invalid")
  const required = runtimeRequirementDigest(ticket.cwd)
  if (required !== input.requirementDigest || ticket.runtime?.requirementDigest !== required) fail("RUNTIME_SESSION_REQUIREMENT", "native requirement digest differs")
  mkdirSync(catalog(root), { recursive: true, mode: 0o700 }); privatePath(catalog(root), true)
  const id = "session-" + input.sessionId
  const revalidateOrigin = (): void => {
    const current = readRunningJob(root)
    if (current?.id !== input.ticketId || current.status !== "running" || current.projectId !== input.projectId
      || current.runtime?.requirementDigest !== required || canonicalJson(current.processGroupIdentity) !== canonicalJson(producer)
      || observeProcessGroup(producer).state !== "alive" || observeProcessGroup(owner).state !== "alive") fail("RUNTIME_SESSION_ORIGIN", "native origin changed during prepare")
  }
  return withSessionLock(root, id, () => {
    revalidateOrigin()
    const paths = sessionPaths(root, id)
    if (existsSync(paths.record)) {
      const old = readSession(root, id)
      if (old.state !== "active" || old.projectId !== input.projectId || old.ticketId !== input.ticketId || old.bindingDigest !== input.launchBindingDigest
        || old.requirementDigest !== required || JSON.stringify(old.owner) !== JSON.stringify(owner) || JSON.stringify(old.producer) !== JSON.stringify(producer)) fail("RUNTIME_SESSION_CONFLICT", "session already bound")
      assertBundle(old); return handleFor(root, old)
    }
    // Never copy a job sidecar: the same builder emits a self-contained session bundle.
    const built = buildRuntime(root, ticket, ["node"], {}, id)
    if (!built.directory || !built.receipt.node) fail("RUNTIME_SESSION_UNCONFIGURED", "registered Node runtime required")
    const r: SessionRecord = { schemaVersion: 1, runtimeId: id, projectId: input.projectId, sessionId: input.sessionId, ticketId: input.ticketId,
      token: randomBytes(32).toString("hex"), bindingDigest: input.launchBindingDigest, requirementDigest: required, producer, owner,
      directory: built.directory!, directoryIdentity: fileIdentity(built.directory!), catalogIdentity: fileIdentity(catalog(root)),
      groups: [owner], evidenceOffset: 0, state: "active", stateRevision: 1, env: built.env, receipt: built.receipt }
    try {
      revalidateOrigin()
      persistSession(root, r)
      return handleFor(root, r)
    } catch (error) {
      // This bundle has not been exposed and cannot have authorized children.
      discardRuntimeDirectory(built.directory)
      throw error
    }
  })
}
function captureSessionEvidence(r: SessionRecord): void {
  // Consume each append once. Persist only a bounded tail and unique groups;
  // checkpoint/release never copies the full lifetime history into the owner.
  const info = lstatSync(r.receipt.evidencePath!)
  if (!info.isFile() || info.isSymbolicLink() || info.size < r.evidenceOffset || info.size > 16 * 1024 * 1024) fail("RUNTIME_SESSION_UNCERTAIN", "evidence extent invalid")
  const fd = openSync(r.receipt.evidencePath!, "r")
  const bytes = Buffer.alloc(info.size - r.evidenceOffset)
  try {
    let read = 0
    while (read < bytes.length) {
      const count = readSync(fd, bytes, read, bytes.length - read, r.evidenceOffset + read)
      if (!count) fail("RUNTIME_SESSION_UNCERTAIN", "evidence changed during checkpoint")
      read += count
    }
  } finally { closeSync(fd) }
  let appended: RuntimeObservation[]
  try {
    if (bytes.length && bytes[bytes.length - 1] !== 10) throw new Error("partial evidence")
    appended = bytes.toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
    if (!appended.every(item => Number.isSafeInteger(item.pid) && typeof item.execPath === "string" && typeof item.version === "string" && ["verified", "rejected"].includes(item.status))) throw new Error("invalid observation")
  } catch { return fail("RUNTIME_SESSION_UNCERTAIN", "session evidence invalid") }
  const rejected = appended.find(item => item.status === "rejected" || item.execPath !== r.receipt.node?.executable || item.version !== r.receipt.node?.version)
  if (rejected || !r.receipt.node || digestFile(r.receipt.node.executable) !== r.receipt.node.sha256) fail("RUNTIME_SESSION_UNCERTAIN", "session runtime rejected or changed")
  const receipt = { ...r.receipt, observations: [...r.receipt.observations, ...appended].slice(-64), state: appended.length || r.receipt.state === "verified" ? "verified" as const : "preflight-only" as const }
  r.evidenceOffset = info.size
  for (const observation of appended) {
    const group = observation.group ?? fail("RUNTIME_SESSION_UNCERTAIN", "session group evidence missing")
    if (!validGroup(group)) fail("RUNTIME_SESSION_UNCERTAIN", "session group evidence invalid")
    if (!r.groups.some(g => g.pgid === group.pgid && g.startedAt === group.startedAt)) r.groups.push(group)
  }
  if (r.groups.length > 512) fail("RUNTIME_SESSION_UNCERTAIN", "session group evidence bound reached")
  r.receipt = { ...receipt, observations: receipt.observations.slice(-64) }
}
export function checkpointSessionRuntime(handle: SessionRuntimeHandle): RuntimeReceipt {
  assertHandleInput(handle)
  return withSessionLock(handle.root, handle.runtimeId, () => {
    const r = readSession(handle.root, handle.runtimeId); assertHandle(handle, r)
    if (r.state !== "active" || r.recovery || observeProcessGroup(r.owner).state !== "alive" || !isDescendant(process.pid, r.owner.leaderPid, processRows())) fail("RUNTIME_SESSION_AUTHORITY", "session owner is not active")
    assertBundle(r)
    captureSessionEvidence(r)
    r.lastCheckpointAt = new Date().toISOString(); r.stateRevision++
    persistSession(handle.root, r); return sessionReceipt(r)
  })
}
export function releaseSessionRuntime(input: SessionRuntimeHandle | SessionRuntimeRecovery): RuntimeReceipt {
  assertReleaseInput(input)
  const recover = "mode" in input && input.mode === "recover"
  const id = recover ? input.original.runtimeId : (input as SessionRuntimeHandle).runtimeId
  return withSessionLock(input.root, id, () => {
    const r = readSession(input.root, id)
    if (recover) {
      const original = input.original
      if (original.projectId !== r.projectId || original.sessionId !== r.sessionId || original.bindingDigest !== r.bindingDigest) fail("RUNTIME_SESSION_AUTHORITY", "original recovery binding mismatch")
      const actor = probeProcessGroupIdentity(input.recoveryOwnerStamp.pid)
      if (!actor || !processRows().some(row => row.pid === actor.leaderPid && row.uid === process.getuid?.()) || actor.pgid !== input.recoveryOwnerStamp.pgid || actor.startedAt !== input.recoveryOwnerStamp.startedAt
        || !isDescendant(process.pid, actor.leaderPid, processRows())) fail("RUNTIME_SESSION_AUTHORITY", "recovery actor invalid")
      if (r.recovery) {
        if (r.recovery.operationId !== input.operationId || r.recovery.originalStateRevision !== original.expectedStateRevision) fail("RUNTIME_SESSION_CAS", "another recovery owns the record")
        if (r.state === "released") { if (existsSync(r.directory)) fail("RUNTIME_SESSION_UNCERTAIN", "released bundle reappeared"); return sessionReceipt(r) }
        const previous = r.recovery.recoveryOwnerStamp
        if (canonicalJson(previous) !== canonicalJson(input.recoveryOwnerStamp)
          && observeProcessGroup({ hostname: hostname(), leaderPid: previous.pid, pgid: previous.pgid, startedAt: previous.startedAt }).state !== "dead") fail("RUNTIME_SESSION_CAS", "previous recovery actor alive or uncertain")
      } else if (r.stateRevision !== original.expectedStateRevision || r.state === "released") fail("RUNTIME_SESSION_CAS", "state revision changed")
      if (r.state !== "released" && existsSync(r.directory)) captureSessionEvidence(r)
      if ([r.owner, r.producer, ...r.groups].some(g => observeProcessGroup(g).state !== "dead")) fail("RUNTIME_SESSION_OCCUPIED", "original groups alive or uncertain")
      if (existsSync(r.directory)) assertBundle(r)
      // A normal release may have removed the bundle before its owner died.
      // Its durable closing state is release authority too; the CAS and dead
      // original groups above fence the transition to a recovery operation.
      else if (r.state !== "closing") fail("RUNTIME_SESSION_UNCERTAIN", "original bundle missing before release authority")
      r.recovery = { operationId: input.operationId, originalStateRevision: original.expectedStateRevision, recoveryOwnerStamp: input.recoveryOwnerStamp }
    } else {
      assertHandle(input as SessionRuntimeHandle, r)
      if (r.recovery) fail("RUNTIME_SESSION_AUTHORITY", "recovery owns the record")
      if (r.state === "released") { if (existsSync(r.directory)) fail("RUNTIME_SESSION_UNCERTAIN", "released bundle reappeared"); return sessionReceipt(r) }
      if (observeProcessGroup(r.owner).state !== "alive" || !isDescendant(process.pid, r.owner.leaderPid, processRows())) fail("RUNTIME_SESSION_AUTHORITY", "owner not current; explicit recovery required")
      // The owner and this control call may remain. Any other group member
      // holds the bundle, including descendants whose leader has disappeared.
      if (existsSync(r.directory)) { assertBundle(r); captureSessionEvidence(r) }
      else if (r.state !== "closing") fail("RUNTIME_SESSION_UNCERTAIN", "bundle missing before release authority")
      if (r.groups.some(g => g.pgid !== r.owner.pgid && observeProcessGroup(g).state !== "dead")) fail("RUNTIME_SESSION_OCCUPIED", "registered session groups alive or uncertain")
      const rows = processRows()
      const callers = new Set<number>([r.owner.leaderPid])
      let pid = process.pid
      while (pid > 1 && !callers.has(pid)) { callers.add(pid); pid = rows.find(p => p.pid === pid)?.ppid ?? 0 }
      if (rows.some(p => p.pgid === r.owner.pgid && !callers.has(p.pid))) fail("RUNTIME_SESSION_OCCUPIED", "session descendants still alive")
      if (existsSync(r.directory)) assertBundle(r)
    }
    r.state = "closing"; r.stateRevision++
    // Durable authority precedes effects. Reentry uses the same original CAS.
    persistSession(input.root, r)
    if (existsSync(r.directory)) {
      // Re-observe after acquiring release authority, before the destructive effect.
      captureSessionEvidence(r)
      if (r.groups.some(g => (!recover && g.pgid === r.owner.pgid) ? false : observeProcessGroup(g).state !== "dead")) fail("RUNTIME_SESSION_OCCUPIED", "session groups changed during release")
      persistSession(input.root, r)
      rmSync(r.directory, { recursive: true })
    }
    r.state = "released"; r.stateRevision++; r.lastCheckpointAt = new Date().toISOString()
    persistSession(input.root, r)
    return sessionReceipt(r)
  })
}
/** Absence means no registered Queue session, never availability of a stack. */
export function listSessionRuntimes(root: string): SessionRuntimeStatus[] {
  const directory = catalog(root)
  if (!existsSync(directory)) { try { lstatSync(directory) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] } }
  const unknown = (): SessionRuntimeStatus => ({ projectId: "unknown", sessionId: "unknown", state: "unknown", pid: 0, startedAt: "", stateRevision: 0 })
  try {
    privatePath(directory, true)
    return readdirSync(directory).flatMap(name => {
      if (!name.endsWith(".json")) return [unknown()]
      try {
        const r = readSession(root, name.slice(0, -5))
        if (r.state === "released") { if (existsSync(r.directory)) throw new Error("released bundle exists"); return [] }
        assertBundle(r)
        const state = r.state === "closing" ? "closing" : observeProcessGroup(r.owner).state === "alive" ? "active" : "unknown"
        return [{ projectId: r.projectId, sessionId: r.sessionId, state, pid: r.owner.leaderPid, startedAt: r.owner.startedAt, stateRevision: r.stateRevision,
          ...(r.lastCheckpointAt ? { lastCheckpointAt: r.lastCheckpointAt } : {}) } as SessionRuntimeStatus]
      } catch { return [unknown()] }
    })
  } catch { return [unknown()] }
}
