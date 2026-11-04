/** Versioned, non-OS-sandbox runtime evidence persisted with tickets. */
export const RUNTIME_CAPABILITY = "node-runtime-guard-v1" as const
export type RuntimeRequirement = { source: string; range: string; sha256: string }
export type RuntimeObservation = {
  pid: number; ppid: number; at: string; execPath: string; version: string
  group?: import("./schema.js").ProcessGroupIdentity
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
  requirementDigest?: string
  session?: { runtimeId: string; bindingDigest: string; stateRevision: number; disposition?: "released"; recovery?: { operationId: string; originalStateRevision: number; recoveryOwnerStamp: SessionRuntimeRecovery["recoveryOwnerStamp"] } }
  observations: RuntimeObservation[]
  failureCode?: string
}

/** Private handles travel only over the launcher's private pipe/stdin. */
export const SESSION_RUNTIME_CAPABILITY = "node-runtime-session-v1" as const
export type SessionRuntimePrepare = {
  projectId: string; ticketId: string; sessionId: string
  producerStamp: { pid: number; startedAt: string }
  sessionStamp: { pid: number; startedAt: string }
  requirementDigest: string; launchBindingDigest: string
}
export type SessionRuntimeHandle = {
  schemaVersion: 1; root: string; runtimeId: string; token: string
  projectId: string; sessionId: string; bindingDigest: string
  directory: string; env: NodeJS.ProcessEnv
}
export type SessionRuntimeRecovery = {
  mode: "recover"; root: string; operationId: string
  original: { runtimeId: string; projectId: string; sessionId: string; bindingDigest: string; expectedStateRevision: number }
  recoveryOwnerStamp: { pid: number; pgid: number; startedAt: string }
}
export type SessionRuntimeStatus = {
  projectId: string; sessionId: string; state: "active" | "closing" | "unknown"
  pid: number; startedAt: string; stateRevision: number; lastCheckpointAt?: string
}
