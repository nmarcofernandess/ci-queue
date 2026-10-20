import { executionCompletion, completionExitCode, listExecutionSources, readExecutionSource, projectExecution } from "./core/completion.js"
import { readQueueConfig } from "./contracts/config.js"
import { InitError, initProject } from "./ship/init.js"
import { ShipError } from "./ship/ops.js"
import { runShip } from "./ship/ship.js"
import { createSystemOps } from "./ship/system-ops.js"
import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  API_VERSION,
  TICKET_SCHEMA_VERSION,
  normalizeTicketFlags,
  normalizeFinalization,
  rejectArtifactSnapshots,
  parseRequestContext,
  parseRunVariant,
  TERMINAL_FINALIZATION_CAPABILITY,
  NO_ARTIFACT_SNAPSHOTS_CAPABILITY, RECOVERABLE_FINALIZATION_CAPABILITY,
  type CliFailure,
  type CliResult,
  type CliSuccess,
  type QueueTicket,
} from "./contracts/schema.js"
import { SPEND_ABORT_CAPABILITY } from "./core/spend-abort.js"
import { JOB_ENV_CAPABILITY, cancelQueuedOrRunningTicket } from "./core/runner.js"
import { SESSION_RUNTIME_CAPABILITY, RUNTIME_CAPABILITY } from "./contracts/runtime.js"
import { prepareSessionRuntime, checkpointSessionRuntime, releaseSessionRuntime, listSessionRuntimes, registerProjectRuntime, readRuntimeRegistry, runtimeRegistryPath, RuntimeError } from "./core/runtime.js"
import { enqueueExplicitTicket, enqueueTicket } from "./core/enqueue.js"
import { runWorker } from "./core/worker.js"
import { findJobById, listHistoryJobs, listQueuedJobs, readRunningJob, resolveStateRoot } from "./core/state.js"
import { buildPresetHistory } from "./core/preset-history.js"
import { attachProgressToTicket, PROGRESS_Q2Q3_CAPABILITY } from "./core/progress.js"
import { listAdvisories, upsertAdvisory } from "./core/advisories.js"
import { evaluateExecutionEntry, EXECUTION_ENTRY_GUARD_CAPABILITY } from "./core/execution-entry.js"
import {
  EXECUTION_OBSERVE_CAPABILITY,
  OBSERVATION_MAX_BYTES,
} from "./contracts/execution-observation.js"
import {
  listExecutionHistory,
  ObservationError,
  readStdinLimited,
  storeExecutionObservation,
} from "./core/execution-observations.js"

type GlobalArgs = { command?: string; rest: string[]; json: boolean; stateRoot?: string; cwd?: string; configPath?: string }

function parseGlobal(argv: string[]): GlobalArgs {
  const values: GlobalArgs = { rest: [], json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") values.json = true
    else if (arg === "--state") values.stateRoot = argv[++index]
    else if (arg === "--cwd") values.cwd = argv[++index]
    else if (arg === "--config") values.configPath = argv[++index]
    else if (!values.command) values.command = arg
    else values.rest.push(arg)
  }
  return values
}

function success<T>(result: T): CliSuccess<T> { return { apiVersion: API_VERSION, ok: true, result } }
function failure(code: string, message: string, details?: Record<string, unknown>): CliFailure {
  return { apiVersion: API_VERSION, ok: false, error: { code, message, ...(details ? { details } : {}) } }
}

function print(result: CliResult<unknown>, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  if (!result.ok) {
    process.stderr.write(`${result.error.code}: ${result.error.message}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify(result.result, null, 2)}\n`)
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function splitExtra(args: string[]): string[] {
  const marker = args.indexOf("--")
  return marker === -1 ? [] : args.slice(marker + 1)
}

function enqueuePreset(args: string[]): string | undefined {
  const valueOptions = new Set(["--recipe", "--argv-json", "--project-id", "--project-name", "--base-ref", "--artifacts-json", "--finalization-json", "--flags-json", "--timeout-ms", "--request-context", "--run-variant"])
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === "--") return undefined
    if (valueOptions.has(value)) { index += 1; continue }
    if (!value.startsWith("--")) return value
  }
  return undefined
}

function parseJsonArray(value: string | undefined, name: string): string[] {
  if (!value) throw new Error(`${name} é obrigatório`)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${name} precisa ser um JSON array`) }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item)) throw new Error(`${name} precisa conter strings não vazias`)
  return parsed
}

function parseFlags(value: string | undefined) {
  if (!value) return undefined
  try {
    return normalizeTicketFlags(JSON.parse(value))
  } catch (error) {
    throw new Error(
      `--flags-json inválido: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function waitForJob(root: string, id: string, timeoutMs: number): Promise<QueueTicket | undefined> {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const job = findJobById(root, id)?.ticket
    if (job && ["passed", "failed", "cancelled", "interrupted"].includes(job.status)) {
      const source = readExecutionSource(root, id)
      if (source && executionCompletion(source.ticket, source.record, source.terminalDigest).state !== "running") return projectExecution(source)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return undefined
}

function usage(): string {
  return [
    "Uso: ci-queue <comando> [--state DIR] [--cwd DIR] [--config FILE] [--json]",
    "  version",
    "  init [--name NAME] [--base-ref REMOTE/BRANCH] [--argv-json JSON] [--workflow] [--force]",
    "  guard [--cwd PATH] [--config FILE] [--state ROOT] [--json]",
    "  ship [--pr N] [--repo [HOST/]OWNER/REPO] [--dry-run] [--remote|--no-remote] [--timeout-ms N]",
    "  enqueue <preset> [--wait] [--timeout-ms N] [-- <args da receita>]",
    "  enqueue --recipe NAME --argv-json JSON --project-id ID --project-name NAME --cwd PATH [--flags-json JSON]",
    "  worker",
    "  status",
    "  observe --stdin [--json]",
    "  history [--project ID] [--legacy]",
    "  history --include-observed [--project ID]",
    "  preset-history [--preset NAME]",
    "  advisory upsert --preset NAME --head-sha SHA --reason TEXT [--pr N]",
    "  advisory list",
    "  runtime show",
    "  runtime prepare-session|checkpoint-session|release-session --stdin --json (private)",
    "  runtime register --project ID --node PATH [--version x.y.z] [--npm-cli PATH] [--npx-cli PATH]",
    "  logs [latest|<ticketId>]",
    "  cancel <ticketId>",
    "  config",
  ].join("\n")
}

export async function runCli(argv: string[]): Promise<CliResult<unknown>> {
  const args = parseGlobal(argv)
  const root = resolveStateRoot(args.stateRoot)
  try {
    switch (args.command) {
      case "version": {
        const path = new URL("../manifest.json", import.meta.url)
        const bytes = existsSync(path) ? readFileSync(path) : undefined
        const manifest = bytes ? JSON.parse(bytes.toString("utf8")) : undefined
        if (manifest && (manifest.schemaVersion !== 1 || manifest.product !== "ci-queue" || !/^[a-f0-9]{40}$/.test(manifest.revision))) {
          return failure("INVALID_MANIFEST", "Manifest da distribuição inválido")
        }
        return success({
          version: manifest?.version ?? "0.1.0",
          revision: manifest?.revision ?? null,
          manifestSha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
          ...(manifest ? { distribution: { revision: manifest.revision, protocol: manifest.protocol } } : {}),
          apiVersion: API_VERSION,
          ticketSchemaVersion: TICKET_SCHEMA_VERSION,
          capabilities: ["enqueue", "worker", "status", "history", "preset-history", "logs", "cancel", "advisory-v1", "execution-flags-v1", JOB_ENV_CAPABILITY, SPEND_ABORT_CAPABILITY, RUNTIME_CAPABILITY, SESSION_RUNTIME_CAPABILITY, TERMINAL_FINALIZATION_CAPABILITY, NO_ARTIFACT_SNAPSHOTS_CAPABILITY, RECOVERABLE_FINALIZATION_CAPABILITY, "ship", EXECUTION_ENTRY_GUARD_CAPABILITY, EXECUTION_OBSERVE_CAPABILITY, PROGRESS_Q2Q3_CAPABILITY, "v1-ticket-read", "v2-ticket-read", "v3-ticket-read", "v4-ticket-read"],
        })
      }
      case "observe": {
        if (!args.rest.includes("--stdin")) {
          return failure("USAGE", "observe requer --stdin")
        }
        const raw = await readStdinLimited(process.stdin, OBSERVATION_MAX_BYTES)
        let payload: unknown
        try {
          payload = JSON.parse(raw)
        } catch {
          return failure("OBSERVATION_INVALID", "stdin não é JSON válido")
        }
        const stored = storeExecutionObservation(root, payload)
        return success({
          id: stored.id,
          executionId: stored.executionId,
          outcome: stored.outcome,
        })
      }
      case "init": {
        const argvText = optionValue(args.rest, "--argv-json")
        return success(await initProject(args.cwd ?? process.cwd(), {
          stateRoot: root,
          force: args.rest.includes("--force"),
          workflow: args.rest.includes("--workflow"),
          ...(optionValue(args.rest, "--name") ? { name: optionValue(args.rest, "--name") } : {}),
          ...(optionValue(args.rest, "--base-ref") ? { baseRef: optionValue(args.rest, "--base-ref") } : {}),
          ...(argvText !== undefined ? { argv: parseJsonArray(argvText, "--argv-json") } : {}),
        }))
      }
      case "guard": {
        let loaded
        try {
          loaded = readQueueConfig(args.cwd ?? process.cwd(), args.configPath)
        } catch (error) {
          return failure("USAGE", error instanceof Error ? error.message : String(error))
        }
        const verdict = await evaluateExecutionEntry({
          config: loaded.config,
          stateRoot: root,
          cwd: loaded.executionCwd,
          env: process.env,
        })
        if (!verdict.allowed) {
          return failure(verdict.code, verdict.message)
        }
        return success({
          allowed: true,
          reason: verdict.reason,
          capability: EXECUTION_ENTRY_GUARD_CAPABILITY,
          projectId: loaded.config.project.id,
          cwd: loaded.executionCwd,
        })
      }
      case "ship": {
        const timeoutRaw = optionValue(args.rest, "--timeout-ms")
        const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 60 * 60_000
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return failure("USAGE", "--timeout-ms precisa ser número positivo")
        const prRaw = optionValue(args.rest, "--pr")
        const pr = prRaw === undefined ? undefined : Number(prRaw)
        if (prRaw !== undefined && (!Number.isSafeInteger(pr) || (pr as number) <= 0)) {
          return failure("USAGE", "--pr precisa ser um inteiro positivo")
        }
        const repo = optionValue(args.rest, "--repo")
        const noRemote = args.rest.includes("--no-remote")
        const remote = args.rest.includes("--remote")
        if (noRemote && remote) return failure("USAGE", "--remote e --no-remote juntos")
        const report = await runShip(createSystemOps({
          cwd: args.cwd ?? process.cwd(),
          stateRoot: root,
          configPath: args.configPath,
          log: (message) => process.stderr.write(`${message}\n`),
        }), {
          dryRun: args.rest.includes("--dry-run"),
          noRemote,
          remote,
          timeoutMs,
          ...(pr !== undefined ? { pr } : {}),
          ...(repo ? { repo } : {}),
        })
        return success(report)
      }
      case "enqueue": {
        const recipe = optionValue(args.rest, "--recipe")
        const preset = enqueuePreset(args.rest)
        if (!recipe && !preset) return failure("USAGE", "enqueue requer um preset ou --recipe")
        const contextText = optionValue(args.rest, "--request-context")
        let requestContext: ReturnType<typeof parseRequestContext>
        if (contextText) {
          try { requestContext = parseRequestContext(JSON.parse(contextText)) } catch { return failure("USAGE", "--request-context precisa ser JSON") }
          if (!requestContext) return failure("USAGE", "--request-context não respeita o contrato de identificadores")
        }
        if (recipe && !args.cwd) return failure("USAGE", "--cwd absoluto é obrigatório com --recipe")
        const runVariantRaw = optionValue(args.rest, "--run-variant")
        if (args.rest.includes("--run-variant") && runVariantRaw === undefined) {
          return failure("USAGE", "--run-variant requer focal ou custom")
        }
        if (!recipe && runVariantRaw !== undefined) {
          return failure("USAGE", "--run-variant exige --recipe; o preset não declara a descoberta do consumidor")
        }
        let runVariant: ReturnType<typeof parseRunVariant>
        if (runVariantRaw !== undefined) {
          try {
            runVariant = parseRunVariant(runVariantRaw)
          } catch (error) {
            return failure("USAGE", error instanceof Error ? error.message : String(error))
          }
        } else {
          runVariant = undefined
        }
        const finalizationJson = optionValue(args.rest, "--finalization-json")
        if (args.rest.includes("--finalization-json") && (!recipe || !finalizationJson)) {
          return failure("USAGE", "--finalization-json requer --recipe e JSON válido")
        }
        const finalization = finalizationJson === undefined ? undefined : normalizeFinalization(JSON.parse(finalizationJson))
        if (args.rest.includes("--artifacts-json")) {
          rejectArtifactSnapshots(parseJsonArray(optionValue(args.rest, "--artifacts-json"), "--artifacts-json"), "--artifacts-json")
        }
        const ticket = recipe
          ? enqueueExplicitTicket({
            recipe,
            argv: parseJsonArray(optionValue(args.rest, "--argv-json"), "--argv-json"),
            projectId: optionValue(args.rest, "--project-id") ?? "",
            projectName: optionValue(args.rest, "--project-name") ?? "",
            cwd: args.cwd ?? "",
            stateRoot: root,
            ...(optionValue(args.rest, "--base-ref") ? { baseRef: optionValue(args.rest, "--base-ref") } : {}),
            ...(optionValue(args.rest, "--artifacts-json") ? { artifacts: parseJsonArray(optionValue(args.rest, "--artifacts-json"), "--artifacts-json") } : {}),
            ...(optionValue(args.rest, "--flags-json") ? { flags: parseFlags(optionValue(args.rest, "--flags-json")) } : {}),
            requestContext,
            ...(finalization ? { finalization } : {}),
            ...(runVariant ? { runVariant } : {}),
          })
          : enqueueTicket({ preset: preset!, stateRoot: root, cwd: args.cwd, configPath: args.configPath, extraArgs: splitExtra(args.rest), requestContext })
        if (args.rest.includes("--wait")) {
          const rawTimeout = optionValue(args.rest, "--timeout-ms")
          const timeoutMs = rawTimeout ? Number(rawTimeout) : 60 * 60_000
          if (!Number.isFinite(timeoutMs) || timeoutMs < 0) return failure("USAGE", "--timeout-ms precisa ser número não negativo")
          const terminal = await waitForJob(root, ticket.id, timeoutMs)
          return terminal ? success({ ticket, terminal }) : failure("WAIT_TIMEOUT", `ticket ${ticket.id} ainda não terminou`, { ticketId: ticket.id })
        }
        return success({ ticket })
      }
      case "finalize": {
        if (args.rest.length !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(args.rest[0])) return failure("USAGE", "uso: ci-queue finalize <id>")
        const report = await runWorker(root, { finalizeOnly: args.rest[0] })
        if (report.busy || report.reconciliation === "blocked" || report.recovery?.pending.length) return failure("FINALIZATION_PENDING", "finalização permanece pendente", { report })
        if (report.recovery?.failed.length) return failure("FINALIZATION_FAILED", report.recovery.failed.map(item => `${item.id}: ${item.error}`).join("; "), { report })
        return success(report)
      }
      case "worker":
        return success(await runWorker(root))
      case "status": {
        const running = readRunningJob(root)
        return success({ sessionRuntimes: listSessionRuntimes(root), running: running ? { ...attachProgressToTicket(root, running), completion: executionCompletion(running) } : null, queued: listQueuedJobs(root).map(ticket => ({ ...ticket, completion: executionCompletion(ticket) })), latest: listExecutionSources(root).map(projectExecution)[0] ?? null })
      }
      case "history": {
        const projectId = optionValue(args.rest, "--project")
        if (args.rest.includes("--include-observed")) {
          if (args.rest.includes("--legacy")) {
            return failure("USAGE", "--legacy não pode ser combinado com --include-observed")
          }
          return success({ executions: listExecutionHistory(root, projectId).map(record => {
            if (record.recordKind !== "queue-ticket") return record
            const source = readExecutionSource(root, record.id)
            return { ...record, completion: source
              ? executionCompletion(source.ticket, source.record, source.terminalDigest)
              : { state: "running", eligible: false, testStatus: record.status, reason: "terminal-source-unreadable" } }
          }) })
        }
        return success({
          jobs: listExecutionSources(root, projectId).map(projectExecution).filter(
            (ticket) => !args.rest.includes("--legacy") || !ticket.projectId,
          ),
        })
      }
      case "preset-history": {
        const loaded = readQueueConfig(args.cwd, args.configPath)
        const sources = listExecutionSources(root, loaded.config.project.id)
        const report = buildPresetHistory(sources.map(source => source.ticket), loaded.config, sources)
        const preset = optionValue(args.rest, "--preset")
        return success(preset ? { ...report, presets: report.presets.filter((item) => item.preset === preset) } : report)
      }
      case "advisory": {
        const action = args.rest.find((item) => !item.startsWith("--"))
        const loaded = readQueueConfig(args.cwd, args.configPath)
        if (action === "list") {
          return success({ pending: listAdvisories(root, loaded.config.project.id) })
        }
        if (action !== "upsert") return failure("USAGE", "advisory requer upsert ou list")
        const preset = optionValue(args.rest, "--preset")
        const headSha = optionValue(args.rest, "--head-sha")
        const reason = optionValue(args.rest, "--reason")
        if (!preset || !headSha || !reason) {
          return failure("USAGE", "advisory upsert requer --preset, --head-sha e --reason")
        }
        const rawPr = optionValue(args.rest, "--pr")
        const pr = rawPr === undefined ? undefined : Number(rawPr)
        return success(await upsertAdvisory({
          root,
          config: loaded.config,
          preset,
          headSha,
          reason,
          ...(pr !== undefined ? { pr } : {}),
        }))
      }
      case "runtime": {
        const action = args.rest.find((item) => !item.startsWith("--"))
        if (["prepare-session", "checkpoint-session", "release-session"].includes(action ?? "")) {
          if (!args.rest.includes("--stdin") || args.rest.some(item => item !== action && item !== "--stdin")) return failure("USAGE", "runtime session requires private --stdin only")
          try {
            const input = JSON.parse(await readStdinLimited(process.stdin, 64 * 1024))
            if (!input || typeof input !== "object" || Array.isArray(input)) return failure("RUNTIME_SESSION_INVALID", "private JSON object required")
            if (action !== "prepare-session" && input.root !== root) return failure("RUNTIME_SESSION_AUTHORITY", "state root mismatch")
            return success(action === "prepare-session" ? prepareSessionRuntime(root, input)
              : action === "checkpoint-session" ? checkpointSessionRuntime(input) : releaseSessionRuntime(input))
          } catch (error) {
            return failure(error instanceof RuntimeError ? error.code : "RUNTIME_SESSION_INVALID", error instanceof RuntimeError ? error.message : "invalid private session request")
          }
        }
        if (action === "show") {
          try {
            const registry = readRuntimeRegistry(root) ?? { schemaVersion: 1 as const, projects: {} }
            return success({ registryPath: runtimeRegistryPath(root), registry })
          } catch (error) {
            if (error instanceof RuntimeError) return failure(error.code, error.message)
            throw error
          }
        }
        if (action !== "register") return failure("USAGE", "runtime requer show ou register")
        const projectId = optionValue(args.rest, "--project")
        const node = optionValue(args.rest, "--node")
        if (!projectId || !node) return failure("USAGE", "runtime register requer --project e --node")
        try {
          return success(registerProjectRuntime(root, {
            projectId,
            node,
            ...(optionValue(args.rest, "--version") ? { version: optionValue(args.rest, "--version") } : {}),
            ...(optionValue(args.rest, "--npm-cli") ? { npmCli: optionValue(args.rest, "--npm-cli") } : {}),
            ...(optionValue(args.rest, "--npx-cli") ? { npxCli: optionValue(args.rest, "--npx-cli") } : {}),
          }))
        } catch (error) {
          if (error instanceof RuntimeError) return failure(error.code, error.message)
          throw error
        }
      }
      case "logs": {
        const requested = args.rest.find((item) => !item.startsWith("--")) ?? "latest"
        const found = requested === "latest"
          ? (() => {
            const ticket = readRunningJob(root) ?? listHistoryJobs(root)[0]
            return ticket ? findJobById(root, ticket.id) : undefined
          })()
          : findJobById(root, requested)
        if (!found) return failure("NOT_FOUND", `ticket não encontrado: ${requested}`)
        if (!existsSync(found.ticket.logPath)) {
          return failure("LOG_UNAVAILABLE", `log ainda não existe: ${found.ticket.logPath}`, { ticketId: found.ticket.id })
        }
        return success({
          ticketId: found.ticket.id,
          logPath: found.ticket.logPath,
          content: readFileSync(found.ticket.logPath, "utf8"),
        })
      }
      case "cancel": {
        const id = args.rest.find((item) => !item.startsWith("--"))
        if (!id) return failure("USAGE", "cancel requer ticketId")
        return success(await cancelQueuedOrRunningTicket(root, id))
      }
      case "config": {
        const config = readQueueConfig(args.cwd, args.configPath)
        return success({ config: config.config, configPath: config.configPath, executionCwd: config.executionCwd })
      }
      default:
        return failure("USAGE", usage())
    }
  } catch (error) {
    if (error instanceof InitError) return failure(error.code, error.message)
    if (error instanceof ObservationError) return failure(error.code, error.message)
    if (error instanceof ShipError) {
      return failure(error.code, error.message, {
        effects: error.effects,
        ...(error.mergeSha ? { mergeSha: error.mergeSha } : {}),
      })
    }
    return failure("COMMAND_FAILED", error instanceof Error ? error.message : String(error))
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseGlobal(argv)
  const result = await runCli(argv)
  print(result, parsed.json)
  if (!result.ok) process.exitCode = result.error.code === "USAGE" ? 2 : 1
  else if (parsed.command === "enqueue" && parsed.rest.includes("--wait")) {
    const terminal = (result.result as { terminal?: QueueTicket & { completion: ReturnType<typeof executionCompletion> } }).terminal
    if (terminal) process.exitCode = completionExitCode(terminal, terminal.completion)
  }
}

const invoked = process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")
if (invoked) void main()
