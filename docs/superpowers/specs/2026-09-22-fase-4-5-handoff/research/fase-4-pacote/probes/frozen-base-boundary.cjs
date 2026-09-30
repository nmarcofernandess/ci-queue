// Read-only audit probe. Mirrors the observed argument/order boundary, not a full runJob.
// No Git, child recipe, queue, repository or host installation is invoked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ticket = { id: 'synthetic', headSha: 'a'.repeat(40), flags: { fetchBase: 'origin/dev' } };
const preflight = { headSha: ticket.headSha, baseSha: 'b'.repeat(40), branch: 'lane', statusShort: '' };
// buildJobEnv currently derives base only from its ticket argument.
function baseFields(argument) {
  const baseSha = argument.preflight?.baseSha ?? '';
  return { DIETFLOW_CI_BASE_SHA: baseSha, LOCAL_CI_BASE_SHA: baseSha };
}
// runJob currently builds the environment before merging `preflight` into ticket.
const environmentForChild = baseFields(ticket);
const storedRunning = { ...ticket, preflight };
assert.equal(environmentForChild.DIETFLOW_CI_BASE_SHA, '');
assert.equal(storedRunning.preflight.baseSha, 'b'.repeat(40));
const result = {
  method: 'Synthetic values exercising the observed argument/order boundary only',
  source: 'nmarcofernandess/ci-queue@24d6a2b417876db209db4519c3826566ab94a1e7 src/core/runner.ts: buildJobEnv/runJob',
  environmentForChild,
  recordedBaseSha: storedRunning.preflight.baseSha,
  sameBaseInRecordAndEnvironment: environmentForChild.DIETFLOW_CI_BASE_SHA === storedRunning.preflight.baseSha,
  fullRunnerExecuted: false,
  consumerFallback: 'smoketest-local.sh reads origin/dev again if DIETFLOW_CI_BASE_SHA is empty',
};
fs.writeFileSync(path.join(__dirname, '../results/frozen-base-boundary.json'), JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify(result, null, 2));
