/** Versioned, non-OS-sandbox runtime evidence persisted with tickets. */
export const RUNTIME_CAPABILITY = "node-runtime-guard-v1" as const
export type RuntimeRequirement = { source: string; range: string; sha256: string }
export type RuntimeObservation = {
  pid: number; ppid: number; at: string; execPath: string; version: string
  entry: string; status: "verified" | "rejected"; reason?: string
}
export type RuntimeReceipt = {
  capability: typeof RUNTIME_CAPABILITY
  // Never describe this user-space mechanism as complete descendant coverage.
  coverage: "guarded-node-processes" | "unconfigured"
  state: "prepared" | "verified" | "rejected" | "unconfigured" | "preflight-only"
  node?: { executable: string; version: string; sha256: string }
  bindingSource?: "project-registry" | "explicit-node-command"
  environmentPolicy?: "reconstructed"
  npmCli?: string
  npxCli?: string
  requirements?: RuntimeRequirement[]
  registrySha256?: string
  evidencePath?: string
  observations: RuntimeObservation[]
  failureCode?: string
}
