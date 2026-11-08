import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const { buildExecutionDescription, formatExecutionDescription, resolveExecutor, CONSUMER_FEATURES } = createRequire(import.meta.url)('../../consumer/index.cjs')
const host = { installed: true, evidence: 'fixture queue' }
const baseline = resolveExecutor({ environment: 'queue', configured: 'direct', host })
const effective = resolveExecutor({ explicit: 'direct', environment: 'queue', configured: 'direct', host })
const facts = () => ({ phase: 'resolved', recipe: { name: 'unit', selectors: ['--case', '', '  a  '] }, executor: { effective, baseline, host }, selection: { state: 'unknown', reason: 'engine not started' } })

test('unknown is not zero and a legitimate explicit executor reports divergence without refusing', () => {
  const input = facts()
  const before = JSON.stringify(input)
  const description = buildExecutionDescription(input)
  assert.ok(CONSUMER_FEATURES.includes('execution-description-v1'))
  assert.equal(description.executor.divergent, true)
  assert.equal(description.executor.baseline.reason, 'environment')
  assert.equal(description.selection.state, 'unknown')
  const human = formatExecutionDescription(description)
  assert.match(human, /divergência informativa/)
  assert.match(human, /ainda não descoberta/)
  assert.doesNotMatch(human, /0 .*selecionados/)
  assert.equal(JSON.stringify(input), before)
  input.recipe.selectors.push('later')
  assert.deepEqual(description.recipe.selectors, ['--case', '', '  a  '])
})

test('keeps units, project/profile, skipped/unreached and retry attempts separate', () => {
  const input = { ...facts(), phase: 'finished', selection: { state: 'known', populations: [
    { scope: 'browser', unit: 'case', project: 'mobile', profile: 'core', selected: 4, started: 3, attempts: 5, outcomes: { passed: 1, failed: 1, skipped: 1, unreached: 1 } },
    { scope: 'jest', unit: 'suite', selected: 0 },
  ] }, policies: [{ scope: 'browser', mode: 'collect', workers: 1, retries: 2, maxFailures: 0 }] }
  const d = buildExecutionDescription(input)
  const human = formatExecutionDescription(d)
  assert.match(human, /browser \/ mobile \/ core.*4 case selecionados.*3 iniciados.*5 tentativas/)
  assert.match(human, /jest.*0 suite selecionados/)
  assert.match(human, /mode|modo=collect/)
  assert.equal(d.selection.populations[1].started, undefined)
  assert.doesNotMatch(human, /total/i)
})

test('rejects malformed observations rather than converting discovery failures to zero', () => {
  assert.throws(() => buildExecutionDescription({ ...facts(), selection: { state: 'unknown' } }), /reason/)
  for (const selected of [-1, NaN, 1.5, '4']) assert.throws(() => buildExecutionDescription({ ...facts(), selection: { state: 'known', populations: [{ scope: 'engine', unit: 'case', selected }] } }), /selected/)
  assert.throws(() => buildExecutionDescription({ ...facts(), policies: [{ scope: 'engine', retries: -1 }] }), /retries/)
  assert.throws(() => buildExecutionDescription({ ...facts(), executor: { effective, baseline: { ...baseline, executor: 'auto' }, host } }), /executor/)
})
