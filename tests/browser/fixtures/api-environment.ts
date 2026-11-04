/** Source API fixtures do not belong to the enclosing installed distribution. */
export function sourceApiEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CI_QUEUE_STATE_DIR
  delete env.CI_QUEUE_MANIFEST_PATH
  delete env.CI_QUEUE_MANIFEST_SHA256
  return env
}
