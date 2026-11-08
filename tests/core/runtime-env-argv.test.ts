import { describe, expect, it } from 'vitest'
import { validateRuntimeArgv } from '../../src/core/runtime.js'

describe('structured env projection', () => {
  it('admits absence, empty and value without relaxing the remaining command', () => {
    for (const argv of [
      ['env', '-u', 'PUBLIC_INPUT', 'node', 'test.js'],
      ['/usr/bin/env', '-u', 'PUBLIC_INPUT', '-u', 'PORT', '--', 'OTHER=', 'TARGET=a b', 'node', 'test.js'],
      ['env', 'PUBLIC_INPUT=', 'node', 'test.js'],
    ]) expect(() => validateRuntimeArgv(argv)).not.toThrow()
    expect(() => validateRuntimeArgv(['env', '-u', 'PUBLIC_INPUT', 'bash', '-lc', 'true'])).toThrow(/RUNTIME_LOGIN_SHELL/)
  })
  it.each(['PATH', 'NODE_OPTIONS', 'npm_node_execpath', 'NVM_DIR', 'LD_PRELOAD', 'BASH_ENV', 'a=b', '-i', '', 'a-b'])(
    'refuses protected or malformed unset %j', name => {
      expect(() => validateRuntimeArgv(['env', '-u', name, 'node', 'test.js'])).toThrow(/RUNTIME_ENV_OVERRIDE/)
    },
  )
  it.each([
    ['env', '-i', 'node', 'test.js'], ['env', '--unset=PUBLIC_INPUT', 'node', 'test.js'],
    ['env', '-u'], ['env', '-u', 'PUBLIC_INPUT'], ['env', '-u', 'PUBLIC_INPUT', 'PATH=bad', 'node'],
  ])('refuses unsupported env options or missing command %j', (...argv) => {
    expect(() => validateRuntimeArgv(argv)).toThrow(/RUNTIME_ENV_OVERRIDE/)
  })
})
