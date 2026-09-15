import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

test('legacy migration verifies commits, refuses active state and preserves original records', () => {
  const root = mkdtempSync(join(tmpdir(), 'ci-queue-legacy-'))
  try {
    execFileSync('git', ['init', '-q', root])
    execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'])
    const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim()
    const state = join(root, 'queue')
    mkdirSync(join(state,'history'), {recursive:true})
    const original = JSON.stringify({id:'verified', headSha:sha, status:'passed'})
    writeFileSync(join(state,'history','verified.json'), original)
    writeFileSync(join(state,'history','unknown.json'), JSON.stringify({id:'unknown', headSha:'0'.repeat(40), status:'passed'}))
    const args = [resolve('scripts/legacy-projects.mjs'), '--state', state, '--repo', root, '--project', 'fixture']
    const dry = JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}))
    assert.equal(dry.assigned,1); assert.equal(dry.unassigned,1)
    assert.equal(existsSync(join(state,'state','legacy-projects.json')), false)
    writeFileSync(join(state,'running.json'),'{}')
    assert.notEqual(spawnSync(process.execPath,[...args,'--apply']).status,0)
    rmSync(join(state,'running.json'))
    const applied = JSON.parse(execFileSync(process.execPath,[...args,'--apply'],{encoding:'utf8'}))
    assert.equal(applied.added,1)
    const again = JSON.parse(execFileSync(process.execPath,[...args,'--apply'],{encoding:'utf8'}))
    assert.equal(again.added,0)
    assert.equal(readFileSync(join(state,'history','verified.json'),'utf8'),original)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
