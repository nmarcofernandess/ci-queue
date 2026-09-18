# Quickstart do consumidor

Este kit gera um catálogo, executa a receita na fila local e, **só quando você
pede**, tenta integrar uma PR no GitHub. O worker nunca faz merge. O dashboard
não tem botão de ship. DietFlow continua com o próprio `npm run ship` até um
cutover separado.

## 1. Gerar o catálogo

No worktree do consumidor (já é um repositório Git; o init não roda `git init`):

```bash
ci-queue init --name "Meu projeto" --base-ref dest/dev --json
# ou, se não houver script npm `check`:
ci-queue init --name "Meu projeto" --base-ref dest/dev \
  --argv-json '["python","-m","pytest","-q"]' --json
```

`--workflow` copia o verificador portátil de atestação para
`.github/workflows/ci-queue-verdict.yml`. Sem isso, a política `wait` recusa
até existir `ship.remoteVerdict`; o caminho explícito sem Actions é
`ci-queue ship --no-remote`.

## 2. Commitar

A prova de ship exige árvore limpa e catálogo **em H**. Commitar `ci-queue.json`
(e o workflow, se gerou) antes de enqueue/ship.

## 3. Vincular o dashboard

O init não escreve o registry. No dashboard, cadastre o projeto (pasta +
catálogo). Sem isso a fila ainda funciona; a UI não adivinha o dono pelo path.

## 4. Enfileirar e executar

```bash
ci-queue enqueue check --json
ci-queue worker --json
```

O ticket terminal precisa ser `passed`, argv idêntico à receita aceita,
preflight/postflight iguais, `statusShort` vazio, HEAD = H e base = B0 (ponta
remota da base da PR, não um merge-base antigo). Um ticket chamado `check` com
outro argv, `extraArgs` ou `custom` não conta.

## 5. Dry-run (somente leitura)

```bash
ci-queue ship --dry-run --no-remote --json
```

GitHub/Git **lêem**. Não cria ticket, status, ready nem merge. O `ticketId`
reutilizado tem de ser o que o worker gravou em `history/` — não um JSON
passado à mão.

## 6. Ship: `wait` versus `--no-remote`

```bash
# política wait (arquivo ausente = wait): prova local → atestação → ready se
# draft (espera o run `pull_request`; não dispara workflow_dispatch) →
# PR já ready sem run causal: um dispatch no ref da base, correlacionado
# por run-name / inputs (PR, H, B0), não por `head_sha` do workflow_run →
# merge REST
ci-queue ship --pr 12 --json

# pula o veredito remoto; não pula prova local nem checagens Git/PR
ci-queue ship --pr 12 --no-remote --json
```

`--no-remote` não autoriza um `remote-verdict.json` corrompido. Timeout
(`--timeout-ms`, padrão 60 min) não cancela o ticket e não enfileira de novo.

O merge é `gh api` PUT `/repos/{owner}/{repo}/pulls/{pull}/merge` com
`sha` = H e `merge_method=merge`. Não é `gh pr merge`. Não há `--admin`.

## Corrida residual da base

A API de merge do GitHub **prende só o HEAD**. Não existe `expectedBaseSha`.
O ship relê B0 imediatamente antes do PUT e inspeciona os pais depois:

| Resultado | Relato |
| --- | --- |
| merge commit, 1º pai B0, 2º pai H, tree = H | `merged=true`, `mergeVerified=true` |
| merge aconteceu com outro 1º pai | `merged=true`, `mergeVerified=false`, `MERGED_BASE_CHANGED` |
| HTTP ambíguo | inspeciona a PR antes de qualquer retry; senão `merged="unknown"` |

Isso **não** é um lock atômico de H+B. Uma mudança de B0 entre a última
revalidação e o PUT ainda pode entrar. Não há trava local que outros agentes
respeitem. `--no-remote` não fecha essa janela.

## O que este corte não faz

- Cutover do DietFlow
- `ship --when-green`, squash/rebase, merge queue, forks
- Botão de merge no dashboard
- Tratar last-green ou o nome da receita como prova
