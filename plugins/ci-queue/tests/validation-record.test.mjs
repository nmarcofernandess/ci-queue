import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { addRequirement, fingerprint, initRecord, isResolved, listRecord, resolveRequirement } from "../scripts/validation-record.mjs"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const input = { preset: "full", headSha: "a".repeat(40), scope: "suite integral", reason: "Não solicitado.", pr: 42 }

function fixture(t, configured = true) {
  const root = mkdtempSync(join(tmpdir(), "ci-queue-plugin-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const record = join(root, "docs/ci/validations.json")
  const config = {
    schemaVersion: 1, project: { id: "fixture", name: "Fixture" },
    presets: { full: { argv: [process.execPath, "-e", "throw new Error('must not run')"] } },
    ...(configured ? { validationRecord: "docs/ci/validations.json" } : {}),
  }
  writeFileSync(join(root, "ci-queue.json"), JSON.stringify(config))
  return { root, record, config }
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim()
}

test("status distinguishes unconfigured, missing and valid empty without writing", t => {
  const f = fixture(t, false)
  assert.equal(listRecord(f.root).status, "unconfigured")
  assert.deepEqual(readdirSync(f.root), ["ci-queue.json"])
  f.config.validationRecord = "docs/ci/validations.json"
  writeFileSync(join(f.root, "ci-queue.json"), JSON.stringify(f.config))
  assert.equal(listRecord(f.root).status, "missing")
  assert.equal(existsSync(f.record), false)
  assert.throws(() => addRequirement(f.root, input), /ausente/)
  initRecord(f.root)
  const bytes = readFileSync(f.record, "utf8")
  assert.deepEqual(listRecord(f.root).pending, [])
  assert.equal(listRecord(f.root).status, "ready")
  assert.equal(readFileSync(f.record, "utf8"), bytes)
  assert.throws(() => initRecord(f.root), /já existe/)
})

test("registration preserves duplicate reasons and same PR without executing the recipe or creating queue state", t => {
  const f = fixture(t)
  initRecord(f.root)
  const one = addRequirement(f.root, input)
  const two = addRequirement(f.root, input)
  assert.notEqual(one.requirement.id, two.requirement.id)
  assert.equal(listRecord(f.root).pending.length, 2)
  assert.equal(existsSync(join(f.root, "state")), false)
  assert.equal(existsSync(join(f.root, "jobs")), false)
  assert.equal(existsSync(`${f.record}.lock`), false)
  assert.throws(() => addRequirement(f.root, { ...input, preset: "unknown" }), /não declarado/)
  assert.equal(listRecord(f.root).pending.length, 2)
})

test("stale closure and evidence from another scope preserve the obligation bytes", t => {
  const f = fixture(t)
  initRecord(f.root)
  const added = addRequirement(f.root, input)
  const request = { id: added.requirement.id, expected: added.fingerprint, headSha: "a".repeat(40), scope: input.scope, evidence: "ticket tested" }
  const before = readFileSync(f.record, "utf8")
  assert.throws(() => resolveRequirement(f.root, { ...request, scope: "smoke only" }), /outro escopo/)
  assert.equal(readFileSync(f.record, "utf8"), before)
  resolveRequirement(f.root, request)
  assert.equal(listRecord(f.root).pending.length, 0)
  const raw = JSON.parse(readFileSync(f.record, "utf8"))
  raw.requirements[0].headSha = "b".repeat(40)
  raw.requirements[0].scope = "suite integral e caso novo"
  writeFileSync(f.record, JSON.stringify(raw))
  assert.equal(listRecord(f.root).pending.length, 1)
  const updated = readFileSync(f.record, "utf8")
  assert.throws(() => resolveRequirement(f.root, request), /obrigação mudou/)
  assert.equal(readFileSync(f.record, "utf8"), updated)
  addRequirement(f.root, { ...input, headSha: "b".repeat(40) })
  assert.equal(listRecord(f.root).pending.length, 2)
})

test("invalid JSON/schema and paths are preserved, and options are never shell commands", t => {
  const f = fixture(t)
  mkdirSync(dirname(f.record), { recursive: true })
  writeFileSync(f.record, "{broken")
  assert.throws(() => listRecord(f.root))
  assert.throws(() => addRequirement(f.root, input))
  assert.equal(readFileSync(f.record, "utf8"), "{broken")
  const invalidUtf8 = Buffer.concat([Buffer.from('{"reason":"'), Buffer.from([0xff]), Buffer.from('"}')])
  writeFileSync(f.record, invalidUtf8)
  assert.throws(() => listRecord(f.root))
  assert.throws(() => addRequirement(f.root, input))
  assert.deepEqual(readFileSync(f.record), invalidUtf8)
  for (const path of ["../outside.json", "/tmp/outside.json", "docs\\outside.json"]) {
    writeFileSync(join(f.root, "ci-queue.json"), JSON.stringify({ ...f.config, validationRecord: path }))
    assert.throws(() => listRecord(f.root), /path relativo/)
  }
  const standalone = join(f.root, "installed-plugin")
  cpSync(packageRoot, standalone, { recursive: true })
  const result = JSON.parse(execFileSync(process.execPath, [join(standalone, "scripts/validation-record.mjs"), "help"], { cwd: f.root, encoding: "utf8" }))
  assert.equal(result.ok, true)
  assert.equal(result.result.usage.includes("list|init|add|resolve"), true)
})

test("an internal symlink keeps one editable owner through writes", t => {
  const f = fixture(t)
  initRecord(f.root)
  const alias = join(f.root, "alias.json")
  symlinkSync("docs/ci/validations.json", alias)
  writeFileSync(join(f.root, "ci-queue.json"), JSON.stringify({ ...f.config, validationRecord: "alias.json" }))
  addRequirement(f.root, input)
  assert.equal(lstatSync(alias).isSymbolicLink(), true)
  assert.equal(JSON.parse(readFileSync(f.record)).requirements.length, 1)
  assert.equal(listRecord(f.root).pending.length, 1)
  rmSync(f.record)
  assert.throws(() => initRecord(f.root), /symlink sem alvo/)
  assert.equal(lstatSync(alias).isSymbolicLink(), true)
})

test("separate worktrees transport their own obligations through ordinary Git", t => {
  const f = fixture(t)
  initRecord(f.root)
  const original = addRequirement(f.root, input)
  git(f.root, "init", "-b", "main")
  git(f.root, "config", "user.name", "Fixture")
  git(f.root, "config", "user.email", "fixture@example.invalid")
  git(f.root, "add", ".")
  git(f.root, "commit", "-m", "initial")
  const lane = join(f.root, "lane")
  git(f.root, "worktree", "add", "-b", "lane", lane)
  const newItem = addRequirement(lane, { ...input, headSha: "b".repeat(40), scope: "caso novo" })
  git(lane, "add", "docs/ci/validations.json")
  git(lane, "commit", "-m", "new obligation")
  assert.equal(listRecord(f.root).pending.length, 1)
  resolveRequirement(f.root, { id: original.requirement.id, expected: original.fingerprint, headSha: input.headSha, scope: input.scope, evidence: "old proof" })
  git(f.root, "add", "docs/ci/validations.json")
  git(f.root, "commit", "-m", "close old obligation")
  // Git may ask for a normal content reconciliation; no sync service or driver.
  try { git(f.root, "merge", "lane", "--no-edit") }
  catch {
    const closed = JSON.parse(git(f.root, "show", "HEAD:docs/ci/validations.json"))
    const newer = JSON.parse(git(f.root, "show", "lane:docs/ci/validations.json"))
    closed.requirements.push(...newer.requirements.filter(item => !closed.requirements.some(existing => existing.id === item.id)))
    writeFileSync(f.record, JSON.stringify(closed))
    git(f.root, "add", "docs/ci/validations.json")
    git(f.root, "commit", "-m", "reconcile Git conflict")
  }
  assert.deepEqual(listRecord(f.root).pending.map(item => item.id), [newItem.requirement.id])
  git(f.root, "worktree", "remove", lane)
})

test("portable and host manifests share identity and install with only package files", () => {
  const portable = JSON.parse(readFileSync(join(packageRoot, "plugin.json")))
  assert.equal(portable.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
  const listing = portable.extensions["com.openai"].interface
  assert.ok(Array.from(listing.shortDescription).length <= 30, "listing shortDescription exceeds 30 characters")
  assert.equal(listing.category, "Developer Tools")
  for (const adapter of [".codex-plugin", ".claude-plugin"]) {
    const manifest = JSON.parse(readFileSync(join(packageRoot, adapter, "plugin.json")))
    assert.equal(manifest.name, portable.name)
    assert.equal(manifest.version, portable.version)
    if (adapter === ".codex-plugin") {
      assert.equal(manifest.interface.shortDescription, listing.shortDescription)
      assert.equal(manifest.interface.category, listing.category)
    }
  }
  assert.equal(existsSync(join(packageRoot, "LICENSE")), true)
  for (const forbidden of ["hooks", "mcp.json", ".mcp.json", "settings.json", "node_modules"]) assert.equal(existsSync(join(packageRoot, forbidden)), false)
  const skills = readdirSync(join(packageRoot, "skills"))
  assert.deepEqual(skills.sort(), ["adopt", "ci-queue", "harness-retro", "operate", "validations"])
  for (const skill of skills) {
    const source = readFileSync(join(packageRoot, "skills", skill, "SKILL.md"), "utf8")
    assert.match(source, /^---\nname: [a-z-]+\ndescription: .+\n---\n/)
    for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
      assert.equal(existsSync(join(packageRoot, "skills", skill, match[1])), true, match[1])
    }
  }
  const sample = { id: "sample", preset: "full", headSha: "a".repeat(40), scope: "escopo ação", reason: "Não solicitado.", createdAt: "2026-10-26T09:00:00Z", pr: 42 }
  assert.equal(fingerprint(sample).length, 64)
  assert.equal(isResolved(sample), false)
})
