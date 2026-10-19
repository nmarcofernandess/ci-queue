import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ESLint parse in-process is slow under queue load; 5s flake.

const uiRoot = resolve('ui')
function lint(snippet: string, filename = 'src/features/status/policy-case.tsx') {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', filename, '--format', 'json'], { cwd: uiRoot, input: snippet, encoding: 'utf8' })
  expect(result.error).toBeUndefined()
  expect(result.stdout, result.stderr).not.toBe('')
  const messages = JSON.parse(result.stdout)[0].messages as { ruleId: string | null; message: string; fatal?: boolean }[]
  expect(messages.filter(message => message.fatal), result.stdout).toEqual([])
  return messages.filter(message => ['no-restricted-imports', 'no-restricted-syntax', 'ui-composition/native-spacing'].includes(message.ruleId ?? ''))
}
describe('UI composition policy through installed ESLint parser', () => {
  // flake under parallel queue load: ESLint lint() >5s

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
  }, 30_000)
  it('allows shared DetailDrawer and named semantic owners', () => {
    expect(lint("export { DetailDrawer } from '@/features/shared/detail-drawer'")).toEqual([])
    expect(lint("export { DrawerTitle } from '@/components/ui/drawer'", 'src/features/shared/entity-identity.tsx')).toEqual([])
    expect(lint("export { Drawer } from '@/components/ui/drawer'", 'src/features/shared/detail-drawer.tsx')).toEqual([])
  }, 30_000)
  it.each(['data-icon', 'data-icon={true}', 'data-icon="wrong"', 'data-icon={"inline-start"}'])('rejects invalid icon position %s', attribute => {
    expect(lint(`export function Case() { return <svg ${attribute} /> }`).some(message => message.ruleId === 'no-restricted-syntax')).toBe(true)
  }, 30_000)
  it.each(['data-icon="inline-start"', 'data-icon="inline-end"', ''])('allows explicit icon position or icon-only: %s', attribute => {
    expect(lint(`export function Case() { return <svg ${attribute} /> }`)).toEqual([])
  }, 30_000)
  it.each([
    '"[&_svg]:size-12"', '"[&>svg]:w-10"',
    '{true ? "[&_svg]:h-6" : "flex"}', '{`flex [&_svg]:size-12`}',
  ])('rejects descendant SVG sizing in JSX class expression %s', expression => {
    expect(lint(`export function Case() { return <div className=${expression} /> }`).some(message => message.ruleId === 'no-restricted-syntax')).toBe(true)
  }, 30_000)
  it('allows sizing in explicit owner and unrelated ordinary feature classes', () => {
    expect(lint('export function Case() { return <div className="[&_svg]:size-12" /> }', 'src/features/shared/status-indicator.tsx')).toEqual([])
    expect(lint('export function Case() { return <div className="size-12 text-sm select-text!" /> }')).toEqual([])
  }, 30_000)
  it.each([
    '<ProjectChip name="A" />',
    '<ProjectChip name="A" mode={mode} />',
    '<ProjectChip name="A" mode={"inline"} />',
    '<ProjectChip name="A" mode />',
    '<ProjectChip name="A" mode="inline" className="max-w-full" />',
    '<ProjectChip name="A" mode="compact-context" className={classes} />',
  ])('rejects ProjectChip presentation forks: %s', chip => {
    expect(lint(`export function Case() { return ${chip} }`).some(message => message.ruleId === 'no-restricted-syntax')).toBe(true)
  }, 30_000)
  it.each(['inline', 'compact-context'])('allows explicit ProjectChip mode %s', mode => {
    expect(lint(`export function Case() { return <ProjectChip name="A" mode="${mode}" /> }`)).toEqual([])
  }, 30_000)
})


describe('native primitive spacing', () => {
  it.each([
    ['item', 'Item', 'p-0'],
    ['item', 'Item', 'sm:px-0!'],
    ['table', 'TableCell', 'px-0'],
    ['table', 'TableHead', 'first:pl-0'],
    ['table', 'Table', '[&_td]:p-0'],
    ['popover', 'PopoverContent', 'gap-2'],
    ['card', 'CardHeader', 'px-4'],
    ['drawer', 'DrawerHeader', 'pb-2'],
    ['drawer', 'DrawerFooter', 'gap-1'],
  ])('rejects native %s/%s spacing override %s through aliased binding', (family, component, classes) => {
    const filename = family === 'drawer' ? 'src/features/shared/detail-drawer.tsx' : undefined
    expect(lint(`import { ${component} as Native } from '@/components/ui/${family}'; export function Case() { return <Native className="${classes}" /> }`, filename)
      .some(message => message.ruleId === 'ui-composition/native-spacing')).toBe(true)
  }, 30_000)

  it('rejects namespace imports and static conditional/template/cn class branches', () => {
    for (const expression of ['{active ? "p-0" : "w-4"}', '{`w-4 ${active ? "px-0" : ""}`}', '{cn("w-4", { "p-0": active })}']) {
      expect(lint(`import * as Native from '@/components/ui/item'; export function Case() { return <Native.Item className=${expression} /> }`)
        .some(message => message.ruleId === 'ui-composition/native-spacing')).toBe(true)
    }
  }, 30_000)

  it.each([
    ['FactsTable', 'facts-table', 'p-0'],
    ['DataTableFrame', 'data-table-frame', '[&_th]:px-0'],
  ])('rejects erased padding through shared %s owner', (component, owner, classes) => {
    expect(lint(`import { ${component} } from '@/features/shared/${owner}'; export function Case() { return <${component} className="${classes}" /> }`)
      .some(message => message.ruleId === 'ui-composition/native-spacing')).toBe(true)
  }, 30_000)

  it.each(['max-h-60', 'md:max-h-[300px]', 'max-h-[calc(100vh-2rem)]'])('rejects fixed FilterSelect popup height %s', classes => {
    expect(lint(`import { SelectContent } from '@/components/ui/select'; export function Case() { return <SelectContent className="${classes}" /> }`, 'src/features/shared/filter-select.tsx')
      .some(message => message.ruleId === 'ui-composition/native-spacing')).toBe(true)
  }, 30_000)

  it('allows legitimate layout and approved adaptations', () => {
    expect(lint(`
      import { Item, ItemGroup } from '@/components/ui/item'
      import { Table, TableCell, TableHead } from '@/components/ui/table'
      import { CardHeader, CardContent, CardFooter } from '@/components/ui/card'
      import { PopoverContent } from '@/components/ui/popover'
      import { Empty } from '@/components/ui/empty'
      import { Button } from '@/components/ui/button'
      export function Case() { return <>
        <Item size="xs" className="w-60 shrink-0" />
        <ItemGroup className="flex-row gap-0 pb-3 has-data-[size=sm]:gap-0" />
        <Table className="table-fixed [&_tr>:first-child]:pl-(--card-spacing)" />
        <TableHead className="w-32 py-2 whitespace-normal" />
        <TableCell className="sticky left-0 min-w-0 max-w-0 text-right" />
        <CardHeader className="shrink-0 border-b" />
        <CardContent className="px-0" />
        <CardFooter className="border-0 bg-transparent" />
        <PopoverContent className="w-64" />
        <Empty className="p-0" />
        <Button className="h-auto text-wrap" />
      </> }
    `)).toEqual([])
  }, 30_000)

  it('does not mistake unrelated or shadowed components for native imports', () => {
    expect(lint(`import { Item } from 'other-package'; export function Case() { return <Item className="p-0" /> }`)).toEqual([])
    expect(lint(`import { Item } from '@/components/ui/item'; export function Case({ Item }) { return <Item className="p-0" /> }`)).toEqual([])
  }, 30_000)

  it('leaves dynamic classes and native sources outside the static consumer check', () => {
    expect(lint(`import { Item } from '@/components/ui/item'; export function Case() { return <Item className={classes} /> }`)).toEqual([])
    expect(lint(`import { Item } from '@/components/ui/item'; export function Case() { return <Item className="p-0" /> }`, 'src/components/ui/example.tsx')).toEqual([])
  }, 30_000)
})
