import { readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const option = (name) => args[args.indexOf(name) + 1]
for (const name of ['--state', '--repo', '--project']) {
  if (!args.includes(name) || !option(name) || option(name).startsWith('--')) throw new Error(`${name} is required`)
}
const state = resolve(option('--state')), repo = resolve(option('--repo')), projectId = option('--project')
const ledgerPath = join(state, 'state', 'legacy-projects.json')
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { schemaVersion: 1, assignments: {} }
if (ledger.schemaVersion !== 1 || !ledger.assignments || Array.isArray(ledger.assignments)) throw new Error('Invalid migration ledger')
const records = readdirSync(join(state, 'history')).filter(name => name.endsWith('.json')).map(name => {
  const bytes = readFileSync(join(state, 'history', name))
  return { job: JSON.parse(bytes), digest: createHash('sha256').update(bytes).digest('hex') }
})
const legacy = records.filter(({job}) => !job.projectId)
const shas = [...new Set(legacy.map(({job}) => job.headSha).filter(sha => typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha))) ]
const git = spawnSync('git', ['-C', repo, 'cat-file', '--batch-check=%(objectname) %(objecttype)'], { input: shas.join('\n') + '\n', encoding: 'utf8' })
if (git.status !== 0) throw new Error('Cannot verify repository objects')
const objectLines = git.stdout.trim().split('\n')
const commits = new Map(shas.map((sha, index) => [sha, objectLines[index]]).filter(([, line]) => line?.endsWith(' commit')))
let added = 0
for (const {job, digest} of legacy) {
  if (Object.hasOwn(ledger.assignments, job.id) || !commits.has(job.headSha)) continue
  if (!/^[A-Za-z0-9_.:-]+$/.test(job.id)) throw new Error('Invalid legacy ticket ID')
  ledger.assignments[job.id] = { projectId, headSha: job.headSha, evidence: `git commit ${commits.get(job.headSha).split(' ')[0]} in ${repo}; ticket sha256:${digest}` }
  added++
}
if (args.includes('--apply')) {
  if (existsSync(join(state, 'running.json')) || existsSync(join(state, 'locks', 'runner.lock'))) throw new Error('Queue is active; migration requires an idle installation')
  mkdirSync(join(state, 'state'), { recursive: true })
  const temporary = `${ledgerPath}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 })
  renameSync(temporary, ledgerPath)
}
console.log(JSON.stringify({ applied: args.includes('--apply'), total: records.length, legacy: legacy.length, added, assigned: legacy.filter(({job}) => Object.hasOwn(ledger.assignments, job.id)).length, unassigned: legacy.filter(({job}) => !Object.hasOwn(ledger.assignments, job.id)).length }, null, 2))
