// Sonda de fronteira, não teste oficial. Extratos git/readGitInfo de runner.ts,
// 24d6a2b4, com anotações TypeScript removidas e spawnSync determinístico.
// Não executa git, fila, receita, worker, API, ship ou operação do host.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let failStatus = false;
function spawnSync(_command, args, _options) {
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') return {status: 0, stdout: 'a'.repeat(40)};
  if (args[0] === 'branch') return {status: 0, stdout: 'feature/fixture'};
  if (args[0] === 'status') return failStatus
    ? {status: null, stdout: '', stderr: 'injected timeout', error: {code: 'ETIMEDOUT'}}
    : {status: 0, stdout: ' M tracked.ts\n'};
  if (args[0] === 'rev-parse') return {status: 0, stdout: 'b'.repeat(40)};
  throw new Error('comando não previsto');
}
function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10_000, env: { ...process.env, LC_ALL: "C", LANG: "C" } });
  return result.status === 0 ? String(result.stdout).trim() : undefined;
}
function readGitInfo(cwd, baseRef) {
  const headSha = git(cwd, ["rev-parse", "HEAD"]);
  if (!headSha) return undefined;
  const branch = git(cwd, ["branch", "--show-current"]) || "HEAD-detached";
  const statusShort = git(cwd, ["status", "--short"]) ?? "";
  const baseSha = baseRef ? git(cwd, ["rev-parse", baseRef]) : undefined;
  return { branch, headSha, baseSha: baseSha ?? "", statusShort };
}
const dirtyControl = readGitInfo('/fixture', 'origin/dev');
failStatus = true;
const unreadable = readGitInfo('/fixture', 'origin/dev');
const secondUnreadable = readGitInfo('/fixture', 'origin/dev');
assert.equal(dirtyControl.statusShort, 'M tracked.ts');
assert.equal(unreadable.statusShort, '');
assert.equal(Boolean(unreadable.statusShort), false);
assert.deepEqual(unreadable, secondUnreadable);
const report = {
  method: 'excertos tipados convertidos para JS; apenas I/O Git substituído; nenhum runner/ship completo executado',
  source: 'https://github.com/nmarcofernandess/ci-queue/blob/24d6a2b417876db209db4519c3826566ab94a1e7/src/core/runner.ts#L139-L173',
  runtime: {node: process.version, platform: process.platform},
  control: dirtyControl,
  failedStatusObservation: unreadable,
  guardWouldDetectDirty: Boolean(unreadable.statusShort),
  repeatedFailureLooksStable: JSON.stringify(unreadable) === JSON.stringify(secondUnreadable),
  finding: 'ausência de observação de status é convertida em string de árvore limpa',
  limits: ['sem execução da suíte', 'sem prova de exploração do ship', 'sem acesso ou alteração do Mac/repositórios/state']
};
fs.writeFileSync(path.join(__dirname, '../results/git-observation-boundary.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
