import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { runCli } from "../../src/cli.js"

describe("validation advisories", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function fixture() {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-advisory-project-"))
    const state = mkdtempSync(join(tmpdir(), "ci-queue-advisory-state-"))
    roots.push(project, state)
    writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
      schemaVersion: 1,
      project: { id: "example", name: "Example" },
      presets: { full: { argv: ["npm", "run", "full"] } },
    }))
    return { project, state }
  }

  it("upserts by PR through the public CLI and preserves one requirement", async () => {
    const { project, state } = fixture()
    const command = (sha: string, reason: string) => runCli([
      "advisory",
      "upsert",
      "--preset",
      "full",
      "--head-sha",
      sha,
      "--pr",
      "42",
      "--reason",
      reason,
      "--state",
      state,
      "--cwd",
      project,
      "--json",
    ])

    await expect(command("a".repeat(40), "primeiro motivo")).resolves.toMatchObject({
      ok: true,
      result: { recorded: true, projectId: "example", preset: "full" },
    })
    await expect(command("b".repeat(40), "motivo atualizado")).resolves.toMatchObject({
      ok: true,
      result: {
        requirement: { sha: "b".repeat(40), reason: "motivo atualizado", pr: 42 },
      },
    })

    const plan = JSON.parse(
      readFileSync(join(state, "state", "validation-plan.json"), "utf8"),
    )
    expect(plan.pending).toHaveLength(1)
    expect(plan.pending[0]).toMatchObject({
      projectId: "example",
      preset: "full",
      argv: ["npm", "run", "full"],
    })
    expect(plan.pending[0].requirements).toHaveLength(1)
    expect(plan.pending[0].requirements[0]).toMatchObject({
      sha: "b".repeat(40),
      reason: "motivo atualizado",
      pr: 42,
    })
  })

  it("rejects unknown presets and incomplete SHAs without writing state", async () => {
    const { project, state } = fixture()
    await expect(runCli([
      "advisory",
      "upsert",
      "--preset",
      "missing",
      "--head-sha",
      "abc",
      "--reason",
      "motivo",
      "--state",
      state,
      "--cwd",
      project,
      "--json",
    ])).resolves.toMatchObject({ ok: false, error: { code: "COMMAND_FAILED" } })
  })

  it("preserves an unreadable plan instead of replacing it", async () => {
    const { project, state } = fixture()
    const stateDirectory = join(state, "state")
    const planPath = join(stateDirectory, "validation-plan.json")
    mkdirSync(stateDirectory, { recursive: true })
    writeFileSync(planPath, "{broken", "utf8")

    await expect(runCli([
      "advisory",
      "upsert",
      "--preset",
      "full",
      "--head-sha",
      "a".repeat(40),
      "--reason",
      "motivo",
      "--state",
      state,
      "--cwd",
      project,
      "--json",
    ])).resolves.toMatchObject({ ok: false, error: { code: "COMMAND_FAILED" } })
    expect(readFileSync(planPath, "utf8")).toBe("{broken")
  })
})
