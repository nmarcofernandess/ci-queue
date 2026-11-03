'use strict'
// Deliberately side-effect free: selection never discovers, starts or retries a job.
const CONSUMER_API_VERSION = 1
function selectExecutor({ explicit, environment, configured, fallback = 'direct' } = {}) {
  for (const value of [explicit, environment, configured, fallback]) {
    if (value !== undefined && value !== 'direct' && value !== 'queue') throw new Error('executor aceita apenas direct ou queue.')
  }
  return explicit ?? environment ?? configured ?? fallback
}
function appendRecipeArgs(argv, extraArgs) {
  if (!Array.isArray(argv) || !argv.length || argv.some(value => typeof value !== 'string') || !Array.isArray(extraArgs) || extraArgs.some(value => typeof value !== 'string')) throw new Error('argv e argumentos devem ser arrays de strings; argv não pode ser vazio.')
  return extraArgs.length ? [...argv, ...(argv.at(-1) === '--' ? [] : ['--']), ...extraArgs] : [...argv]
}
module.exports = { CONSUMER_API_VERSION, selectExecutor, appendRecipeArgs }
