import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildRelease, verifyRelease } from '../../scripts/release.mjs'
import { installRelease, uninstallRelease } from '../../scripts/install.mjs'
import { normalizeFinalizationResult, FINALIZATION_JSON_MAX_BYTES } from '../../dist/contracts/schema.js'
import { readFinalization, serializedJson } from '../../dist/core/state.js'

const revision = 'a'.repeat(40)
const protocol = { apiVersion: 1, ticketSchemaVersion: 4, capabilities: ['terminal-finalization-v1', 'no-artifact-snapshots-v1', 'recoverable-finalization-v1', 'node-runtime-session-v1'] }
const components = { launcher: ['bin/ci-queue.mjs'], worker: ['dist/cli.js'], api: ['backend/ci_queue_api/__main__.py'], ui: ['ui/dist/index.html'] }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ci-queue-finalization-install-'))
  const put = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes) }
  put('package.json', JSON.stringify({ version: '0.1.0', type: 'module' }))
  for (const path of ['package-lock.json', 'LICENSE', 'README.md', 'scripts/install.mjs', 'scripts/release.mjs', 'scripts/legacy-projects.mjs', 'scripts/ci/verify-local-attestation.sh', 'scripts/ci/check-with-progress.sh', 'scripts/ci/test-suite.sh', 'scripts/progress-emit.sh', 'docs/INSTALL.md', 'templates/github/ci-queue-verdict.yml', 'examples/local-project/ci-queue.json', ...Object.values(components).flat()]) put(path, path)
  const stamp = (component, overrides = {}) => {
    const files = components[component].map(path => { const bytes = readFileSync(join(root, path)); return { path, bytes: bytes.length, sha256: hash(bytes) } })
    put(`build-provenance/${component}.json`, JSON.stringify({ schemaVersion: 1, component, revision, protocol, files, ...overrides }))
  }
  for (const component of Object.keys(components)) stamp(component)
  const build = () => buildRelease({ root, outputDir: join(root, 'bundles'), revision }).destination
  return { root, stamp, put, build, prefix: join(root, 'prefix'), stateRoot: join(root, 'state') }
}

test('release rejects a newly advertised revision with an older worker or API', () => {
  for (const component of ['worker', 'api']) {
    const f = fixture()
    try { f.stamp(component, { revision: 'b'.repeat(40) }); assert.throws(f.build, /migração|revisão|revision/i) }
    finally { rmSync(f.root, { recursive: true, force: true }) }
  }
})
test('release rejects missing finalization capabilities and stale compiled bytes', () => {
  for (const problem of ['capabilities', 'bytes']) {
    const f = fixture()
    try {
      if (problem === 'capabilities') f.stamp('api', { protocol: { ...protocol, capabilities: [] } })
      else f.put('dist/cli.js', 'older executable')
      assert.throws(f.build, /migração|protocol|integridade|build/i)
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  }
})
test('verification rejects a component substitution even when the outer file manifest was recomputed', () => {
  const f = fixture()
  try {
    const bundle = f.build(), path = join(bundle, 'dist/cli.js'), manifestPath = join(bundle, 'manifest.json')
    writeFileSync(path, 'older worker')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const entry = manifest.files.find(entry => entry.path === 'dist/cli.js')
    entry.bytes = readFileSync(path).length; entry.sha256 = hash(readFileSync(path))
    writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.throws(() => verifyRelease(bundle), /integridade|build|protocolo/i)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
for (const phase of ['pending', 'running', 'interrupted', 'malformed', 'cleanup-uncertain']) test(`${phase} historical finalization permits maintenance without touching its state`, () => {
  const f = fixture()
  try {
    const bundle = f.build(); installRelease({ ...f, bundle })
    const path = `state/state/finalization/job.json`
    const value = phase === 'malformed' ? '{' : JSON.stringify({ schemaVersion: 1, ticketId: 'job', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1, phase: phase === 'cleanup-uncertain' ? 'failed' : phase, ...(phase === 'cleanup-uncertain' ? { finishedAt: '2026-10-17T00:00:00Z', result: { schemaVersion: 1, cleanup: 'uncertain', outputs: [] } } : {}) })
    f.put(path, value)
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    uninstallRelease({ prefix: f.prefix })
    assert.equal(readFileSync(join(f.root, path), 'utf8'), value)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('terminal-cleanup-warning-allows-update without discarding terminal or residual files', () => {
  const f = fixture()
  try {
    const bundle = f.build(); installRelease({ ...f, bundle })
    const terminal = JSON.stringify({ schemaVersion: 4, id: 'job', status: 'passed', exitCode: 0,
      finalization: { schemaVersion: 2 }, finalizationDigest: 'e'.repeat(64) })
    const record = JSON.stringify({ schemaVersion: 1, ticketId: 'job', ticketDigest: hash(terminal), finalizationDigest: 'e'.repeat(64),
      attempt: 1, phase: 'failed', finishedAt: '2026-10-17T00:00:00Z', recovery: 'blocked-ownership',
      result: { schemaVersion: 2, recovery: 'blocked-ownership', cleanup: 'uncertain', outputs: [] } })
    f.put('state/history/job.json', terminal)
    f.put('state/state/finalization/job.json', record)
    f.put('state/state/finalization/job.result.json', 'residual output')
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    for (const [path, bytes] of [['history/job.json', terminal], ['state/finalization/job.json', record], ['state/finalization/job.result.json', 'residual output']]) {
      assert.equal(readFileSync(join(f.stateRoot, path), 'utf8'), bytes)
    }
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('completed records and legacy history do not block a quiet fixture install', () => {
  const f = fixture()
  try {
    const bundle = f.build()
    f.put('state/state/finalization/old.json', JSON.stringify({ schemaVersion: 1, ticketId: 'old', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1, phase: 'failed', finishedAt: '2026-10-17T00:00:00Z', result: { schemaVersion: 1, cleanup: 'confirmed', outputs: [] } }))
    f.put('state/history/legacy.json', JSON.stringify({ schemaVersion: 1, status: 'failed' }))
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.equal(existsSync(join(f.stateRoot, 'state/finalization/old.json')), true)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
for (const owner of ['running.json', 'runner.lock', 'locks/runner.lock', 'state/worker.json', 'state/worker.pid', 'locks/jobs/job.finalization/owner.json', 'claims/job.json']) test(`unreconciled ownership ${owner} prevents fixture cutover`, () => {
  const f = fixture()
  try { const bundle = f.build(); f.put(`state/${owner}`, '{}'); assert.throws(() => installRelease({ ...f, bundle }), /incerto|owner|recuper/i) }
  finally { rmSync(f.root, { recursive: true, force: true }) }
})

for (const kind of ['missing source', 'invalid source', 'symlinked source']) test(`historical ${kind} permits maintenance without replay or traversal`, () => {
  const f = fixture()
  try {
    const bundle = f.build(); installRelease({ ...f, bundle })
    f.put('state/state/finalization/orphan.json', '{invalid record')
    const foreign = join(f.root, 'foreign-source')
    writeFileSync(foreign, 'preserve foreign bytes')
    if (kind === 'invalid source') f.put('state/history/orphan.json', '{invalid terminal')
    if (kind === 'symlinked source') {
      mkdirSync(join(f.stateRoot, 'history'), { recursive: true })
      symlinkSync(foreign, join(f.stateRoot, 'history/orphan.json'))
    }
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.equal(readFileSync(join(f.stateRoot, 'state/finalization/orphan.json'), 'utf8'), '{invalid record')
    if (kind === 'invalid source') assert.equal(readFileSync(join(f.stateRoot, 'history/orphan.json'), 'utf8'), '{invalid terminal')
    if (kind === 'symlinked source') assert.equal(lstatSync(join(f.stateRoot, 'history/orphan.json')).isSymbolicLink(), true)
    assert.equal(readFileSync(foreign, 'utf8'), 'preserve foreign bytes')
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('an API from another checkout cannot advertise the installed bundle or serve its UI', () => {
  const f = fixture()
  try {
    const bundle = f.build(), manifest = join(bundle, 'manifest.json')
    const backend = fileURLToPath(new URL('../../backend', import.meta.url))
    const child = spawnSync('python3', ['-m', 'ci_queue_api', '--state', f.stateRoot, '--ui', join(bundle, 'ui/dist'), '--manifest', manifest,
      '--manifest-sha256', hash(readFileSync(manifest)), '--port', '0'], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: backend }, timeout: 2000 })
    assert.notEqual(child.status, 0)
    assert.match(child.stderr, /migração/)
    assert.doesNotMatch(child.stdout, /API em/)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('a distribution without recoverable-finalization cannot claim the current protocol', () => {
  const f = fixture()
  try {
    f.stamp('worker', { protocol: { ...protocol, capabilities: protocol.capabilities.slice(0, 2) } })
    assert.throws(f.build, /migração|protocolo/i)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('confirmed v2 finalization releases maintenance while retaining its record', () => {
  const f = fixture()
  try {
    const bundle = f.build()
    const record = { schemaVersion: 1, ticketId: 'v2', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1,
      phase: 'passed', finishedAt: '2026-10-19T00:00:00Z', recovery: 'none', result: { schemaVersion: 2, recovery: 'none', cleanup: 'confirmed', outputs: [] } }
    f.put('state/state/finalization/v2.json', JSON.stringify(record))
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.deepEqual(JSON.parse(readFileSync(join(f.stateRoot, 'state/finalization/v2.json'), 'utf8')), record)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('historical blocked recovery does not reserve maintenance', () => {
  const f = fixture()
  try {
    const bundle = f.build()
    f.put('state/state/finalization/blocked.json', JSON.stringify({ schemaVersion: 1, ticketId: 'blocked', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1,
      phase: 'failed', finishedAt: '2026-10-19T00:00:00Z', recovery: 'blocked-ownership', result: { schemaVersion: 1, cleanup: 'confirmed', outputs: [] } }))
    const before = readFileSync(join(f.stateRoot, 'state/finalization/blocked.json'))
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.deepEqual(readFileSync(join(f.stateRoot, 'state/finalization/blocked.json')), before)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

function completedRecord(result) {
  return { schemaVersion: 1, ticketId: 'boundary', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1,
    phase: 'passed', finishedAt: '2026-10-19T00:00:00Z', recovery: 'none', result }
}
const cleanResult = () => ({ schemaVersion: 2, recovery: 'none', cleanup: 'confirmed', outputs: [] })

test('record limits: maintenance accepts a canonical envelope above the result limit', () => {
  const f = fixture()
  try {
    const bundle = f.build(), result = cleanResult()
    for (let id = 0; ; id++) {
      result.outputs.push({ path: `docs/proof-candidates/fixture/${id}.json`, sha256: 'a'.repeat(64), role: 'proof-candidate' })
      if (Buffer.byteLength(JSON.stringify(result)) > FINALIZATION_JSON_MAX_BYTES) { result.outputs.pop(); break }
    }
    assert.deepEqual(normalizeFinalizationResult(result, 2), result)
    const record = completedRecord(result), raw = serializedJson(record)
    assert.ok(Buffer.byteLength(raw) > FINALIZATION_JSON_MAX_BYTES)
    assert.ok(Buffer.byteLength(raw) < 2 * FINALIZATION_JSON_MAX_BYTES)
    f.put('state/state/finalization/boundary.json', raw)
    assert.deepEqual(readFinalization(f.stateRoot, 'boundary'), record)
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    uninstallRelease({ prefix: f.prefix })
    assert.equal(readFileSync(join(f.stateRoot, 'state/finalization/boundary.json'), 'utf8'), raw)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('record limits: oversized result is refused by its parser and preserved during maintenance', () => {
  const f = fixture()
  try {
    const bundle = f.build(), result = cleanResult()
    result.outputs.push({ path: 'proof/output.json', sha256: 'a'.repeat(64), role: 'x'.repeat(FINALIZATION_JSON_MAX_BYTES) })
    const raw = serializedJson(completedRecord(result))
    assert.ok(Buffer.byteLength(raw) < 2 * FINALIZATION_JSON_MAX_BYTES)
    assert.throws(() => normalizeFinalizationResult(result, 2), /64 KiB/)
    f.put('state/state/finalization/boundary.json', raw)
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.equal(readFileSync(join(f.stateRoot, 'state/finalization/boundary.json'), 'utf8'), raw)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('record limits: oversized envelope is refused by its reader and preserved during maintenance', () => {
  const f = fixture()
  try {
    const bundle = f.build(), record = completedRecord(cleanResult())
    const raw = serializedJson(record).padEnd(2 * FINALIZATION_JSON_MAX_BYTES + 1, ' ')
    f.put('state/state/finalization/boundary.json', raw)
    assert.equal(readFinalization(f.stateRoot, 'boundary'), undefined)
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.equal(readFileSync(join(f.stateRoot, 'state/finalization/boundary.json'), 'utf8'), raw)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})


test('legacy lock targets permit quiet maintenance while preserving their bytes and inodes', () => {
  const f = fixture()
  try {
    const bundle = f.build()
    const names = ['20260910-164750-5246ef.state', 'validation-plan.state']
    const anchors = names.map(name => join(f.stateRoot, 'locks/jobs', name))
    for (const name of names) f.put(`state/locks/jobs/${name}`, '')
    const before = anchors.map(file => ({ stat: lstatSync(file), bytes: readFileSync(file) }))
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    assert.equal(installRelease({ ...f, bundle }).revision, revision)
    uninstallRelease({ prefix: f.prefix })
    anchors.forEach((file, index) => {
      const after = lstatSync(file)
      assert.equal(after.dev, before[index].stat.dev)
      assert.equal(after.ino, before[index].stat.ino)
      assert.equal(after.nlink, 1)
      assert.deepEqual(readFileSync(file), before[index].bytes)
    })
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

for (const kind of ['active legacy reservation', 'directory lock', 'unknown file', 'nonempty target', 'symlink target', 'hardlinked target']) {
  test(`legacy lock compatibility still refuses ${kind}`, () => {
    const f = fixture()
    try {
      const bundle = f.build()
      installRelease({ ...f, bundle })
      const target = join(f.stateRoot, 'locks/jobs/20260910-164750-5246ef.state')
      mkdirSync(join(f.stateRoot, 'locks/jobs'), { recursive: true })
      if (kind === 'active legacy reservation') {
        writeFileSync(target, '')
        mkdirSync(`${target}.lock`)
      } else if (kind === 'directory lock') {
        mkdirSync(target)
        writeFileSync(join(target, 'owner.json'), JSON.stringify({ pid: process.pid }))
      } else if (kind === 'unknown file') {
        writeFileSync(join(f.stateRoot, 'locks/jobs/unknown.state'), '')
      } else if (kind === 'nonempty target') {
        writeFileSync(target, 'reserved')
      } else {
        const source = join(f.root, 'reserved-source')
        writeFileSync(source, '')
        if (kind === 'symlink target') symlinkSync(source, target)
        else linkSync(source, target)
      }
      const entries = join(f.stateRoot, 'locks/jobs')
      assert.throws(() => installRelease({ ...f, bundle }), /incerto|owner|recuper/i)
      assert.throws(() => uninstallRelease({ prefix: f.prefix }), /incerto|owner|recuper/i)
      assert.equal(existsSync(entries), true)
      if (kind !== 'unknown file') assert.equal(lstatSync(target).isDirectory(), kind === 'directory lock')
    } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
}
