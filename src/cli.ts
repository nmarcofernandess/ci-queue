import { readQueueConfig } from "./contracts/config.js"
import { API_VERSION, type CliFailure, type CliResult, type CliSuccess, type QueueTicket } from "./contracts/schema.js"
import { cancelQueuedOrRunningTicket } from "./core/runner.js"
import { enqueueExplicitTicket, enqueueTicket } from "./core/enqueue.js"
import { runWorker } from "./core/worker.js"
import { findJobById, listHistoryJobs, listQueuedJobs, readRunningJob, resolveStateRoot } from "./core/state.js"

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

function parseJsonArray(value: string | undefined, name: string): string[] {
  if (!value) throw new Error(`${name} é obrigatório`)
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`${name} precisa ser um JSON array`) }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item)) throw new Error(`${name} precisa conter strings não vazias`)
  return parsed
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
    "  enqueue <preset> [--wait] [--timeout-ms N] [-- <args da receita>]",
    "  enqueue --recipe NAME --argv-json JSON --project-id ID --project-name NAME --cwd PATH",
    "  worker",
    "  status",
    "  history [--project ID]",
    "  cancel <ticketId>",
  ].join("\n")
}

export async function runCli(argv: string[]): Promise<CliResult<unknown>> {
  const args = parseGlobal(argv)
  const root = resolveStateRoot(args.stateRoot)
  try {
    switch (args.command) {
      case "version":
        return success({
          version: "0.1.0",
          apiVersion: API_VERSION,
          ticketSchemaVersion: 3,
          capabilities: ["enqueue", "worker", "status", "history", "cancel", "v1-ticket-read", "v2-ticket-read", "v3-ticket-read"],
        })
      case "enqueue": {
        const recipe = optionValue(args.rest, "--recipe")
        const preset = args.rest.find((item, index) => !item.startsWith("--") && args.rest[index - 1] !== "--recipe" && args.rest[index - 1] !== "--argv-json" && args.rest[index - 1] !== "--project-id" && args.rest[index - 1] !== "--project-name" && args.rest[index - 1] !== "--base-ref" && args.rest[index - 1] !== "--artifacts-json" && args.rest[index - 1] !== "--timeout-ms" && item !== "--")
        if (!recipe && !preset) return failure("USAGE", "enqueue requer um preset ou --recipe")
        const contextText = optionValue(args.rest, "--request-context")
        let requestContext: unknown
        if (contextText) {
          try { requestContext = JSON.parse(contextText) } catch { return failure("USAGE", "--request-context precisa ser JSON") }
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
            requestContext: requestContext as never,
          })
          : enqueueTicket({ preset: preset!, stateRoot: root, cwd: args.cwd, configPath: args.configPath, extraArgs: splitExtra(args.rest), requestContext: requestContext as never })
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
        return success({ jobs: listHistoryJobs(root, optionValue(args.rest, "--project")) })
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
