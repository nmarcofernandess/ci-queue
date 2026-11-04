// Consumer recipe, not queue infrastructure: preparation, test, report and cleanup.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const temporary = mkdtempSync(join(tmpdir(), 'ci-example-resource-'))
const report = {schemaVersion: 1, status: 'failed', cleanup: 'uncertain'}
try {
  writeFileSync(join(temporary, 'input'), 'consumer-owned')
  assert.equal(readFileSync(join(temporary, 'input'), 'utf8'), 'consumer-owned')
  assert.equal(process.argv.includes('--fail'), false, 'intentional example failure')
  report.status = 'passed'
} catch (error) {
  report.error = error.message
  process.exitCode = 1
} finally {
  rmSync(temporary, {recursive: true, force: true})
  report.cleanup = existsSync(temporary) ? 'uncertain' : 'confirmed'
  mkdirSync('artifacts/example', {recursive: true})
  writeFileSync('artifacts/example/report.json', JSON.stringify(report, null, 2) + '\n')
}
