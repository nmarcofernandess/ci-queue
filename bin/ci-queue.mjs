#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { verifyRelease } from "../scripts/release.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, "..", "dist", "cli.js")
const manifest = join(here, "..", "manifest.json")
if (existsSync(manifest)) {
  verifyRelease(join(here, ".."))
  const digest = createHash("sha256").update(readFileSync(manifest)).digest("hex")
  if (process.env.CI_QUEUE_MANIFEST_SHA256 && process.env.CI_QUEUE_MANIFEST_SHA256 !== digest) {
    throw new Error("migração: launcher e distribuição divergem; reinstale uma release compatível")
  }
}

if (!existsSync(entry)) {
  console.error("CI Queue não foi compilado. Rode npm run build antes de usar o binário.")
  process.exit(1)
}

const { main } = await import(pathToFileURL(entry).href)
await main(process.argv.slice(2))
