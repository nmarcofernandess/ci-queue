import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../..')
const PORT = 18876

function writeJob(state: string, id: string, projectId: string, preset: string) {
  writeFileSync(join(state, 'history', `${id}.json`), JSON.stringify({
    id,
    projectId,
    preset,
    status: 'passed',
    startedAt: '2026-09-13T10:00:00Z',
    finishedAt: '2026-09-13T10:00:01Z',
    durationMs: 1000,
    argv: ['node', '--version'],
    headSha: 'a'.repeat(40),
    branch: 'main',
    exitCode: 0,
  }))
}

async function startCandidateApi() {
  const root = mkdtempSync(join(tmpdir(), 'ci-queue-1b-'))
  const state = join(root, 'state-root')
  mkdirSync(join(state, 'history'), { recursive: true })
  mkdirSync(join(state, 'state'), { recursive: true })
  writeFileSync(join(state, 'state', 'projects.json'), JSON.stringify({
    schemaVersion: 1,
    revision: 1,
    bootstrapProjectId: 'alpha',
    projects: {
      alpha: {
        id: 'alpha',
        displayName: 'Alpha',
        repositoryPath: null,
        gitCommonDir: null,
        configPath: null,
        archivedAt: null,
        revision: 1,
        createdAt: '2026-09-15T12:00:00Z',
        updatedAt: '2026-09-15T12:00:00Z',
      },
      beta: {
        id: 'beta',
        displayName: 'Beta',
        repositoryPath: null,
        gitCommonDir: null,
        configPath: null,
        archivedAt: null,
        revision: 1,
        createdAt: '2026-09-15T12:00:00Z',
        updatedAt: '2026-09-15T12:00:00Z',
      },
    },
  }))
  writeJob(state, 'alpha-1', 'alpha', 'smoketest')
  writeJob(state, 'beta-1', 'beta', 'static')
  const env = { ...process.env }
  delete env.CI_QUEUE_STATE_DIR
  const child: ChildProcess = spawn(
    'python3',
    ['-m', 'ci_queue_api.server', '--state', state, '--host', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: ROOT,
      env: { ...env, PYTHONPATH: join(ROOT, 'backend'), CI_QUEUE_STATE_DIR: state },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API candidata não iniciou')), 8000)
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes('CI Queue API')) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`API candidata saiu com ${code}`))
    })
  })
  return {
    state,
    stop() {
      child.kill('SIGTERM')
    },
  }
}

test('EV-01 real UI and API keep Alpha and Beta isolated', async ({ page }) => {
  const api = await startCandidateApi()
  try {
    await page.goto('/?projectId=alpha#analysis')
    await expect(page.getByRole('button', { name: /Alpha/ })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'smoketest' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'static' })).toHaveCount(0)
    await page.getByRole('button', { name: /Alpha/ }).click()
    await page.getByRole('button', { name: /Beta/ }).click()
    await expect(page.getByRole('cell', { name: 'static' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'smoketest' })).toHaveCount(0)
    const crossed = await page.request.get('/api/job?projectId=beta&jobId=alpha-1')
    expect(crossed.status()).toBe(200)
    expect(await crossed.json()).toMatchObject({
      id: 'alpha-1',
      projectId: 'alpha',
      context: { kind: 'project', projectId: 'beta' },
    })
    const own = await page.request.get('/api/job?projectId=alpha&jobId=alpha-1')
    expect(own.status()).toBe(200)
    expect(await own.json()).toMatchObject({ id: 'alpha-1', projectId: 'alpha' })
  } finally {
    api.stop()
  }
})
