import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { accessSync, closeSync, constants, openSync, readSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

import { RUNTIME_CAPABILITY, type RuntimeRequirement as Requirement, type RuntimeReceipt, type RuntimeObservation } from "../contracts/runtime.js"
import type { QueueTicket } from "../contracts/schema.js"
import { runtimeGuard, shellPolicyError, type GuardConfig } from "./runtime-guard.js"

const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RESERVED = /^(PATH|NODE|NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|BASH_ENV|ENV|ZDOTDIR|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|IFS|npm_node_execpath|npm_execpath|npm_config_(script_shell|node_options|prefix|userconfig|globalconfig)|BASH_FUNC_.*|NVM_.*|VOLTA_.*|ASDF_.*|DYLD_.*|LD_.*)$/i

export type RuntimeSession = {
  argv: string[]; env: NodeJS.ProcessEnv; receipt: RuntimeReceipt
  finish(): RuntimeReceipt
}
export class RuntimeError extends Error {
  constructor(readonly code: string, detail: string) { super(`${code}: ${detail}`) }
}
const fail = (code: string, detail: string): never => { throw new RuntimeError(code, detail) }
const digest = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex")
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))

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

/**
 * Local, operator-owned registry: no global PATH/nvm lookup, no recipe re-entry.
 * Binding + repo constraints are resolved at claim and recorded in the receipt.
 */
export function prepareJobRuntime(root: string, ticket: QueueTicket, argv: string[], inherited: NodeJS.ProcessEnv): RuntimeSession {
  validateRuntimeArgv(argv)
  const required = requirements(ticket.cwd)
  const registryPath = join(root, "runtimes.json")
  let binding: Record<string, unknown> | undefined
  let registrySha256: string | undefined
  let bindingSource: "project-registry" | "explicit-node-command" = "project-registry"
  if (existsSync(registryPath)) {
    const bytes = readFileSync(registryPath)
    const registry = readObject(registryPath, bytes.toString("utf8"))
    if (Object.keys(registry).some(key => !["schemaVersion", "projects"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown registry field")
    if (registry.schemaVersion !== 1 || !object(registry.projects)) fail("RUNTIME_CONFIG_INVALID", registryPath)
    const raw = (registry.projects as Record<string, unknown>)[ticket.projectId ?? ""]
    if (raw !== undefined && !object(raw)) fail("RUNTIME_CONFIG_INVALID", "project binding")
    binding = raw as Record<string, unknown> | undefined
    registrySha256 = digest(bytes)
  }
  if (!binding && !required.length && isAbsolute(argv[0]) && basename(argv[0]) === "node") {
    // Preserve the existing explicit-executable contract. This is not a PATH
    // fallback, and may not override a repository's declared requirements.
    const explicitNode = absoluteFile(argv[0], "explicit node", true)
    binding = { node: { executable: explicitNode }, npmCli: join(dirname(explicitNode), "npm"), npxCli: join(dirname(explicitNode), "npx") }
    bindingSource = "explicit-node-command"
  }
  if (!binding) {
    if (required.length || ["node", "npm", "npx"].includes(basename(argv[0]))) {
      fail("RUNTIME_NOT_CONFIGURED", `register project ${ticket.projectId ?? "[missing id]"} in runtimes.json`)
    }
    // Native legacy jobs remain compatible, explicitly without a Node guarantee.
    const receipt: RuntimeReceipt = { capability: RUNTIME_CAPABILITY, coverage: "unconfigured", state: "unconfigured", observations: [] }
    return { argv, env: inherited, receipt, finish: () => receipt }
  }
  if (Object.keys(binding).some(key => !["node", "npmCli", "npxCli", "toolPaths"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown project runtime field")
  if (!object(binding.node)) fail("RUNTIME_CONFIG_INVALID", "node binding is required")
  const nodeBinding = binding.node as Record<string, unknown>
  if (Object.keys(nodeBinding).some(key => !["executable", "version"].includes(key))) fail("RUNTIME_CONFIG_INVALID", "unknown node binding field")
  const executable = absoluteFile(nodeBinding.executable, "node.executable", true)
  let version = nodeBinding.version
  if (bindingSource === "project-registry" && (typeof version !== "string" || !EXACT_VERSION.test(version))) fail("RUNTIME_CONFIG_INVALID", "node.version must be exact x.y.z")
  const npmCli = absoluteFile(binding.npmCli, "npmCli")
  const npxCli = absoluteFile(binding.npxCli, "npxCli")
  const toolPaths = binding.toolPaths ?? []
  if (!Array.isArray(toolPaths) || !toolPaths.every(value => typeof value === "string" && isAbsolute(value) && !/[:\0\r\n]/.test(value))) {
    fail("RUNTIME_CONFIG_INVALID", "toolPaths must contain absolute directories")
  }
  const clean = sanitizeRuntimeEnv(inherited)
  // No startup hooks, user npmrc, or NODE_OPTIONS may run during this probe.
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
  if (bindingSource === "explicit-node-command") version = actual.version
  if (typeof version !== "string" || !EXACT_VERSION.test(version)) fail("RUNTIME_PROBE_FAILED", "invalid Node version")
  if (actual.execPath !== executable || actual.version !== version) fail("RUNTIME_VERSION_MISMATCH", `required ${version}; effective ${actual.version}`)
  if (!Array.isArray(actual.constraints) || actual.constraints.length !== required.length) fail("RUNTIME_PROBE_FAILED", "constraint probe incomplete")
  actual.constraints.forEach((item, i) => {
    if (!item.valid) fail("RUNTIME_REQUIREMENT_INVALID", required[i].source)
    if (!item.satisfies) fail("RUNTIME_REQUIREMENT_MISMATCH", `${required[i].source} requires ${required[i].range}, selected ${version}`)
  })
  const runtimeRoot = join(root, "runtime")
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 })
  const directory = mkdtempSync(join(runtimeRoot, "job-"))
  const shimDir = join(directory, "bin")
  mkdirSync(shimDir, { mode: 0o700 })
  const guardPath = join(directory, "guard.cjs")
  const evidencePath = join(directory, "processes.jsonl")
  writeFileSync(evidencePath, "", { mode: 0o600 })
  const config: GuardConfig = { executable, version: version as string, npmCli, npxCli, shimDir, evidencePath, guardPath }
  writeFileSync(guardPath, `(${runtimeGuard.toString()})(${JSON.stringify(config)});\n`, { mode: 0o600 })
  writeShim(join(shimDir, "node"), executable, ["--require", guardPath])
  writeShim(join(shimDir, "npm"), executable, ["--require", guardPath, npmCli])
  writeShim(join(shimDir, "npx"), executable, ["--require", guardPath, npxCli])
  // Nested named shells pass through the same admission parser. Absolute nested
  // shells remain outside this interception; the Node preload still checks them.
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
    PATH: [shimDir, dirname(executable), SYSTEM_PATH, ...(toolPaths as string[])].join(":"),
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
  // Catch an absolute foreign node/npm and a direct login-shell shebang before
  // launching the work. Do not read an entire executable to inspect two bytes.
  if (["node", "npm", "npx"].includes(basename(command[0]))) {
    const allowed = [executable, npmCli, npxCli, ...["node", "npm", "npx"].map(name => join(shimDir, name))]
    if (!allowed.includes(realpathSync(command[0]))) fail("RUNTIME_EXECUTABLE_MISMATCH", command[0])
  }
  const receipt: RuntimeReceipt = {
    capability: RUNTIME_CAPABILITY, coverage: "guarded-node-processes", state: "prepared",
    node: { executable, version: version as string, sha256: digest(readFileSync(executable)) },
    npmCli, npxCli, bindingSource, environmentPolicy: "reconstructed", requirements: required, registrySha256, evidencePath, observations: [],
  }
  const finish = (): RuntimeReceipt => {
    try {
      if (statSync(evidencePath).size > 16 * 1024 * 1024) throw new Error("evidence exceeds bound")
      const observations: RuntimeObservation[] = readFileSync(evidencePath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line))
      if (!observations.every(item => Number.isSafeInteger(item.pid) && typeof item.execPath === "string" && typeof item.version === "string" && ["verified", "rejected"].includes(item.status))) throw new Error("malformed evidence")
      const rejected = observations.find(item => item.status === "rejected" || item.execPath !== executable || item.version !== version)
      const changed = digest(readFileSync(executable)) !== receipt.node!.sha256
      return { ...receipt, observations, state: rejected || changed ? "rejected" : observations.length ? "verified" : "preflight-only",
        ...(rejected || changed ? { failureCode: rejected?.reason ?? "RUNTIME_BINARY_CHANGED" } : {}) }
    } catch { return { ...receipt, state: "rejected", failureCode: "RUNTIME_EVIDENCE_INVALID" } }
  }
  return { argv: command, env, receipt, finish }
}
