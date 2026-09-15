import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function classify(input: string) {
  const result = spawnSync('bash', ['scripts/ci/classify-docs-only.sh'], { input, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  return result.stdout.trim()
}
describe('CI documentation scope', () => {
  it.each([
    ['docs/ui/PRODUCT-CONTRACT.md', 'true'],
    ['docs/a.md\ndocs/b.md\n', 'true'],
    ['ui/src/features/shared/entity-identity.tsx', 'false'],
    ['docs/a.md\nui/src/App.tsx', 'false'],
    ['tests/browser/ui-consistency.spec.ts', 'false'],
    ['.context/patterns/ui-composition.yaml', 'false'],
    ['AGENTS.md', 'false'], ['DESIGN.md', 'false'],
    ['.github/workflows/ci.yml', 'false'], ['', 'false'], ['\n', 'false'],
  ])('classifies %j as %s', (input, expected) => expect(classify(input)).toBe(expected))
  it('consumes ten thousand paths including the final path without newline', () => {
    const paths = Array.from({ length: 10000 }, (_, i) => `docs/${i}.md`)
    paths[1] = 'ui/src/App.tsx'
    expect(classify(paths.join('\n'))).toBe('false')
  })
})
