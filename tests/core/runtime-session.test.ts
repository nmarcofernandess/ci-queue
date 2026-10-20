import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, lstatSync, realpathSync, readdirSync } from "node:fs"
import { hostname, tmpdir } from "node:os"
import { join } from "node:path"
import * as runtime from "../../src/core/runtime.js"

describe("session runtime authority", () => {
  it("refuses prepare outside native running job context", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
    try { expect(() => runtime.prepareSessionRuntime(root, {
      projectId: "fixture", ticketId: "20261020-120000-abcdef", sessionId: "fixture",
      producerStamp: { pid: process.pid, startedAt: "forged" }, sessionStamp: { pid: process.pid, startedAt: "forged" },
      requirementDigest: "a".repeat(64), launchBindingDigest: "b".repeat(64),
    })).toThrow(/RUNTIME_SESSION_ORIGIN/) } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it("projects uncertain private records without authority or private paths", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
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

it("keeps incomplete session publication visible as unknown", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
  try {
    mkdirSync(join(root, "runtime-sessions"), { mode: 0o700 })
    mkdirSync(join(root, "runtime-sessions", "session-fixture.lock"), { mode: 0o700 })
    expect(runtime.listSessionRuntimes(root)).toEqual([{
      projectId: "unknown", sessionId: "unknown", state: "unknown", pid: 0, startedAt: "", stateRevision: 0,
    }])
  } finally { rmSync(root, { recursive: true, force: true }) }
})


it.each(["recovery", "evidencePath", "token", "nodeVersion"])("keeps corrupted released %s authority uncertain", (field) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
  try {
    const catalog = join(root, "runtime-sessions")
    mkdirSync(catalog, { mode: 0o700 })
    const { uid, ino, dev } = lstatSync(catalog)
    const directory = join(root, "runtime", "session-fixture")
    const group = { hostname: hostname(), leaderPid: 999999, pgid: 999999, startedAt: "fixture" }
    const r = {
      schemaVersion: 1, runtimeId: "session-fixture", sessionId: "fixture", ticketId: "fixture", projectId: "example",
      token: "a".repeat(64), bindingDigest: "b".repeat(64), requirementDigest: "c".repeat(64),
      directory, directoryIdentity: { uid, ino: 1, dev }, catalogIdentity: { uid, ino, dev }, owner: group, producer: group,
      groups: [group], evidenceOffset: 0, state: "released", stateRevision: 3, env: {},
      receipt: { capability: "node-runtime-guard-v1", coverage: "guarded-node-processes", state: "prepared", observations: [],
        evidencePath: join(directory, "processes.jsonl"), requirementDigest: "c".repeat(64),
        node: { executable: process.execPath, version: process.versions.node, sha256: "d".repeat(64) } },
    }
    const file = join(catalog, "session-fixture.json")
    writeFileSync(file, JSON.stringify(r), { mode: 0o600 })
    expect(runtime.listSessionRuntimes(root)).toEqual([])
    const corrupted = field === "recovery" ? { ...r, recovery: { operationId: "incomplete" } }
      : field === "token" ? { ...r, token: [r.token] }
      : field === "nodeVersion" ? { ...r, receipt: { ...r.receipt, node: { ...r.receipt.node, version: [r.receipt.node.version] } } }
      : { ...r, receipt: { ...r.receipt, evidencePath: "/private/not-this-runtime" } }
    writeFileSync(file, JSON.stringify(corrupted), { mode: 0o600 })
    expect(runtime.listSessionRuntimes(root)[0]?.state).toBe("unknown")
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it.each(["mode", "originalSession", "originalBinding", "revision", "actorPid", "handleToken", "prepareStamp"])(
  "rejects malformed %s input before consulting or writing the session owner", (field) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "queue-session-")))
    try {
      const stamp = { pid: process.pid, pgid: process.pid, startedAt: "fixture" }
      const original = { runtimeId: "session-fixture", projectId: "example", sessionId: "fixture", bindingDigest: "b".repeat(64), expectedStateRevision: 1 }
      const recovery = { mode: "recover", root, operationId: "fixture", original, recoveryOwnerStamp: stamp }
      const malformed = field === "mode" ? { ...recovery, mode: ["recover"] }
        : field === "originalSession" ? { ...recovery, original: { ...original, sessionId: ["fixture"] } }
        : field === "originalBinding" ? { ...recovery, original: { ...original, bindingDigest: [original.bindingDigest] } }
        : field === "revision" ? { ...recovery, original: { ...original, expectedStateRevision: [1] } }
        : { ...recovery, recoveryOwnerStamp: { ...stamp, pid: [stamp.pid] } }
      const action = field === "handleToken" ? () => runtime.checkpointSessionRuntime({
        schemaVersion: 1, root, runtimeId: "session-fixture", projectId: "example", sessionId: "fixture", bindingDigest: original.bindingDigest,
        token: ["a".repeat(64)], directory: join(root, "runtime", "session-fixture"), env: {},
      } as never) : field === "prepareStamp" ? () => runtime.prepareSessionRuntime(root, {
        projectId: "example", ticketId: "fixture", sessionId: "fixture", requirementDigest: "c".repeat(64), launchBindingDigest: original.bindingDigest,
        producerStamp: { pid: [process.pid], startedAt: "fixture" }, sessionStamp: stamp,
      } as never) : () => runtime.releaseSessionRuntime(malformed as never)
      expect(action).toThrow(/RUNTIME_SESSION_INVALID/)
      expect(readdirSync(root)).toEqual([])
    } finally { rmSync(root, { recursive: true, force: true }) }
  },
)
