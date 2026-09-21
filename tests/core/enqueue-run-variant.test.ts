import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "vitest"

import { runCli } from "../../src/cli.ts"
import { enqueueExplicitTicket } from "../../src/core/enqueue.ts"
import { attachProgressToTicket, createProgressState, writeProgressSnapshot } from "../../src/core/progress.ts"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function tempPair() {
  const project = mkdtempSync(join(tmpdir(), "ci-queue-rv-project-"))
  const state = mkdtempSync(join(tmpdir(), "ci-queue-rv-state-"))
  cleanup.push(project, state)
  return { project, state }
}

describe("enqueue runVariant", () => {
  it("persists custom and focal on explicit enqueue", () => {
    const { project, state } = tempPair()
    for (const runVariant of ["custom", "focal"] as const) {
      const ticket = enqueueExplicitTicket({
        recipe: "check",
        argv: [process.execPath, "-e", "process.exit(0)"],
        projectId: "fixture-project",
        projectName: "Fixture",
        cwd: project,
        stateRoot: state,
        runVariant,
      })
      assert.equal(ticket.runVariant, runVariant)
    }
  })

  it("omits runVariant when unset", () => {
    const { project, state } = tempPair()
    const ticket = enqueueExplicitTicket({
      recipe: "check",
      argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project",
      projectName: "Fixture",
      cwd: project,
      stateRoot: state,
    })
    assert.equal(ticket.runVariant, undefined)
  })

  it("promotes a confirmed focal event from the same ticket sidecar", () => {
    const { project, state } = tempPair()
    const ticket = enqueueExplicitTicket({
      recipe: "e2e", argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project", projectName: "Fixture", cwd: project,
      stateRoot: state, runVariant: "custom",
    })
    writeProgressSnapshot(state, ticket.id, { ...createProgressState(), runVariant: "focal" })
    assert.equal(attachProgressToTicket(state, ticket).runVariant, "focal")
    assert.equal(ticket.runVariant, "custom")
  })

  it("shows the same late focal variant in CLI status as the live API", async () => {
    const { project, state } = tempPair()
    const ticket = enqueueExplicitTicket({
      recipe: "e2e", argv: [process.execPath, "-e", "process.exit(0)"],
      projectId: "fixture-project", projectName: "Fixture", cwd: project,
      stateRoot: state, runVariant: "custom",
    })
    writeFileSync(join(state, "running.json"), JSON.stringify({ ...ticket, status: "running" }))
    writeProgressSnapshot(state, ticket.id, { ...createProgressState(), runVariant: "focal" })
    const status = await runCli(["status", "--state", state, "--json"])
    assert.equal(status.ok, true)
    if (status.ok) assert.equal((status.result as { running: { runVariant: string } }).running.runVariant, "focal")
  })

  it("advertises the complete Q2/Q3 progress contract", async () => {
    const version = await runCli(["version", "--json"])
    assert.equal(version.ok, true)
    if (version.ok) assert.ok((version.result as { capabilities: string[] }).capabilities.includes("progress-q2q3-v1"))
  })

  it("rejects unknown --run-variant with USAGE", async () => {
    const { project, state } = tempPair()
    const result = await runCli([
      "enqueue",
      "--recipe",
      "check",
      "--argv-json",
      JSON.stringify([process.execPath, "-e", "process.exit(0)"]),
      "--project-id",
      "fixture-project",
      "--project-name",
      "Fixture",
      "--cwd",
      project,
      "--state",
      state,
      "--run-variant",
      "batata",
      "--json",
    ])
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.error.code, "USAGE")
    assert.equal(result.error.message, "--run-variant precisa ser custom ou focal")
  })

  it("rejects a variant without a value or an explicit recipe", async () => {
    const { project, state } = tempPair()
    for (const args of [["--run-variant"], ["--run-variant", "focal"]]) {
      const result = await runCli(["enqueue", "check", "--cwd", project, "--state", state, ...args, "--json"])
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.error.code, "USAGE")
    }
  })

  it("accepts --run-variant focal via CLI", async () => {
    const { project, state } = tempPair()
    const result = await runCli([
      "enqueue",
      "--recipe",
      "check",
      "--argv-json",
      JSON.stringify([process.execPath, "-e", "process.exit(0)"]),
      "--project-id",
      "fixture-project",
      "--project-name",
      "Fixture",
      "--cwd",
      project,
      "--state",
      state,
      "--run-variant",
      "focal",
      "--json",
    ])
    assert.equal(result.ok, true)
    if (!result.ok) return
    const ticket = (result.result as { ticket: { runVariant?: string } }).ticket
    assert.equal(ticket.runVariant, "focal")
  })
})
