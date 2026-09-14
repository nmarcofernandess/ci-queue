import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli.js";

describe("CLI logs contract", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });

  it("returns the latest terminal log through the JSON envelope", async () => {
    const root = mkdtempSync(join(tmpdir(), "ci-queue-cli-log-"));
    roots.push(root);
    const logPath = join(root, "logs", "job-1.log");
    mkdirSync(join(root, "history"), { recursive: true });
    mkdirSync(join(root, "logs"), { recursive: true });
    writeFileSync(logPath, "hello from the job\n");
    writeFileSync(
      join(root, "history", "job-1.json"),
      JSON.stringify({
        id: "job-1",
        createdAt: "2026-09-13T10:00:00.000Z",
        finishedAt: "2026-09-13T10:01:00.000Z",
        status: "passed",
        preset: "smoke",
        cwd: "/project",
        branch: "main",
        headSha: "abc",
        requestedBy: "test",
        command: "npm test",
        logPath,
      }),
    );

    await expect(
      runCli(["logs", "latest", "--state", root, "--json"]),
    ).resolves.toEqual({
      apiVersion: 1,
      ok: true,
      result: { ticketId: "job-1", logPath, content: "hello from the job\n" },
    });
  });
});
