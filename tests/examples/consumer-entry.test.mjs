import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const consumerCli = new URL('../../bin/ci-queue-consumer.cjs', import.meta.url).pathname

// A host is described by PATH, HOME and the queue state variable only.
function hostFixture({ withQueue = false, withInstallation = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'consumer-host-'))
  const bin = join(root, 'bin')
  const home = join(root, 'home')
  mkdirSync(bin)
  mkdirSync(home)
  if (withQueue) {
    writeFileSync(join(bin, 'ci-queue'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(bin, 'ci-queue'), 0o755)
  }
  if (withInstallation) {
    mkdirSync(join(home, '.local/state/ci-queue'), { recursive: true })
    writeFileSync(join(home, '.local/state/ci-queue/installation.json'), '{}')
  }
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home }
  return { root, home, env }
}

function catalogFixture(root, extra = {}) {
  const project = join(root, 'project')
  mkdirSync(join(project, 'nested'), { recursive: true })
  writeFileSync(join(project, 'ci-queue.json'), JSON.stringify({
    schemaVersion: 1,
    project: { id: 'teaching', name: 'Teaching' },
    execution: { executor: 'queue', queue: { command: 'ci-queue' } },
    presets: {
      check: { argv: ['node', '-e', 'process.exit(99)'], note: 'Checagem rápida de WIP. Não é prova.' },
      'check-ship': { argv: ['node', '-e', 'process.exit(99)'], note: 'Prova de integração.', requireCleanTree: true, requireGitStability: true, pinHeadSha: true, fetchBase: 'origin/dev' },
    },
    ship: { acceptedPresets: ['check-ship'] },
    ...extra,
  }))
  return project
}

function runConsumer(cwd, args, env) {
  return spawnSync(process.execPath, [consumerCli, ...args], { cwd, env: { ...env, PATH: `${env.PATH}` }, encoding: 'utf8' })
}

test('host decides the executor and says why; the catalog preference never runs a queue that is not installed', () => {
  const { detectQueueHost, resolveExecutor } = require('../../consumer/index.cjs')
  const bare = hostFixture()
  const queueHost = hostFixture({ withQueue: true })
  const brokenHost = hostFixture({ withInstallation: true })
  try {
    const absent = detectQueueHost({ env: bare.env, home: bare.home })
    assert.equal(absent.installed, false)
    assert.deepEqual(resolveExecutor({ configured: 'queue', host: absent }).executor, 'direct')
    assert.equal(resolveExecutor({ configured: 'queue', host: absent }).reason, 'host-without-queue')

    const present = detectQueueHost({ env: queueHost.env, home: queueHost.home })
    assert.equal(present.installed, true)
    assert.match(present.evidence, /ci-queue/)
    assert.deepEqual(resolveExecutor({ configured: 'queue', host: present }), { executor: 'queue', reason: 'catalog', detail: `preferência do catálogo; ${present.evidence}` })

    // Installed but unreachable stays queue: the run fails loudly instead of silently running elsewhere.
    const installedWithoutCommand = detectQueueHost({ env: brokenHost.env, home: brokenHost.home })
    assert.equal(installedWithoutCommand.installed, true)
    assert.equal(resolveExecutor({ configured: 'queue', host: installedWithoutCommand }).executor, 'queue')

    assert.equal(resolveExecutor({ explicit: 'queue', configured: 'queue', host: absent }).reason, 'explicit')
    assert.equal(resolveExecutor({ environment: 'direct', configured: 'queue', host: present }).executor, 'direct')
    assert.equal(resolveExecutor({}).reason, 'default')
    assert.throws(() => resolveExecutor({ environment: 'auto' }), /CI_QUEUE_EXECUTOR.*direct ou queue/)
  } finally {
    for (const fixture of [bare, queueHost, brokenHost]) rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('guide teaches the two kinds of work, the host executor and what the catalog still lacks', () => {
  const host = hostFixture()
  try {
    const project = catalogFixture(host.root)
    const human = runConsumer(join(project, 'nested'), ['guide'], host.env)
    assert.equal(human.status, 0, human.stderr)
    assert.match(human.stdout, /Executor neste host: direct/)
    assert.match(human.stdout, /este host não tem CI Queue/)
    assert.match(human.stdout, /1\. Verificar/)
    assert.match(human.stdout, /2\. Integrar: ship/)
    assert.match(human.stdout, /check-ship\s+Prova de integração\. \[prova do ship\]/)
    assert.match(human.stdout, /ci-queue ship --cwd \. --config ci-queue\.json/)
    assert.match(human.stdout, /guide\.notes/)

    const plain = runConsumer(project, [], host.env)
    assert.equal(plain.stdout, human.stdout, 'no command means guide')

    const machine = JSON.parse(runConsumer(project, ['guide', '--json'], host.env).stdout)
    assert.equal(machine.executor.executor, 'direct')
    assert.equal(machine.executor.reason, 'host-without-queue')
    assert.deepEqual(machine.integrate.proofRecipes, ['check-ship'])
    assert.equal(machine.missing.length, 3)
  } finally { rmSync(host.root, { recursive: true, force: true }) }
})

test('repository teachings come from its catalog; the tool keeps the generic ones', () => {
  const host = hostFixture({ withQueue: true })
  try {
    const project = catalogFixture(host.root, {
      guide: { verify: 'npm run ci:run -- <receita>', notes: ['Use check durante a autoria.'] },
      ship: { acceptedPresets: ['check-ship'], command: 'npm run ship', notes: ['Base movida: incorpore a base e rode o ship de novo.'] },
    })
    const result = JSON.parse(runConsumer(project, ['guide', '--json'], host.env).stdout)
    assert.equal(result.executor.executor, 'queue')
    assert.equal(result.verify.entry, 'npm run ci:run -- <receita>')
    assert.equal(result.integrate.entry, 'npm run ship')
    assert.deepEqual(result.teachings.repository, ['Use check durante a autoria.'])
    assert.deepEqual(result.integrate.notes, ['Base movida: incorpore a base e rode o ship de novo.'])
    assert.ok(result.teachings.tool.length >= 3)
    assert.deepEqual(result.missing, [])

    const inspected = JSON.parse(runConsumer(project, ['inspect', 'check'], host.env).stdout)
    assert.equal(inspected.executor, 'queue')
    assert.equal(inspected.executorReason, 'catalog')
    assert.equal(inspected.next, 'npm run ci:run -- check')
    assert.equal(inspected.shipProof, false)
    assert.equal(inspected.started, false)
    const proof = JSON.parse(runConsumer(project, ['inspect', 'check-ship'], host.env).stdout)
    assert.equal(proof.shipProof, true)
    assert.equal(proof.next, 'npm run ship', 'the ship produces its own proof')

    const wrongTeaching = catalogFixture(host.root, { guide: { notes: 'uma frase solta' } })
    const invalid = runConsumer(wrongTeaching, ['guide'], host.env)
    assert.equal(invalid.status, 2)
    assert.match(invalid.stderr, /guide\.notes deve ser uma lista/)
  } finally { rmSync(host.root, { recursive: true, force: true }) }
})

test('errors teach the next step instead of only refusing', () => {
  const host = hostFixture()
  try {
    const project = catalogFixture(host.root)
    const missingRecipe = runConsumer(project, ['inspect', 'nao-existe'], host.env)
    assert.equal(missingRecipe.status, 2)
    assert.match(missingRecipe.stderr, /Receitas deste catálogo: check, check-ship/)
    assert.match(missingRecipe.stderr, /ci-queue-consumer guide/)

    const unknownCommand = runConsumer(project, ['run'], host.env)
    assert.equal(unknownCommand.status, 2)
    assert.match(unknownCommand.stderr, /ci-queue-consumer guide/)

    const outside = runConsumer(host.home, ['guide'], host.env)
    assert.equal(outside.status, 2)
    assert.match(outside.stderr, /CONSUMER-QUICKSTART/)
  } finally { rmSync(host.root, { recursive: true, force: true }) }
})

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
