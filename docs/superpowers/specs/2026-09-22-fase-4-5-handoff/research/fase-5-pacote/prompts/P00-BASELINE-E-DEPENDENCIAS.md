# P00 — Receipts e dependências antes de medir

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** revisor de performance / Spec121, com leitura dos dois repos. **Natureza:** somente leitura; produzir artefatos em Downloads, zero jobs novos.

## Fontes e arquivos

- DF: `specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/{queue-ticket.json,execution-receipt.json}`.
- DF: `docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md`, `scripts/ci/full-local.sh`, `scripts/ci/smoketest-local.sh`, `scripts/ci-local.sh`, `scripts/ci/e2e-local-stack.sh`, `ci-queue.json`.
- CQ: `src/core/runner.ts`, `src/core/progress.ts`, `docs/performance/etapa-3/`, `docs/superpowers/specs/2026-09-20-q1-disk-inventory.md`.
- Usar `04-ARTEFATOS-PENDENTES.md` deste pacote para os IDs e paths exatos. Não pedir fontes de produto inteiras.

## Executar

1. Registrar data/hora e SHA/tree de origin/dev nos dois repos. Ler metadados dos PRs17/1305/18 e comprovar os merges como ancestrais. Conferir PRs posteriores relevantes, especialmente as implementações F4-C01/F4-C06. Não basta achar os prompts no disco.
2. Conferir `readGitInfo` e `runJob`: falha de `git status` não pode virar clean e o env do filho deve receber B0 do preflight. Se ainda abertos, encaminhar ao **C01 da Fase4**, não implementar aqui. Leitura e aritmética seguem; comparação canônica nova espera a prova focal desse owner.
3. Ler os dois JSON do Full versionado. Recalcular: espera360ms, recipe6920829ms, queue6928041ms; raízes6918000ms;54gates803829ms; cópia931ms. Se o cálculo divergir, preservar arquivo e explicar; não editar receipt.
4. Coletar os history/logs especificados e descobrir até5 terminais recentes por projeto/preset desde19/09. Não exportar running, claims ou todos os logs. Encontrou amostra melhor? Conservar a histórica e acrescentar a nova; não substituir silenciosamente.
5. Construir uma linha por amostra com cobertura dos dados. Separar duração de espera, setup, execução, finalização, publicação. Para extração de log, guardar linha/instante e SHA do original; logs incompletos continuam incompletos.
6. Conferir read-only runtime/instalação atual. O H do repo não prova a distribuição executada. Não instalar para “fechar o pacote”.

## Aceite e prova focal

`BASELINE.json` e `BASELINE.md` com todos os campos presentes/ausentes e grupos realmente comparáveis; `PENDENCIAS.md` com artefato exato; manifest dos arquivos coletados. Validar contagens e somas por script local de análise, sem testes de produto. Referências D (relato) não passam a A (receipt lido) sem bytes.

**Não fazer:** A/B Mac×Cursor; usar hora do ticket como startedAt; inferir0retries da árvore histórica limitada; inferir cache frio do nome de worktree; chamar7,212s de overhead total do worker.

**Rollback:** nenhum produto alterado; apagar só o pacote de análise criado por esta coleta, mediante confirmação, não as fontes. **Saída:** diagnóstico fechado no alcance disponível + indicação de quais próximos cortes já podem seguir.
