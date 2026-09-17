import type { Page } from '@playwright/test'
import type { JobRecord, ProgressNode, WorktreeRecord, DashboardState, AnalysisResponse } from '../../../ui/src/lib/types'

export const fixtureNow = new Date('2026-09-15T12:00:00Z')
export const fixtureNodes: ProgressNode[] = [
  { id: 'static', label: 'Static', kind: 'stage', status: 'running' },
  { id: 'gates', parentId: 'static', label: 'Gates', kind: 'suite', status: 'running', detail: {kind:'cases',completed:1,total:2,passed:1,failed:0,running:1,pending:0,skipped:0} },
  { id: 'group', parentId: 'gates', label: 'Validation group', kind: 'suite', status: 'running' },
  { id: 'case', parentId: 'group', label: 'A long validation case name that must wrap without moving sibling columns', kind: 'case', status: 'passed', retryCount: 1, durationMs: 1250 },
  { id: 'jest', label: 'Jest', kind: 'stage', status: 'pending' },
  { id: 'artifacts', label: 'Artefatos', kind: 'stage', status: 'pending' },
  ...Array.from({length:9},(_,i):ProgressNode=>({id:`stage-${i}`,label:`Stage ${i+4}`,kind:'stage',status:'pending'})),
]
export const fixtureJob: JobRecord = {
  id: 'fixture-current', preset: 'smoketest', projectId: 'example', status: 'running',
  branch: 'feature/long-consumer-branch-for-interface-consistency', headSha: 'a'.repeat(40),
  createdAt: '2026-09-15T11:58:00Z', startedAt: '2026-09-15T11:59:00Z',
  cwd: '/example/projects/a-long-project-name/checkout-with-a-long-directory-name', commitSubject:'Preserve readable progress and shared detail composition',
  progressSummary: { available: true, schemaVersion: 1, nodes: fixtureNodes, roots: fixtureNodes.filter(n => !n.parentId), active: fixtureNodes.filter(n => n.status === 'running') },
}
const nodesWithoutRetries = fixtureNodes.map(node => ({
  ...node,
  retryCount: undefined,
}))
const progressWithoutRetries = {
  ...fixtureJob.progressSummary!,
  nodes: nodesWithoutRetries,
  roots: nodesWithoutRetries.filter(node => !node.parentId),
  active: nodesWithoutRetries.filter(node => node.status === 'running'),
}
export const fixtureTerminals: JobRecord[] = [
  ...(['passed','failed','cancelled','interrupted'] as const).map((status,i)=>({...fixtureJob,id:`fixture-${status}`,preset:`${status}-run`,status,headSha:(i%2?'b':'a').repeat(i%2?64:40),finishedAt:'2026-09-15T11:55:00Z',startedAt:status==='cancelled'?undefined:'2026-09-15T11:54:00Z',durationMs:i===2?null:62000, failureReason:status==='failed'?'A recorded fixture assertion failed':null,progressSummary:status==='failed'?progressWithoutRetries:fixtureJob.progressSummary})),
  {
    ...fixtureJob,
    id: 'fixture-long-preset',
    preset: 'a-very-long-preset-name-for-density',
    status: 'passed',
    finishedAt: '2026-09-15T11:55:00Z',
    durationMs: 62000,
  },
]
export const fixtureTrees: WorktreeRecord[] = ['example-clean', 'example-dirty', 'example-measuring'].map((id, index) => ({
  id, path: `/example/projects/${id}`, branch: `feature/${id}`, headSha: 'b'.repeat(64),
  dirty: index === 1, changedEntries: index, ahead: 2, behind: 3, locked: false,
  size: { bytes: 1073741824, state: index===2?'measuring':'ready', observedAt: fixtureNow.toISOString(), error: index===1?'Fixture measurement error; previous size retained':null },
}))
export function fixtureDashboard(): DashboardState {
  return { revision: 1, projectId:'example', presets: ['smoketest','static','full'], pendingError:null,
    meta:{name:'A complete candidate with a long descriptive name for the next release',description:'Validate the candidate across the declared recipes while preserving a readable description and long content in every viewport.',presets:['smoketest','future-recipe'],candidateSha:null,checks:[{preset:'smoketest',status:'passed',ticketId:'fixture-passed',headSha:'a'.repeat(40),finishedAt:'2026-09-15T11:55:00Z'},{preset:'future-recipe',status:'recipe-missing',ticketId:null,headSha:null,finishedAt:null}]},
    pending:[{id:'pending-fixture',preset:'full',headSha:'b'.repeat(64),reason:'A long recorded recommendation explaining the consumer validation still needed before this revision has a later eligible green result.',pr:42,createdAt:'2026-09-14T12:00:00Z',latestTicketId:'fixture-failed',latestStatus:'failed'}],
  }
}
export const fixtureAnalysis: AnalysisResponse = { schemaVersion:1,projectId:'example',from:null,to:null,preset:null,total:12,coverage:{unattributedRecords:0},presets:['smoketest','static','full'].map((preset,i)=>({preset,passed:2,failed:1,cancelled:1,interrupted:0,total:4,passRate:50,points:i===2?[]:[{id:'fixture-passed',at:'2026-09-14T12:00:00Z',durationMs:62000},{id:'fixture-failed',at:'2026-09-15T11:00:00Z',durationMs:92000}],duration:{count:i===2?0:2,medianMs:i===2?null:77000,minMs:i===2?null:62000,maxMs:i===2?null:92000},failedDurationMs:92000,failedDurationCount:1,failedDurationMissing:0})) }
export type FixtureOptions = { empty?: boolean; error?: boolean; saveError?: boolean; theme?:'light'|'dark'|'system'; displayName?: string; living?: JobRecord | null; extraProjects?: Array<{ id: string; displayName: string }>; durationMeanMs?: number; history?: JobRecord[]; resultsPresets?: Array<{ preset: string; projectId?: string; projectName?: string; passed: number; failed: number; cancelled: number; interrupted: number; total: number }>; durationPresets?: Array<{ key: string; label: string; projectId: string; preset: string }> }

function echoContext(url: URL) {
  const projectId = url.searchParams.get('projectId')
  const context = url.searchParams.get('context')
  if (context === 'all') return { kind: 'all' as const }
  if (context === 'unassigned') return { kind: 'unassigned' as const }
  if (projectId) return { kind: 'project' as const, projectId }
  return { kind: 'project' as const, projectId: 'example' }
}
export async function installConsistencyFixtures(page: Page, options: FixtureOptions = {}) {
  await page.clock.install({ time: fixtureNow })
  await page.addInitScript((theme) => {
    localStorage.setItem('ci-queue-theme', theme)
    localStorage.setItem('ci-queue.lastProjectId', 'example')
  }, options.theme ?? 'light')
  await page.route('**/health', async (route) => {
    await route.fulfill({
      json: { ok: true, apiVersion: 1, serverTime: fixtureNow.toISOString(), projectId: 'example' },
    })
  })
  const state=fixtureDashboard()
  if(options.empty){state.meta=null;state.pending=[]}
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if(options.error && ['/api/status','/api/executions','/api/dashboard-state','/api/worktrees','/api/analysis'].includes(url.pathname)){await route.fulfill({status:503,json:{error:'Fixture unavailable'}});return}
    if(url.pathname==='/api/dashboard-state' && route.request().method()==='POST') {
      if(options.saveError){await route.fulfill({status:409,json:{error:'Fixture save rejected'}});return}
      const body=route.request().postDataJSON()
      state.revision++
      state.meta=body.action==='remove-meta'?null:{...state.meta,...body.meta,checks:state.meta?.checks??[],candidateSha:null}
    }
    const context = echoContext(url)
    const displayName = options.displayName ?? 'Example'
    const living = options.empty ? null : (options.living === undefined ? fixtureJob : options.living)
    const running = living && typeof options.durationMeanMs === 'number'
      ? { ...living, durationReference: { medianMs: options.durationMeanMs, meanMs: options.durationMeanMs, sampleCount: 1, window: 'latest-green-canonical' } }
      : living
    const extraProjects = options.extraProjects ?? []
    const history = options.empty ? [] : (options.history ?? fixtureTerminals)
    const selected=[running,fixtureJob,...history,...fixtureTerminals].find(j=>j && j.id===url.searchParams.get('jobId'))??running??fixtureJob
    const green={ticketId:'fixture-passed',startedAt:'2026-09-15T11:54:00Z',createdAt:'2026-09-15T11:53:00Z',finishedAt:'2026-09-15T11:55:00Z',status:'passed',headSha:'a'.repeat(40),branch:fixtureJob.branch,custom:false,durationMs:62000}
    const log=Array.from({length:160},(_,i)=>`line ${i}: fixture output available for native text selection`).join('\n')+'\n'
    const offset=Number(url.searchParams.get('offset')??0)
    const data: Record<string, unknown> = {
      '/api/projects': { schemaVersion:1, registryRevision:1, bootstrapProjectId:'example', observedUnregistered:[], projects:[{id:'example',displayName,repositoryPath:'/example',resolvedRepositoryPath:'/example',repositoryAvailable:true,configPath:'/example/ci-queue.json',archivedAt:null,revision:1,bindingState:'linked'}, ...extraProjects.map(project=>({id:project.id,displayName:project.displayName,repositoryPath:`/${project.id}`,resolvedRepositoryPath:`/${project.id}`,repositoryAvailable:true,configPath:`/${project.id}/ci-queue.json`,archivedAt:null,revision:1,bindingState:'linked'}))] },
      '/api/session': { csrfToken: 'fixture', canReveal: true, canPick: true, revealTargets:['directory'], clipboardLimitBytes: 1000000 },
      '/api/status': { schemaVersion:1,serverTime:fixtureNow.toISOString(),project: context.kind === 'project' ? { id: context.projectId, name: context.projectId === 'example' ? displayName : extraProjects.find(project=>project.id===context.projectId)?.displayName ?? context.projectId } : null, running, queued: options.empty?[]:[{...fixtureJob,id:'fixture-queued',preset:'queued-run',status:'queued',startedAt:undefined,progressSummary:undefined,projectName: running?.projectName ?? fixtureJob.projectName}], history,lastFailed:null, globalOccupancy: Boolean(running) || !options.empty, otherProjectOccupancy:false, context },
      '/api/executions': { schemaVersion:1,jobs: options.empty||url.searchParams.get('q')?[]:history, hasMore: false, snapshotBefore:fixtureNow.toISOString(),nextCursor: null, coverage: { unattributedRecords: 0 }, context },
      '/api/dashboard-state': { ...state, context },
      '/api/machine': {schemaVersion:1,observedAt:fixtureNow.toISOString(),disk:{totalBytes:2000000000,usedBytes:1000000000,freeBytes:1000000000},error:null},
      '/api/job': { ...selected, context },
      '/api/worktrees': {schemaVersion:1,observedAt:fixtureNow.toISOString(), worktrees: options.empty?[]:fixtureTrees, baseRef: 'main',baseSha:'c'.repeat(40), error: null, context },
      '/api/worktree-view': fixtureTrees.find(tree => tree.id === url.searchParams.get('id')),
      '/api/analysis': (() => {
        const requested = url.searchParams.get('preset') || ''
        const split = requested.indexOf(':')
        const ownerId = split > 0 ? requested.slice(0, split) : (context.kind === 'project' ? context.projectId : 'example')
        const name = split > 0 ? requested.slice(split + 1) : requested
        const durationMs = ownerId === 'dietflow' ? 90_000 : 62_000
        if (url.searchParams.get('metric') === 'results') {
          const presets = options.empty ? [] : (options.resultsPresets ?? fixtureAnalysis.presets.map(({preset,passed,failed,cancelled,interrupted,total})=>({preset,passed,failed,cancelled,interrupted,total})))
          return { schemaVersion:2, metric:'results', context, from:null, to:null, sampleCount: presets.reduce((sum, row) => sum + row.total, 0), presets, durationPresets: options.durationPresets ?? [] }
        }
        const source = (options.empty ? [] : fixtureAnalysis.presets).filter(
          (item) => !name || item.preset === name
        )
        return {
          ...fixtureAnalysis,
          projectId: ownerId,
          preset: name || null,
          context,
          presets: source.length
            ? source.map((item) =>
                ownerId === 'dietflow'
                  ? {
                      ...item,
                      points: [{ id: `${ownerId}-point`, at: '2026-09-15T11:00:00Z', durationMs }],
                      duration: { count: 1, medianMs: durationMs, minMs: durationMs, maxMs: durationMs },
                    }
                  : item
              )
            : name && !options.empty
              ? [{
                  preset: name,
                  passed: 2,
                  failed: 0,
                  cancelled: 0,
                  interrupted: 0,
                  total: 2,
                  passRate: 100,
                  points: [{ id: `${ownerId}-point`, at: '2026-09-15T11:00:00Z', durationMs }],
                  duration: { count: 1, medianMs: durationMs, minMs: durationMs, maxMs: durationMs },
                  failedDurationMs: 0,
                  failedDurationCount: 0,
                  failedDurationMissing: 0,
                }]
              : [],
        }
      })(),
      '/api/preset-history':{schemaVersion:1,catalog:{resolved:true,projectId:'example',declaredCount:3},totals:{tickets:12,presets:3},coverage:{unattributedRecords:0},context,presets:['smoketest','static','full'].map(preset=>({projectId:'example',projectName:'Example',preset,declared:true,runCount:4,canonicalRunCount:4,customRunCount:0,lastGreenCanonical:preset==='smoketest'?green:null,lastRun:null,lastFailure:null,durationReference:null}))},
      '/api/remote-slots':{schemaVersion:2,source:{kind:'git',available:true,stale:false,remote:'origin',namespace:'ci',readAt:fixtureNow.toISOString(),refreshedAt:null,reason:null},catalog:{projectId:'example',resolved:true,declaredCount:3},coverage:{declaredPresets:3,greenPresets:1,withoutTagPresets:[],invalidPayloads:[]},context,greens:[{origin:'git',preset:'static',projectId:'example',ticketId:'git-only',jobAvailable:false,status:'passed',headSha:'a'.repeat(40),commitSha:'a'.repeat(40),baseSha:null,branch:'feature/git-only-summary',finishedAt:'2026-09-15T11:56:00Z',publishedAt:'2026-09-15T11:57:00Z',durationMs:null,ref:'refs/tags/fixture'}]},
      '/api/log':{schemaVersion:1,jobId:selected.id,content:log.slice(offset),offset,nextOffset:log.length,sourceBytes:log.length,complete:true,error:null,context},
      '/api/log/export':{schemaVersion:1,jobId:selected.id,content:log,coverage:{available:true,sourceBytes:log.length,capturedBytes:log.length,complete:true,preserved:'complete'},context},
      '/api/diagnostic':{schemaVersion:1,jobId:selected.id,available:true,ticket:selected,resources:{observations:[],coverage:'unavailable'},context},
    }
    await route.fulfill({ json: data[url.pathname] ?? {} })
  })
}
