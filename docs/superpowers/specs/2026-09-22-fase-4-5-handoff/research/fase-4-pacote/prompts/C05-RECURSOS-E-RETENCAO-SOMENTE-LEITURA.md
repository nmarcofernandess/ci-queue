# C05 — capacidade, ENOSPC e owners de arquivos: somente leitura

**Owner:** operador local + revisor DietFlow/CI Queue. **Entrega:** diagnóstico dos artefatos existentes, não implementação de retenção.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Proibições específicas

Não criar cleaner nem usar TDD como pretexto para um. Não iniciar Full, Jest global, E2E clínico, comparação Colima 8/4, swapfile, instalação, sinal para processo ou remoção de arquivos. Não coletar conteúdo clínico nem segredos. Esta fase só lê receipts e metadados dos paths nomeados; uma varredura cara exige janela combinada com o operador.

## Fontes

CQ: `docs/superpowers/specs/2026-09-20-q1-disk-inventory.md`, `src/core/runner.ts` (cópia/finalização/reconcile), `src/core/runtime.ts` e `docs/CONTRACTS.md`.

DF: `ci-queue.json`, `scripts/ci/execution-evidence.ts`, `scripts/proof/proof-pack.ts`, `scripts/ci/e2e-local-stack.sh`, Spec121 M01–M05 e `RESULTADO-EXPERIMENTOS.md`, research J/K, Spec125 `progress.md`/`status.md` apenas no cruzamento Full/harness, `docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md`.

## Passos verificáveis

- [ ] Identificar host, CLI, state e instalação pela configuração/receipt reais. Ler version, health, build.json, installation.json e labels já existentes, sem reiniciar. Fila vazia com worker on-demand parado é legítima.
- [ ] Identificar o ENOSPC em questão: ticket, timestamp, operação/syscall, path e filesystem. Se só existir relato genérico, registrar NÃO COMPROVADO e solicitar stderr/receipt exato. Não atribuir automaticamente o evento ao ticket de 17/09.
- [ ] Separar capacidade livre do volume, bytes lógicos de diretórios e bytes alocados quando medidos. Não somar 79 GB lógicos de worktrees como uso físico comprovado do APFS. Priorizar os snapshots existentes; se autorizado, uma leitura seriada por diretório nomeado, sem du global concorrente ou repetição em loop.
- [ ] Para cada path, registrar classe, producer, readers, atividade atual, publisher durável e condição futura de liberação. Classes: log oficial; ticket/ledger; runtime CQ; scratch de fixture; cache do consumidor; cópia de inspeção; proof canônico; log auxiliar; desconhecido.
- [ ] Conferir a captura global de artefatos e os metadados de dois tickets já existentes. Determinar se o segundo repetiu provas anteriores. Não gerar duas execuções para testar essa hipótese nesta leitura.
- [ ] Verificar entradas necessárias ao pack antes de classificá-las como descartáveis. Log Next em `/tmp` não é automaticamente um artefato sem valor; um verde não comprova sucesso de todas as cópias.
- [ ] Ler os receipts e trechos existentes do Full da 125 e das falhas nativas. Separar H/base, runtime exato, workers, heap, Colima, população e carga externa. Não preencher metadados históricos pelo default atual.
- [ ] Tratar research J/K como série Linux/Cursor Cloud independente. Sucesso após swap/recycle é mitigação relatada, não adoção aprovada nem prova de causalidade do Mac. Preservar a ausência do log que foi sobrescrito.
- [ ] Mapear os quatro limites: quantidade, memória, prazo e ownership/pai. Distinguir validação de flags/Git de admissão física de recursos; guard cooperativo não é limite de RAM do SO.
- [ ] Produzir before/peak/after somente quando houver medições nesses instantes. Para qualquer experimento novo, devolver protocolo e critérios de interrupção em vez de executar.

## Campos mínimos da saída

`pathClass`, `path confirmado`, `producer`, `readers`, `active`, `bytesLogical`, `bytesAllocated`, `measuredAt`, `sourceReceipt`, `canonicalPublication`, `pruneAuthorized=false`. Valores não medidos ficam ausentes/null; unknown nunca vira licença de apagar.

## Aceite

Nenhum ticket/log/proof/state alterado. ENOSPC identificado por operação/path/fonte ou marcado não comprovado. M01–M05 não são encerradas por um Full verde. A saída contém uma lista curta dos artefatos que faltam e da próxima pergunta experimental, sem limpeza global, mudança de framework ou receita.
