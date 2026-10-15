import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { enqueueExplicitTicket, enqueueTicket } from "../../src/core/enqueue.js"
import { parseTicket } from "../../src/core/runner.js"
import { runCli } from "../../src/cli.js"
import type { ExplicitEnqueueInput } from "../../src/core/enqueue.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const hash = (text: string) => createHash("sha256").update(text).digest("hex")
function spec(contract: unknown = { b: 2, a: 1 }) {
  return { schemaVersion: 1, argv: ["node", "finish.mjs"], timeoutMs: 120000, contract, contractDigest: hash('{"a":1,"b":2}') }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cq-finalization-contract-"))
  roots.push(root)
  return { recipe: "focal", argv: [process.execPath, "-e", "process.exit(0)"], projectId: "fixture", projectName: "Fixture", cwd: root, stateRoot: join(root, "state") }
}
function enqueue(finalization: unknown) {
  return enqueueExplicitTicket({ ...fixture(), finalization } as ExplicitEnqueueInput)
}

describe("frozen terminal finalization contract", () => {
  it("freezes valid finalization with independently calculated canonical digests", () => {
    const ticket = enqueue(spec()) as ReturnType<typeof enqueue> & { finalization?: unknown; finalizationDigest?: string }
    expect(ticket).toMatchObject({ schemaVersion: 4, finalization: spec() })
    expect(ticket.finalizationDigest).toBe(hash('{"argv":["node","finish.mjs"],"contract":{"a":1,"b":2},"contractDigest":"' + spec().contractDigest + '","schemaVersion":1,"timeoutMs":120000}'))
    expect(JSON.parse(readFileSync(join(ticket.cwd, "state", "jobs", `${ticket.id}.json`), "utf8"))).toMatchObject({ finalization: spec() })
  })

  it.each([0, NaN, -1, 1.5, 2147483648])("rejects invalid finalization timeout %s", (timeoutMs) => {
    expect(() => enqueue({ ...spec(), timeoutMs })).toThrow(/timeoutMs/)
  })
  it("rejects empty argv", () => { expect(() => enqueue({ ...spec(), argv: [] })).toThrow(/argv/) })
  it("rejects oversized UTF-8 contract", () => {
    const contract = "é".repeat(32768)
    expect(() => enqueue({ ...spec(contract), contractDigest: hash(JSON.stringify(contract)) })).toThrow(/64|tamanho|size/)
  })
  it.each([Infinity, undefined, new Date(), { missing: undefined }, [NaN]])("rejects non-JSON contract %#", (contract) => {
    expect(() => enqueue({ ...spec(contract), contract })).toThrow(/JSON|contract/)
  })
  it("rejects tampered contract digest", () => {
    expect(() => enqueue({ ...spec(), contractDigest: "0".repeat(64) })).toThrow(/digest|Digest/)
  })
  it("canonicalizes object key order while preserving array order", () => {
    const first = enqueue(spec()) as ReturnType<typeof enqueue> & { finalizationDigest?: string }
    const second = enqueue(spec({ a: 1, b: 2 })) as typeof first
    expect(first.finalizationDigest).toBeTruthy()
    expect(first.finalizationDigest).toBe(second.finalizationDigest)
    const a = enqueue({ ...spec([1, 2]), contractDigest: hash("[1,2]") }) as typeof first
    const b = enqueue({ ...spec([2, 1]), contractDigest: hash("[2,1]") }) as typeof first
    expect(a.finalizationDigest).not.toBe(b.finalizationDigest)
  })
  it("uses the same recursive key ordering for nested contract objects", () => {
    const contractDigest = hash('{"nested":{"a":1,"z":2}}')
    const a = enqueue({ ...spec({ nested: { z: 2, a: 1 } }), contractDigest })
    const b = enqueue({ ...spec({ nested: { a: 1, z: 2 } }), contractDigest })
    expect(a.finalizationDigest).toBeTruthy()
    expect(a.finalizationDigest).toBe(b.finalizationDigest)
  })
  it("accepts the exact contract byte limit and timeout boundaries", () => {
    const contract = "a".repeat(65534)
    const contractDigest = hash(JSON.stringify(contract))
    for (const timeoutMs of [1, 2147483647]) {
      expect(enqueue({ ...spec(contract), contractDigest, timeoutMs })).toMatchObject({ finalization: { contract, timeoutMs } })
    }
  })
  it("seals argv and timeout and rejects a tampered persisted ticket", () => {
    const ticket = enqueue(spec())
    for (const finalization of [{ ...spec(), argv: ["node", "other.mjs"] }, { ...spec(), timeoutMs: 10 }]) {
      expect(parseTicket({ ...ticket, finalization } as typeof ticket)).toHaveProperty("rejectReason")
    }
  })
  it("keeps the enqueued catalog contract unchanged after catalog mutation", () => {
    const input = fixture()
    const path = join(input.cwd, "ci-queue.json")
    const config = { schemaVersion: 1, project: { id: "fixture", name: "Fixture" }, presets: { focal: { argv: input.argv, finalization: spec() } } }
    writeFileSync(path, JSON.stringify(config))
    const ticket = enqueueTicket({ preset: "focal", cwd: input.cwd, stateRoot: input.stateRoot })
    config.presets.focal.finalization.timeoutMs = 25
    writeFileSync(path, JSON.stringify(config))
    expect(JSON.parse(readFileSync(join(input.stateRoot, "jobs", `${ticket.id}.json`), "utf8"))).toMatchObject({ finalization: { timeoutMs: 120000 } })
  })
  it("accepts --finalization-json in explicit CLI enqueue", async () => {
    const input = fixture()
    const result = await runCli(["enqueue", "--recipe", "focal", "--argv-json", JSON.stringify(input.argv), "--project-id", "fixture", "--project-name", "Fixture", "--cwd", input.cwd, "--state", input.stateRoot, "--finalization-json", JSON.stringify(spec()), "--json"])
    expect(result).toMatchObject({ ok: true, result: { ticket: { schemaVersion: 4, finalization: spec() } } })
  })
})
