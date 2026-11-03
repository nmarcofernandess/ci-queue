#!/usr/bin/env node
'use strict'
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { CONSUMER_API_VERSION, selectExecutor, appendRecipeArgs } = require('../consumer/index.cjs')
try {
  const [command, recipe, ...args] = process.argv.slice(2)
  if (command !== 'inspect' || !recipe || recipe.startsWith('-')) throw new Error('uso: ci-queue-consumer inspect <receita> [--executor direct|queue] [-- argumentos]. Inspeção não executa nem certifica runtime; leia AGENTS e o método do consumidor.')
  let explicit
  let extra = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--') { extra = args.slice(index + 1); break }
    if (args[index] !== '--executor' || explicit !== undefined || args[index + 1] === undefined) throw new Error('opção inválida; use --executor direct|queue ou -- argumentos')
    explicit = args[++index]
  }
  const root = process.cwd()
  const config = JSON.parse(readFileSync(resolve(root, 'ci-queue.json'), 'utf8'))
  if (config.schemaVersion !== 1) throw new Error('catálogo incompatível: requer schemaVersion 1')
  const preset = Object.hasOwn(config.presets ?? {}, recipe) ? config.presets[recipe] : undefined
  if (!preset) throw new Error(`receita ausente: ${recipe}`)
  const executor = selectExecutor({ explicit, configured: config.execution?.executor })
  console.log(JSON.stringify({ consumerApiVersion: CONSUMER_API_VERSION, cwd: root, project: config.project, recipe, executor, argv: appendRecipeArgs(preset.argv, extra), started: false,
    limits: 'Inspeção do catálogo; não verifica instalação, recursos, extensões, outputs ou elegibilidade. Consulte o método consumidor antes de executar. Queue requerida permanece requerida; recusa, HOLD ou outcome incerto não autorizam fallback.' }, null, 2))
} catch (error) { console.error(error.message); process.exitCode = 2 }
