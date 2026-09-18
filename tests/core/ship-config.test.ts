import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readQueueConfig } from "../../src/contracts/config.js"

const cleanup: string[] = []
afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

function writeCatalog(project: string, body: Record<string, unknown>) {
  writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
    schemaVersion: 1,
    project: { id: "fixture-project", name: "Fixture" },
    presets: {
      check: {
        argv: [process.execPath, "-e", "process.exit(0)"],
        fetchBase: "dest/dev",
        requireCleanTree: true,
        requireGitStability: true,
        pinHeadSha: true,
      },
    },
    ...body,
  }))
}

function readCatalog(project: string, body: Record<string, unknown> = {}) {
  writeCatalog(project, body)
  return readQueueConfig(project).config
}

describe("ship catalog block", () => {
  it("parses acceptedPresets and attestationContext", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    const config = readCatalog(project, {
      ship: {
        acceptedPresets: ["check"],
        attestationContext: "local/check",
      },
    })
    expect(config.ship).toEqual({
      acceptedPresets: ["check"],
      attestationContext: "local/check",
    })
  })

  it("parses optional remoteVerdict", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    const config = readCatalog(project, {
      ship: {
        acceptedPresets: ["check"],
        attestationContext: "local/check",
        remoteVerdict: {
          workflow: ".github/workflows/ci-queue-verdict.yml",
          job: "ci-verdict",
        },
      },
    })
    expect(config.ship?.remoteVerdict).toEqual({
      workflow: ".github/workflows/ci-queue-verdict.yml",
      job: "ci-verdict",
    })
  })

  it("rejects empty acceptedPresets", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeCatalog(project, {
      ship: { acceptedPresets: [], attestationContext: "local/check" },
    })
    expect(() => readQueueConfig(project)).toThrow()
  })

  it("rejects unknown preset in acceptedPresets", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeCatalog(project, {
      ship: { acceptedPresets: ["missing"], attestationContext: "local/check" },
    })
    expect(() => readQueueConfig(project)).toThrow()
  })

  it("rejects abortOnStaleBase true without fetchBase", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
      schemaVersion: 1,
      project: { id: "fixture-project", name: "Fixture" },
      presets: {
        check: {
          argv: [process.execPath, "-e", "process.exit(0)"],
          abortOnStaleBase: true,
        },
      },
    }))
    expect(() => readQueueConfig(project)).toThrow()
  })

  it("rejects non-boolean abortOnStaleBase", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
      schemaVersion: 1,
      project: { id: "fixture-project", name: "Fixture" },
      presets: {
        check: {
          argv: [process.execPath, "-e", "process.exit(0)"],
          fetchBase: "dest/dev",
          abortOnStaleBase: "yes",
        },
      },
    }))
    expect(() => readQueueConfig(project)).toThrow()
  })

  it("rejects workflow path with ..", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeCatalog(project, {
      ship: {
        acceptedPresets: ["check"],
        attestationContext: "local/check",
        remoteVerdict: {
          workflow: ".github/workflows/../evil.yml",
          job: "ci-verdict",
        },
      },
    })
    expect(() => readQueueConfig(project)).toThrow()
  })

  it("rejects acceptedPresets whose recipe is not ship-bound", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeFileSync(join(project, "ci-queue.json"), JSON.stringify({
      schemaVersion: 1,
      project: { id: "fixture-project", name: "Fixture" },
      presets: {
        check: {
          argv: [process.execPath, "-e", "process.exit(0)"],
          fetchBase: "dest/dev",
        },
      },
      ship: { acceptedPresets: ["check"], attestationContext: "local/check" },
    }))
    expect(() => readQueueConfig(project)).toThrow(/pinHeadSha|requireCleanTree|requireGitStability/)
  })

  it("rejects empty attestationContext", () => {
    const project = mkdtempSync(join(tmpdir(), "ci-queue-project-"))
    cleanup.push(project)
    writeCatalog(project, {
      ship: { acceptedPresets: ["check"], attestationContext: "" },
    })
    expect(() => readQueueConfig(project)).toThrow()
  })
})
