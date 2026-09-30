# C03 — uma fixture curta de produtor a UI no mesmo ticket

**Entrega:** Adicionar a prova entre repos que os PRs Q2/Q3 explicitamente não forneceram.

**Owner:** DietFlow em emissor/fixture pública; CI Queue em runner/API/UI testados. Consolidador único para sequência.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Fontes e arquivos

CQ: `src/core/progress.ts`, `src/core/runner.ts`, `backend/ci_queue_api/records.py`, `tests/core/progress-pipeline.test.ts`, `tests/backend/test_live_active.py`, `tests/browser/progress-timing-integrated.spec.ts`, UI shared `execution-stages.tsx`, `progress-tree.tsx`, `run-variant-badge.tsx`.
DF: `scripts/ci/e2e-local-stack.sh`, `playwright-progress-reporter.ts`, `playwright-discover.sh`, `playwright-case-identity.ts`, `playwright-discovery-reporter.ts`, `queue-client.ts`, `scripts/__tests__/playwright-discover.test.ts`, `scripts/__tests__/fixtures/pw-discover/`.

Abrir os arquivos reais antes de estender; não substituir o teste existente por uma família paralela. Não importar código DF em runtime de produção CQ. Uma fixture de integração aceita como entrada um artefato de teste identificado/hashiado do produtor, sem tornar o checkout consumidor dependência da aplicação instalada.

## Desenho mínimo da prova

O orquestrador de teste recebe roots explícitos dos dois checkouts temporários/candidatos, SHAs esperados e state temporário. Ele prepara a fixture Playwright do produtor; enfileira seu comando num worker CQ do **state temporário**; serve a UI CQ compilada com a API que lê esse mesmo state; browser inspeciona o mesmo ticket ID. Os subprocessos são controlados e encerrados pelo owner da fixture. No Mac, a suíte orquestradora entra na fila real, e os states internos não são o state do operador.

A receita sintética usa uma barreira de teste depois da descoberta e antes dos casos, em vez de Next/Supabase. A evidência precisa capturar a fase pendente e liberar a barreira explicitamente, sem sleeps longos arbitrários. Casos Playwright pequenos podem usar asserts puros, sem app clínico.

O teste atual `progress-timing-integrated.spec.ts` usa JSONs sintéticos e API real, sem worker. A configuração browser usa Vite dev com reutilização de servidor. A nova prova deve servir o bundle compilado identificado, não adotar o preview de outra lane. Adaptar o owner existente; não iniciar servidor concorrente na porta instalada. Encerrar os subprocessos e remover apenas o diretório temporário criado pela própria fixture depois da confirmação de saída.

## Cenários e resultados esperados

- [ ] Descobrir 7; antes de liberar prep, API/strip/drawer mostram 0/7 e casos pending. Full-shaped root continua hierarquia real, sem segunda raiz falsa.
- [ ] Executar 7; a cada atualização relevante, contador do agregado/invocação permanece coerente. Terminal 7/7 não apaga failed/skipped.
- [ ] RepeatEach 2 e duas invocações do mesmo projeto: IDs distintos por invocação/repeat, mesmo ID no retry.
- [ ] Trocar deliberadamente inventário 7→2: desvio declarado; ficam os 2 casos autoritativos, sem cinco casos fantasmas. Falha de descoberta inicial produz desconhecido, não 0/0 aprovado.
- [ ] Fail-fast e preparação falha: casos não iniciados não são fabricados como passed. Retry+fail-on-flaky-tests mantém a política do consumidor.
- [ ] Caso 1001 omitido falha/retry: summary.hasRetries permanece true sem materializar todos os casos. Live continua limitado; não cresce com todos os casos.
- [ ] Canonical `--grep-invert @save-cycle`, duplicação semântica desse filtro e `--workers`/`--output` operacional não inventam focal; seletor confirmado pode promovê-lo. Capabilities antigas recusam antes do enqueue dependente.
- [ ] Projeto B rodando com filtro A: ocupação global visível e drawer B sem trocar filtro. Variante efetiva igual na UI e no leitor CLI compartilhado.
- [ ] Finalização: terminal durável antes de remover sidecar; execução sai do current e surge no Histórico. O job não é prova de ship de outro argv/preset.

## Evidência e aceite

Registrar `producerHead`, `productHead`, manifest/hash do build, hash da fixture, command/runtime, ticket ID, timeline/capturas e endpoint observado. Sem same-ticket único a entrega fica parcial; testes isolados continuam úteis e não devem ser apagados.

Primeiro regressões focais e prova sintética. Nenhum Full DietFlow. Executar browser API real + candidata compilada pela receita de teste autorizada e conservar logs dessa execução oficial; fixtures limpas só por seu lifecycle. Se um comportamento atual estiver errado, entregar o RED e o owner mínimo ao consolidador, sem expandir para outros subsistemas. Sem release/install/merge por efeito desta prova.
