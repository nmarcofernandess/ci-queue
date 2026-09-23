# P04 — Build interno único no check do CI Queue

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** CI Queue; zero arquivos DietFlow. **Objetivo:** remover uma compilação redundante comprovada no agregado, preservando entradas standalone e a mesma suíte.

## Arquivos

`package.json`, `scripts/ci/check-with-progress.sh`, `tsconfig.json` (leitura), `tests/core/progress-emit.test.ts` e `tests/runtime/` (contratos existentes). Teste focal novo, se necessário: `tests/core/check-composition.test.ts`.

## Evidência

No checkpoint auditado, o wrapper roda `build`, `test`, `check:ui`, `test:browser`. O script `test` chama `test:runtime`, que executa `npm run build` novamente. Isso prova repetição no CQ, não seus minutos e não uma falha do Vitest. O mesmo check contém unittest Python e outros runners Node.

## Execução

1. Ler o ticket `20260921133518-b846929f` e logs disponíveis. Identificar as duas compilações e seus intervalos. Se não houver subtempos, usar fixture de composição e aproveitar o próximo check CQ autorizado para medi-los.
2. Mapear consumidores standalone de `test:runtime`, `test` e scripts de release/install. Não retirar a garantia de dist fresco de uma entrada que hoje o constrói.
3. Separar, se necessário, operação interna que consome build da entrada pública que prepara + consome. O agregado deve compor uma única preparação para aquela árvore/config e chamar o corpo correspondente; não depender de `dist` velho existir ou de env arbitrário “já construiu”. Manter scripts existentes com semântica standalone.
4. RED com dist ausente, dist velho versus fonte alterada, build que falha, core que falha, runtime que falha e teste que emite markers de fixture. O agregado não usa output obsoleto, termina vermelho corretamente e continua filtrando markers internos.
5. Provar que a população Vitest/core/UI, Node/runtime/examples/release/install, Python/backend e Playwright/browser não mudou. Não chamar `test` de “Vitest” no relatório de tempo.
6. Medir antes/depois no mesmo host/caches e mesma árvore funcional. Não instalar release para medir o check. Preservar quatro estágios externos; granularidade adicional é artefato diagnóstico, não novo protocolo/UI.

## Aceite

Uma preparação equivalente por agregado, entradas standalone frescas, falha propagada, mesmos testes e custo total menor de forma reproduzível. Teste de contador isolado não basta; precisa provar dist fresco e execução do runner real em fixture.

Se uma etapa anterior ao segundo build realmente modifica inputs, não suprimi-lo: registrar a dependência e parar o corte até a composição tornar a validade demonstrável.

**Integração:** review/check oficiais do CQ, PR para dev quando autorizada. Nenhum smoke ou Full DietFlow “por garantia”, pois não houve alteração de contrato consumidor.

**Rollback:** revert da composição; manter logs. Ganho anunciado somente em segundos do **check CQ**, nunca como redução do Full DietFlow.
