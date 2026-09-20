import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { evaluateExecutionEntry } from "../../src/core/execution-entry.js"
import type { QueueProjectConfig } from "../../src/contracts/schema.js"

const config: QueueProjectConfig = {
  schemaVersion: 1,
  project: { id: "fixture", name: "Fixture" },
  presets: {
    check: {
      argv: ["npm", "run", "check"],
      requireCleanTree: true,
      fetchBase: "origin/dev",
      requireGitStability: true,
      pinHeadSha: true,
    },
  },
  execution: { executor: "queue", queue: { command: "ci-queue" } },
}

describe("execution-entry guard", () => {
  it("allows when queue executor is not required", async () => {
    const verdict = await evaluateExecutionEntry({
      config: { ...config, execution: undefined },
      stateRoot: "/tmp/missing",
      cwd: "/tmp",
      env: {},
    })
    expect(verdict).toEqual({ allowed: true, reason: "not-required" })
  })

  it("rejects bare local env without a matching running ticket", async () => {
    const root = mkdtempSync(join(tmpdir(), "ci-queue-guard-"))
    try {
      mkdirSync(join(root, "jobs"), { recursive: true })
      const verdict = await evaluateExecutionEntry({
        config,
        stateRoot: root,
        cwd: root,
        env: {},
        nowMs: (() => {
          let t = 0
          return () => (t += 200)
        })(),
        sleepMs: async () => undefined,
      })
      expect(verdict.allowed).toBe(false)
      if (!verdict.allowed) {
        expect(verdict.code).toBe("QUEUE_REQUIRED")
        expect(verdict.message).toMatch(/ci-queue enqueue check/)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows recognized GitHub Actions context", async () => {
    const root = mkdtempSync(join(tmpdir(), "ci-queue-guard-gha-"))
    try {
      const verdict = await evaluateExecutionEntry({
        config,
        stateRoot: root,
        cwd: root,
        env: {
          GITHUB_ACTIONS: "true",
          GITHUB_RUN_ID: "123",
          GITHUB_WORKSPACE: root,
        },
      })
      expect(verdict).toEqual({ allowed: true, reason: "github-actions" })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("allows matching CI_QUEUE_JOB_ID for the running ticket", async () => {
    const root = mkdtempSync(join(tmpdir(), "ci-queue-guard-job-"))
    try {
      writeFileSync(join(root, "running.json"), JSON.stringify({
        id: "job-1",
        status: "running",
        projectId: "fixture",
        cwd: root,
        preset: "check",
        argv: ["npm", "run", "check"],
      }))
      const verdict = await evaluateExecutionEntry({
        config,
        stateRoot: root,
        cwd: root,
        env: { CI_QUEUE_JOB_ID: "job-1" },
      })
      expect(verdict).toEqual({ allowed: true, reason: "queue-job" })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
