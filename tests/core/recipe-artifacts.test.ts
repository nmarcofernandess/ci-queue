import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { parseQueueConfig, readQueueConfig } from "../../src/contracts/config.js"
import { runCli } from "../../src/cli.js"
import { buildTicket, enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import { listHistoryJobs, queuePaths } from "../../src/core/state.js"
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
  it("inherits global artifacts when absent and replaces them when declared", () => {
    const inherited = fixture()
    const inheritedTicket = buildTicket({ preset: "review", cwd: inherited.project, stateRoot: inherited.state })
    expect(inheritedTicket.artifacts).toEqual(["old-proofs"])

    const replaced = fixture(["current-proof"])
    const replacedTicket = buildTicket({ preset: "review", cwd: replaced.project, stateRoot: replaced.state })
    expect(replacedTicket.artifacts).toEqual(["current-proof"])
  })

  it("preserves legacy global artifact paths when the recipe has no override", () => {
    const { project, state } = fixture()
    const configPath = join(project, "ci-queue.json")
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { artifacts?: string[] }
    config.artifacts = ["old-proofs", "/legacy/global-path"]
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

    const ticket = buildTicket({ preset: "review", cwd: project, stateRoot: state })

    expect(ticket.artifacts).toEqual(["old-proofs", "/legacy/global-path"])
  })

  it("serializes an empty recipe override and skips global capture", async () => {
    const { project, state } = fixture([])
    const ticket = enqueueTicket({ preset: "review", cwd: project, stateRoot: state })

    expect(ticket.artifacts).toEqual([])
    expect(readEnqueuedTicket(state, ticket.id).artifacts).toEqual([])

    await runWorker(state)

    const terminal = listHistoryJobs(state)[0]
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed" })
    expect(terminal?.artifactsPath).toBeUndefined()
  })

  it("copies only the current recipe artifacts into the ticket snapshot", async () => {
    const { project, state } = fixture(["current-proof"])
    const ticket = enqueueTicket({ preset: "review", cwd: project, stateRoot: state })

    expect(readEnqueuedTicket(state, ticket.id).artifacts).toEqual(["current-proof"])

    await runWorker(state)

    const terminal = listHistoryJobs(state)[0]
    const snapshot = join(state, "artifacts", ticket.id)
    expect(terminal).toMatchObject({ id: ticket.id, status: "passed", artifactsPath: snapshot })
    expect(readFileSync(join(snapshot, "current-proof", "receipt.txt"), "utf8")).toBe("current receipt\n")
    expect(existsSync(join(snapshot, "old-proofs", "sentinel.txt"))).toBe(false)
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

  it("advertises recipe artifact resolution support", async () => {
    const version = await runCli(["version", "--json"])
    expect(version.ok).toBe(true)
    if (version.ok) {
      expect((version.result as { capabilities: string[] }).capabilities).toContain("recipe-artifacts-v1")
    }
  })
})
