# C06 — cobertura da seleção e fronteira dos frameworks

**Entrega:** Fechar gatilhos ausentes do harness e produzir inventário de escopo/progresso/custo, sem migrar runners.

**Owner:** DietFlow no selector e testes do consumidor; CI Queue nos contratos de seu self-host.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Fontes e arquivos

DF: `scripts/ci/jest-scope.ts`, `scripts/ci/__tests__/jest-scope.test.ts`, `scripts/__tests__/playwright-discover.test.ts`, `scripts/__tests__/playwright-invocation-shell.test.ts`, `scripts/ci/playwright-discover.sh`, `scripts/ci/playwright-invocation.sh`, `scripts/ci/e2e-local-stack.sh`, `jest.config.cjs`, `vitest.config.ts`, `package.json`, `scripts/ci/full-local.sh` e `docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md`.

CQ: `package.json`, `scripts/ci/check-with-progress.sh` e testes de progresso/pipeline/entry guard. Ler os contratos atuais, não o dashboard aposentado do DF.

## Decisões

Manter Jest no escopo atual do DF, Playwright clínico/fixture, Vitest Storybook, Vitest CQ e os demais runners. A marca da ferramenta não define duplicação. Não criar grafo executivo, reporter por arquivo ou novo pré-requisito Full.

O selector usa extensões JS/TS para related e mappings explícitos para leitura por filesystem. Uma alteração isolada nos shells novos de Q2 precisa selecionar os testes de seu owner. Não pode desaparecer porque a extensão é `.sh`.

## Tasks verificáveis

- [ ] **RED 1:** `classifyJestScope(['scripts/ci/playwright-discover.sh'])` deve selecionar `scripts/__tests__/playwright-discover.test.ts`. O caso isolado de `playwright-invocation.sh` seleciona `playwright-invocation-shell.test.ts`. Confirmar que o RED é a ausência dessa cobertura.
- [ ] **GREEN 1:** acrescentar o mapping no owner existente de forced contracts. Não fazer toda alteração `.sh` disparar Jest inteiro nem copiar a tabela para outro arquivo.
- [ ] **RED 2:** o teste de discovery invoca o wrapper real com a fixture pequena, passando um seletor explícito. Manifesto deve conter a população esperada, com condições/argumentos preservados. Chamar `npx playwright` diretamente não protege uma mudança no wrapper.
- [ ] **GREEN 2:** corrigir somente o boundary se o teste demonstrar defeito. Não calcular o esperado lendo o texto do shell. Reutilizar `scripts/__tests__/fixtures/pw-discover/`. Falha ou manifesto malformado não fabrica 0/0 aprovado.
- [ ] Conferir `e2e-local-stack.sh`: mudanças no wiring devem alcançar os testes do agregado, discovery e invocação pertinentes. Selecionar apenas testes que realmente exercitam esses contratos, não uma lista simbólica de arquivos.
- [ ] Num diff pequeno e congelado, enumerar os arquivos selecionados por `forced`, `related` e `catalog`, e sua interseção. Usar a listagem do runner sem execução, com a mesma configuração/ambiente. Registrar base/HEAD, comando e nomes; seleção não é resultado de teste.
- [ ] Não deduplicar populações com ambientes, contratos ou efeitos diferentes. Interseção realmente equivalente e com custo medido pode motivar ajuste posterior mínimo. Este corte não autoriza excluir suítes por limite arbitrário ou remover o complemento filesystem do related.
- [ ] Registrar a matriz de progresso: CQ publica quatro fases externas; DF Static publica gates; DF Jest publica invocação/seleção; DF Playwright publica casos. Nome impresso no stdout não é evento estruturado.
- [ ] Preservar ou acrescentar o negativo do self-host: marker impresso por fixture que testa o protocolo não contamina a execução real. Não remover o filtro para obter mais detalhe.
- [ ] Executar owner tests focais pela fila. Se tocar contrato TS exportado, rodar o typecheck correspondente. Sem Jest global de dezenas de minutos por ritual e sem declarar Full aprovado.

## Aceite

Mudanças de shell têm testes donos selecionados; documentação continua no fluxo próprio; unknown/delete não ganham verde falsamente vazio. Entregar matriz runner/escopo/prova, receipt da seleção e regressões. Nenhuma migração de framework, cópia de negócio para CQ ou grafo inventado.

Granularidade adicional dos runners internos é um próximo incremento consciente: reporter central, canal confiável e orçamento de eventos/bytes. Não disfarçar essa feature como requisito já atendido pela impressão de nomes no terminal.

## Delta recente relevante

O Static atual tem 56 gates após os checks `calculo-card-shell` e `editor-list-item-delete`; os diagnósticos antigos de 54 gates continuam datados. O `jest.setup.js` agora limpa aliases de job da fila no ambiente das suites. Conferir os testes de isolamento tocados sem confundir esse setup com emissão de nomes/casos ou runtime guard completo. O projeto Storybook do Vitest continua distinto de Jest. Não atribuir aos novos gates a lentidão anterior do Mac sem medição causal.
