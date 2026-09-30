import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runCli } from "../../src/cli.js"
import { readQueueConfig } from "../../src/contracts/config.js"
import { InitError, initProject } from "../../src/ship/init.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

const GIT_ENV = (() => {
  const env = {
    ...process.env,
    LC_ALL: "C",
    LANG: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  }
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete env[key]
  }
  return env
})()

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ARGV = ["python", "-m", "pytest", "-q"]

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function configureRepo(cwd: string) {
  git(cwd, ["config", "user.email", "ci-queue@example.invalid"])
  git(cwd, ["config", "user.name", "CI Queue test"])
  git(cwd, ["config", "gc.auto", "0"])
}

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  cleanup.push(path)
  return path
}

function gitCommonDir(cwd: string): string {
  const raw = git(cwd, ["rev-parse", "--git-common-dir"])
  return realpathSync(raw.startsWith("/") ? raw : join(cwd, raw))
}

function initGitRepo(options: { remote?: string } = {}): string {
  const cwd = tempDir("ci-queue-init-repo-")
  git(cwd, ["init", "-b", "dev"])
  configureRepo(cwd)
  writeFileSync(join(cwd, "README.md"), "fixture\n")
  git(cwd, ["add", "README.md"])
  git(cwd, ["commit", "-m", "init"])
  git(cwd, ["remote", "add", options.remote ?? "dest", cwd])
  return cwd
}

function addWorktree(repo: string, name: string): string {
  const path = join(dirname(repo), `${name}-${Math.random().toString(16).slice(2)}`)
  git(repo, ["worktree", "add", "-b", name, path])
  cleanup.push(path)
  return path
}

function writeRegistry(
  stateRoot: string,
  projects: Record<string, { gitCommonDir: string; repositoryPath: string }>,
) {
  mkdirSync(join(stateRoot, "state"), { recursive: true })
  writeFileSync(
    join(stateRoot, "state", "projects.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      bootstrapProjectId: Object.keys(projects)[0] ?? null,
      projects: Object.fromEntries(
        Object.entries(projects).map(([id, locators]) => [
          id,
          {
            id,
            displayName: id,
            repositoryPath: locators.repositoryPath,
            gitCommonDir: locators.gitCommonDir,
            configPath: null,
            archivedAt: null,
            revision: 1,
            createdAt: "2026-09-17T00:00:00.000Z",
            updatedAt: "2026-09-17T00:00:00.000Z",
          },
        ]),
      ),
    })}\n`,
  )
}

function readCatalogFile(cwd: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(cwd, "ci-queue.json"), "utf8")) as Record<string, unknown>
}

describe("ci-queue init", () => {
  it("writes a ship-bound catalog from argv and base without inventing origin/dev", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")

    const result = await initProject(repo, {
      stateRoot: state,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/dev",
    })

    expect(result.state).toBe("created")
    expect(result.projectId).toMatch(UUID_V4)
    expect(realpathSync(result.configPath)).toBe(realpathSync(join(repo, "ci-queue.json")))
    expect(result.files).toEqual(["ci-queue.json"])
    expect(result.dashboardRegistration).toBe("manual-binding-required")
    expect(existsSync(join(state, "state", "projects.json"))).toBe(false)

    const raw = readCatalogFile(repo)
    const config = readQueueConfig(repo).config
    expect(config.project.id).toBe(result.projectId)
    expect(config.project.name).toBe("Fixture")
    expect(config.repository).toEqual({ path: ".", baseRef: "dest/dev" })
    expect(config.presets.check).toEqual({
      argv: ARGV,
      progress: true,
      requireCleanTree: true,
      fetchBase: "dest/dev",
      requireGitStability: true,
      pinHeadSha: true,
      abortOnStaleBase: false,
    })
    expect(config.ship).toEqual({
      acceptedPresets: ["check"],
      attestationContext: "local/check",
    })
    expect(JSON.stringify(raw)).not.toContain("origin/dev")
    expect(JSON.stringify(raw)).not.toContain("npm")
  })

  it("refuses a Python/Go tree without npm check and without --argv-json", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    writeFileSync(join(repo, "main.py"), "print('hi')\n")
    writeFileSync(join(repo, "go.mod"), "module example.com/fixture\n")

    await expect(initProject(repo, { stateRoot: state, baseRef: "dest/dev" })).rejects.toMatchObject({
      name: "InitError",
      code: "ARGV_REQUIRED",
    })
    expect(existsSync(join(repo, "ci-queue.json"))).toBe(false)
  })

  it("defaults argv to npm run check only when package.json declares that script", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { check: "node ./check.mjs" } }),
    )

    const result = await initProject(repo, { stateRoot: state, name: "Npm", baseRef: "dest/dev" })
    expect(result.state).toBe("created")
    expect(readQueueConfig(repo).config.presets.check.argv).toEqual(["npm", "run", "check"])
  })

  it("refuses npm check inference when another package manager is present", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { check: "node ./check.mjs" } }),
    )
    writeFileSync(join(repo, "go.mod"), "module example.com/fixture\n")

    await expect(initProject(repo, { stateRoot: state, baseRef: "dest/dev" })).rejects.toMatchObject({
      name: "InitError",
      code: "ARGV_REQUIRED",
    })
  })

  it("returns already-initialized for an unchanged valid catalog and errors on requested change", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    const created = await initProject(repo, {
      stateRoot: state,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/dev",
    })
    const before = readFileSync(join(repo, "ci-queue.json"), "utf8")

    const again = await initProject(repo, { stateRoot: state, argv: ARGV, baseRef: "dest/dev" })
    expect(again).toMatchObject({
      state: "already-initialized",
      projectId: created.projectId,
      files: [],
    })
    expect(readFileSync(join(repo, "ci-queue.json"), "utf8")).toBe(before)

    await expect(
      initProject(repo, { stateRoot: state, name: "Renamed", argv: ARGV, baseRef: "dest/dev" }),
    ).rejects.toMatchObject({ name: "InitError", code: "CONFIG_EXISTS" })
    expect(readFileSync(join(repo, "ci-queue.json"), "utf8")).toBe(before)
  })

  it("preserves project.id, extra presets and unknown keys on --force", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    const created = await initProject(repo, {
      stateRoot: state,
      name: "Fixture",
      argv: ARGV,
      baseRef: "dest/dev",
    })
    const extra = readCatalogFile(repo)
    extra.execution = { executor: "queue" }
    extra.presets = {
      ...(extra.presets as object),
      other: { argv: ["make", "lint"], note: "keep me" },
    }
    extra.ship = {
      ...(extra.ship as object),
      acceptedPresets: ["check"],
    }
    extra.presets = {
      ...(extra.presets as Record<string, unknown>),
      check: {
        ...((extra.presets as Record<string, unknown>).check as object),
        abortOnStaleBase: true,
        note: "operator flag",
      },
    }
    writeFileSync(join(repo, "ci-queue.json"), `${JSON.stringify(extra, null, 2)}\n`)

    const updated = await initProject(repo, {
      stateRoot: state,
      force: true,
      name: "Renamed",
      argv: ["go", "test", "./..."],
      baseRef: "dest/dev",
    })

    expect(updated.state).toBe("updated")
    expect(updated.projectId).toBe(created.projectId)
    const raw = readCatalogFile(repo)
    expect(raw.execution).toEqual({ executor: "queue" })
    expect((raw.project as { id: string; name: string }).id).toBe(created.projectId)
    expect((raw.project as { name: string }).name).toBe("Renamed")
    const presets = raw.presets as Record<string, Record<string, unknown>>
    expect(presets.other).toEqual({ argv: ["make", "lint"], note: "keep me" })
    expect(presets.check.argv).toEqual(["go", "test", "./..."])
    expect(presets.check.abortOnStaleBase).toBe(true)
    expect(presets.check.note).toBe("operator flag")
    expect((raw.ship as { acceptedPresets: string[] }).acceptedPresets).toEqual(["check"])
  })

  it("reuses one identity across worktrees and refuses two", async () => {
    const primary = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    const linked = addWorktree(primary, "feature")
    const created = await initProject(primary, {
      stateRoot: state,
      name: "Primary",
      argv: ARGV,
      baseRef: "dest/dev",
    })

    const reused = await initProject(linked, {
      stateRoot: state,
      name: "Linked",
      argv: ARGV,
      baseRef: "dest/dev",
    })
    expect(reused.projectId).toBe(created.projectId)
    expect(existsSync(join(linked, "ci-queue.json"))).toBe(true)
    expect(readQueueConfig(linked).config.project.id).toBe(created.projectId)

    const conflicted = addWorktree(primary, "conflict")
    writeFileSync(
      join(conflicted, "ci-queue.json"),
      JSON.stringify({
        schemaVersion: 1,
        project: { id: "other-identity", name: "Other" },
        presets: { check: { argv: ARGV } },
      }),
    )
    const third = addWorktree(primary, "third")
    await expect(
      initProject(third, { stateRoot: state, name: "Third", argv: ARGV, baseRef: "dest/dev" }),
    ).rejects.toMatchObject({ name: "InitError", code: "IDENTITY_CONFLICT" })
    expect(existsSync(join(third, "ci-queue.json"))).toBe(false)
  })

  it("does not treat invalid JSON on disk as absent", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    writeFileSync(join(repo, "ci-queue.json"), "{not-json")
    await expect(
      initProject(repo, { stateRoot: state, force: true, argv: ARGV, baseRef: "dest/dev" }),
    ).rejects.toMatchObject({ name: "InitError", code: "CONFIG_INVALID" })
    expect(readFileSync(join(repo, "ci-queue.json"), "utf8")).toBe("{not-json")

    rmSync(join(repo, "ci-queue.json"))
    mkdirSync(join(state, "state"), { recursive: true })
    writeFileSync(join(state, "state", "projects.json"), "{broken")
    await expect(
      initProject(repo, { stateRoot: state, argv: ARGV, baseRef: "dest/dev" }),
    ).rejects.toMatchObject({ name: "InitError", code: "REGISTRY_UNREADABLE" })
    expect(existsSync(join(repo, "ci-queue.json"))).toBe(false)
    expect(readFileSync(join(state, "state", "projects.json"), "utf8")).toBe("{broken")
  })

  it("writes the current worktree instead of a recorded primary clone", async () => {
    const primary = initGitRepo()
    const linked = addWorktree(primary, "lane")
    const state = tempDir("ci-queue-init-state-")
    writeRegistry(state, {
      "registered-id": {
        gitCommonDir: gitCommonDir(primary),
        repositoryPath: primary,
      },
    })
    const registryBefore = readFileSync(join(state, "state", "projects.json"), "utf8")

    const result = await initProject(linked, {
      stateRoot: state,
      name: "Lane",
      argv: ARGV,
      baseRef: "dest/dev",
    })

    expect(result.projectId).toBe("registered-id")
    expect(result.dashboardRegistration).toBe("existing")
    expect(realpathSync(result.configPath)).toBe(realpathSync(join(linked, "ci-queue.json")))
    expect(existsSync(join(primary, "ci-queue.json"))).toBe(false)
    expect(realpathSync(readQueueConfig(linked).executionCwd)).toBe(realpathSync(linked))
    expect(readFileSync(join(state, "state", "projects.json"), "utf8")).toBe(registryBefore)
  })

  it("treats --workflow as a requested change on an existing catalog", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    mkdirSync(join(repo, ".github", "workflows"), { recursive: true })
    writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "name: consumer\n")
    await initProject(repo, {
      stateRoot: state,
      argv: ARGV,
      baseRef: "dest/dev",
    })
    const before = readFileSync(join(repo, "ci-queue.json"), "utf8")

    await expect(
      initProject(repo, {
        stateRoot: state,
        workflow: true,
        argv: ARGV,
        baseRef: "dest/dev",
      }),
    ).rejects.toMatchObject({ name: "InitError", code: "CONFIG_EXISTS" })
    expect(readFileSync(join(repo, "ci-queue.json"), "utf8")).toBe(before)
    expect(existsSync(join(repo, ".github", "workflows", "ci-queue-verdict.yml"))).toBe(false)
    expect(readFileSync(join(repo, ".github", "workflows", "ci.yml"), "utf8")).toBe("name: consumer\n")
  })

  it("wires ci-queue init on the CLI", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    const result = await runCli([
      "init",
      "--cwd",
      repo,
      "--state",
      state,
      "--name",
      "From CLI",
      "--argv-json",
      JSON.stringify(ARGV),
      "--base-ref",
      "dest/dev",
      "--json",
    ])
    expect(result).toMatchObject({
      apiVersion: 1,
      ok: true,
      result: {
        state: "created",
        dashboardRegistration: "manual-binding-required",
        files: ["ci-queue.json"],
      },
    })
    if (!result.ok) throw new Error(result.error.message)
    const payload = result.result as { projectId: string; configPath: string }
    expect(payload.projectId).toMatch(UUID_V4)
    expect(readQueueConfig(repo).config.presets.check.argv).toEqual(ARGV)
    expect(existsSync(join(state, "state", "projects.json"))).toBe(false)
  })

  it("does not default origin/dev when HEAD has no configured upstream", async () => {
    const repo = initGitRepo()
    const state = tempDir("ci-queue-init-state-")
    await expect(initProject(repo, { stateRoot: state, argv: ARGV })).rejects.toMatchObject({
      name: "InitError",
      code: "BASE_REF_REQUIRED",
    })
    expect(existsSync(join(repo, "ci-queue.json"))).toBe(false)
  })
})

describe("InitError", () => {
  it("is constructible for named CLI mapping", () => {
    const error = new InitError("CONFIG_EXISTS", "ci-queue.json já existe")
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe("CONFIG_EXISTS")
  })
})
