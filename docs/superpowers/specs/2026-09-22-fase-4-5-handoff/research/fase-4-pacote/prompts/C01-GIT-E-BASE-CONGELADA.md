# C01 — observação Git honesta e base congelada no filho

**Entrega:** Corrigir duas fronteiras no runner atual sem mudar o modelo de fila/prova.

**Owner:** CI Queue; DietFlow apenas prova de consumo/fallback se necessária.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Fontes e arquivos

Leia [`CQ · src/core/runner.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts) (`git`, `readGitInfo`, `assertPreflight`, `verifyGitStability`, `buildJobEnv`, `runJob`), [`CQ · src/ship/eligibility.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/ship/eligibility.ts), [`CQ · src/core/enqueue.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/enqueue.ts), [`CQ · tests/core/queue-engine.test.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/queue-engine.test.ts), [`CQ · tests/core/eligibility.test.ts`](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/tests/core/eligibility.test.ts) e [`DF · scripts/ci/smoketest-local.sh`](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/smoketest-local.sh). `docs/CONTRACTS.md` e `CONSUMER-QUICKSTART.md` governam o env/prova.

Arquivos de produção esperados: `src/core/runner.ts` e, só se o tipo de observação exigir, `src/contracts/schema.ts`. Testes: `tests/core/queue-engine.test.ts` e `tests/core/eligibility.test.ts`. Docs apenas no owner do contrato. Não duplicar o reader no DietFlow.

## Defeitos auditados

1. `git status` falhando devolve undefined; `?? ""` o transforma em clean.
2. `preflight` é observado numa variável; `buildJobEnv` recebe ticket ainda sem esse campo. Só depois o ticket é enriquecido/persistido. O smoke faz fetch tardio quando a base vem vazia.

As sondas da auditoria demonstram esses boundaries, não o runner inteiro. Converter o caso em testes reais do owner, não usar a sonda como runtime.

## Execução

- [ ] Confirmar os dois mecanismos no HEAD de trabalho. Se corrigidos, demonstrar o teste vigente e retirar somente o delta correspondente.
- [ ] **RED A:** em fixture Git/remote temporária e receita de filho inerte, fazer falhar somente `git status --short` do preflight. Provar que o filho NÃO foi iniciado, que não há clean comprovado nem ticket elegível. Repetir com timeout e com status dirty real. Use executor Git de teste ou proxy temporário que delega os demais comandos ao Git real; não tocar Git global.
- [ ] **GREEN A:** preservar erro de observação distinto de stdout vazio. A autorização canônica exige observação bem-sucedida; não converter erro em clean. Erro nomeado e diagnóstico sem segredo. Preserve comportamento não-canônico de leitura informativa quando não exige Git, sem inventar fatos.
- [ ] **RED B:** o child termina com exit 0, mas a leitura status do postflight falha; ticket não pode ser passed/elegível por igualdade de vazios. Preflight clean real + postflight clean real continua válido.
- [ ] **GREEN B:** tratar falha pós-execução como prova incompleta, não reprovação clínica do comando. Conservar exit/causa separados conforme contrato atual.
- [ ] **RED C:** enqueue de receita Git-bound nova, sem preflight preenchido pelo teste. Filho real curto escreve apenas HEAD/base observados em um arquivo temporário. Comparar `DIETFLOW_CI_BASE_SHA`/alias publicado com `history.preflight.baseSha`. Hoje o env pode vir vazio; esperado B0 real.
- [ ] **GREEN C:** preparar env/runtime a partir do ticket com preflight efetivo. Não corrigir lendo origin/dev novamente no consumidor. Descoberta de Git não pode depender da conclusão do próprio teste.
- [ ] Provar variante, progresso ou runtime receipt não passam a substituir a tupla material; prova inválida continua rejeitada por eligibility.
- [ ] Focal pela fila executando o argv `npx vitest run tests/core/queue-engine.test.ts tests/core/eligibility.test.ts`; em seguida owner suites de env/runtime tocadas e build oficial do produto pelo fluxo já declarado. Não certificar apenas types.

## Aceite

Git indisponível ≠ clean. O mesmo B0 observado no preflight chega ao processo e ao terminal. Filho não é executado em admissão canônica inválida. Sem mudança de policy/last-green/ship. Evidência inclui testIDs, RED/GREEN, HEAD/tree, argv e outputs sintéticos esperados. Voltar ao orquestrador; sem operação Git remota de integração.
