import { buildRelease as build, recordBuildProvenance } from '../../scripts/release.mjs'
export { verifyRelease } from '../../scripts/release.mjs'
/** Small synthetic component bytes; never the operator installation or a product build. */
export function buildRelease(options) {
  recordBuildProvenance({ ...options, component: 'runtime' })
  recordBuildProvenance({ ...options, component: 'ui' })
  return build(options)
}
