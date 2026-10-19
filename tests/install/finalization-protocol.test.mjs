import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildRelease, verifyRelease } from '../../scripts/release.mjs'
import { installRelease, uninstallRelease } from '../../scripts/install.mjs'

const revision = 'a'.repeat(40)
const protocol = { apiVersion: 1, ticketSchemaVersion: 4, capabilities: ['terminal-finalization-v1', 'no-artifact-snapshots-v1'] }
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
for (const phase of ['pending', 'running', 'interrupted', 'malformed', 'cleanup-uncertain']) test(`${phase} finalization blocks update and uninstall without touching its state`, () => {
  const f = fixture()
  try {
    const bundle = f.build(); installRelease({ ...f, bundle })
    const path = `state/state/finalization/job.json`
    const value = phase === 'malformed' ? '{' : JSON.stringify({ schemaVersion: 1, ticketId: 'job', ticketDigest: 'd'.repeat(64), finalizationDigest: 'e'.repeat(64), attempt: 1, phase: phase === 'cleanup-uncertain' ? 'failed' : phase, ...(phase === 'cleanup-uncertain' ? { finishedAt: '2026-10-17T00:00:00Z', result: { schemaVersion: 1, cleanup: 'uncertain', outputs: [] } } : {}) })
    f.put(path, value)
    assert.throws(() => installRelease({ ...f, bundle }), /finaliza|incerto/i)
    assert.throws(() => uninstallRelease({ prefix: f.prefix }), /finaliza|incerto/i)
    assert.equal(readFileSync(join(f.root, path), 'utf8'), value)
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
for (const owner of ['state/worker.json', 'state/worker.pid', 'locks/jobs/job.finalization/owner.json', 'claims/job.json']) test(`unreconciled ownership ${owner} prevents fixture cutover`, () => {
  const f = fixture()
  try { const bundle = f.build(); f.put(`state/${owner}`, '{}'); assert.throws(() => installRelease({ ...f, bundle }), /incerto|owner|recuper/i) }
  finally { rmSync(f.root, { recursive: true, force: true }) }
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
