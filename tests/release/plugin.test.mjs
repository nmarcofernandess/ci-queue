// The same package suite runs standalone and in the product's canonical check.
import "../../plugins/ci-queue/tests/validation-record.test.mjs"

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("both repo marketplaces point to the self-contained package", () => {
  const read = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url)))
  const codex = read(".agents/plugins/marketplace.json")
  const claude = read(".claude-plugin/marketplace.json")
  assert.equal(codex.name, claude.name)
  assert.deepEqual(codex.plugins[0].source, { source: "local", path: "./plugins/ci-queue" })
  assert.equal(codex.plugins[0].policy.installation, "AVAILABLE")
  assert.equal(claude.plugins[0].source, "./plugins/ci-queue")
})
