import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildRelease as build, recordBuildProvenance } from '../../scripts/release.mjs'
export { verifyRelease } from '../../scripts/release.mjs'
/** Small synthetic component bytes; never the operator installation or a product build. */
export function buildRelease(options) {
  recordBuildProvenance({ ...options, component: 'runtime' })
  recordBuildProvenance({ ...options, component: 'ui' })
  return build(options)
}

/** Bind each synthetic launcher to its own bundle instead of the enclosing installation. */
export function releaseEnvironment(bundleRoot, environment) {
  return {
    ...environment,
    CI_QUEUE_MANIFEST_SHA256: createHash('sha256').update(readFileSync(join(bundleRoot, 'manifest.json'))).digest('hex'),
  }
}
