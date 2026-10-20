/**
 * Serialized into a job-private CommonJS preload after TypeScript compilation.
 * Keep this function self-contained: no imports or outer lexical references.
 * This is a reproducibility guard for cooperating processes, NOT an OS sandbox.
 */
export type GuardConfig = {
  session?: boolean
  executable: string
  version: string
  npmCli: string
  npxCli: string
  shimDir: string
  evidencePath: string
  guardPath: string
}

export function runtimeGuard(config: GuardConfig): void {
  const fs = require("node:fs") as typeof import("node:fs")
  const path = require("node:path") as typeof import("node:path")
  const real = (value: string): string => fs.realpathSync(value)
  const record = (status: string, reason?: string): void => {
    try {
      let group: { hostname: string; leaderPid: number; pgid: number; startedAt: string } | undefined
      if (config.session) {
        const { spawnSync } = require("node:child_process") as typeof import("node:child_process")
        const env = { ...process.env, LC_ALL: "C", LANG: "C" }
        const current = spawnSync("/bin/ps", ["-o", "pgid=", "-p", String(process.pid)], { env, encoding: "utf8", timeout: 2000 })
        const pgid = Number(current.stdout?.trim())
        if (current.status !== 0 || !Number.isSafeInteger(pgid) || pgid <= 0) throw new Error("group unavailable")
        const leader = spawnSync("/bin/ps", ["-o", "pid=,pgid=,lstart=", "-p", String(pgid)], { env, encoding: "utf8", timeout: 2000 })
        const stamp = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(leader.stdout?.trim() ?? "")
        if (leader.status !== 0 || !stamp || +stamp[1] !== pgid || +stamp[2] !== pgid) throw new Error("group leader unavailable")
        group = { hostname: require("node:os").hostname(), leaderPid: pgid, pgid, startedAt: stamp[3] }
        if (fs.statSync(config.evidencePath).size > 16 * 1024 * 1024 - 4096) throw new Error("evidence bound reached")
      }
      fs.appendFileSync(config.evidencePath, JSON.stringify({
        pid: process.pid, ppid: process.ppid, at: new Date().toISOString(),
        execPath: real(process.execPath), version: process.versions.node,
        // Never persist arguments, credentials or the inherited environment.
        entry: process.argv[1] ? path.basename(process.argv[1]) : "[eval]",
        status, ...(group ? { group } : {}), ...(reason ? { reason } : {}),
      }) + "\n", { encoding: "utf8", mode: 0o600 })
    } catch {
      process.stderr.write("RUNTIME_EVIDENCE_UNWRITABLE\n")
      process.exit(78)
    }
  }
  const fail = (reason: string): never => {
    record("rejected", reason)
    process.stderr.write(reason + "\n")
    process.exit(78)
  }
  try {
    if (real(process.execPath) !== config.executable || process.versions.node !== config.version) {
      fail("RUNTIME_PROCESS_MISMATCH")
    }
    let resolved: string | undefined
    for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
      // Empty/relative entries allow cwd to change the meaning of the contract.
      if (!path.isAbsolute(directory)) fail("RUNTIME_PATH_UNSAFE")
      const candidate = path.join(directory, "node")
      try {
        fs.accessSync(candidate, fs.constants.X_OK)
        if (fs.statSync(candidate).isFile()) { resolved = real(candidate); break }
      } catch { /* Continue the same search as env(1). */ }
    }
    const allowedShim = real(path.join(config.shimDir, "node"))
    if (resolved !== config.executable && resolved !== allowedShim) {
      fail("RUNTIME_PATH_MISMATCH")
    }
    for (const key of ["NODE", "npm_node_execpath"] as const) {
      if (process.env[key] && real(process.env[key]!) !== config.executable) fail("RUNTIME_ENV_MISMATCH")
    }
    if (process.env.npm_execpath && ![config.npmCli, config.npxCli].includes(real(process.env.npm_execpath))) {
      fail("RUNTIME_NPM_MISMATCH")
    }
    record("verified")
  } catch {
    fail("RUNTIME_VALIDATION_FAILED")
  }
}

/** Same parser is used before the initial spawn and by named nested-shell shims. */
export function shellPolicyError(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]
    if (argument === "--" || !argument.startsWith("-")) break
    if (argument === "--login" || argument.startsWith("--login=")) return "RUNTIME_LOGIN_SHELL"
    if (argument === "--interactive") return "RUNTIME_INTERACTIVE_SHELL"
    if (["--rcfile", "--init-file"].includes(argument)) return "RUNTIME_SHELL_STARTUP_OVERRIDE"
    if (/^(?:-o|--options=)(login|interactive|rcs|global_?rcs)$/i.test(argument)) return "RUNTIME_SHELL_STARTUP_OVERRIDE"
    if (["-o", "--options"].includes(argument)) {
      const option = args[++i]
      if (option && /^(login|interactive|rcs|globalrcs)$/i.test(option.replaceAll("_", ""))) return "RUNTIME_SHELL_STARTUP_OVERRIDE"
      continue
    }
    if (!argument.startsWith("--")) {
      if (argument.slice(1).includes("l")) return "RUNTIME_LOGIN_SHELL"
      if (argument.slice(1).includes("i")) return "RUNTIME_INTERACTIVE_SHELL"
      // Only options preceding the command operand are options; never scan code.
      if (argument.slice(1).includes("c")) break
    }
  }
  return undefined
}
