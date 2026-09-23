# P02 — Primeiro candidato: menos repetição no Static, mesma prova

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** DietFlow. **Objetivo:** eliminar trabalho comprovadamente redundante de preparação/typecheck dentro do mesmo agregado, sem reduzir o universo validado.

## Arquivos e fundamento

Modificar somente onde necessário: `scripts/check-fixtures-vs-schema.sh`, `scripts/ci-local.sh`, `scripts/prisma/generate-client.sh`, `package.json`; consumidores auxiliares apenas com prova de necessidade. Testar em `scripts/ci/__tests__/static-validation-equivalence.test.ts` (novo) e nos contratos existentes do Static/smoke. Conferir `scripts/__tests__/ci-smoketest-policy.test.ts` e `scripts/ci/jest-scope.ts` para seleção do próprio teste.

Fonte medida: ticket AP17 `20260919075127-addfb8a5`: `check:fixtures=197537ms`, `typecheck=241226ms`, Prisma gate1=6990ms. Ambos caminhos executam tsc amplo, mas seus pré-requisitos não são idênticos por definição: typecheck tem `next typegen` e MDX. Não apagar um comando só porque os dois se chamam tsc.

## Execução

1. Usar P01 para mapear programas TS, gerados, schema, config, env e alterações entre as duas chamadas. Um hash estável do source não prova gerados estáveis. Confirmar os resultados completos da validação de refs/snapshot/Prisma que devem continuar.
2. Antes de reutilizar resultado, adicionar RED de segurança: tsc com falha nativa/exit134 ou139 sem linha Prisma; erro global de compilação; erro em fixture; erro apenas fora de Prisma. Hoje o wrapper filtrado pode avisar em vez de rejeitar um crash. O agregado deve conservar sua falha estrita e diagnóstico; o standalone não pode apresentar erro de infraestrutura como prova bem-sucedida de fixtures.
3. Definir composição mínima do agregado. Preparar os mesmos inputs uma vez e reutilizar resultado real apenas no mesmo escopo, com identidade de configuração/gerados. Preferir passagem direta de resultado/manifest da própria execução a cache persistente. **Proibido** env `TSC_PASSED=1` ou sinal equivalente sem prova vinculada.
4. Implementar somente se a equivalência permitir. Preserve `check:fixtures` standalone, a validação de tipos geral, o projeto Storybook distinto, validate/refs/snapshot e propagação de falha. Se a primeira medição mostrar que não há resultado reutilizável entre esses pontos, pare com diagnóstico e não force uma arquitetura de cache.
5. RED/GREEN de comportamento com fixture TS mínima: campo de Prisma removido; erro de tipo fora de Prisma; generated/config alterado após primeira validação; falha de gerador; receipt ausente/inválido; inputs idênticos; caminhos standalone e agregado. O oracle é rejeitar o programa inválido e conservar todos os validadores, não contar strings do shell. Contagem de comandos é métrica complementar.
6. Rodar prova focal pelo owner na fila. Comparar A/B no mesmo ambiente e com a mesma carga clínica/config/cache. Um primeiro par para triagem; confirmar ganho em recorte pequeno antes do smoke da entrega, sem outro Full.

## Aceite, integração e rollback

Mesma cobertura/diagnóstico obrigatórios, nenhum bypass, nenhum sucesso de tsc inferido, outputs reproduzíveis, economia medida maior que a variabilidade. Relatar custo de seleção/manifest/preparo junto com economia. Não prometer197s: isso é o limite do gate inteiro observado, que inclui trabalho próprio.

Registrar teste no selector existente para mudança `.sh` não ficar invisível; coordenar com F4-C06/P03 para não editar esse mapa simultaneamente. Não alterar CQ.

Entregar patch pequeno, matriz de equivalência e antes/depois. Se a cobertura ou a segurança divergir, revert do corte inteiro e preservação das evidências, não aumentar timeout/heap ou excluir diagnóstico para fazer passar.
