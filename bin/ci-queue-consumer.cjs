#!/usr/bin/env node
'use strict'
// Consumer entry that teaches. It reads the repository catalog and the host,
// prints what to run and why, and never starts, retries or certifies work.
const { existsSync, readFileSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const {
  CONSUMER_API_VERSION,
  HOST_EXECUTOR_ENV,
  appendRecipeArgs,
  buildGuide,
  detectQueueHost,
  formatGuide,
  resolveExecutor,
} = require('../consumer/index.cjs')

const USAGE = `ci-queue-consumer: o que rodar neste repositório e por quê.

  ci-queue-consumer guide [--json]          receitas, executor deste host e como integrar
  ci-queue-consumer inspect <receita> [--executor direct|queue] [-- argumentos]
                                            argv e executor de uma receita, sem executar

Nada aqui inicia, repete ou certifica um job.`

class TeachingError extends Error {}

function findCatalog(start) {
  let current = resolve(start)
  for (;;) {
    const candidate = join(current, 'ci-queue.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readCatalog(cwd) {
  const path = findCatalog(cwd)
  if (!path) throw new TeachingError(`ci-queue.json não encontrado a partir de ${cwd}. Para adotar, siga docs/CONSUMER-QUICKSTART.md (ci-queue init cria o catálogo).`)
  let config
  try { config = JSON.parse(readFileSync(path, 'utf8')) } catch (error) { throw new TeachingError(`${path} não é JSON válido: ${error.message}`) }
  if (config.schemaVersion !== 1) throw new TeachingError(`${path} precisa de schemaVersion 1.`)
  return { config, root: dirname(path) }
}

function guide(args) {
  const json = args.includes('--json')
  const unknown = args.filter(arg => arg !== '--json')
  if (unknown.length) throw new TeachingError(`opção desconhecida para guide: ${unknown.join(' ')}\n\n${USAGE}`)
  const { config, root } = readCatalog(process.cwd())
  const result = buildGuide({ config, root })
  console.log(json ? JSON.stringify(result, null, 2) : formatGuide(result))
}

function inspect(recipe, args) {
  if (!recipe || recipe.startsWith('-')) throw new TeachingError(`informe a receita: ci-queue-consumer inspect <receita>\n\n${USAGE}`)
  let explicit
  let extra = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--') { extra = args.slice(index + 1); break }
    if (args[index] !== '--executor' || explicit !== undefined || args[index + 1] === undefined) throw new TeachingError('opção inválida; use --executor direct|queue ou -- argumentos')
    explicit = args[++index]
  }
  const { config, root } = readCatalog(process.cwd())
  const preset = Object.hasOwn(config.presets ?? {}, recipe) ? config.presets[recipe] : undefined
  if (!preset) {
    const known = Object.keys(config.presets ?? {}).sort()
    throw new TeachingError(`receita ausente: ${recipe}. Receitas deste catálogo: ${known.join(', ') || 'nenhuma'}. Visão geral: ci-queue-consumer guide`)
  }
  const host = detectQueueHost({ command: config.execution?.queue?.command ?? 'ci-queue' })
  const resolved = resolveExecutor({ explicit, environment: process.env[HOST_EXECUTOR_ENV]?.trim() || undefined, configured: config.execution?.executor, host })
  const accepted = Array.isArray(config.ship?.acceptedPresets) ? config.ship.acceptedPresets : []
  const argv = appendRecipeArgs(preset.argv, extra)
  const declared = config.guide?.verify
  const shipCommand = config.ship?.command
  // A prova do ship é produzida pelo próprio ship; rodá-la à parte não integra.
  const next = accepted.includes(recipe) && shipCommand
    ? (Array.isArray(shipCommand) ? shipCommand.join(' ') : String(shipCommand))
    : declared
    ? (Array.isArray(declared) ? declared.join(' ') : String(declared)).replace('<receita>', recipe)
    : resolved.executor === 'queue'
      ? `${config.execution?.queue?.command ?? 'ci-queue'} enqueue ${recipe} --cwd "$PWD" --config ci-queue.json --wait`
      : argv.join(' ')
  console.log(JSON.stringify({
    consumerApiVersion: CONSUMER_API_VERSION,
    cwd: root,
    project: config.project,
    recipe,
    note: preset.note ?? null,
    executor: resolved.executor,
    executorReason: resolved.reason,
    executorDetail: resolved.detail,
    host,
    argv,
    shipProof: accepted.includes(recipe),
    next,
    started: false,
    limits: 'Inspeção do catálogo e do host; não verifica recursos da receita, extensões, outputs nem elegibilidade de ship.',
  }, null, 2))
}

try {
  const [command, ...rest] = process.argv.slice(2)
  if (command === undefined || command === 'guide') guide(rest)
  else if (command === 'inspect') inspect(rest[0], rest.slice(1))
  else if (command === 'help' || command === '--help' || command === '-h') console.log(USAGE)
  else throw new TeachingError(`comando desconhecido: ${command}\n\n${USAGE}`)
} catch (error) {
  console.error(error instanceof TeachingError ? error.message : `ci-queue-consumer: ${error.message}`)
  process.exitCode = 2
}
