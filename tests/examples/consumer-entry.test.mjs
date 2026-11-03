import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)

test('consumer API preserves explicit choice, rejects incompatible choices, and never runs commands', () => {
  const { selectExecutor, appendRecipeArgs } = require('../../consumer/index.cjs')
  assert.equal(selectExecutor({ explicit: 'direct', configured: 'queue' }), 'direct')
  assert.equal(selectExecutor({ configured: 'queue' }), 'queue')
  assert.equal(selectExecutor({ environment: 'queue', configured: 'direct' }), 'queue')
  assert.throws(() => selectExecutor({ explicit: 'auto' }), /direct.*queue/)
  assert.throws(() => selectExecutor({ environment: 'auto', explicit: 'direct' }), /direct.*queue/)
  assert.deepEqual(appendRecipeArgs(['node', 'test.js'], ['--case', 'a b']), ['node', 'test.js', '--', '--case', 'a b'])
  assert.deepEqual(appendRecipeArgs(['npm', 'test', '--'], ['--case']), ['npm', 'test', '--', '--case'])
})

test('packed consumer inspects a second project without worker, plugin or product preparation', () => {
  const root = mkdtempSync(join(tmpdir(), 'consumer-entry-'))
  try {
    const archive = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', root], { encoding: 'utf8' }))[0].filename
    execFileSync('tar', ['-xzf', join(root, archive), '-C', root])
    writeFileSync(join(root, 'ci-queue.json'), JSON.stringify({schemaVersion: 1, project: {id: 'minimal', name: 'Minimal'}, execution: {executor: 'queue'}, presets: {check: {argv: ['node', '-e', 'process.exit(99)']}}}))
    const metadata = JSON.parse(readFileSync(join(root, 'package/package.json'), 'utf8'))
    assert.equal(metadata.bin['ci-queue'], undefined, 'dependency must not shadow the installed worker launcher')
    const cli = join(root, 'package/bin/ci-queue-consumer.cjs')
    const result = spawnSync(process.execPath, [cli, 'inspect', 'check', '--executor', 'direct', '--', 'literal value'], {cwd: root, encoding: 'utf8'})
    assert.equal(result.status, 0, result.stderr)
    const plan = JSON.parse(result.stdout)
    assert.equal(plan.executor, 'direct')
    assert.equal(plan.project.id, 'minimal')
    assert.equal(plan.started, false)
    assert.deepEqual(plan.argv.slice(-2), ['--', 'literal value'])
    const incompatible = spawnSync(process.execPath, [cli, 'inspect', 'check', '--executor', 'auto'], {cwd: root, encoding: 'utf8'})
    assert.equal(incompatible.status, 2)
    assert.match(incompatible.stderr, /direct.*queue/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('consumer extension prepares and closes its own resources, retaining its report on failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'consumer-extension-'))
  try {
    const script = new URL('../../examples/local-project/scripts/extension.mjs', import.meta.url)
    for (const fail of [false, true]) {
      const result = spawnSync(process.execPath, [script.pathname, ...(fail ? ['--fail'] : [])], {cwd: root, encoding: 'utf8'})
      assert.equal(result.status, fail ? 1 : 0, result.stderr)
      const report = JSON.parse(readFileSync(join(root, 'artifacts/example/report.json'), 'utf8'))
      assert.equal(report.status, fail ? 'failed' : 'passed')
      assert.equal(report.cleanup, 'confirmed')
      assert.equal(report.schemaVersion, 1)
    }
  } finally { rmSync(root, {recursive: true, force: true}) }
})
