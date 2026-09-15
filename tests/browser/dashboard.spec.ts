import { test, expect } from '@playwright/test'

// Isolated API fixtures exercise the real Vite UI without launching any job.
const baseJob = { id: 'observed', preset: 'smoke', projectId: 'example', branch: 'example-branch', headSha: 'abcdef12', startedAt: new Date(Date.now()-61000).toISOString(), createdAt: new Date().toISOString(), cwd: '/example' }
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
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
  await page.goto('/#status')
  await expect(page.getByText('Flaky detectado')).toBeVisible()
  await page.getByRole('button', { name: 'smoke', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('Retry case')).toBeVisible()
  await expect(drawer.getByText('0 de 1')).toBeVisible()
  await expect(drawer.getByRole('rowheader', { name: 'Estado', exact: true })).toHaveCount(0)
  await drawer.getByRole('tab', { name: 'Log', exact: true }).click()
  await expect(drawer.getByText('first line', { exact: true })).toBeVisible()
  terminal = true
  await expect(drawer.locator('pre')).toContainText('terminal line', { timeout: 8000 })
  await expect(drawer.getByText('Passou', { exact: true })).toBeVisible()
  const count = offsets.length
  await page.waitForTimeout(2500)
  expect(offsets.length).toBe(count)
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
    await expect(page.getByRole('dialog').getByRole('rowheader', { name: 'Ticket', exact: true })).toBeVisible()
    const bounds = await page.getByRole('dialog').boundingBox()
    expect(bounds!.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('worktree selection persists and copy menu exposes only the two formats', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const trees = ['one', 'two'].map((id, index) => ({ id, path: `/example/${id}`, branch: `branch-${id}`, headSha: 'abcdef12', dirty: index === 0, changedEntries: index === 0 ? 1 : 0, ahead: 0, behind: 0, locked: false, size: { bytes: 1024, state: 'ready', observedAt: new Date().toISOString(), error: null } }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const data: Record<string, unknown> = {
      '/api/session': { csrfToken: 'fixture', canReveal: false, clipboardLimitBytes: 1000000 },
      '/api/dashboard-state': { projectId: 'example', revision: 0, presets: [], meta: null, pending: [] },
      '/api/worktrees': { worktrees: trees, baseRef: 'main', error: null },
      '/api/worktree-view': trees.find(tree => tree.id === url.searchParams.get('id')),
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
  await page.clock.fastForward(60_001)
  await expect(page.getByRole('dialog').getByText('updated-sha', { exact: true })).toBeVisible()
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
  let state:any={revision:0,presets:['smoke'],meta:null,pending:[]}
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
