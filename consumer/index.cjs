'use strict'
// Deliberately side-effect free: nothing here discovers, starts or retries a job.
// Host detection only reads the PATH and well-known installation files.
const { accessSync, constants, existsSync, statSync } = require('node:fs')
const { delimiter, isAbsolute, join } = require('node:path')

const CONSUMER_API_VERSION = 1
const CONSUMER_FEATURES = Object.freeze(['host-executor-v1', 'guide-v1'])
const EXECUTORS = Object.freeze(['direct', 'queue'])
const HOST_EXECUTOR_ENV = 'CI_QUEUE_EXECUTOR'
const INSTALLATION_STATES = Object.freeze(['.local/state/ci-queue', '.local/state/local-ci/queue'])

function assertExecutor(value, label) {
  if (value !== undefined && !EXECUTORS.includes(value)) throw new Error(`${label}: executor aceita apenas direct ou queue.`)
}

/** Kept for API v1 callers: first declared value wins, no host knowledge. */
function selectExecutor({ explicit, environment, configured, fallback = 'direct' } = {}) {
  for (const value of [explicit, environment, configured, fallback]) {
    if (value !== undefined && value !== 'direct' && value !== 'queue') throw new Error('executor aceita apenas direct ou queue.')
  }
  return explicit ?? environment ?? configured ?? fallback
}

function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveCommand(command, env) {
  if (!command) return null
  if (command.includes('/')) return isAbsolute(command) && isExecutableFile(command) ? command : null
  for (const directory of String(env.PATH ?? '').split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, command)
    if (isExecutableFile(candidate)) return candidate
  }
  return null
}

/**
 * Whether this machine has a CI Queue installation. The repository may prefer
 * the queue, but only a host can have one: a cloud container without the
 * launcher or state is a host without queue, not a broken queue. The host is
 * described only by env (PATH, HOME, CI_QUEUE_STATE_DIR), so callers and tests
 * get the same answer for the same description.
 */
function detectQueueHost({ env = process.env, command = 'ci-queue', home = env.HOME } = {}) {
  const found = resolveCommand(command, env)
  if (found) return { installed: true, evidence: `comando ${command} em ${found}` }
  if (env.CI_QUEUE_STATE_DIR) return { installed: true, evidence: `CI_QUEUE_STATE_DIR=${env.CI_QUEUE_STATE_DIR}, mas o comando ${command} não está no PATH` }
  for (const state of home ? INSTALLATION_STATES : []) {
    if (existsSync(join(home, state, 'installation.json'))) {
      return { installed: true, evidence: `installation.json em ~/${state}, mas o comando ${command} não está no PATH` }
    }
  }
  return { installed: false, evidence: `sem comando ${command} no PATH e sem instalação em ~/.local/state` }
}

/**
 * Resolves who runs a recipe on this host and says why. Order: explicit choice,
 * host variable, host without queue, catalog preference, direct.
 */
function resolveExecutor({ explicit, environment, configured, host } = {}) {
  assertExecutor(explicit, 'opção --executor')
  assertExecutor(environment, `variável ${HOST_EXECUTOR_ENV}`)
  assertExecutor(configured, 'execution.executor do catálogo')
  if (explicit) return { executor: explicit, reason: 'explicit', detail: 'escolhido na linha de comando para esta execução' }
  if (environment) return { executor: environment, reason: 'environment', detail: 'declarado pelo host na variável de executor' }
  if (configured === 'queue' && host && host.installed === false) {
    return { executor: 'direct', reason: 'host-without-queue', detail: `o catálogo prefere a fila, mas este host não tem CI Queue (${host.evidence})` }
  }
  if (configured) {
    return { executor: configured, reason: 'catalog', detail: host ? `preferência do catálogo; ${host.evidence}` : 'preferência do catálogo' }
  }
  return { executor: 'direct', reason: 'default', detail: 'o catálogo não declara preferência; o comando roda direto' }
}

function appendRecipeArgs(argv, extraArgs) {
  if (!Array.isArray(argv) || !argv.length || argv.some(value => typeof value !== 'string') || !Array.isArray(extraArgs) || extraArgs.some(value => typeof value !== 'string')) throw new Error('argv e argumentos devem ser arrays de strings; argv não pode ser vazio.')
  return extraArgs.length ? [...argv, ...(argv.at(-1) === '--' ? [] : ['--']), ...extraArgs] : [...argv]
}

// What every consumer needs to know, said once by the tool instead of copied
// into each repository's instructions.
const GENERIC_TEACHINGS = Object.freeze([
  'Há dois tipos de trabalho: verificar (uma receita do catálogo) e integrar (o ship). Não existe um terceiro.',
  'O executor é do host: esta ferramenta mostra qual é e por quê. A opção --executor é só para uma exceção pontual.',
  'Rodar o comando da receita diretamente continua válido; só a prova aceita pelo ship conta para integrar.',
  'Fila ocupada é espera normal. Para retomar, consulte o ticket existente antes de enfileirar de novo.',
  'Encerrar a espera (--wait, timeout) não cancela o job, e resultado ausente não é aprovação.',
])

function readTeachingList(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} deve ser uma lista de frases não vazias.`)
  }
  return value.map(item => item.trim())
}

function commandText(value, label) {
  if (value === undefined) return undefined
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && value.length && value.every(item => typeof item === 'string' && item)) return value.join(' ')
  throw new Error(`${label} deve ser texto ou argv não vazio.`)
}

function firstSentence(text) {
  if (typeof text !== 'string') return ''
  const match = text.match(/^(.+?[.!?])(\s|$)/)
  return (match ? match[1] : text).trim()
}

/**
 * The repository's own teachings come from its catalog; the generic ones from
 * this package. Missing consumer declarations become instructions to add them.
 */
function buildGuide({ config, root, env = process.env, home = env.HOME }) {
  if (!config || config.schemaVersion !== 1) throw new Error('catálogo incompatível: requer schemaVersion 1')
  const guide = config.guide ?? {}
  if (typeof guide !== 'object' || Array.isArray(guide)) throw new Error('guide deve ser um objeto.')
  const ship = config.ship ?? {}
  const command = config.execution?.queue?.command ?? 'ci-queue'
  const host = detectQueueHost({ env, command, home })
  const executor = resolveExecutor({ environment: env[HOST_EXECUTOR_ENV]?.trim() || undefined, configured: config.execution?.executor, host })
  const accepted = Array.isArray(ship.acceptedPresets) ? ship.acceptedPresets : []
  const recipes = Object.entries(config.presets ?? {}).map(([name, preset]) => ({
    name,
    note: firstSentence(preset?.note),
    shipProof: accepted.includes(name),
  }))
  const verifyEntry = commandText(guide.verify, 'guide.verify') ?? 'ci-queue-consumer inspect <receita>'
  const shipEntry = commandText(ship.command, 'ship.command') ?? (accepted.length ? 'ci-queue ship --cwd . --config ci-queue.json' : undefined)
  const missing = []
  if (guide.verify === undefined) missing.push('guide.verify: o comando que este repositório usa para rodar uma receita (ex.: "npm run ci:run -- <receita>").')
  if (accepted.length && ship.command === undefined) missing.push('ship.command: a entrada de integração deste repositório, se ele tiver um ship próprio.')
  if (guide.notes === undefined) missing.push('guide.notes: o que só este repositório sabe (quando usar cada receita, o que conta como prova).')
  return {
    consumerApiVersion: CONSUMER_API_VERSION,
    features: [...CONSUMER_FEATURES],
    project: config.project,
    root,
    executor: { ...executor, host, override: `--executor direct|queue (pontual) ou ${HOST_EXECUTOR_ENV}=direct|queue (host)` },
    verify: { entry: verifyEntry, recipes },
    integrate: shipEntry
      ? { entry: shipEntry, proofRecipes: accepted, notes: readTeachingList(ship.notes, 'ship.notes') }
      : { entry: null, proofRecipes: [], notes: ['Este catálogo não declara ship; integrar fica fora do CI Queue neste repositório.'] },
    teachings: { tool: [...GENERIC_TEACHINGS], repository: readTeachingList(guide.notes, 'guide.notes') },
    missing,
  }
}

function formatGuide(guide) {
  const lines = []
  const project = guide.project?.name ?? guide.project?.id ?? 'projeto'
  lines.push(`CI Queue · guia de ${project}`)
  lines.push('')
  lines.push(`Executor neste host: ${guide.executor.executor}`)
  lines.push(`  por quê: ${guide.executor.detail}`)
  lines.push(`  para mudar: ${guide.executor.override}`)
  lines.push('')
  lines.push('1. Verificar: rodar uma receita do catálogo')
  lines.push(`  entrada: ${guide.verify.entry}`)
  const width = Math.min(34, Math.max(8, ...guide.verify.recipes.map(recipe => recipe.name.length)))
  for (const recipe of guide.verify.recipes) {
    const proof = recipe.shipProof ? ' [prova do ship]' : ''
    lines.push(`  ${recipe.name.padEnd(width)}  ${recipe.note}${proof}`.trimEnd())
  }
  lines.push('')
  lines.push('2. Integrar: ship')
  if (guide.integrate.entry) {
    lines.push(`  entrada: ${guide.integrate.entry}`)
    lines.push(`  prova aceita: ${guide.integrate.proofRecipes.join(' ou ') || 'nenhuma declarada'}`)
  }
  for (const note of guide.integrate.notes) lines.push(`  - ${note}`)
  lines.push('')
  lines.push('O que vale em qualquer repositório')
  for (const note of guide.teachings.tool) lines.push(`  - ${note}`)
  if (guide.teachings.repository.length) {
    lines.push('')
    lines.push('O que vale neste repositório (ci-queue.json#guide.notes)')
    for (const note of guide.teachings.repository) lines.push(`  - ${note}`)
  }
  if (guide.missing.length) {
    lines.push('')
    lines.push('O catálogo ainda não ensina (acrescente em ci-queue.json)')
    for (const item of guide.missing) lines.push(`  - ${item}`)
  }
  lines.push('')
  lines.push('Detalhe de uma receita: ci-queue-consumer inspect <receita>')
  return lines.join('\n')
}

module.exports = {
  CONSUMER_API_VERSION,
  CONSUMER_FEATURES,
  HOST_EXECUTOR_ENV,
  selectExecutor,
  detectQueueHost,
  resolveExecutor,
  appendRecipeArgs,
  buildGuide,
  formatGuide,
  GENERIC_TEACHINGS,
}
