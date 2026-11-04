import { executionCompletion, listExecutionSources, readExecutionSource } from "../core/completion.js"
import { finalizationDigest } from "../contracts/schema.js"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"

import { parseQueueConfig, readQueueConfig } from "../contracts/config.js"
import {
  normalizeTicketFlags,
  type ProjectPreset,
  type QueueProjectConfig,
  type QueueTicket,
  type ShipConfig,
} from "../contracts/schema.js"
import { enqueueTicket } from "../core/enqueue.js"
import { argvEquals } from "../core/preset-history.js"
import { resolveRemoteBase } from "../core/spend-abort.js"
import {
  findJobById,
  listHistoryJobs,
  listQueuedJobs,
  readRunningJob,
} from "../core/state.js"
import type { AcceptedRecipe, ShipProofQuery } from "./eligibility.js"
import {
  ShipError,
  emptyShipEffects,
  type MergeState,
  type ShipOps,
  type ShipRequest,
  type ShipTarget,
  type VerdictRequest,
  type VerdictRun,
} from "./ops.js"

const STRIP_GIT = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
] as const

const SHA = /^[0-9a-f]{40}$/i
const POLICY_FILE = "remote-verdict.json"
const WAIT_POLL_MS = 100

export type SystemOpsInput = {
  cwd: string
  stateRoot: string
  configPath?: string
  log?: (message: string) => void
}

type CommandResult = { status: number; stdout: string; stderr: string }

type GitHubRepo = {
  id: number
  full_name: string
  clone_url?: string
  allow_merge_commit?: boolean
}

type GitHubPull = {
  number: number
  draft?: boolean
  merged?: boolean
  mergeable_state?: string
  merge_commit_sha?: string | null
  auto_merge?: unknown
  head?: { ref?: string; sha?: string; repo?: { id?: number; full_name?: string; clone_url?: string } }
  base?: { ref?: string; sha?: string; repo?: { id?: number; full_name?: string; clone_url?: string } }
}

type GitHubCommit = {
  sha?: string
  parents?: Array<{ sha?: string }>
  tree?: { sha?: string }
}

function abortError(): Error {
  const error = new Error("The operation was aborted.")
  error.name = "AbortError"
  return error
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ("name" in error && error.name === "AbortError") return true
  return "code" in error && error.code === "ABORT_ERR"
}

function fail(code: string, message: string): never {
  throw new ShipError(code, message, emptyShipEffects())
}

function commandEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  }
  for (const key of STRIP_GIT) delete env[key]
  delete env.GH_HOST
  return env
}

function runCommand(
  file: string,
  args: readonly string[],
  options: { cwd?: string; signal: AbortSignal; input?: string },
): Promise<CommandResult> {
  return new Promise((resolveCommand, reject) => {
    if (options.signal.aborted) {
      reject(abortError())
      return
    }
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      env: commandEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let settled = false
    const finish = (error?: Error, status = 1) => {
      if (settled) return
      settled = true
      options.signal.removeEventListener("abort", onAbort)
      if (error) {
        reject(error)
        return
      }
      resolveCommand({ status, stdout, stderr })
    }
    const onAbort = () => {
      child.kill()
      finish(abortError())
    }
    options.signal.addEventListener("abort", onAbort, { once: true })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => { stdout += chunk })
    child.stderr.on("data", (chunk: string) => { stderr += chunk })
    child.on("error", (error) => {
      if (isAbortError(error) || options.signal.aborted) {
        finish(error instanceof Error ? error : abortError())
        return
      }
      finish(undefined, 1)
    })
    child.on("close", (code) => {
      if (options.signal.aborted) {
        finish(abortError())
        return
      }
      finish(undefined, code ?? 1)
    })
    if (options.input !== undefined) child.stdin.end(options.input, "utf8")
    else child.stdin.end()
    child.stdin.on("error", () => undefined)
  })
}

async function runGit(
  cwd: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<CommandResult> {
  return runCommand("git", args, { cwd, signal })
}

async function gitText(cwd: string, args: readonly string[], signal: AbortSignal): Promise<string> {
  const result = await runGit(cwd, args, signal)
  if (result.status !== 0) {
    fail("TARGET_INVALID", result.stderr.trim() || `git ${args.join(" ")} falhou`)
  }
  return result.stdout.trim()
}

async function runGh(
  args: readonly string[],
  signal: AbortSignal,
  input?: string,
): Promise<CommandResult> {
  return runCommand("gh", ["api", ...args], { signal, input })
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    fail("TARGET_INVALID", "resposta GitHub inválida")
  }
}

async function ghJson(args: readonly string[], signal: AbortSignal, input?: string): Promise<unknown> {
  const result = await runGh(args, signal, input)
  if (result.status !== 0) {
    fail("TARGET_INVALID", result.stderr.trim() || `gh api ${args.join(" ")} falhou`)
  }
  return parseJson(result.stdout)
}

function digestOf(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseGitHubRepo(value: string): { host: "github.com"; repo: string } {
  const trimmed = value.trim().replace(/\.git$/i, "")
  const https = trimmed.match(/^https?:\/\/([^/]+)\/([^/]+\/[^/]+)$/i)
  if (https) {
    if (https[1] !== "github.com") fail("HOST_UNSUPPORTED", "somente github.com é suportado")
    return { host: "github.com", repo: https[2] }
  }
  const ssh = trimmed.match(/^git@([^:]+):([^/]+\/[^/]+)$/)
  if (ssh) {
    if (ssh[1] !== "github.com") fail("HOST_UNSUPPORTED", "somente github.com é suportado")
    return { host: "github.com", repo: ssh[2] }
  }
  const hosted = trimmed.match(/^([^/]+)\/([^/]+\/[^/]+)$/)
  if (hosted) {
    if (hosted[1] !== "github.com") fail("HOST_UNSUPPORTED", "somente github.com é suportado")
    return { host: "github.com", repo: hosted[2] }
  }
  if (/^[^/]+\/[^/]+$/.test(trimmed)) return { host: "github.com", repo: trimmed }
  fail("TARGET_INVALID", "repositório GitHub inválido")
}

function sameCwd(left: string, right: string): boolean {
  if (!isAbsolute(left) || !isAbsolute(right)) return false
  return resolve(left) === resolve(right)
}

function recipeFlags(preset: ProjectPreset) {
  return normalizeTicketFlags({
    ...(preset.fetchBase ? { fetchBase: preset.fetchBase } : {}),
    ...(preset.requireCleanTree !== undefined ? { requireCleanTree: preset.requireCleanTree } : {}),
    ...(preset.requireGitStability !== undefined ? { requireGitStability: preset.requireGitStability } : {}),
    ...(preset.pinHeadSha !== undefined ? { pinHeadSha: preset.pinHeadSha } : {}),
    ...(preset.executionTimeoutMs !== undefined ? { executionTimeoutMs: preset.executionTimeoutMs } : {}),
  })
}

function acceptedRecipes(config: QueueProjectConfig): AcceptedRecipe[] {
  const ship = config.ship
  if (!ship) return []
  return ship.acceptedPresets.flatMap((name) => {
    const preset = config.presets[name]
    if (!preset) return []
    return [{ name, argv: [...preset.argv], flags: recipeFlags(preset), ...(preset.finalization ? { finalizationDigest: finalizationDigest(preset.finalization) } : {}) }]
  })
}

function flagsMatch(ticket: QueueTicket, recipe: AcceptedRecipe): boolean {
  const ticketFlags = normalizeTicketFlags(ticket.flags)
  const recipeFlagsValue = recipe.flags
  return ticketFlags.fetchBase === recipeFlagsValue.fetchBase
    && ticketFlags.requireCleanTree === recipeFlagsValue.requireCleanTree
    && ticketFlags.requireGitStability === recipeFlagsValue.requireGitStability
    && ticketFlags.pinHeadSha === recipeFlagsValue.pinHeadSha
    && ticketFlags.executionTimeoutMs === recipeFlagsValue.executionTimeoutMs
}

function pendingMatch(ticket: QueueTicket, query: ShipProofQuery, recipe: AcceptedRecipe): boolean {
  if (ticket.finalizationDigest !== recipe.finalizationDigest) return false
  if (ticket.status !== "queued" && ticket.status !== "running" && !ticket.finalization) return false
  if (ticket.projectId !== query.projectId) return false
  if (!sameCwd(ticket.cwd, query.executionCwd)) return false
  if (ticket.headSha !== query.headSha) return false
  if (ticket.preset !== recipe.name) return false
  if (!argvEquals(ticket.argv, recipe.argv)) return false
  return flagsMatch(ticket, recipe)
}

function readPolicyFile(bytes: string | undefined): "wait" | "skipped" {
  if (bytes === undefined) return "wait"
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes)
  } catch {
    fail("SHIP_CONFIG", "remote-verdict.json inválido")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("SHIP_CONFIG", "remote-verdict.json inválido")
  }
  const verdict = (parsed as { verdict?: unknown }).verdict
  if (verdict === "wait" || verdict === "skipped") return verdict
  fail("SHIP_CONFIG", "remote-verdict.json inválido")
}

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function catalogRelative(gitRoot: string, configPath: string): string {
  const relativePath = relative(real(gitRoot), real(configPath))
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    fail("TARGET_INVALID", "catálogo fora da árvore Git")
  }
  return relativePath
}

async function showAtHead(cwd: string, headSha: string, path: string, signal: AbortSignal): Promise<string | undefined> {
  const result = await runGit(cwd, ["show", `${headSha}:${path}`], signal)
  if (result.status !== 0) return undefined
  return result.stdout
}

async function readCatalogAtHead(
  cwd: string,
  gitRoot: string,
  configPath: string,
  headSha: string,
  signal: AbortSignal,
): Promise<{ bytes: string; config: QueueProjectConfig; digest: string }> {
  const relativePath = catalogRelative(gitRoot, configPath)
  const bytes = await showAtHead(cwd, headSha, relativePath, signal)
  if (bytes === undefined) fail("SHIP_CONFIG", "catálogo ausente em H")
  const worktree = readFileSync(configPath, "utf8")
  if (worktree !== bytes) fail("CONFIG_CHANGED", "digest do catálogo mudou")
  let config: QueueProjectConfig
  try {
    config = parseQueueConfig(JSON.parse(bytes) as Record<string, unknown>, dirname(configPath))
  } catch (error) {
    fail("SHIP_CONFIG", error instanceof Error ? error.message : "catálogo inválido em H")
  }
  return { bytes, config, digest: digestOf(bytes) }
}

async function assertPolicyMatchesHead(
  cwd: string,
  gitRoot: string,
  configPath: string,
  headSha: string,
  signal: AbortSignal,
): Promise<void> {
  const relativePath = join(dirname(catalogRelative(gitRoot, configPath)), POLICY_FILE)
  const atHead = await showAtHead(cwd, headSha, relativePath, signal)
  const worktreePath = join(dirname(configPath), POLICY_FILE)
  const worktree = existsSync(worktreePath) ? readFileSync(worktreePath, "utf8") : undefined
  if (atHead !== worktree) fail("CONFIG_CHANGED", "política remota divergiu de H")
}

async function listRemoteNames(cwd: string, signal: AbortSignal): Promise<string[]> {
  const text = await gitText(cwd, ["remote"], signal)
  return text.split("\n").map((line) => line.trim()).filter(Boolean)
}

function asPull(value: unknown): GitHubPull | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as GitHubPull
}

function requirePull(value: unknown): GitHubPull {
  const pull = asPull(value)
  if (!pull || !Number.isSafeInteger(pull.number)) fail("TARGET_INVALID", "pull request inválido")
  return pull
}

function pullIdentity(pull: GitHubPull): {
  headBranch: string
  headSha: string
  baseBranch: string
  baseSha: string
  isDraft: boolean
} {
  const headSha = pull.head?.sha
  const baseSha = pull.base?.sha
  const headBranch = pull.head?.ref
  const baseBranch = pull.base?.ref
  if (!headSha || !SHA.test(headSha) || !baseSha || !SHA.test(baseSha) || !headBranch || !baseBranch) {
    fail("TARGET_INVALID", "PR sem HEAD/base utilizáveis")
  }
  if (pull.head?.repo?.id !== pull.base?.repo?.id) fail("FORK_UNSUPPORTED", "forks não são suportados")
  if (pull.merged !== true && (pull.mergeable_state === "queued" || pull.auto_merge)) {
    fail("MERGE_QUEUE_UNSUPPORTED", "merge queue não é suportado")
  }
  return { headBranch, headSha, baseBranch, baseSha, isDraft: pull.draft === true }
}

async function readPull(repo: string, pr: number, signal: AbortSignal): Promise<GitHubPull> {
  return requirePull(await ghJson([`/repos/${repo}/pulls/${pr}`], signal))
}

async function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError()
  await new Promise<void>((resolveSleep, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolveSleep()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function workflowMatches(runPath: string | undefined, workflow: string): boolean {
  if (!runPath) return false
  return runPath === workflow || runPath === basename(workflow) || basename(runPath) === basename(workflow)
}

function parseVerdictTitle(title: string | undefined): { pr: number; headSha: string; baseSha: string } | undefined {
  if (!title) return undefined
  const match = title.match(/\bPR (\d+) H ([0-9a-f]{40}) B0 ([0-9a-f]{40})\b/i)
  if (!match) return undefined
  return {
    pr: Number(match[1]),
    headSha: match[2]!.toLowerCase(),
    baseSha: match[3]!.toLowerCase(),
  }
}

function sameSha(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function bindVerdictIdentity(
  run: {
    display_title?: string
    name?: string
    pull_requests?: Array<{ number?: number; head?: { sha?: string }; base?: { sha?: string } }>
  },
  target: ShipTarget,
): { pr: number; headSha: string; baseSha: string } | undefined {
  const named = parseVerdictTitle(run.display_title) ?? parseVerdictTitle(run.name)
  if (named) return named
  const pulls = run.pull_requests ?? []
  const pull = pulls.find((item) => item.number === target.pr) ?? pulls[0]
  const pr = Number.isSafeInteger(pull?.number) ? pull!.number as number : undefined
  const headSha = typeof pull?.head?.sha === "string" && SHA.test(pull.head.sha) ? pull.head.sha : undefined
  const baseSha = typeof pull?.base?.sha === "string" && SHA.test(pull.base.sha) ? pull.base.sha : undefined
  if (pr === undefined || !headSha || !baseSha) return undefined
  return { pr, headSha: headSha.toLowerCase(), baseSha: baseSha.toLowerCase() }
}

export function createSystemOps(input: SystemOpsInput): ShipOps {
  const log = input.log ?? (() => undefined)

  const readQueryFromTarget = async (target: ShipTarget, signal: AbortSignal): Promise<{
    query: ShipProofQuery
    config: QueueProjectConfig
  }> => {
    const gitRoot = await gitText(target.executionCwd, ["rev-parse", "--show-toplevel"], signal)
    const catalog = await readCatalogAtHead(target.executionCwd, gitRoot, target.configPath, target.headSha, signal)
    if (catalog.digest !== target.configDigest) fail("CONFIG_CHANGED", "digest do catálogo mudou")
    await assertPolicyMatchesHead(target.executionCwd, gitRoot, target.configPath, target.headSha, signal)
    return {
      config: catalog.config,
      query: {
        projectId: catalog.config.project.id,
        executionCwd: target.executionCwd,
        headSha: target.headSha,
        baseSha: target.baseSha,
        acceptedRecipes: acceptedRecipes(catalog.config),
      },
    }
  }

  return {
    nowMs() {
      return Date.now()
    },
    sleep: abortableSleep,
    log,
    async resolveTarget(request: ShipRequest, signal: AbortSignal): Promise<ShipTarget> {
      const loaded = readQueueConfig(input.cwd, input.configPath)
      const cwd = loaded.executionCwd
      const gitRoot = await gitText(cwd, ["rev-parse", "--show-toplevel"], signal)
      const branch = await gitText(cwd, ["branch", "--show-current"], signal)
      const headSha = await gitText(cwd, ["rev-parse", "HEAD"], signal)
      const statusShort = await gitText(cwd, ["status", "--short"], signal)
      if (statusShort) fail("TARGET_INVALID", "árvore de trabalho não está limpa")
      if (!SHA.test(headSha)) fail("TARGET_INVALID", "HEAD inválido")
      if (!branch && request.pr === undefined) fail("TARGET_INVALID", "HEAD detached sem --pr")

      const remotes = await listRemoteNames(cwd, signal)
      let parsedRepo = request.repo ? parseGitHubRepo(request.repo) : undefined
      if (!parsedRepo) {
        const urls: string[] = []
        for (const name of remotes) {
          const url = await gitText(cwd, ["config", "--get", `remote.${name}.url`], signal)
          try {
            urls.push(parseGitHubRepo(url).repo)
          } catch {
            continue
          }
        }
        const unique = [...new Set(urls)]
        if (unique.length !== 1) fail("TARGET_INVALID", "remote GitHub ambíguo; use --repo")
        parsedRepo = { host: "github.com", repo: unique[0]! }
      }

      const repoJson = await ghJson([`/repos/${parsedRepo.repo}`], signal) as GitHubRepo
      if (!repoJson || typeof repoJson !== "object") fail("TARGET_INVALID", "repositório GitHub ausente")
      if (repoJson.full_name !== parsedRepo.repo) {
        fail("TARGET_INVALID", `repositório GitHub divergente: ${String(repoJson.full_name)}`)
      }
      if (!Number.isSafeInteger(repoJson.id)) fail("TARGET_INVALID", "repositório GitHub sem id")
      if (repoJson.allow_merge_commit === false) {
        fail("MERGE_METHOD_UNSUPPORTED", "somente merge commit é suportado")
      }

      let pull: GitHubPull
      if (request.pr !== undefined) {
        pull = await readPull(parsedRepo.repo, request.pr, signal)
      } else {
        const owner = parsedRepo.repo.split("/")[0]
        const listed = await ghJson(
          [`/repos/${parsedRepo.repo}/pulls?head=${owner}:${branch}&state=open`],
          signal,
        )
        const pulls = Array.isArray(listed) ? listed.map(asPull).filter((item): item is GitHubPull => Boolean(item)) : []
        if (pulls.length !== 1) fail("PR_AMBIGUOUS", "informe --pr; zero ou várias PRs abertas")
        pull = pulls[0]!
      }

      const identity = pullIdentity(pull)
      if (identity.headSha !== headSha) fail("TARGET_INVALID", "HEAD local diverge do HEAD da PR")
      if (branch && identity.headBranch !== branch) fail("TARGET_INVALID", "branch local diverge da PR")

      const ancestor = await runGit(cwd, ["merge-base", "--is-ancestor", identity.baseSha, headSha], signal)
      if (ancestor.status === 1) fail("TARGET_INVALID", "B0 não está contido em H")
      if (ancestor.status !== 0) {
        if (/bad object|invalid|not a valid/i.test(ancestor.stderr)) fail("MISSING_OBJECT", "objeto de B0 ausente localmente")
        fail("TARGET_INVALID", "não foi possível provar ancestralidade de B0")
      }

      const catalog = await readCatalogAtHead(cwd, gitRoot, loaded.configPath, headSha, signal)
      await assertPolicyMatchesHead(cwd, gitRoot, loaded.configPath, headSha, signal)
      const fetchBase = catalog.config.presets[catalog.config.ship?.acceptedPresets[0] ?? ""]?.fetchBase
        ?? catalog.config.repository?.baseRef
      if (fetchBase) {
        const remotesNow = await listRemoteNames(cwd, signal)
        const base = resolveRemoteBase(fetchBase, remotesNow)
        const url = await gitText(cwd, ["config", "--get", `remote.${base.remote}.url`], signal)
        if (parseGitHubRepo(url).repo !== parsedRepo.repo) {
          fail("TARGET_INVALID", "remote da base não é o repositório GitHub")
        }
      }

      return {
        host: "github.com",
        repo: parsedRepo.repo,
        repositoryId: repoJson.id,
        pr: pull.number,
        headBranch: identity.headBranch,
        headSha,
        baseBranch: identity.baseBranch,
        baseSha: identity.baseSha,
        executionCwd: cwd,
        configPath: loaded.configPath,
        configDigest: catalog.digest,
        isDraft: identity.isDraft,
        ...(pull.merged === true ? { alreadyMerged: true } : {}),
      }
    },
    async readShipConfig(target: ShipTarget): Promise<ShipConfig> {
      const loaded = parseQueueConfig(
        JSON.parse(readFileSync(target.configPath, "utf8")) as Record<string, unknown>,
        dirname(target.configPath),
      )
      if (!loaded.ship) fail("SHIP_CONFIG", "bloco ship ausente ou incompleto")
      return loaded.ship
    },
    async readProofQuery(target: ShipTarget, signal?: AbortSignal): Promise<ShipProofQuery> {
      return (await readQueryFromTarget(target, signal ?? new AbortController().signal)).query
    },
    async readHistory(query: ShipProofQuery): Promise<unknown[]> {
      return listExecutionSources(input.stateRoot, query.projectId)
    },
    async findPending(query: ShipProofQuery): Promise<{ id: string } | undefined> {
      const finalizing = listExecutionSources(input.stateRoot, query.projectId)
        .filter(source => executionCompletion(source.ticket, source.record, source.terminalDigest).state === "running")
        .map(source => source.ticket)
      const candidates = [...finalizing, ...listQueuedJobs(input.stateRoot), ...[readRunningJob(input.stateRoot)].filter((item): item is QueueTicket => Boolean(item))]
      for (const recipe of query.acceptedRecipes) {
        const match = candidates.find((ticket) => pendingMatch(ticket, query, recipe))
        if (match) return { id: match.id }
      }
      return undefined
    },
    async enqueue(recipe: AcceptedRecipe, target: ShipTarget): Promise<{ id: string }> {
      const ticket = enqueueTicket({
        preset: recipe.name,
        cwd: target.executionCwd,
        stateRoot: input.stateRoot,
        configPath: target.configPath,
      })
      return { id: ticket.id }
    },
    async waitTicket(id: string, signal: AbortSignal): Promise<unknown> {
      for (;;) {
        if (signal.aborted) throw abortError()
        const found = findJobById(input.stateRoot, id)
        if (found && ["passed", "failed", "cancelled", "interrupted"].includes(found.ticket.status)) {
          const source = readExecutionSource(input.stateRoot, id)
          if (source && executionCompletion(source.ticket, source.record, source.terminalDigest).state !== "running") return source.ticket
        }
        await abortableSleep(WAIT_POLL_MS, signal)
      }
    },
    async readPolicy(target: ShipTarget): Promise<"wait" | "skipped"> {
      const path = join(dirname(target.configPath), POLICY_FILE)
      if (!existsSync(path)) return "wait"
      return readPolicyFile(readFileSync(path, "utf8"))
    },
    async revalidate(target: ShipTarget, signal: AbortSignal): Promise<void> {
      const statusShort = await gitText(target.executionCwd, ["status", "--short"], signal)
      if (statusShort) fail("TARGET_CHANGED", "árvore de trabalho não está limpa")
      const headSha = await gitText(target.executionCwd, ["rev-parse", "HEAD"], signal)
      if (headSha !== target.headSha) fail("TARGET_CHANGED", "HEAD divergiu do alvo congelado")
      const branch = await gitText(target.executionCwd, ["branch", "--show-current"], signal)
      if (branch && branch !== target.headBranch) fail("TARGET_CHANGED", "branch divergiu do alvo congelado")
      const gitRoot = await gitText(target.executionCwd, ["rev-parse", "--show-toplevel"], signal)
      const catalog = await readCatalogAtHead(target.executionCwd, gitRoot, target.configPath, target.headSha, signal)
      if (catalog.digest !== target.configDigest) fail("CONFIG_CHANGED", "digest do catálogo mudou")
      await assertPolicyMatchesHead(target.executionCwd, gitRoot, target.configPath, target.headSha, signal)
      const pull = await readPull(target.repo, target.pr, signal)
      const identity = pullIdentity(pull)
      if (identity.headSha !== target.headSha) fail("TARGET_CHANGED", "HEAD da PR divergiu do alvo congelado")
      if (identity.headBranch !== target.headBranch) fail("TARGET_CHANGED", "branch da PR divergiu do alvo congelado")
      if (identity.baseSha !== target.baseSha) fail("BASE_MOVED", "B0 mudou")
      if (identity.baseBranch !== target.baseBranch) fail("TARGET_CHANGED", "base da PR divergiu do alvo congelado")
    },
    async attest(target: ShipTarget, context: string, signal: AbortSignal): Promise<void> {
      const description = `base:${target.baseSha}`
      const existing = await ghJson([`/repos/${target.repo}/commits/${target.headSha}/status`], signal)
      const statuses = existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as { statuses?: Array<{ context?: string; state?: string; description?: string }> }).statuses ?? []
        : []
      const already = statuses.some((item) => (
        item.context === context && item.state === "success" && item.description === description
      ))
      if (already) return
      const result = await runGh(
        ["--method", "POST", `/repos/${target.repo}/statuses/${target.headSha}`, "--input", "-"],
        signal,
        JSON.stringify({ state: "success", context, description }),
      )
      if (result.status !== 0) fail("ATTESTATION_FAILED", result.stderr.trim() || "falha na atestação")
    },
    async markReady(target: ShipTarget, signal: AbortSignal): Promise<void> {
      const result = await runCommand(
        "gh",
        ["pr", "ready", String(target.pr), "--repo", target.repo],
        { signal },
      )
      if (result.status !== 0) {
        fail("READY_FAILED", result.stderr.trim() || result.stdout.trim() || "não foi possível marcar a PR ready")
      }
      const pull = asPull(await ghJson([`/repos/${target.repo}/pulls/${target.pr}`], signal).catch(() => undefined))
      if (!pull) fail("READY_FAILED", "não foi possível reler a PR após ready")
      if (pull.draft === true) fail("READY_FAILED", "PR permanece draft após gh pr ready")
      const identity = pullIdentity(pull)
      if (!sameSha(identity.headSha, target.headSha)) fail("READY_FAILED", "HEAD mudou durante a transição ready")
      if (identity.headBranch !== target.headBranch) fail("READY_FAILED", "branch mudou durante a transição ready")
      if (!sameSha(identity.baseSha, target.baseSha)) fail("READY_FAILED", "B0 mudou durante a transição ready")
      if (identity.baseBranch !== target.baseBranch) fail("READY_FAILED", "base mudou durante a transição ready")
    },
    async observeVerdict(inputVerdict: VerdictRequest, signal: AbortSignal): Promise<VerdictRun | undefined> {
      const repo = inputVerdict.target.repo
      const queries = [
        `head_sha=${inputVerdict.target.headSha}&per_page=30`,
        "event=workflow_dispatch&per_page=30",
      ]
      const seen = new Set<number>()
      const runs: unknown[] = []
      for (const query of queries) {
        const runsRaw = await ghJson([`/repos/${repo}/actions/runs?${query}`], signal)
        const page = runsRaw && typeof runsRaw === "object" && !Array.isArray(runsRaw)
          ? (runsRaw as { workflow_runs?: unknown[] }).workflow_runs ?? []
          : []
        for (const raw of page) {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
          const id = (raw as { id?: number }).id
          if (typeof id !== "number" || !Number.isSafeInteger(id) || seen.has(id)) continue
          seen.add(id)
          runs.push(raw)
        }
      }
      for (const raw of runs) {
        const run = raw as {
          id?: number
          run_attempt?: number
          head_sha?: string
          path?: string
          name?: string
          display_title?: string
          status?: string
          conclusion?: string | null
          pull_requests?: Array<{ number?: number; head?: { sha?: string }; base?: { sha?: string } }>
        }
        if (!workflowMatches(run.path, inputVerdict.workflow)) continue
        const identity = bindVerdictIdentity(run, inputVerdict.target)
        if (!identity) continue
        if (identity.pr !== inputVerdict.target.pr) continue
        if (!sameSha(identity.headSha, inputVerdict.target.headSha)) continue
        if (!sameSha(identity.baseSha, inputVerdict.target.baseSha)) continue
        const runId = run.id
        if (typeof runId !== "number" || !Number.isSafeInteger(runId)) continue
        const jobsRaw = await ghJson([`/repos/${repo}/actions/runs/${runId}/jobs`], signal)
        const jobs = jobsRaw && typeof jobsRaw === "object" && !Array.isArray(jobsRaw)
          ? (jobsRaw as { jobs?: Array<{ name?: string; status?: string; conclusion?: string | null }> }).jobs ?? []
          : []
        const job = jobs.find((item) => item.name === inputVerdict.job)
        if (!job) continue
        return {
          id: runId,
          attempt: Number.isSafeInteger(run.run_attempt) ? run.run_attempt as number : 1,
          pr: identity.pr,
          headSha: identity.headSha,
          baseSha: identity.baseSha,
          workflow: inputVerdict.workflow,
          job: inputVerdict.job,
          status: job.status ?? run.status ?? "",
          conclusion: job.conclusion ?? run.conclusion ?? null,
        }
      }
      return undefined
    },
    async dispatchVerdict(inputVerdict: VerdictRequest, signal: AbortSignal): Promise<void> {
      const workflow = basename(inputVerdict.workflow)
      const result = await runGh(
        ["--method", "POST", `/repos/${inputVerdict.target.repo}/actions/workflows/${workflow}/dispatches`, "--input", "-"],
        signal,
        JSON.stringify({
          ref: inputVerdict.target.baseBranch,
          inputs: {
            pr: String(inputVerdict.target.pr),
            head: inputVerdict.target.headSha,
            base: inputVerdict.target.baseSha,
            ...(inputVerdict.requestId ? { requestId: inputVerdict.requestId } : {}),
          },
        }),
      )
      if (result.status !== 0) fail("REMOTE_RUN_MISSING", result.stderr.trim() || "não foi possível disparar o veredito remoto")
    },
    async mergePinned(target: ShipTarget, signal: AbortSignal): Promise<{ merged: boolean; sha?: string; error?: string }> {
      const current = asPull(await ghJson([`/repos/${target.repo}/pulls/${target.pr}`], signal).catch(() => undefined))
      if (current?.merged === true && current.merge_commit_sha) {
        return { merged: true, sha: current.merge_commit_sha }
      }
      const result = await runGh(
        ["--method", "PUT", `/repos/${target.repo}/pulls/${target.pr}/merge`, "--input", "-"],
        signal,
        JSON.stringify({ sha: target.headSha, merge_method: "merge" }),
      )
      if (result.status !== 0) {
        const detail = (result.stderr.trim() || result.stdout.trim() || `HTTP ${result.status}`).slice(0, 400)
        return { merged: false, error: detail }
      }
      const body = parseJson(result.stdout) as { merged?: boolean; sha?: string; message?: string } | undefined
      if (body?.merged === true) return { merged: true, ...(body.sha ? { sha: body.sha } : {}) }
      const detail = typeof body?.message === "string" ? body.message.slice(0, 400) : "merge não confirmado"
      return { merged: false, error: detail }
    },
    async inspectMerge(target: ShipTarget, signal: AbortSignal): Promise<{
      merged: MergeState
      sha?: string
      parents?: string[]
      treeMatchesHead?: boolean
    }> {
      const pullResult = await runGh([`/repos/${target.repo}/pulls/${target.pr}`], signal)
      if (pullResult.status !== 0) return { merged: "unknown" }
      const pull = asPull(parseJson(pullResult.stdout))
      if (!pull) return { merged: "unknown" }
      if (pull.merged !== true || !pull.merge_commit_sha) return { merged: false }
      const mergeResult = await runGh([`/repos/${target.repo}/git/commits/${pull.merge_commit_sha}`], signal)
      const headResult = await runGh([`/repos/${target.repo}/git/commits/${target.headSha}`], signal)
      if (mergeResult.status !== 0 || headResult.status !== 0) {
        return { merged: "unknown", sha: pull.merge_commit_sha }
      }
      const merge = parseJson(mergeResult.stdout) as GitHubCommit
      const head = parseJson(headResult.stdout) as GitHubCommit
      const parents = (merge.parents ?? []).map((item) => item.sha).filter((item): item is string => Boolean(item))
      return {
        merged: true,
        sha: pull.merge_commit_sha,
        parents,
        treeMatchesHead: Boolean(merge.tree?.sha && head.tree?.sha && merge.tree.sha === head.tree.sha),
      }
    },
  }
}
