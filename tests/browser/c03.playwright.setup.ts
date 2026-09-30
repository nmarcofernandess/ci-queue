const REQUIRED_ENVIRONMENT = [
  "C03_DIETFLOW_ROOT",
  "C03_DIETFLOW_HEAD",
  "C03_CI_QUEUE_HEAD",
] as const

export default function requireC03DedicatedEnvironment() {
  const missing: string[] = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name])
  if (process.env.C03_DEDICATED !== "1") missing.push("C03_DEDICATED=1")
  if (missing.length > 0) {
    throw new Error(`C03 dedicated runner requires explicit environment: ${missing.join(", ")}`)
  }
}
