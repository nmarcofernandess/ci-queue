// The consumer's public CI entry; recipes remain reusable children.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
const { appendRecipeArgs, detectQueueHost, resolveExecutor, buildExecutionDescription, formatExecutionDescription } = createRequire(import.meta.url)('@nmarcofernandess/ci-queue/consumer')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const [recipe, ...args] = process.argv.slice(2)
  const config = JSON.parse(readFileSync(resolve(root, 'ci-queue.json'), 'utf8'))
  if (!Object.hasOwn(config.presets, recipe)) throw new Error('Choose a recipe from ci-queue-consumer guide.')
  let explicit
  let extra = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { extra = args.slice(i + 1); break }
    if (args[i] !== '--executor' || explicit !== undefined || !args[i + 1]) throw new Error('Use --executor direct|queue or -- recipe arguments.')
    explicit = args[++i]
  }
  const host = detectQueueHost()
  const options = { configured: config.execution?.executor, environment: process.env.CI_QUEUE_EXECUTOR?.trim() || undefined, host }
  const effective = resolveExecutor({ ...options, explicit })
  console.error(formatExecutionDescription(buildExecutionDescription({ phase: 'resolved', recipe: { name: recipe, selectors: extra }, executor: { effective, baseline: resolveExecutor(options), host }, selection: { state: 'unknown', reason: 'example scripts do not report engine populations' } })))
  const argv = effective.executor === 'queue'
    ? ['ci-queue', 'enqueue', recipe, '--cwd', root, '--config', resolve(root, 'ci-queue.json'), '--wait', ...(extra.length ? ['--', ...extra] : [])]
    : appendRecipeArgs(config.presets[recipe].argv, extra)
  const child = spawnSync(argv[0], argv.slice(1), { cwd: root, stdio: 'inherit' })
  if (child.error) throw child.error
  process.exitCode = child.status ?? 1
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
