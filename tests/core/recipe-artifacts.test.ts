import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { parseQueueConfig } from "../../src/contracts/config.js"
import { runCli } from "../../src/cli.js"
import { buildTicket, enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import { listHistoryJobs, queuePaths, ensureQueueDirs, stageTicketWrite } from "../../src/core/state.js"
import { runWorker } from "../../src/core/worker.js"

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture(recipeArtifacts?: unknown): { project: string; state: string } {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-recipe-artifacts-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-recipe-artifacts-state-"))
  cleanup.push(project, state)
  mkdirSync(join(project, "old-proofs"), { recursive: true })
  mkdirSync(join(project, "current-proof"), { recursive: true })
  writeFileSync(join(project, "old-proofs", "sentinel.txt"), "belongs to an earlier proof\n")
  writeFileSync(join(project, "current-proof", "receipt.txt"), "current receipt\n")
  writeFileSync(join(project, "ci-queue.json"), `${JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture project" },
    artifacts: ["old-proofs"],
    presets: {
      review: {
        argv: [process.execPath, "-e", "process.exit(0)"],
        ...(recipeArtifacts !== undefined ? { artifacts: recipeArtifacts } : {}),
      },
    },
  }, null, 2)}\n`)
  execFileSync("git", ["init", "-q"], { cwd: project })
  execFileSync("git", ["config", "user.name", "CI Queue test"], { cwd: project })
  execFileSync("git", ["config", "user.email", "ci-queue@example.invalid"], { cwd: project })
  execFileSync("git", ["add", "."], { cwd: project })
  execFileSync("git", ["commit", "-qm", "recipe artifact fixture"], { cwd: project })
  return { project, state }
}

function readEnqueuedTicket(state: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(queuePaths(state).jobs, `${id}.json`), "utf8")) as Record<string, unknown>
}

describe("recipe-specific artifacts", () => {
  it("rejects new snapshot selections from the global catalog or recipe", () => {
    for (const selection of [undefined, [], ["current-proof"]]) {
      const { project, state } = fixture(selection)
      expect(() => buildTicket({ preset: "review", cwd: project, stateRoot: state })).toThrow(/artifacts/)
    }
  })

  it("rejects recipe snapshots even without a global selection", () => {
    const { project, state } = fixture(["current-proof"])
    const path = join(project, "ci-queue.json")
    const config = JSON.parse(readFileSync(path, "utf8"))
    delete config.artifacts
    writeFileSync(path, JSON.stringify(config))
    expect(() => buildTicket({ preset: "review", cwd: project, stateRoot: state })).toThrow(/artifacts/)
  })

  it("accepts legacy empty artifact declarations without snapshots", async () => {
    const { project, state } = fixture([])
    const path = join(project, "ci-queue.json")
    const config = JSON.parse(readFileSync(path, "utf8"))
    config.artifacts = []
    writeFileSync(path, JSON.stringify(config))
    const ticket = enqueueTicket({ preset: "review", cwd: project, stateRoot: state })
    await runWorker(state)
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed" })
    expect(existsSync(join(state, "artifacts", ticket.id))).toBe(false)
  })

  it("executes a manually persisted v3 ticket without copying its historical selection", async () => {
    const { project, state } = fixture()
    const paths = ensureQueueDirs(state)
    const ticket = {
      id: "legacy-v3-artifacts", schemaVersion: 3, status: "queued" as const,
      createdAt: new Date().toISOString(), preset: "review", cwd: project,
      branch: "main", headSha: "unknown", requestedBy: "fixture",
      command: "node -e process.exit(0)", argv: [process.execPath, "-e", "process.exit(0)"],
      flags: {}, executionDeadline: { state: "disabled" as const },
      logPath: join(paths.logs, "legacy-v3-artifacts.log"), artifacts: ["old-proofs"],
    }
    stageTicketWrite(state, ticket)
    await runWorker(state)
    expect(listHistoryJobs(state)[0]).toMatchObject({ id: ticket.id, status: "passed", artifacts: ["old-proofs"] })
    expect(existsSync(join(state, "artifacts", ticket.id))).toBe(false)
    expect(readFileSync(join(project, "old-proofs", "sentinel.txt"), "utf8")).toContain("earlier")
  })

  it("rejects an explicit snapshot selection", () => {
    const { project, state } = fixture()
    expect(() => enqueueExplicitTicket({
      recipe: "explicit", argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project", projectName: "Fixture project", cwd: project,
      stateRoot: state, artifacts: ["old-proofs"],
    })).toThrow(/artifacts/)
  })

  it.each([
    ["empty", [""]],
    ["absolute", ["/outside/proof"]],
    ["Windows root-relative absolute", ["\\outside\\proof"]],
    ["traversal", ["nested/../outside"]],
    ["NUL", ["bad\u0000path"]],
    ["non-array", null],
  ])("rejects %s recipe artifact paths", (_label, artifacts) => {
    expect(() => parseQueueConfig({
      schemaVersion: 1,
      project: { id: "fixture-project", name: "Fixture project" },
      presets: { review: { argv: ["node", "-e", "process.exit(0)"], artifacts } },
    }, tmpdir())).toThrow()
  })

  it("keeps an explicit empty artifact list omitted and does not inherit the project catalog", async () => {
    const { project, state } = fixture()
    const ticket = enqueueExplicitTicket({
      recipe: "explicit",
      argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project",
      projectName: "Fixture project",
      cwd: project,
      stateRoot: state,
      artifacts: [],
    })

    expect(ticket.artifacts).toBeUndefined()
    expect(readEnqueuedTicket(state, ticket.id)).not.toHaveProperty("artifacts")

    await runWorker(state)

    expect(listHistoryJobs(state)[0]?.artifactsPath).toBeUndefined()
  })

  it("advertises terminal finalization and snapshot removal", async () => {
    const version = await runCli(["version", "--json"])
    expect(version.ok).toBe(true)
    if (version.ok) {
      expect(version.result).toMatchObject({ apiVersion: 1, ticketSchemaVersion: 4 })
      const capabilities = (version.result as { capabilities: string[] }).capabilities
      expect(capabilities).toEqual(expect.arrayContaining(["terminal-finalization-v1", "no-artifact-snapshots-v1", "v4-ticket-read"]))
      expect(capabilities).not.toContain("recipe-artifacts-v1")
    }
  })
})
