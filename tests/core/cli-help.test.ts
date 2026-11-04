import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { runCli } from "../../src/cli.js"
import * as enqueue from "../../src/core/enqueue.js"
import * as observations from "../../src/core/execution-observations.js"
import * as runner from "../../src/core/runner.js"
import { jobPath } from "../../src/core/state.js"
import * as worker from "../../src/core/worker.js"

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-help-"))
  roots.push(root)
  return root
}

describe("CLI help is a query", () => {
  const commands = [
    ["worker"], ["enqueue", "check", "--wait"], ["cancel", "job-1"], ["finalize", "job-1"],
    ["observe", "--stdin"], ["runtime", "prepare-session", "--stdin"], ["runtime", "register"],
    ["init", "--force"], ["advisory", "upsert"], ["ship", "--pr", "43"],
    ["pause", "job-1", "--reason", "maintenance"], ["resume", "job-1"], ["disk-guard", "enforce"],
    ["status"], ["logs", "job-1"], ["history"], ["preset-history"], ["config"], ["guard"], ["version"],
  ]

  it.each(commands.map(argv => ({ argv })))("answers help for $argv before dispatch or stdin", async ({ argv }) => {
    const root = fixture(), state = join(root, "state-not-created")
    const sentinels = [
      vi.spyOn(worker, "runWorker"), vi.spyOn(enqueue, "enqueueTicket"),
      vi.spyOn(runner, "cancelQueuedOrRunningTicket"),
      vi.spyOn(observations, "readStdinLimited").mockRejectedValue(new Error("help must not read stdin")),
    ]
    for (const helpArgs of [["help", argv[0]], [...argv, "--help"], [...argv, "-h"], ["--help", ...argv]]) {
      const result = await runCli([...helpArgs, "--state", state, "--cwd", root, "--json"])
      expect(result).toMatchObject({ ok: true, result: { usage: expect.stringContaining(`Uso: ci-queue ${argv[0]}`) } })
    }
    for (const sentinel of sentinels) expect(sentinel).not.toHaveBeenCalled()
    expect(readdirSync(root)).toEqual([])
  })

  it.each(["help", "--help", "-h"])("lists finalize and the distinct recovery owners in %s", async flag => {
    const result = await runCli([flag, "--json"])
    expect(result).toMatchObject({ ok: true, result: { usage: expect.stringContaining("finalize <ticketId>") } })
    if (!result.ok) return
    const { usage } = result.result as { usage: string }
    expect(usage).toContain("ci-queue status --json")
    expect(usage).toContain("ci-queue logs <ticketId> --json")
    expect(usage).toContain("Sessão, reserva e dados são encerrados pela entrada pública do consumidor")
  })

  it.each(["--state", "--cwd", "--config"])("recognizes help even when %s has no value", async option => {
    const root = fixture()
    const run = vi.spyOn(worker, "runWorker"), cancel = vi.spyOn(runner, "cancelQueuedOrRunningTicket")
    for (const flag of ["--help", "-h"]) {
      for (const argv of [["worker"], ["cancel", "job-1"]]) {
        const result = await runCli([...argv, "--state", root, option, flag, "--json"])
        expect(result).toMatchObject({ ok: true, result: { usage: expect.stringContaining(`Uso: ci-queue ${argv[0]}`) } })
      }
    }
    expect(run).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect(readdirSync(root)).toEqual([])
  })

  it("does not cancel an existing queued ticket when its help is requested", async () => {
    const root = fixture()
    const ticket = enqueue.enqueueExplicitTicket({ recipe: "check", argv: [process.execPath, "--version"], projectId: "help-fixture", projectName: "Help fixture", cwd: root, stateRoot: root })
    const before = JSON.stringify(readdirSync(root, { recursive: true }))
    const ticketBytes = readFileSync(jobPath(root, ticket.id), "utf8")
    const result = await runCli(["cancel", ticket.id, "--help", "--state", root, "--json"])
    expect(result.ok).toBe(true)
    expect(JSON.stringify(readdirSync(root, { recursive: true }))).toBe(before)
    expect(readFileSync(jobPath(root, ticket.id), "utf8")).toBe(ticketBytes)
  })

  it("passes recipe help and global-looking arguments after -- unchanged", async () => {
    const project = fixture(), state = fixture()
    writeFileSync(join(project, "ci-queue.json"), JSON.stringify({ schemaVersion: 1, project: { id: "help-fixture", name: "Help fixture" }, presets: { check: { argv: [process.execPath, "--version"] } } }))
    const extra = ["--help", "-h", "help", "--json", "--state", "recipe-state", "--cwd", "recipe-cwd", "--config", "recipe-config"]
    const result = await runCli(["enqueue", "check", "--state", state, "--cwd", project, "--json", "--", ...extra])
    expect(result).toMatchObject({ ok: true, result: { ticket: { argv: [process.execPath, "--version", "--", ...extra], extraArgs: extra, cwd: project, status: "queued" } } })
  })

  it("reports an unknown help target without invoking a command", async () => {
    const state = fixture()
    expect(await runCli(["help", "does-not-exist", "--state", state, "--json"])).toMatchObject({ ok: false, error: { code: "USAGE", message: expect.stringContaining("comando desconhecido: does-not-exist") } })
    expect(readdirSync(state)).toEqual([])
  })
})
