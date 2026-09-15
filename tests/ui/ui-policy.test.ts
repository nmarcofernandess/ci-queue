import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const uiRoot = resolve('ui')
function lint(snippet: string, filename = 'src/features/status/policy-case.tsx') {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', filename, '--format', 'json'], { cwd: uiRoot, input: snippet, encoding: 'utf8' })
  expect(result.error).toBeUndefined()
  expect(result.stdout, result.stderr).not.toBe('')
  const messages = JSON.parse(result.stdout)[0].messages as { ruleId: string | null; message: string; fatal?: boolean }[]
  expect(messages.filter(message => message.fatal), result.stdout).toEqual([])
  return messages.filter(message => ['no-restricted-imports', 'no-restricted-syntax'].includes(message.ruleId ?? ''))
}
describe('UI composition policy through installed ESLint parser', () => {
  it.each([
    "import { Drawer } from 'vaul'; export { Drawer }",
    "export { Dialog } from 'radix-ui'",
    "export * from '@radix-ui/react-dialog'",
    "import { Drawer as Alias } from '@/components/ui/drawer'; export { Alias }",
    "import * as Drawer from '@/components/ui/drawer'; export { Drawer }",
    "export { Drawer } from '../../components/ui/drawer'",
    "export * from '@/components/ui/drawer.tsx'",
  ])('rejects direct primitive or drawer import: %s', snippet => {
    expect(lint(snippet).some(message => message.ruleId === 'no-restricted-imports')).toBe(true)
  })
  it('allows shared DetailDrawer and named semantic owners', () => {
    expect(lint("export { DetailDrawer } from '@/features/shared/detail-drawer'")).toEqual([])
    expect(lint("export { DrawerTitle } from '@/components/ui/drawer'", 'src/features/shared/entity-identity.tsx')).toEqual([])
    expect(lint("export { Drawer } from '@/components/ui/drawer'", 'src/features/shared/detail-drawer.tsx')).toEqual([])
  })
  it.each(['data-icon', 'data-icon={true}', 'data-icon="wrong"', 'data-icon={"inline-start"}'])('rejects invalid icon position %s', attribute => {
    expect(lint(`export function Case() { return <svg ${attribute} /> }`).some(message => message.ruleId === 'no-restricted-syntax')).toBe(true)
  })
  it.each(['data-icon="inline-start"', 'data-icon="inline-end"', ''])('allows explicit icon position or icon-only: %s', attribute => {
    expect(lint(`export function Case() { return <svg ${attribute} /> }`)).toEqual([])
  })
  it.each([
    '"[&_svg]:size-12"', '"[&>svg]:w-10"',
    '{true ? "[&_svg]:h-6" : "flex"}', '{`flex [&_svg]:size-12`}',
  ])('rejects descendant SVG sizing in JSX class expression %s', expression => {
    expect(lint(`export function Case() { return <div className=${expression} /> }`).some(message => message.ruleId === 'no-restricted-syntax')).toBe(true)
  })
  it('allows sizing in explicit owner and unrelated ordinary feature classes', () => {
    expect(lint('export function Case() { return <div className="[&_svg]:size-12" /> }', 'src/features/shared/status-indicator.tsx')).toEqual([])
    expect(lint('export function Case() { return <div className="size-12 text-sm select-text!" /> }')).toEqual([])
  })
})
