'use strict'
// Deliberately side-effect free: nothing here discovers, starts or retries a job.
// Host detection only reads the PATH and well-known installation files.
const { accessSync, constants, existsSync, statSync } = require('node:fs')
const { delimiter, isAbsolute, join } = require('node:path')

const CONSUMER_API_VERSION = 1
const CONSUMER_FEATURES = Object.freeze(['host-executor-v1', 'guide-v1', 'execution-description-v1'])
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

// Facts come from the consumer and engine. This API never discovers tests.
function descriptionText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: texto não vazio requerido.`)
  return value
}
function descriptionCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}: inteiro não negativo requerido.`)
  return value
}
function descriptionExecutor(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label}: resolução requerida.`)
  assertExecutor(value.executor, label)
  if (!EXECUTORS.includes(value.executor)) throw new Error(`${label}: executor requerido.`)
  if (!['explicit', 'environment', 'host-without-queue', 'catalog', 'default'].includes(value.reason)) throw new Error(`${label}: motivo inválido.`)
  return { executor: value.executor, reason: value.reason, detail: descriptionText(value.detail, `${label}.detail`) }
}
function buildExecutionDescription(facts) {
  if (!facts || !['resolved', 'selected', 'finished'].includes(facts.phase)) throw new Error('phase: resolved, selected ou finished requerida.')
  const recipe = { name: descriptionText(facts.recipe?.name, 'recipe.name') }
  if (facts.recipe.note !== undefined) recipe.note = descriptionText(facts.recipe.note, 'recipe.note')
  if (facts.recipe.selectors !== undefined) {
    if (!Array.isArray(facts.recipe.selectors) || facts.recipe.selectors.some(token => typeof token !== 'string')) throw new Error('recipe.selectors: argv deve conter strings.')
    recipe.selectors = [...facts.recipe.selectors]
  }
  const effective = descriptionExecutor(facts.executor?.effective, 'executor.effective')
  const baseline = descriptionExecutor(facts.executor?.baseline, 'executor.baseline')
  const host = facts.executor.host
  if (!host || typeof host.installed !== 'boolean') throw new Error('executor.host: host requerido.')
  const executor = { effective, baseline, host: { installed: host.installed, evidence: descriptionText(host.evidence, 'executor.host.evidence') }, divergent: effective.executor !== baseline.executor }
  let selection
  if (facts.selection?.state === 'unknown') selection = { state: 'unknown', reason: descriptionText(facts.selection.reason, 'selection.reason') }
  else if (facts.selection?.state === 'known' && Array.isArray(facts.selection.populations)) {
    selection = { state: 'known', populations: facts.selection.populations.map((source, index) => {
      const label = `selection.populations[${index}]`
      if (!source || typeof source !== 'object') throw new Error(`${label}: população requerida.`)
      const population = { scope: descriptionText(source.scope, `${label}.scope`), unit: descriptionText(source.unit, `${label}.unit`), selected: descriptionCount(source.selected, `${label}.selected`) }
      for (const key of ['project', 'profile']) if (source[key] !== undefined) population[key] = descriptionText(source[key], `${label}.${key}`)
      for (const key of ['started', 'attempts']) if (source[key] !== undefined) population[key] = descriptionCount(source[key], `${label}.${key}`)
      if (source.outcomes !== undefined) {
        if (!source.outcomes || typeof source.outcomes !== 'object' || Array.isArray(source.outcomes)) throw new Error(`${label}.outcomes: objeto requerido.`)
        population.outcomes = {}
        for (const key of ['passed', 'failed', 'skipped', 'interrupted', 'unreached']) if (source.outcomes[key] !== undefined) population.outcomes[key] = descriptionCount(source.outcomes[key], `${label}.outcomes.${key}`)
      }
      return population
    }) }
  } else throw new Error('selection: unknown com motivo ou known com populations requerida.')
  if (facts.policies !== undefined && !Array.isArray(facts.policies)) throw new Error('policies: array requerido.')
  const policies = (facts.policies ?? []).map(policy => {
    const result = { scope: descriptionText(policy?.scope, 'policy.scope') }
    if (policy.mode !== undefined) {
      if (!['collect', 'stop'].includes(policy.mode)) throw new Error('policy.mode: collect ou stop requerido.')
      result.mode = policy.mode
    }
    for (const key of ['workers', 'retries', 'maxFailures']) if (policy[key] !== undefined) result[key] = descriptionCount(policy[key], `policy.${key}`)
    return result
  })
  return { consumerApiVersion: CONSUMER_API_VERSION, phase: facts.phase, recipe, executor, selection, policies,
    context: readTeachingList(facts.context, 'context'), effects: readTeachingList(facts.effects, 'effects'),
    results: readTeachingList(facts.results, 'results'), limits: readTeachingList(facts.limits, 'limits') }
}
function formatExecutionDescription(description) {
  const d = buildExecutionDescription(description)
  const lines = [`CI · ${d.recipe.name} · ${d.phase}`]
  if (d.recipe.note) lines.push(d.recipe.note)
  if (d.recipe.selectors?.length) lines.push(`Seletores: ${d.recipe.selectors.join(' ')}`)
  lines.push(`Executor: ${d.executor.effective.executor} (${d.executor.effective.detail})`)
  lines.push(`Padrão deste host: ${d.executor.baseline.executor} (${d.executor.baseline.detail})${d.executor.divergent ? '; divergência informativa' : ''}`)
  if (d.selection.state === 'unknown') lines.push(`População: ainda não descoberta (${d.selection.reason})`)
  else for (const p of d.selection.populations) {
    const scope = [p.scope, p.project, p.profile].filter(Boolean).join(' / ')
    const counts = [`${p.selected} ${p.unit} selecionados`]
    if (p.started !== undefined) counts.push(`${p.started} iniciados`)
    if (p.outcomes) for (const [key, value] of Object.entries(p.outcomes)) counts.push(`${key}=${value}`)
    if (p.attempts !== undefined) counts.push(`${p.attempts} tentativas (incluindo retries)`)
    lines.push(`População [${scope}]: ${counts.join('; ')}`)
  }
  if (!d.policies.length) lines.push('Política efetiva: pendente do motor')
  for (const p of d.policies) lines.push(`Política [${p.scope}]: modo=${p.mode ?? 'pendente'}; workers=${p.workers ?? 'pendente'}; retries=${p.retries ?? 'pendente'}; maxFailures=${p.maxFailures ?? 'pendente'}`)
  for (const [key, label] of [['context', 'Contexto'], ['effects', 'Efeito'], ['results', 'Resultado'], ['limits', 'Limite']]) for (const value of d[key]) lines.push(`${label}: ${value}`)
  return lines.join('\n')
}

// What every consumer needs to know, said once by the tool instead of copied
// into each repository's instructions.
const GENERIC_TEACHINGS = Object.freeze([
  'Há dois tipos de trabalho: verificar (uma receita do catálogo) e integrar (o ship). Não existe um terceiro.',
  'O CI do consumidor recebe o pedido e mostra executor, seleção e política. --executor direct|queue preserva a escolha explícita; divergência com o padrão do host é informação.',
  'Uma execução integral ou focal explícita pode usar WIP; executar testes, publicar evidência e integrar pelo ship são operações distintas.',
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
    verify: { entry: verifyEntry, ...(Array.isArray(guide.verify) ? { entryArgv: [...guide.verify] } : {}), recipes },
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
  buildExecutionDescription,
  formatExecutionDescription,
}
