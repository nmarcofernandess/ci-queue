#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, "..", "dist", "cli.js")

if (!existsSync(entry)) {
  console.error("CI Queue não foi compilado. Rode npm run build antes de usar o binário.")
  process.exit(1)
}

const { main } = await import(pathToFileURL(entry).href)
await main(process.argv.slice(2))
