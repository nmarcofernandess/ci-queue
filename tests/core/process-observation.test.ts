import { hostname } from 'node:os'
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { observeProcessGroup, observeWorkerIdentity } from '../../src/core/process.js'
vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))
const born = 'Tue Nov  3 04:00:00 2026'
const identity = { hostname: hostname(), leaderPid: 123, pgid: 123, startedAt: born }
const output = (stdout: string) => vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout } as any)
describe('process exit observation', () => {
  it('does not reserve a group containing only unreaped zombies', () => {
    output(`123 123 Zs ${born}\n124 123 Z ${born}\n`)
    expect(observeProcessGroup(identity).state).toBe('dead')
  })
  it('preserves live descendant ownership while the original leader is a zombie', () => {
    output(`123 123 Zs ${born}\n124 123 S ${born}\n`)
    expect(observeProcessGroup(identity).state).toBe('uncertain')
  })
  it('does not trust a reused zombie PID', () => {
    output(`123 123 Zs Wed Nov  4 04:00:00 2026\n`)
    expect(observeProcessGroup(identity).state).toBe('uncertain')
  })
  it('recognizes an exited supervisor without dropping birth identity', () => {
    output(`123 Zs ${born}\n`)
    expect(observeWorkerIdentity({schemaVersion:1, hostname: hostname(), pid:123, startedAt:born}).state).toBe('dead')
  })
})

it('keeps an unavailable process probe uncertain', () => {
  vi.mocked(spawnSync).mockReturnValue({status: 1, stdout: ''} as any)
  expect(observeProcessGroup(identity).state).toBe('uncertain')
})
it('preserves supervisor PID reuse protection even for zombies', () => {
  output('123 Zs Wed Nov  4 04:00:00 2026\n')
  expect(observeWorkerIdentity({schemaVersion:1, hostname:hostname(), pid:123, startedAt:born}).state).toBe('uncertain')
})
