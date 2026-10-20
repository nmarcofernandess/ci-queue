import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as runtime from "../../src/core/runtime.js"

describe("session runtime authority", () => {
  it("refuses prepare outside native running job context", () => {
    const root = mkdtempSync(join(tmpdir(), "queue-session-"))
    try { expect(() => runtime.prepareSessionRuntime(root, {
      projectId: "fixture", ticketId: "20261020-120000-abcdef", sessionId: "fixture",
      producerStamp: { pid: process.pid, startedAt: "forged" }, sessionStamp: { pid: process.pid, startedAt: "forged" },
      requirementDigest: "a".repeat(64), launchBindingDigest: "b".repeat(64),
    })).toThrow(/RUNTIME_SESSION_ORIGIN/) } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it("projects uncertain private records without authority or private paths", () => {
    const root = mkdtempSync(join(tmpdir(), "queue-session-"))
    try {
      mkdirSync(join(root, "runtime-sessions"))
      writeFileSync(join(root, "runtime-sessions", "session-fixture.json"), JSON.stringify({ token: "secret", env: { SECRET: "secret" } }))
      const status = runtime.listSessionRuntimes(root)
      expect(status).toHaveLength(1)
      expect(status[0].state).toBe("unknown")
      expect(JSON.stringify(status)).not.toMatch(/secret|token|env|directory/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
