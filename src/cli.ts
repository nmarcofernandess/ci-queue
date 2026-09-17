import { readQueueConfig } from "./contracts/config.js"
import { InitError, initProject } from "./ship/init.js"
import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import {
  API_VERSION,
  normalizeTicketFlags,
  parseRequestContext,
  type CliFailure,
  type CliResult,
  type CliSuccess,
  type QueueTicket,
} from "./contracts/schema.js"
import { SPEND_ABORT_CAPABILITY } from "./core/spend-abort.js"
import { JOB_ENV_CAPABILITY, cancelQueuedOrRunningTicket } from "./core/runner.js"
import { enqueueExplicitTicket, enqueueTicket } from "./core/enqueue.js"
import { runWorker } from "./core/worker.js"
import { findJobById, listHistoryJobs, listQueuedJobs, readRunningJob, resolveStateRoot } from "./core/state.js"
import { buildPresetHistory } from "./core/preset-history.js"
import { listAdvisories, upsertAdvisory } from "./core/advisories.js"

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
  const valueOptions = new Set(["--recipe", "--argv-json", "--project-id", "--project-name", "--base-ref", "--artifacts-json", "--flags-json", "--timeout-ms", "--request-context"])
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
    if (job && ["passed", "failed", "cancelled", "interrupted"].includes(job.status)) return job
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return undefined
}

function usage(): string {
  return [
    "Uso: ci-queue <comando> [--state DIR] [--cwd DIR] [--config FILE] [--json]",
    "  version",
    "  init [--name NAME] [--base-ref REMOTE/BRANCH] [--argv-json JSON] [--workflow] [--force]",
    "  enqueue <preset> [--wait] [--timeout-ms N] [-- <args da receita>]",
    "  enqueue --recipe NAME --argv-json JSON --project-id ID --project-name NAME --cwd PATH [--flags-json JSON]",
    "  worker",
    "  status",
    "  history [--project ID] [--legacy]",
    "  preset-history [--preset NAME]",
    "  advisory upsert --preset NAME --head-sha SHA --reason TEXT [--pr N]",
    "  advisory list",
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
          apiVersion: API_VERSION,
          ticketSchemaVersion: 3,
          capabilities: ["enqueue", "worker", "status", "history", "preset-history", "logs", "cancel", "advisory-v1", "execution-flags-v1", JOB_ENV_CAPABILITY, SPEND_ABORT_CAPABILITY, "v1-ticket-read", "v2-ticket-read", "v3-ticket-read"],
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
      case "worker":
        return success(await runWorker(root))
      case "status":
        return success({ running: readRunningJob(root) ?? null, queued: listQueuedJobs(root), latest: listHistoryJobs(root)[0] ?? null })
      case "history":
        return success({ jobs: listHistoryJobs(root, optionValue(args.rest, "--project")).filter(ticket => !args.rest.includes("--legacy") || !ticket.projectId) })
      case "preset-history": {
        const loaded = readQueueConfig(args.cwd, args.configPath)
        const report = buildPresetHistory(listHistoryJobs(root, loaded.config.project.id), loaded.config)
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
    return failure("COMMAND_FAILED", error instanceof Error ? error.message : String(error))
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseGlobal(argv)
  const result = await runCli(argv)
  print(result, parsed.json)
  if (!result.ok) process.exitCode = result.error.code === "USAGE" ? 2 : 1
}

const invoked = process.argv[1]?.endsWith("cli.js") || process.argv[1]?.endsWith("cli.ts")
if (invoked) void main()
