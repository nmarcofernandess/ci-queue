import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { runJob } from '../../dist/core/runner.js'

const roots = []
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))
const node = realpathSync(process.execPath)
const npmCli = realpathSync(join(dirname(process.execPath), 'npm'))
const npxCli = realpathSync(join(dirname(process.execPath), 'npx'))
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
function fixture(argv, { registry = true, version = process.versions.node } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ci-queue runtime '))
  roots.push(root)
  const cwd = join(root, 'project')
  mkdirSync(cwd)
  writeFileSync(join(cwd, '.nvmrc'), process.versions.node.split('.')[0] + '\n')
  const state = join(root, 'state')
  mkdirSync(state)
  if (registry) writeFileSync(join(state, 'runtimes.json'), JSON.stringify({
    schemaVersion: 1,
    projects: { example: { node: { executable: node, version }, npmCli, npxCli } },
  }))
  const ticket = { id: 'runtime-test', createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    status: 'running', preset: 'probe', cwd, branch: 'test', headSha: 'unknown', requestedBy: 'test',
    command: argv.join(' '), argv, flags: {}, projectId: 'example', projectName: 'Example',
    logPath: join(state, 'logs', 'runtime-test.log') }
  return { root, cwd, state, ticket, run: () => runJob(state, { ticket, argv, flags: {} }) }
}

test('rejects a login shell before any recipe work', async () => {
  const f = fixture(['bash', '-lc', 'echo executed > forbidden'])
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason, /RUNTIME_LOGIN_SHELL/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('records selected and effective Node for a shell-free command', async () => {
  const f = fixture(['node', '-e', 'console.log(process.execPath)'])
  const result = await f.run()
  assert.equal(result.status, 'passed')
  assert.equal(result.runtime?.node.executable, node)
  assert.equal(result.runtime?.node.version, process.versions.node)
  assert.ok(result.runtime?.observations.some(item => item.execPath === node && item.version === process.versions.node))
  const runtimeRoot = join(f.state, 'runtime')
  assert.equal(existsSync(runtimeRoot) ? readdirSync(runtimeRoot).length : 0, 0)
})

test('fails before work when the registered exact version diverges', async () => {
  const f = fixture([node, '-e', 'require("node:fs").writeFileSync("forbidden", "bad")'], { version: '99.0.0' })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason, /RUNTIME_VERSION_MISMATCH/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

const { copyFileSync, chmodSync, symlinkSync, unlinkSync } = await import('node:fs')
const { spawnSync } = await import('node:child_process')
const { prepareJobRuntime, validateRuntimeArgv, sanitizeRuntimeEnv, registerProjectRuntime } = await import('../../dist/core/runtime.js')
const competitors = mkdtempSync(join(tmpdir(), 'ci-queue-other-node-'))
roots.push(competitors)
copyFileSync(node, join(competitors, 'node'))
chmodSync(join(competitors, 'node'), 0o755)
const otherNode = realpathSync(join(competitors, 'node'))
const writeBinding = (f, patch = {}) => writeFileSync(join(f.state, 'runtimes.json'), JSON.stringify({
  schemaVersion: 1, projects: { example: { node: { executable: node, version: process.versions.node }, npmCli, npxCli, ...patch } },
}))
const markerCode = 'require("node:fs").writeFileSync("forbidden", "bad")'
const log = f => readFileSync(f.ticket.logPath, 'utf8')

for (const argv of [
  ['bash', '-l', '-c', 'true'], ['bash', '-cl', 'true'], ['/bin/bash', '--login', '-c', 'true'],
  ['zsh', '-lc', 'true'], ['zsh', '-o', 'login', '-c', 'true'], ['sh', '-l', '-c', 'true'],
  ['/usr/bin/env', 'bash', '-lc', 'true'], ['bash', '-ic', 'true'],
]) {
  test(`rejects startup options before spawn: ${argv.join(' ')}`, () => {
    assert.throws(() => validateRuntimeArgv(argv), /RUNTIME_(LOGIN|INTERACTIVE|SHELL_STARTUP)/)
  })
}

test('does not mistake the shell command operand for shell flags', () => {
  assert.doesNotThrow(() => validateRuntimeArgv(['bash', '-c', 'printf "%s" "bash -lc"']))
})

test('non-login shell ignores inherited BASH_ENV and competing global PATH', async () => {
  const f = fixture(['bash', '-c', 'node -p process.execPath'])
  const startup = join(f.cwd, 'startup.sh')
  writeFileSync(startup, 'echo BAD_STARTUP > forbidden\n')
  const old = { PATH: process.env.PATH, BASH_ENV: process.env.BASH_ENV, NODE_OPTIONS: process.env.NODE_OPTIONS }
  Object.assign(process.env, { PATH: `${competitors}:${old.PATH}`, BASH_ENV: startup, NODE_OPTIONS: '--require /does-not-exist' })
  try {
    const result = await f.run()
    assert.equal(result.status, 'passed', log(f))
    assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
    assert.ok(result.runtime.observations.length >= 2)
    assert.ok(result.runtime.observations.every(item => item.execPath === node))
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})

test('env-node shebang executes with the selected binary', async () => {
  const f = fixture(['./probe'])
  writeFileSync(join(f.cwd, 'probe'), '#!/usr/bin/env node\nconsole.log(process.execPath)\n', { mode: 0o755 })
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.equal(result.runtime.observations[0].entry, 'probe')
  assert.equal(result.runtime.observations[0].execPath, node)
})

test('an intermediate process inheriting the environment stays in the runtime', async () => {
  const f = fixture(['node', '-e', 'require("node:child_process").execFileSync("node",["-p","process.execPath"],{stdio:"inherit"})'])
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.ok(result.runtime.observations.length >= 2)
  assert.ok(result.runtime.observations.every(item => item.execPath === node))
})

test('a nested named login shell is rejected even when its exit is swallowed', async () => {
  const f = fixture(['bash', '-c', 'bash -lc "echo bad > forbidden" || true'])
  const result = await f.run()
  assert.equal(result.status, 'failed', log(f))
  assert.equal(result.failureReason, 'RUNTIME_LOGIN_SHELL')
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('a competing Node reached through PATH exits before application code, even with || true', async () => {
  const f = fixture(['bash', '-c', `PATH=${quote(competitors)}:/usr/bin:/bin node -e ${quote(markerCode)} || true`])
  const result = await f.run()
  assert.equal(result.status, 'failed', log(f))
  assert.equal(result.failureReason, 'RUNTIME_PROCESS_MISMATCH')
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
  assert.ok(result.runtime.observations.some(item => item.execPath === otherNode && item.status === 'rejected'))
})

test('even the correct absolute Node refuses a PATH that would choose a different Node next', async () => {
  const f = fixture(['bash', '-c', `PATH=${quote(competitors)}:/usr/bin:/bin ${quote(node)} -e ${quote(markerCode)} || true`])
  const result = await f.run()
  assert.equal(result.status, 'failed', log(f))
  assert.equal(result.failureReason, 'RUNTIME_PATH_MISMATCH')
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('direct absolute foreign Node is refused before it is spawned', async () => {
  const f = fixture([otherNode, '-e', markerCode])
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason, /RUNTIME_EXECUTABLE_MISMATCH/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
  assert.equal(result.childPid, undefined)
})

test('without a registry entry a Node recipe stays unconfigured and still runs', async () => {
  const f = fixture(['node', '-e', markerCode], { registry: false })
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.equal(result.runtime.coverage, 'unconfigured')
  assert.equal(existsSync(join(f.cwd, 'forbidden')), true)
})

test('an uninstalled runtime has no global fallback', async () => {
  const f = fixture(['node', '-e', markerCode])
  writeBinding(f, { node: { executable: '/missing/managed/node', version: process.versions.node } })
  const result = await f.run()
  assert.match(result.failureReason, /RUNTIME_NOT_INSTALLED/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('a different required project major fails before work', async () => {
  const f = fixture(['node', '-e', markerCode])
  writeFileSync(join(f.cwd, '.nvmrc'), String(Number(process.versions.node.split('.')[0]) + 1))
  const result = await f.run()
  assert.match(result.failureReason, /RUNTIME_REQUIREMENT_MISMATCH/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('package engines and nvmrc are intersected, not silently prioritized', async () => {
  const f = fixture(['node', '-e', markerCode])
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify({ engines: { node: '<10' } }))
  const result = await f.run()
  assert.match(result.failureReason, /RUNTIME_REQUIREMENT_MISMATCH/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('unresolvable nvm aliases are rejected rather than consulting dotfiles', async () => {
  const f = fixture(['node', '-e', markerCode])
  writeFileSync(join(f.cwd, '.nvmrc'), 'lts/*\n')
  const result = await f.run()
  assert.match(result.failureReason, /RUNTIME_REQUIREMENT_INVALID/)
})

function offlineNpmProject(f) {
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify({
    name: 'offline-probe', private: true, version: '1.0.0',
    engines: { node: `>=${process.versions.node.split('.')[0]} <${Number(process.versions.node.split('.')[0])+1}` },
    scripts: { test: 'local-probe' },
  }))
  const bin = join(f.cwd, 'node_modules', '.bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'local-probe'), '#!/usr/bin/env node\nconsole.log("NPM_PROBE",process.execPath)\n', { mode: 0o755 })
}
for (const argv of [['npm', 'test'], ['npm', 'exec', '--offline', '--', 'local-probe'], ['npx', '--offline', '--no-install', 'local-probe']]) {
  test(`${argv.join(' ')} keeps npm, script-shell and local shebang in the same runtime`, async () => {
    const f = fixture(argv)
    offlineNpmProject(f)
    const result = await f.run()
    assert.equal(result.status, 'passed', log(f))
    assert.match(log(f), /NPM_PROBE/)
    assert.ok(result.runtime.observations.some(item => item.entry === 'local-probe'))
    assert.ok(result.runtime.observations.every(item => item.execPath === node))
  })
}

test('a node_modules/.bin/node shadow fails before script application code', async () => {
  const f = fixture(['npm', 'test'])
  offlineNpmProject(f)
  symlinkSync(otherNode, join(f.cwd, 'node_modules', '.bin', 'node'))
  const result = await f.run()
  assert.equal(result.status, 'failed', log(f))
  assert.doesNotMatch(log(f), /NPM_PROBE/)
  assert.match(result.failureReason, /RUNTIME_(PATH|PROCESS)_MISMATCH/)
})

test('environment sanitizer removes ambient runtime switches without dropping project credentials', () => {
  const env = sanitizeRuntimeEnv({ PATH: '/bad', NODE: '/bad', NODE_OPTIONS: '--require bad', BASH_ENV: 'bad',
    npm_node_execpath: '/bad', npm_execpath: '/bad', NPM_CONFIG_SCRIPT_SHELL: 'bad',
    ZDOTDIR: 'bad', DYLD_INSERT_LIBRARIES: 'bad', DATABASE_URL: 'private-value' })
  assert.deepEqual(env, { DATABASE_URL: 'private-value' })
})

test('native shell-free legacy jobs remain usable and explicitly unconfigured', async () => {
  const f = fixture(['/bin/echo', 'native'], { registry: false })
  unlinkSync(join(f.cwd, '.nvmrc'))
  const result = await f.run()
  assert.equal(result.status, 'passed')
  assert.equal(result.runtime.coverage, 'unconfigured')
})

test('two registered projects resolve independently on the same queue', async () => {
  const f = fixture(['node', '-p', 'process.execPath'])
  const registry = JSON.parse(readFileSync(join(f.state, 'runtimes.json'), 'utf8'))
  registry.projects.second = { node: { executable: otherNode, version: process.versions.node }, npmCli, npxCli }
  writeFileSync(join(f.state, 'runtimes.json'), JSON.stringify(registry))
  const first = await f.run()
  const argv = ['node', '-p', 'process.execPath']
  const secondTicket = { ...f.ticket, id: 'second-runtime', projectId: 'second', logPath: join(f.state, 'logs', 'second.log') }
  const second = await runJob(f.state, { ticket: secondTicket, argv, flags: {} })
  assert.equal(first.status, 'passed')
  assert.equal(second.status, 'passed')
  assert.equal(first.runtime.node.executable, node)
  assert.equal(second.runtime.node.executable, otherNode)
  assert.ok(second.runtime.observations.every(item => item.execPath === otherNode))
})

test('a project-specific registry can specify different majors without a shared worker runtime assumption', () => {
  const f = fixture(['node', '-p', 'process.version'])
  writeBinding(f, { node: { executable: node, version: '99.0.0' } })
  assert.throws(() => prepareJobRuntime(f.state, f.ticket, f.ticket.argv, process.env), /RUNTIME_VERSION_MISMATCH/)
})

test('a corrupt evidence stream invalidates an otherwise successful job', async () => {
  const f = fixture(['bash', '-c', 'true'])
  const prepared = prepareJobRuntime(f.state, f.ticket, f.ticket.argv, process.env)
  writeFileSync(prepared.receipt.evidencePath, 'not-json\n')
  assert.equal(prepared.finish().failureCode, 'RUNTIME_EVIDENCE_INVALID')
})

test('documented boundary: env -i plus an absolute executable bypasses a user-space preload', async () => {
  const f = fixture(['bash', '-c', `/usr/bin/env -i ${quote(otherNode)} -e ${quote(markerCode)}`])
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.equal(result.runtime.state, 'verified')
  assert.equal(result.runtime.coverage, 'guarded-node-processes')
  assert.equal(existsSync(join(f.cwd, 'forbidden')), true,
    'verified means observed processes agreed, not that every descendant was mediated')
})

const secondBinary = process.env.CI_QUEUE_TEST_SECOND_NODE
// Must provide a real second-major Node, not a mock or a version-printing shell.
test('real different-major runtime matrix (requires CI_QUEUE_TEST_SECOND_NODE)', { skip: !secondBinary }, async () => {
  const probe = spawnSync(secondBinary, ['-p', 'JSON.stringify({node:process.execPath,version:process.versions.node})'], { encoding: 'utf8' })
  assert.equal(probe.status, 0)
  const other = JSON.parse(probe.stdout)
  assert.notEqual(other.version.split('.')[0], process.versions.node.split('.')[0])
  const f = fixture(['node', '-p', 'process.execPath'])
  const registry = JSON.parse(readFileSync(join(f.state, 'runtimes.json'), 'utf8'))
  const npm = realpathSync(join(dirname(secondBinary), 'npm'))
  const npx = realpathSync(join(dirname(secondBinary), 'npx'))
  registry.projects.second = { node: { executable: realpathSync(other.node), version: other.version }, npmCli: npm, npxCli: npx }
  writeFileSync(join(f.state, 'runtimes.json'), JSON.stringify(registry))
  const first = await f.run()
  assert.equal(first.status, 'passed')
  writeFileSync(join(f.cwd, '.nvmrc'), other.version.split('.')[0])
  const secondTicket = { ...f.ticket, id: 'second-major', projectId: 'second', logPath: join(f.state, 'logs', 'second-major.log') }
  const second = await runJob(f.state, { ticket: secondTicket, argv: f.ticket.argv, flags: {} })
  assert.equal(second.status, 'passed')
  assert.equal(second.runtime.node.version, other.version)
  assert.ok(second.runtime.observations.every(item => item.version === other.version))
})

test('direct login-shell shebang cannot execute a recipe body', async () => {
  const f = fixture(['./login-script'])
  writeFileSync(join(f.cwd, 'login-script'), '#!/bin/bash -l\necho bad > forbidden\n', { mode: 0o755 })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason, /RUNTIME_LOGIN_SHELL/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('compact zsh option spelling cannot request login startup', () => {
  assert.throws(() => validateRuntimeArgv(['zsh', '-oLOGIN', '-c', 'true']), /RUNTIME_SHELL_STARTUP_OVERRIDE/)
})

test('a native configured command has preflight evidence, not fictional Node observations', async () => {
  const f = fixture(['/bin/echo', 'native'])
  const result = await f.run()
  assert.equal(result.status, 'passed')
  assert.equal(result.runtime.state, 'preflight-only')
  assert.deepEqual(result.runtime.observations, [])
})

test('legacy shell-free jobs with an explicit absolute Node remain usable without a registry', async () => {
  const f = fixture([node, '-p', 'process.execPath'], { registry: false })
  unlinkSync(join(f.cwd, '.nvmrc'))
  const result = await f.run()
  assert.equal(result.status, 'passed')
  assert.equal(result.runtime.coverage, 'unconfigured')
})

test('unknown runtime configuration cannot silently imply unsupported strict isolation', async () => {
  const f = fixture(['node', '-e', markerCode])
  writeBinding(f, { isolation: 'strict' })
  const result = await f.run()
  assert.equal(result.status, 'failed')
  assert.match(result.failureReason, /RUNTIME_CONFIG_INVALID/)
  assert.equal(existsSync(join(f.cwd, 'forbidden')), false)
})

test('runtime register pins a project by absolute Node without failing closed by default', async () => {
  const f = fixture(['node', '-p', 'process.version'], { registry: false })
  const registered = registerProjectRuntime(f.state, { projectId: 'example', node })
  assert.equal(registered.node.version, process.versions.node)
  assert.equal(registered.node.executable, node)
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.equal(result.runtime.state, 'verified')
  assert.equal(result.runtime.node.executable, node)
})

test('login shell is not rejected until a project runtime is registered', async () => {
  const f = fixture(['bash', '-lc', 'echo executed > allowed'], { registry: false })
  unlinkSync(join(f.cwd, '.nvmrc'))
  const result = await f.run()
  assert.equal(result.status, 'passed', log(f))
  assert.equal(result.runtime.coverage, 'unconfigured')
  assert.equal(existsSync(join(f.cwd, 'allowed')), true)
})

test('deadline and process-group ownership survive the shell launcher', async () => {
  const f = fixture(['bash', '-c', 'node -e "setInterval(()=>{},1000)"'])
  const result = await runJob(f.state, { ticket: f.ticket, argv: f.ticket.argv, flags: { executionTimeoutMs: 150 } })
  assert.equal(result.status, 'failed')
  assert.equal(result.executionDeadline.state, 'expired')
  assert.equal(result.processGroupIdentity.leaderPid, result.childPid)
  assert.match(result.failureReason, /prazo de execução excedido/)
})
