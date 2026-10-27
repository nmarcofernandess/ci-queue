import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import type { JobRecord } from '../../ui/src/lib/types'
import type { DashboardProjectState } from '../../ui/src/lib/types'

const fixtureProjects = {
  schemaVersion: 1,
  registryRevision: 1,
  bootstrapProjectId: 'example',
  observedUnregistered: [],
  projects: [{
    id: 'example',
    displayName: 'Example',
    repositoryPath: '/example',
    resolvedRepositoryPath: '/example',
    repositoryAvailable: true,
    configPath: null,
    archivedAt: null,
    revision: 1,
    bindingState: 'linked',
  }],
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ci-queue.lastProjectId', 'example'))
  await page.route('**/health', (route) =>
    route.fulfill({ json: { ok: true, apiVersion: 1, serverTime: new Date().toISOString() } })
  )
})

// Isolated API fixtures exercise the real Vite UI without launching any job.
const baseJob = { id: 'observed', preset: 'smoke', projectId: 'example', branch: 'example-branch', headSha: 'abcdef12', startedAt: new Date(Date.now()-61000).toISOString(), createdAt: new Date().toISOString(), cwd: '/example', progressEnabled: true }
const nodes = [
  { id: 'e2e', label: 'E2E', kind: 'stage', status: 'running' },
  { id: 'pw', parentId: 'e2e', label: 'Playwright', kind: 'suite', status: 'running', detail: { kind: 'cases', completed: 0, total: 1, passed: 0, failed: 0, running: 1, pending: 0, skipped: 0 } },
  { id: 'case', parentId: 'pw', label: 'Retry case', kind: 'case', status: 'running', retryCount: 1 },
]

test('live drawer preserves identity, recursive counts, cursor and terminal polling boundary', async ({ page }) => {
  let terminal = false
  const offsets: number[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const job = { ...baseJob, status: terminal ? 'passed' : 'running', ...(terminal ? { finishedAt: new Date().toISOString(), durationMs: 62000 } : {}), progressSummary: { available: true, schemaVersion: 1, nodes, roots: [nodes[0]], active: nodes } }
    const data: Record<string, unknown> = {
      '/api/session': { csrfToken: 'fixture', canReveal: false, clipboardLimitBytes: 1000000 },
      '/api/status': { project: { id: 'example', name: 'Example' }, running: terminal ? null : job, queued: [], history: terminal ? [job] : [], globalOccupancy: !terminal },
      '/api/executions': { jobs: terminal ? [job] : [], hasMore: false, nextCursor: null, coverage: { unattributedRecords: 0 } },
      '/api/dashboard-state': { revision: 0, presets: ['smoke'], meta: null, pending: [], pendingError: null },
      '/api/machine': { disk: { availableBytes: 1000000000 } },
      '/api/job': job,
    }
    if (url.pathname === '/api/log') {
      const offset = Number(url.searchParams.get('offset')); offsets.push(offset)
      const text = terminal ? 'first line\nterminal line\n' : 'first line\n'
      await route.fulfill({ json: { jobId: baseJob.id, content: text.slice(offset), offset, nextOffset: text.length, sourceBytes: text.length, complete: true, error: null } }); return
    }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/#status')
  const currentState = page.locator('[data-slot=entity-identity][data-presentation=current] [data-slot=status-indicator]')
  await expect(currentState).toHaveAttribute('aria-label', 'Em execução · Flaky detectado')
  await expect(currentState).toHaveClass(/text-warning/)
  await expect(page.getByText('Atualizando', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'smoke', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Retry case')).toBeVisible()
  await expect(drawer.getByText('0 de 1')).toBeVisible()
  const expand = drawer.locator('[data-slot=progress-row][data-node-id=e2e] [data-slot=collapsible-trigger]')
  await expect(expand).toHaveCount(1)
  await expect(expand).toHaveAttribute('data-state', 'open')
  const openRotation = await expand.locator('svg').evaluate(el => getComputedStyle(el).rotate)
  await expand.getByText('E2E', {exact:true}).click()
  await expect(expand).toHaveAttribute('data-state', 'closed')
  await expect.poll(() => expand.locator('svg').evaluate(el => getComputedStyle(el).rotate)).not.toBe(openRotation)
  await expand.click()

  await expect(drawer.getByRole('rowheader', { name: 'Estado', exact: true })).toHaveCount(0)
  await drawer.getByRole('tab', { name: 'Log', exact: true }).click()
  await expect(drawer.getByText('first line', { exact: true })).toBeVisible()
  const logBounds = await drawer.locator('pre').evaluate(el => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const rect = range.getBoundingClientRect()
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height}
  })
  await page.mouse.move(logBounds!.x + 1, logBounds!.y + 5)
  await page.mouse.down()
  await page.mouse.move(logBounds!.x + logBounds!.width - 1, logBounds!.y + 5, {steps:12})
  await page.mouse.up()
  await expect(drawer).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('first')

  terminal = true
  await expect(drawer.locator('pre')).toContainText('terminal line', { timeout: 8000 })
  await expect(drawer.getByLabel('Passou · Flaky detectado', { exact: true })).toBeVisible()
  await expect(drawer.locator('.animate-spin')).toHaveCount(0)
  await expect(drawer).toContainText('Duração: 1m 2s')
  const count = offsets.length
  await page.waitForTimeout(2500)
  expect(offsets.length).toBe(count)
  await drawer.getByRole('tab', {name:'Progresso', exact:true}).click()
  await expect(drawer.locator('.animate-spin')).toHaveCount(0)
  await expect(drawer.getByLabel('Execução encerrada; etapa sem conclusão registrada').first()).toBeVisible()
  expect(offsets[0]).toBe(0)
  expect(offsets.slice(1).every(offset => offset > 0)).toBe(true)
})

for (const width of [390, 820, 1440]) {
  test(`history controls, empty state and trigger boundaries at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const queries: URL[] = []
    const job = { ...baseJob, status: 'passed', finishedAt: new Date().toISOString(), durationMs: 62000 }
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const data: Record<string, unknown> = {
        '/api/status': { project: { id: 'example', name: 'Example' }, running: null, queued: [], history: [job], globalOccupancy: false },
        '/api/session': { csrfToken: 'fixture', canReveal: false },
        '/api/dashboard-state': { revision: 0, presets: ['smoke'], meta: null, pending: [] },
        '/api/machine': {}, '/api/job': job,
      }
      if (url.pathname === '/api/executions') {
        queries.push(url)
        data[url.pathname] = { jobs: url.searchParams.get('q') ? [] : [job], hasMore: false, coverage: { unattributedRecords: 0 } }
      }
      if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
    })
    await page.goto('/#status')
    await expect(page.getByText('Fila livre', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Histórico', exact: true })).toHaveCount(0)
    const search = page.getByRole('textbox', { name: 'Buscar por preset, branch, SHA ou ticket' })
    await search.fill('missing')
    await expect(page.getByText('Nenhuma execução corresponde aos filtros')).toBeVisible()
    expect(queries.at(-1)?.searchParams.get('q')).toBe('missing')
    await page.getByRole('button', { name: 'Limpar', exact: true }).click()
    await page.getByRole('combobox').filter({ hasText: 'Todo período' }).click()
    await expect(page.getByRole('option', { name: 'Hoje', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Intervalo', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByText('abcdef12 · example-branch', { exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'smoke', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').locator('[data-slot=drawer-title]')).toHaveCSS('text-align', 'left')
    await expect(page.getByRole('dialog').locator('[data-slot=drawer-description]')).toHaveCSS('text-align', 'left')
    await expect(page.getByRole('dialog').getByRole('rowheader', { name: 'Ticket', exact: true })).toBeVisible()
    const bounds = await page.getByRole('dialog').boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('history keeps the loaded query, its next page and an accessible refresh error', async ({ page }) => {
  await page.clock.install()
  const firstPage = Array.from({ length: 50 }, (_, index) => ({
    ...baseJob,
    id: `history-a-${index + 1}`,
    preset: `history-a-${index + 1}`,
    status: 'passed',
    finishedAt: new Date().toISOString(),
    durationMs: 62_000,
  }))
  const nextPage = {
    ...baseJob,
    id: 'history-a-page-two',
    preset: 'history-a-page-two',
    status: 'passed',
    finishedAt: new Date().toISOString(),
    durationMs: 62_000,
  }
  const recoveredFirstPage = Array.from({ length: 50 }, (_, index) => ({
    ...baseJob,
    id: `history-recovered-${index + 1}`,
    preset: `history-recovered-${index + 1}`,
    status: 'passed',
    finishedAt: new Date().toISOString(),
    durationMs: 62_000,
  }))
  let rejectRefresh = false
  let generation: 'a' | 'b' = 'a'

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/executions') {
      if (url.searchParams.get('q') === 'history-b') {
        await route.fulfill({ status: 503, json: { error: 'History B unavailable' } })
        return
      }
      if (url.searchParams.get('cursor') === 'page-two') {
        await route.fulfill({
          json: {
            jobs: [nextPage],
            hasMore: false,
            snapshotBefore: 'fixture-snapshot',
            nextCursor: null,
            coverage: { unattributedRecords: 0 },
          },
        })
        return
      }
      if (rejectRefresh) {
        await route.fulfill({ status: 503, json: { error: 'History refresh unavailable' } })
        return
      }
      const activeFirstPage = generation === 'a' ? firstPage : recoveredFirstPage
      await route.fulfill({
        json: {
          jobs: activeFirstPage,
          hasMore: generation === 'a',
          snapshotBefore: `fixture-snapshot-${generation}`,
          nextCursor: generation === 'a' ? 'page-two' : null,
          coverage: { unattributedRecords: 0 },
        },
      })
      return
    }

    const data: Record<string, unknown> = {
      '/api/status': {
        project: { id: 'example', name: 'Example' },
        running: null,
        queued: [],
        history: generation === 'a' ? firstPage : recoveredFirstPage,
        historyRevision: `history-${generation}`,
        globalOccupancy: false,
      },
      '/api/session': { csrfToken: 'fixture', canReveal: false },
      '/api/dashboard-state': { revision: 0, presets: ['smoke'], meta: null, pending: [] },
      '/api/machine': {},
      '/api/job': firstPage[0],
    }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })

  await page.goto('/#status')
  const history = page.getByRole('table', { name: 'Execuções' }).last()
  await expect(history.getByRole('button', { name: 'history-a-50', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click()
  await expect(history.getByRole('button', { name: 'history-a-page-two', exact: true })).toBeVisible()

  rejectRefresh = true
  await page.clock.fastForward(10_000)
  const refreshError = page.getByRole('alert')
  await expect(refreshError).toContainText('History refresh unavailable')
  await expect(history.getByRole('button', { name: 'history-a-50', exact: true })).toBeVisible()
  await expect(history.getByRole('button', { name: 'history-a-page-two', exact: true })).toBeVisible()

  rejectRefresh = false
  generation = 'b'
  await page.clock.fastForward(10_000)
  await page.clock.fastForward(10_000)
  await expect(refreshError).toHaveCount(0)
  await expect(history.getByRole('button', { name: 'history-recovered-50', exact: true })).toBeVisible()
  await expect(history.getByRole('button', { name: 'history-a-50', exact: true })).toHaveCount(0)
  await expect(history.getByRole('button', { name: 'history-a-page-two', exact: true })).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Buscar por preset, branch, SHA ou ticket' }).fill('history-b')
  await expect(page.getByText('History B unavailable', { exact: true })).toBeVisible()
  await expect(history.getByRole('button', { name: 'history-a-50', exact: true })).toHaveCount(0)
})

test('history drops project A rows before a failed project B query', async ({ page }, testInfo) => {
  testInfo.setTimeout(10_000)
  const projects = {
    ...fixtureProjects,
    projects: [
      ...fixtureProjects.projects,
      {
        ...fixtureProjects.projects[0],
        id: 'other',
        displayName: 'Other',
        repositoryPath: '/other',
        resolvedRepositoryPath: '/other',
      },
    ],
  }
  const projectAJob = {
    ...baseJob,
    id: 'history-project-a',
    preset: 'history-project-a',
    status: 'passed',
    finishedAt: new Date().toISOString(),
    durationMs: 62_000,
  }

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/executions') {
      if (url.searchParams.get('projectId') === 'other') {
        await route.fulfill({ status: 503, json: { error: 'Other history unavailable' } })
        return
      }
      await route.fulfill({
        json: {
          jobs: [projectAJob],
          hasMore: false,
          nextCursor: null,
          coverage: { unattributedRecords: 0 },
        },
      })
      return
    }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: projects })
      return
    }
    const data: Record<string, unknown> = {
      '/api/status': { project: { id: 'example', name: 'Example' }, running: null, queued: [], history: [projectAJob], globalOccupancy: false },
      '/api/session': { csrfToken: 'fixture', canReveal: false },
      '/api/dashboard-state': { revision: 0, presets: ['smoke'], meta: null, pending: [] },
      '/api/machine': {},
      '/api/job': projectAJob,
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })

  await page.goto('/#status')
  const history = page.getByRole('table', { name: 'Execuções' }).last()
  await expect(history.getByRole('button', { name: 'history-project-a', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Example', exact: true }).click()
  await page.getByRole('button', { name: 'Other /other', exact: true }).click()
  await expect(page.getByText('Other history unavailable', { exact: true })).toBeVisible()
  await expect(history.getByRole('button', { name: 'history-project-a', exact: true })).toHaveCount(0)
})

test('worktree selection persists and copy menu exposes only the two formats', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const trees = ['one', 'two'].map((id, index) => ({ id, path: `/example/${id}`, branch: `branch-${id}`, headSha: 'abcdef12', dirty: index === 0, changedEntries: index === 0 ? 1 : 0, ahead: 0, behind: 0, locked: false, size: { bytes: 1073741824, state: 'ready', observedAt: new Date().toISOString(), error: null } }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const data: Record<string, unknown> = {
      '/api/session': { csrfToken: 'fixture', canReveal: false, clipboardLimitBytes: 1000000 },
      '/api/dashboard-state': { projectId: 'example', revision: 0, presets: [], meta: null, pending: [] },
      '/api/worktrees': { worktrees: trees, baseRef: 'main', error: null },
      '/api/worktree-view': trees.find(tree => tree.id === url.searchParams.get('id')),
    }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.clock.install()
  await page.goto('/#worktrees')
  await page.getByRole('checkbox', { name: 'Selecionar one', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Selecionar two', exact: true }).check()
  await expect(page.getByText('2 selecionadas', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copiar', exact: true }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(2)
  await page.getByRole('menuitem', { name: 'Copiar caminhos' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/example/one\n/example/two')
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Selecionar one', exact: true })).toBeChecked()
  await page.getByRole('button', { name: 'one', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('/example/one', { exact: true })).toBeVisible()
  trees[0].headSha = 'updated-sha'
  trees[0].size.state = 'measuring'
  await page.clock.fastForward(60_001)
  await expect(page.getByRole('dialog').getByText('updated-sha', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Medindo…', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('row', { name: /Tamanho/ })).toContainText('1 GB')
})

test('log pause preserves visible text, fixed regions and diagnostic bundle', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  let text = Array.from({length:200}, (_,i) => `line ${i}`).join('\n')+'\n'
  let reads = 0
  const job = {...baseJob, status:'running'}
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/log') {
      reads++
      const offset = Number(url.searchParams.get('offset'))
      await route.fulfill({json:{content:text.slice(offset),offset,nextOffset:text.length,complete:true,sourceBytes:text.length,error:null}}); return
    }
    const data:Record<string,unknown> = {
      '/api/session':{csrfToken:'fixture',clipboardLimitBytes:1000000},
      '/api/status':{running:job, queued:[],history:[]}, '/api/job':job,
      '/api/dashboard-state':{revision:0,presets:[],meta:null,pending:[]}, '/api/machine':{},
      '/api/diagnostic':{available:true,jobId:job.id,ticket:job,coverage:{ticket:'complete',logs:{available:true}},resources:{coverage:'unavailable'}},
      '/api/log/export':{jobId:job.id,content:text,coverage:{available:true,complete:true,sourceBytes:text.length}},
    }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({json:data[url.pathname]??{}})
  })
  await page.goto('/#status')
  await page.getByRole('button',{name:'smoke',exact:true}).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('tab',{name:'Log',exact:true}).click()
  const pre=drawer.locator('pre')
  await expect(pre).toContainText('line 199')
  const header=drawer.locator('[data-slot="drawer-header"]')
  const initialHeader=await header.boundingBox()
  await pre.evaluate(el => { const viewport=el.parentElement!; viewport.scrollTop=0; viewport.dispatchEvent(new Event('scroll',{bubbles:true})) })
  await expect(drawer.getByRole('button',{name:'Acompanhar',exact:true})).toBeVisible()
  const previousReads=reads
  text+='new output\n'
  await expect.poll(()=>reads).toBeGreaterThan(previousReads)
  await expect(pre).not.toContainText('new output')
  expect((await header.boundingBox())!.y).toBe(initialHeader!.y)
  await drawer.getByRole('button',{name:'Acompanhar',exact:true}).click()
  await expect(pre).toContainText('new output')
  await drawer.getByRole('button',{name:'Copiar contexto',exact:true}).click()
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('observed')
  await drawer.getByRole('button',{name:'Diagnóstico',exact:true}).click()
  await expect(page.getByRole('button',{name:'Baixar log',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Copiar diagnóstico',exact:true}).click()
  await expect(page.getByText('Diagnóstico copiado.',{exact:true})).toBeVisible()
  const copied=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()))
  expect(copied.sources.logExport.content).toContain('new output')
  expect(copied.sources.diagnostic.ticket.id).toBe('observed')
  const downloaded=page.waitForEvent('download')
  await page.getByRole('button',{name:'Baixar diagnóstico',exact:true}).click()
  expect((await downloaded).suggestedFilename()).toBe('ci-diagnostic-observed.json')
})

test('meta creates, cancels edits, reports save failure and removes without SHA input',async({page})=>{
  let state:any={projectId:'example',revision:0,presets:['smoke'],meta:null,pending:[],pendingError:null,context:{kind:'project',projectId:'example'}}
  let fail=false
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path==='/api/dashboard-state' && route.request().method()==='POST') {
      if(fail) {await route.fulfill({status:409,json:{error:'Conflito de revisão'}});return}
      const mutation=route.request().postDataJSON()
      state={...state,revision:state.revision+1,meta:mutation.action==='remove-meta'?null:{...mutation.meta,checks:mutation.meta.presets.map((preset:string)=>({preset,status:preset==='smoke'?'missing':'recipe-missing'}))}}
      await route.fulfill({json:state});return
    }
    const data:Record<string,unknown>={'/api/session':{csrfToken:'fixture'},'/api/status':{running:null,queued:[],history:[]},'/api/executions':{jobs:[],coverage:{}},'/api/dashboard-state':state,'/api/machine':{}}
    if (path === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({json:data[path]??{}})
  })
  await page.goto('/#status')
  await page.getByRole('button',{name:'Abrir meta',exact:true}).click()
  const drawer=page.getByRole('dialog')
  await drawer.getByRole('button',{name:'Declarar meta',exact:true}).click()
  await drawer.getByLabel('Nome',{exact:true}).fill('Entrega')
  await drawer.getByLabel('Descrição',{exact:true}).fill('Objetivo de exemplo')
  await drawer.getByRole('checkbox',{name:'smoke',exact:true}).check()
  await drawer.getByLabel('Receita futura',{exact:true}).fill('future')
  await drawer.getByRole('button',{name:'Adicionar',exact:true}).click()
  await expect(drawer.getByLabel('SHA',{exact:true})).toHaveCount(0)
  await drawer.getByRole('button',{name:'Salvar meta',exact:true}).click()
  await expect(drawer.getByRole('heading',{name:'Entrega',exact:true})).toBeVisible()
  await expect(drawer.getByText('Receita não declarada',{exact:true})).toBeVisible()
  await drawer.getByRole('button',{name:'Editar',exact:true}).click()
  await drawer.getByLabel('Nome',{exact:true}).fill('Descartar')
  await drawer.getByRole('button',{name:'Cancelar',exact:true}).click()
  expect(state.meta.name).toBe('Entrega')
  await drawer.getByRole('button',{name:'Editar',exact:true}).click()
  fail=true
  await drawer.getByRole('button',{name:'Salvar meta',exact:true}).click()
  await expect(page.getByText('Conflito de revisão',{exact:true})).toBeVisible()
  fail=false
  await drawer.getByRole('button',{name:'Cancelar',exact:true}).click()
  await drawer.getByRole('button',{name:'Remover',exact:true}).click()
  await page.getByRole('alertdialog').getByRole('button',{name:'Remover',exact:true}).click()
  await expect(drawer.getByText('Nenhuma meta declarada',{exact:true})).toBeVisible()
})


test('log tab keeps loading distinct from an unavailable ticket', async ({ page }) => {
  let releaseJob!: () => void
  const pendingJob = new Promise<void>(resolve => { releaseJob = resolve })
  const job = { ...baseJob, status: 'passed', finishedAt: new Date().toISOString(), durationMs: 62000 }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const data: Record<string, unknown> = {
      '/api/status': { project: { id: 'example', name: 'Example' }, running: null, queued: [], history: [job] },
      '/api/session': { csrfToken: 'fixture', canReveal: false },
      '/api/dashboard-state': { revision: 0, presets: ['smoke'], meta: null, pending: [] },
      '/api/machine': {},
      '/api/executions': { jobs: [job], hasMore: false },
      '/api/log': { content: 'retained log', offset: 0, nextOffset: 12, sourceBytes: 12, complete: true, error: null },
    }
    if (url.pathname === '/api/job') { await pendingJob; await route.fulfill({ json: job }); return }
    if (url.pathname === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/#status')
  await page.getByRole('button', { name: 'smoke', exact: true }).click()
  await page.getByRole('tab', { name: 'Log', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Carregando dados da execução…')).toBeVisible()
  await expect(drawer.getByText('Log indisponível', { exact: true })).toHaveCount(0)
  releaseJob()
  await expect(drawer.locator('pre')).toHaveText('retained log')
})

test('current stages fit eight, overflow horizontally and follow without stealing manual scroll', async ({ page }) => {
  let active = 0
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.clock.install()
  await page.route('**/api/**', async route => {
    const stages = Array.from({length: 12}, (_, index) => ({id: `stage-${index}`, label: `Etapa ${index + 1}`, kind: 'stage', status: index === active ? 'running' : index < active ? 'passed' : 'pending'}))
    const data: Record<string, unknown> = {
      '/api/session': {}, '/api/machine': {},
      '/api/status': {running: {...baseJob, status:'running', progressSummary:{available:true, roots:stages, nodes:stages}}, queued:[], history:[]},
      '/api/executions': {jobs:[],coverage:{}},
      '/api/dashboard-state': {presets:[],meta:null,pending:[]},
    }
    const path = new URL(route.request().url()).pathname
    if (path === '/api/projects') {
      await route.fulfill({ json: fixtureProjects })
      return
    }
    await route.fulfill({json:data[path] ?? {}})
  })
  await page.goto('/')
  const strip = page.getByLabel('Etapas da execução')
  const viewport = strip.locator('[data-slot="scroll-area-viewport"]')
  await expect(strip.getByText('Etapa 8', {exact:true})).toBeVisible()
  const geometry = await viewport.evaluate(el => {
    const items = el.querySelectorAll('[data-stage-index]')
    return {width:el.clientWidth, total:el.scrollWidth, first:items[0].getBoundingClientRect().left, eighth:items[7].getBoundingClientRect().right}
  })
  expect(geometry.eighth - geometry.first).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.total).toBeGreaterThan(geometry.width)
  // The status snapshot polls every 10 seconds; wait for its next published state.
  active = 10
  await page.clock.fastForward(10_000)
  await expect(strip.locator('[data-stage-index="10"]').getByLabel("Em execução", {exact:true})).toBeVisible()
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  await viewport.hover()
  await page.mouse.wheel(-1200, 0)
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBe(0)
  active = 11
  await page.clock.fastForward(10_000)
  await expect(strip.locator('[data-stage-index="11"]').getByLabel("Em execução", {exact:true})).toBeAttached()
  expect(await viewport.evaluate(el => el.scrollLeft)).toBe(0)
  await page.setViewportSize({width:390,height:844})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

async function allStatusFixture(page: import('@playwright/test').Page, empty = false, partial = false, longName = false) {
  const projects = ['alpha', 'beta'].map(id => ({ ...fixtureProjects.projects[0], id, displayName: id === 'alpha' ? (longName ? 'Alpha — projeto com nome suficientemente longo para truncar' : 'Alpha') : 'Beta', repositoryPath: `/${id}`, resolvedRepositoryPath: `/${id}` }))
  let states: DashboardProjectState[] = projects.map(project => ({
    projectId: project.id, projectName: project.displayName, revision: 1, catalog: 'linked', presets: ['check'], pendingError: null,
    meta: empty ? null : { name: `${project.displayName} entrega`, description: '', presets: ['check'], candidateSha: null, checks: partial && project.id === 'beta' ? null : [{ preset: 'check', status: 'pending', ticketId: null, headSha: null, finishedAt: null }] },
    pending: empty ? [] : [{ id: `${project.id}-advisory`, preset: `${project.id}-check`, reason: 'Validação recomendada', createdAt: '2026-09-29T10:00:00Z', headSha: 'abcdef12', pr: 42, latestTicketId: null, latestStatus: null }],
  }))
  const writes: URL[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/dashboard-state') {
      if (route.request().method() === 'POST') {
        writes.push(url)
        const mutation = route.request().postDataJSON()
        states = states.map(state => state.projectId === url.searchParams.get('projectId') ? { ...state, revision: state.revision + 1, meta: { ...mutation.meta, candidateSha: null, checks: [] } } : state)
      }
      const state = states.find(state => state.projectId === url.searchParams.get('projectId'))
      await route.fulfill({ json: url.searchParams.get('context') === 'all'
        ? { schemaVersion: 2, projects: states, projectErrors: partial ? [{ projectId: 'gamma', projectName: 'Gamma', error: 'Leitura indisponível' }] : [], context: { kind: 'all' } }
        : { ...state, context: { kind: 'project', projectId: state?.projectId } } })
      return
    }
    const data: Record<string, unknown> = {
      '/api/projects': { ...fixtureProjects, bootstrapProjectId: 'alpha', projects },
      '/api/session': { csrfToken: 'fixture' },
      '/api/status': { running: null, queued: [], history: [], context: { kind: 'all' } },
      '/api/executions': { jobs: [], coverage: {}, context: { kind: 'all' } },
      '/api/machine': {},
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/?context=all#status')
  return writes
}

test('all status mixes project previews and factual global empties', async ({ page }) => {
  await allStatusFixture(page)
  const cards = page.locator('aside')
  await expect(cards.getByText('Alpha entrega', { exact: true })).toBeVisible()
  await expect(cards.getByText('Beta entrega', { exact: true })).toBeVisible()
  await expect(cards.getByText('alpha-check', { exact: true })).toBeVisible()
  await expect(cards.getByText('beta-check', { exact: true })).toBeVisible()
  await expect(cards.getByText('Alpha', { exact: true })).toHaveCount(2)
  await expect(cards.getByText('Beta', { exact: true })).toHaveCount(2)
  await expect(cards.getByText('Selecione um projeto')).toHaveCount(0)
  await allStatusFixture(page, true)
  await expect(cards.getByText('Nenhuma meta declarada.', { exact: true })).toBeVisible()
  await expect(cards.getByText('Nenhuma pendência.', { exact: true })).toBeVisible()
})

test('all metas drawer chooses a local owner and preserves drafts and global scope', async ({ page }) => {
  const writes = await allStatusFixture(page, true)
  await page.getByRole('button', { name: 'Abrir metas', exact: true }).click()
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Metas', exact: true }) })
  await expect(drawer.getByRole('button', { name: 'Todos os projetos', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Declarar meta', exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Todos os projetos', exact: true }).click()
  await page.getByRole('button', { name: /Beta.*\/beta/ }).click()
  await drawer.getByRole('button', { name: 'Declarar meta', exact: true }).click()
  await drawer.getByLabel('Nome', { exact: true }).fill('Beta draft')
  await drawer.getByRole('button', { name: 'Beta', exact: true }).click()
  await page.getByRole('button', { name: /Alpha.*\/alpha/ }).click()
  await drawer.getByRole('button', { name: 'Alpha', exact: true }).click()
  await page.getByRole('button', { name: /Beta.*\/beta/ }).click()
  await drawer.getByRole('button', { name: 'Declarar meta', exact: true }).click()
  await expect(drawer.getByLabel('Nome', { exact: true })).toHaveValue('Beta draft')
  await drawer.getByRole('checkbox', { name: 'check', exact: true }).check()
  await drawer.getByRole('button', { name: 'Salvar meta', exact: true }).click()
  await expect(drawer.getByText('Nenhuma meta declarada', { exact: true })).toHaveCount(0)
  expect(writes).toHaveLength(1)
  expect(writes[0].searchParams.get('projectId')).toBe('beta')
  expect(writes[0].searchParams.has('context')).toBe(false)
  await drawer.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.locator('header').first().getByRole('button', { name: 'Todos os projetos', exact: true })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('context')).toBe('all')
})

test('all pendings drawer filters locally without a creation action', async ({ page }) => {
  await allStatusFixture(page)
  await page.getByRole('button', { name: 'Ver pendências', exact: true }).click()
  const drawer = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Pendências', exact: true }) })
  await expect(drawer.getByText('alpha-check', { exact: true })).toBeVisible()
  await expect(drawer.getByText('beta-check', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: 'Todos os projetos', exact: true }).click()
  await page.getByRole('button', { name: /Beta.*\/beta/ }).click()
  await expect(drawer.getByText('alpha-check', { exact: true })).toHaveCount(0)
  await expect(drawer.getByText('beta-check', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Nova pendência|Criar|Salvar|Editar|Remover/ })).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.locator('header').first().getByRole('button', { name: 'Todos os projetos', exact: true })).toBeVisible()
})


test('all status preserves valid projects and unavailable checks without inventing progress', async ({ page }) => {
  await allStatusFixture(page, false, true)
  const cards = page.locator('aside')
  await expect(cards.getByText('Alpha entrega', { exact: true })).toBeVisible()
  await expect(cards.getByText('Beta entrega', { exact: true })).toBeVisible()
  await expect(cards.getByText('Checks indisponíveis:', { exact: false })).toHaveCount(1)
  await expect(cards.getByText('0 de 1 requisitos atendidos', { exact: true })).toHaveCount(1)
  await expect(cards.getByText('Gamma: Leitura indisponível', { exact: true })).toHaveCount(2)
})


test('all status project chips stay on their own line without overflow at supported widths', async ({ page }) => {
  await allStatusFixture(page, false, false, true)
  const cards = page.locator('aside')
  await expect(cards.getByText('Beta entrega', { exact: true })).toBeVisible()
  for (const width of [390, 640, 820, 1440, 1600]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const rows = cards.locator('[data-slot=item-content]')
    for (const row of await rows.all()) {
      const chip = await row.locator('[data-slot=tooltip-trigger][data-variant=outline]').boundingBox()
      const title = await row.locator('[data-slot=item-title]').boundingBox()
      expect(chip).not.toBeNull()
      expect(title!.y).toBeGreaterThanOrEqual(chip!.y + chip!.height)
      expect(chip!.width).toBeLessThanOrEqual((await row.boundingBox())!.width)
    }
  }
})

test('all drawer keeps long project identity readable inside the narrow detail surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await allStatusFixture(page, false, false, true)
  await page.getByRole('button', { name: 'Abrir metas', exact: true }).click()
  const drawer = page.getByRole('dialog')
  const projectItem = drawer.locator('[data-slot=item]').filter({ has: page.getByText('Alpha — projeto com nome suficientemente longo para truncar', { exact: true }) }).first()
  const bounds = await drawer.boundingBox()
  const itemBounds = await projectItem.boundingBox()
  expect(itemBounds!.x + itemBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width)
  const identity = projectItem.locator('[data-slot=scroll-area-viewport]').first()
  await expect(identity).toBeVisible()
  await identity.locator('[tabindex="0"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => identity.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  await drawer.getByRole('button', { name: 'Todos os projetos', exact: true }).click()
  await page.getByRole('textbox', { name: 'Buscar projeto' }).fill('Beta')
  await page.getByRole('button', { name: /Beta.*\/beta/ }).click()
  await expect(drawer.getByRole('button', { name: 'Editar', exact: true })).toBeVisible()
})

async function allGreensFixture(page: import('@playwright/test').Page, partial = false, failed = false, empty = false, mixedGitCoverage = false, integrations: Record<string, unknown> = {}) {
  const projects = ['alpha', 'beta'].map(id => ({ ...fixtureProjects.projects[0], id, displayName: id === 'alpha' ? 'Alpha' : 'Beta' }))
  const requests: URL[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const context = url.searchParams.get('context') === 'unassigned' ? { kind: 'unassigned' } : { kind: 'all' }
    const source = { kind: 'git', available: true, stale: false, remote: 'origin', namespace: 'ci', readAt: null, refreshedAt: null, reason: null }
    const errors = partial ? [{ projectId: 'beta', projectName: 'Beta', error: 'Catálogo indisponível' }] : []
    const visible = empty ? [] : partial ? projects.slice(0, 1) : projects
    if (['/api/preset-history', '/api/remote-slots'].includes(url.pathname)) {
      requests.push(url)
      if (failed) { await route.fulfill({ status: 503, json: { error: 'Fonte indisponível' } }); return }
    }
    const data: Record<string, unknown> = {
      '/api/projects': { ...fixtureProjects, bootstrapProjectId: 'alpha', projects },
      '/api/session': { csrfToken: 'fixture' },
      '/api/status': { running: null, queued: [], history: [], context },
      '/api/executions': { jobs: [], coverage: {}, context },
      '/api/dashboard-state': { schemaVersion: 2, projects: [], projectErrors: [], context },
      '/api/machine': {},
      '/api/preset-history': { schemaVersion: 2, context, projects: visible.map(project => ({ projectId: project.id, projectName: project.displayName, resolved: true, declaredCount: 1 })), projectErrors: errors, coverage: {}, presets: visible.map(project => ({ projectId: project.id, projectName: project.displayName, preset: 'full', lastGreenCanonical: { ticketId: 'shared-ticket', status: 'passed', headSha: 'abcdef123456', branch: 'dev', finishedAt: '2026-09-29T10:00:00Z', integration: integrations[project.id] } })) },
      '/api/remote-slots': { schemaVersion: 2, context, projects: visible.map(project => ({ projectId: project.id, projectName: project.displayName, catalog: 'linked', source: { ...source, stale: mixedGitCoverage && project.id === 'beta' }, coverage: { declaredPresets: mixedGitCoverage ? 2 : 1, greenPresets: 1, withoutTagPresets: mixedGitCoverage && project.id === 'alpha' ? ['full'] : [], invalidPayloads: mixedGitCoverage && project.id === 'beta' ? [{ preset: 'full', reason: 'payload-exit-not-green' }] : [] } })), projectErrors: errors, greens: visible.map(project => ({ projectId: project.id, projectName: project.displayName, origin: 'git', preset: mixedGitCoverage ? 'smoke' : 'full', ticketId: 'shared-ticket', jobAvailable: false, status: 'passed', headSha: 'abcdef123456', commitSha: 'abcdef123456', baseSha: null, branch: 'dev', finishedAt: '2026-09-29T10:00:00Z', publishedAt: '2026-09-29T10:00:00Z', durationMs: 1000, ref: mixedGitCoverage ? 'refs/green/smoke' : 'refs/green/full', integration: integrations[project.id] })) },
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/?context=all&mode=greens#status')
  return requests
}

test('all greens preserve project identity, sources, search and commit drawer', async ({ page }) => {
  const requests = await allGreensFixture(page)
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  await expect(history.getByRole('radio', { name: 'Últimos verdes', exact: true })).toBeEnabled()
  await expect(history.getByText('Alpha', { exact: true })).toBeVisible()
  await expect(history.getByText('Beta', { exact: true })).toBeVisible()
  await expect(history.getByRole('row')).toHaveCount(3)
  await history.getByRole('textbox').fill('Beta')
  await expect(history.getByText('Alpha', { exact: true })).toHaveCount(0)
  await expect(history.getByText('Beta', { exact: true })).toBeVisible()
  await history.getByRole('textbox').fill('')
  for (const name of ['Máquina', 'Git', 'Máquina e Git']) {
    await history.getByRole('combobox', { name: 'Origem', exact: true }).click()
    await page.getByRole('option', { name, exact: true }).click()
    await expect(history.getByRole('row')).toHaveCount(3)
    await expect(history.getByText('Alpha', { exact: true })).toBeVisible()
    await expect(history.getByRole('button', { name: 'full', exact: true })).toHaveCount(name === 'Git' ? 0 : 2)
  }
  await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
  await page.getByRole('option', { name: 'Por commit', exact: true }).click()
  await expect(history.getByRole('row')).toHaveCount(3)
  const beta = history.getByRole('row').filter({ has: page.getByText('Beta', { exact: true }) })
  await beta.getByRole('button', { name: 'abcdef12', exact: true }).click()
  await expect(page.getByRole('dialog').locator('[data-slot=drawer-header]').getByText('Beta', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar commit' }).click()
  expect(requests.every(url => url.searchParams.get('context') === 'all' && !url.searchParams.has('projectId'))).toBe(true)
  await page.goto('/?context=unassigned&mode=greens#status')
  await expect(page.getByRole('radio', { name: 'Últimos verdes', exact: true })).toBeDisabled()
})

test('all greens keep data and project coverage notes after a partial failure', async ({ page }) => {
  await allGreensFixture(page, true)
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  await expect(history.getByText('Alpha', { exact: true })).toBeVisible()
  await expect(history).toContainText('Beta')
  await expect(history).toContainText('Catálogo indisponível')
})

test('all greens distinguish empty responses from failed sources in both groupings', async ({ page }) => {
  await allGreensFixture(page, false, false, true)
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  await expect(history).toContainText('Não há execução canônica aprovada')
  await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
  await page.getByRole('option', { name: 'Por commit', exact: true }).click()
  await expect(history).toContainText('Nenhum commit encontrado')
  await allGreensFixture(page, false, true)
  await expect(history).toContainText('Fonte indisponível')
  await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
  await page.getByRole('option', { name: 'Por commit', exact: true }).click()
  await expect(history).toContainText('Últimos verdes indisponíveis')
  await expect(history.getByText('Nenhum commit encontrado')).toHaveCount(0)
})

test('all greens composition stays contained across widths and themes with drawer open', async ({ page }) => {
  await allGreensFixture(page)
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
  await page.getByRole('option', { name: 'Por commit', exact: true }).click()
  await expect(history.getByText('Beta', { exact: true })).toBeVisible()
  for (const theme of ['light', 'dark', 'system']) {
    await page.evaluate(theme => { localStorage.setItem('ci-queue-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'ci-queue-theme', newValue: theme, storageArea: localStorage })) }, theme)
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/)
    for (const width of [390, 640, 820, 1440, 1600]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await history.getByRole('button', { name: 'abcdef12', exact: true }).first().click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.locator('[data-slot=drawer-header]').getByText('Alpha', { exact: true })).toBeVisible()
      await expect.poll(async () => {
        const bounds = await drawer.boundingBox()
        return Boolean(bounds && bounds.x >= -1 && bounds.y >= -1 &&
          bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 1001)
      }).toBe(true)
      await drawer.getByRole('button', { name: 'Fechar commit' }).click()
      await expect(drawer).toHaveCount(0)
    }
  }
})


test('all greens preserve machine data when the Git request fails', async ({ page }) => {
  await allGreensFixture(page)
  await page.route('**/api/remote-slots?context=all', route => route.fulfill({ status: 503, json: { error: 'Espelho offline' } }))
  await page.reload()
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  await expect(history.getByText('Alpha', { exact: true })).toBeVisible()
  await expect(history.getByText('Beta', { exact: true })).toBeVisible()
  await expect(history).toContainText('Git indisponível: Espelho offline')
})

test('all greens explain stale and invalid Git coverage beside valid greens in both groupings', async ({ page }) => {
  const requests = await allGreensFixture(page, false, false, false, true)
  const history = page.getByRole('region', { name: 'Histórico', exact: true })
  const description = history.locator('[data-slot="card-description"]')
  for (const grouping of ['Por preset', 'Por commit']) {
    await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
    await page.getByRole('option', { name: grouping, exact: true }).click()
    for (const origin of ['Git', 'Máquina e Git', 'Máquina']) {
      await history.getByRole('combobox', { name: 'Origem', exact: true }).click()
      await page.getByRole('option', { name: origin, exact: true }).click()
      const hasGit = origin !== 'Máquina'
      if (hasGit) {
        await expect(description).toContainText(/Git · Beta:.*espelho.*desatualizado/i)
        await expect(description).toContainText(/Git · Beta.*full.*inválido/i)
      } else {
        await expect(description).not.toContainText(/desatualizado|inválido/i)
      }
      const rows = history.getByRole('row')
      await expect(rows).toHaveCount(grouping === 'Por preset' && origin === 'Máquina e Git' ? 5 : 3)
      for (const project of ['Alpha', 'Beta']) {
        const projectRows = rows.filter({ has: page.getByText(project, { exact: true }) })
        await expect(projectRows).toHaveCount(grouping === 'Por preset' && origin === 'Máquina e Git' ? 2 : 1)
        if (grouping === 'Por preset') {
          await expect(projectRows.filter({ hasText: 'smoke' })).toHaveCount(hasGit ? 1 : 0)
          await expect(projectRows.filter({ hasText: 'full' })).toHaveCount(origin === 'Git' ? 0 : 1)
        }
      }
    }
  }
  expect(requests.every(url => url.searchParams.get('context') === 'all' && !url.searchParams.has('projectId'))).toBe(true)
})


// Exercise the current Python public reader, including verification of record joins.
const completionViewerJobs: Record<string, JobRecord> = JSON.parse(execFileSync('python3', ['-c', `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'backend')
from ci_queue_api.records import read_history, public_job
cases = json.loads(Path('tests/fixtures/finalization-completion.json').read_text())
selected = {'confirmed', 'pending', 'running', 'failed', 'uncertain', 'failed-test', 'legacy-3', 'missing-record', 'wrong-ticket', 'invalid-result-outputs', 'v2-confirmed', 'v2-retryable', 'v2-blocked'}
projected = {}
for case in cases:
    if case['name'] not in selected:
        continue
    with tempfile.TemporaryDirectory(prefix='ci-queue-viewer-') as directory:
        root = Path(directory)
        (root / 'history').mkdir()
        (root / 'state/finalization').mkdir(parents=True)
        (root / 'history/job-1.json').write_text(case['terminalBytes'])
        if case['record']:
            (root / 'state/finalization/job-1.json').write_text(json.dumps(case['record']))
        projected[case['name']] = public_job(read_history(root)[0])
print(json.dumps(projected))
`], { encoding: 'utf8' }))

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 820, 1440]) {
    test(`completion viewer composition ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript((theme) => localStorage.setItem('ci-queue-theme', theme), theme)
      const jobs = Object.entries(completionViewerJobs).map(([name, publicJob]) => ({
        ...baseJob, ...publicJob, id: name, preset: name, projectId: 'example', projectName: 'Example',
        ...(name === 'failed-test' ? { failureReason: 'Original test assertion failed' } : {}),
      }))
      let detailMode: 'data' | 'loading' | 'error' = 'data'
      let detailCompleted = false
      let historyEmpty = false
      let detailReads = 0
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/api/job') {
          detailReads++
          if (detailMode === 'loading') return
          if (detailMode === 'error') {
            await route.fulfill({ status: 503, json: { error: 'Fixture detail unavailable' } })
            return
          }
          const selected = jobs.find(job => job.id === url.searchParams.get('jobId'))!
          await route.fulfill({ json: selected.id === 'pending' && detailCompleted ? { ...selected, completion: completionViewerJobs.confirmed.completion } : selected })
          return
        }
        const data: Record<string, unknown> = {
          '/api/projects': fixtureProjects,
          '/api/status': { project: { id: 'example', name: 'Example' }, running: { ...baseJob, id: 'live', preset: 'running-test', status: 'running', completion: { state: 'running', eligible: false, testStatus: 'running' }, progressSummary: { available: true, schemaVersion: 1, nodes, roots: [nodes[0]], active: nodes } }, queued: [], globalOccupancy: true },
          '/api/session': { csrfToken: 'fixture', canReveal: false },
          '/api/executions': { jobs: historyEmpty ? [] : jobs, hasMore: false, coverage: { unattributedRecords: 0 } },
          '/api/dashboard-state': { revision: 0, presets: ['check'], meta: null, pending: [] },
          '/api/machine': {},
        }
        await route.fulfill({ json: data[url.pathname] ?? {} })
      })
      await page.goto('/#status')
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await expect(page.getByLabel('Em execução · Flaky detectado', { exact: true })).toBeVisible()
      const labels: Record<string, string> = {
        confirmed: 'Passou · Finalização concluída', pending: 'Finalizando · Teste passou', running: 'Finalizando · Teste passou',
        failed: 'Falha na finalização · Teste passou; entrega incompleta',
        uncertain: 'Passou · Finalização concluída · Limpeza não confirmada · O finalizador não confirmou a limpeza',
        'failed-test': 'Falhou · Finalização concluída', 'legacy-3': 'Passou',
        'missing-record': 'Finalizando · Teste passou · Finalização não verificada',
        'wrong-ticket': 'Finalizando · Teste passou · Finalização não verificada',
        'invalid-result-outputs': 'Falha na finalização · Teste passou; entrega incompleta',
        'v2-confirmed': 'Passou · Finalização concluída',
        'v2-retryable': 'Limpeza não confirmada · Teste passou; entrega incompleta · O finalizador não confirmou a limpeza · Recuperação pendente',
        'v2-blocked': 'Limpeza não confirmada · Teste passou; entrega incompleta · O finalizador não confirmou a limpeza · Propriedade dos processos não confirmada',
      }
      for (const job of jobs) {
        const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: job.preset, exact: true }) })
        await expect(row.getByRole('img', { name: labels[job.id], exact: true })).toBeVisible()
        if (job.completion?.state === 'running') await expect(row.getByRole('img')).not.toHaveClass(/text-success/)
        await row.getByRole('button', { name: job.preset, exact: true }).click()
        const drawer = page.getByRole('dialog')
        await expect(drawer.getByRole('img', { name: labels[job.id], exact: true }).first()).toBeVisible()
        const facts = drawer.getByRole('table', { name: 'Resultado, finalização e limpeza' })
        await expect(facts.getByRole('row')).toHaveCount(3)
        await expect(facts.getByRole('rowheader')).toHaveText(['Resultado do teste', 'Finalização', 'Limpeza'])
        await expect(facts).toContainText(job.status === 'failed' ? 'Teste falhou' : 'Teste passou')
        if (job.id === 'legacy-3') await expect(facts).toContainText('Sem registro de finalização')
        if (job.id === 'uncertain') await expect(facts.getByRole('cell')).toHaveText([
          'Teste passou',
          'Finalização concluída',
          'Limpeza não confirmada · O finalizador não confirmou a limpeza',
        ])
        if (job.id === 'failed-test') await expect(drawer).toContainText('Original test assertion failed')
        if (job.id === 'v2-retryable') await expect(facts).toContainText('Recuperação pendente')
        if (job.id === 'v2-blocked') await expect(facts).toContainText('Propriedade dos processos não confirmada')
        const bounds = await drawer.boundingBox()
        expect(bounds!.width).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await drawer.getByRole('button', { name: 'Fechar execução' }).click()
        await expect(drawer).toHaveCount(0)
      }
      // A terminal test must continue polling its independent finalization.
      await page.getByRole('button', { name: 'pending', exact: true }).click()
      await expect(page.getByRole('dialog').getByLabel(labels.pending, { exact: true })).toBeVisible()
      detailCompleted = true
      await expect(page.getByRole('dialog').getByLabel(labels.confirmed, { exact: true })).toBeVisible({ timeout: 5000 })
      const completedReads = detailReads
      await page.waitForTimeout(2200)
      expect(detailReads).toBe(completedReads)
      await page.getByRole('button', { name: 'Fechar execução' }).click()

      // New document avoids reusing the legitimately cached successful detail.
      await page.reload()
      await expect(page.getByRole('button', { name: 'confirmed', exact: true })).toBeVisible()
      detailMode = 'loading'
      await page.getByRole('button', { name: 'confirmed', exact: true }).click()
      await expect(page.getByRole('dialog').locator('[data-slot=skeleton]').first()).toBeVisible()
      await expect(page.getByRole('dialog').locator('[data-slot=status-indicator]')).toHaveCount(0)
      await page.getByRole('button', { name: 'Fechar execução' }).click()
      detailMode = 'error'
      await page.getByRole('button', { name: 'failed', exact: true }).click()
      await expect(page.getByRole('dialog')).toContainText('Não foi possível carregar a execução')
      await expect(page.getByRole('dialog').locator('[data-slot=status-indicator]')).toHaveCount(0)
      await page.getByRole('button', { name: 'Fechar execução' }).click()
      historyEmpty = true
      await page.getByRole('textbox', { name: 'Buscar por preset, branch, SHA ou ticket' }).fill('empty')
      await expect(page.getByText('Nenhuma execução corresponde aos filtros')).toBeVisible()
    })
  }
}

for (const width of [390, 1440]) {
  test(`a paused current execution shows its reason and a stopped clock ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.install({ time: new Date('2026-10-26T10:05:00Z') })
    const paused = {
      ...baseJob, id: 'paused', status: 'running', startedAt: '2026-10-26T10:00:00Z',
      pause: { state: 'paused', pausedAt: '2026-10-26T10:01:30Z', pausedMsTotal: 20_000, windows: 2, reason: 'disco abaixo de 2.0 GiB', source: 'auto' },
    }
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/projects') return route.fulfill({ json: fixtureProjects })
      const data: Record<string, unknown> = {
        '/api/session': {}, '/api/machine': {},
        '/api/status': { project: { id: 'example', name: 'Example' }, running: paused, queued: [], history: [], globalOccupancy: true },
        '/api/executions': { jobs: [], coverage: {} },
        '/api/dashboard-state': { presets: [], meta: null, pending: [] },
      }
      await route.fulfill({ json: data[path] ?? {} })
    })
    await page.goto('/')
    const current = page.locator('[data-slot="card"]').filter({ hasText: 'Execução atual' })
    await expect(current.getByRole('img', { name: 'Pausado · disco abaixo de 2.0 GiB' })).toBeVisible()
    await expect(current.getByText('1m 10s', { exact: true })).toBeVisible()
    await expect(current.getByText('pausado · disco abaixo de 2.0 GiB', { exact: true })).toBeVisible()
    await page.clock.fastForward(30_000)
    await expect(current.getByText('1m 10s', { exact: true })).toBeVisible()
    await expect(page.locator('.animate-spin')).toHaveCount(0)
  })
}

for (const width of [390, 1440]) {
  test(`greens say whether each revision is already in the base at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const read = { baseRef: 'origin/dev', baseName: 'dev', readAt: '2026-10-26T14:33:22Z', via: 'fetch --prune origin dev: fast-forward' }
    await allGreensFixture(page, false, false, false, false, {
      alpha: { ...read, state: 'integrated', reason: null },
      beta: { ...read, state: 'stale', reason: 'A ref local de origin/dev não tem leitura das últimas 24 horas.' },
    })
    const history = page.getByRole('region', { name: 'Histórico', exact: true })
    for (const grouping of ['Por preset', 'Por commit']) {
      await history.getByRole('combobox', { name: 'Agrupamento do histórico' }).click()
      await page.getByRole('option', { name: grouping, exact: true }).click()
      await expect(history.getByRole('columnheader', { name: 'Integração', exact: true })).toHaveCount(1)
      const alpha = history.getByRole('row').filter({ has: page.getByText('Alpha', { exact: true }) })
      const beta = history.getByRole('row').filter({ has: page.getByText('Beta', { exact: true }) })
      await expect(alpha.getByText('Em dev', { exact: true })).toBeVisible()
      await expect(beta.getByText('Desatualizado', { exact: true })).toBeVisible()
      await alpha.getByText('Em dev', { exact: true }).focus()
      await expect(page.getByRole('tooltip')).toContainText('Contido em origin/dev pela ref local de')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (grouping === 'Por commit' && width >= 1440) {
        const sha = history.getByRole('button', { name: 'abcdef12', exact: true }).first().locator('span')
        expect(await sha.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      }
      await page.screenshot({ path: testInfo.outputPath(`greens-integration-${grouping === 'Por preset' ? 'preset' : 'commit'}-${width}.png`) })
      await page.keyboard.press('Escape')
    }
    await history.getByRole('button', { name: 'abcdef12', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toContainText('Contido em origin/dev pela ref local de')
  })
}
