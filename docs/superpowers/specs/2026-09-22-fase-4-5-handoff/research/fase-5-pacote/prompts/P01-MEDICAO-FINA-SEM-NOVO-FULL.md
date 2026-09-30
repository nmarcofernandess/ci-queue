# P01 — Separar subcomandos sem inventar outro protocolo

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** DietFlow para receita; CQ apenas para eventual medição genérica do executor. **Natureza:** instrumentação diagnóstica mínima, depois uma validação focal autorizada; nunca Full novo.

## Arquivos

DF `scripts/ci-local.sh`, `scripts/check-fixtures-vs-schema.sh`, `scripts/prisma/generate-client.sh`, `scripts/ci/full-local.sh`, `scripts/ci/e2e-local-stack.sh`, `scripts/ci/run-context.ts`, `scripts/ci/execution-evidence.ts`, `scripts/ci-flowui.ts`. Inspecionar helpers existentes antes de criar outro. Testes em `scripts/ci/__tests__/`, estendendo o owner de instrumentation/receipt; novo teste, se necessário: `scripts/ci/__tests__/performance-measurement-boundary.test.ts`.

## Plano

1. Ler P00. Já existem54gates temporizados no AP17: não reimplementar durationSource/collector para responder ao que já se sabe. Inventariar a semântica atual (56gates; Q2 discovery incorporada).
2. Medir apenas buracos: validate/generate/Next typegen/MDX/tsc; escolha e execução de grupos Jest; Chromium/Next build/start/health; Supabase start/health/generate/migrate/seed/realtime/discovery; Storybook Care/build/capturas e agregação Care. Fases pai/filho não se somam.
3. Usar relógio monotônico e boundary do comando, mantendo argv/env, exit/signal e traps do dono. Artefato diagnóstico sob o runDir existente, com IDs, início/fim, duração, versão da fronteira, caminho/identidade e bytes. Não criar evento novo no protocolo público nem um daemon/telemetria global. Se falta run context, criar somente scratch diagnóstico owned e vinculá-lo ao ticket verdadeiro; não fabricar receipt/executionId.
4. Registrar cache por camada antes/depois com hashes permitidos; medir CPU/RSS quando a ferramenta disponível prover e anotar unidade/metodologia. Falta de medição não vira0. Evitar hash recursivo caro por evento.
5. Testar com subprocessos de fixture: sucesso, exit7, sinal, filho que falha, medidor que falha, comando sem saída, Unicode e stdout fragmentado. Resultado do comando/cleanup permanecem; medição ausente é explícita. Verificar redaction e limite do arquivo. Não engolir falha para manter gráfico verde.
6. Comparar overhead da instrumentação em fixture pequena. Depois aproveitar **o próximo Static/smoke já necessário e autorizado**, com identidade congelada, para coletar os subtempos. Não executar todos os subcomandos pesados separadamente fora da fila. Caso não exista essa janela, entregar instrumentação e aguardar — sem prometer números.

## Aceite

Prova causal focal não baseada só em “o JSON tem uma chave”: subprocesso real controlado mantém o mesmo outcome e logs; nested spans não duplicam total; falha não gera duração0; cache/proveniência da amostra documentados. Produzir amostra original e normalização com fontes, sem mudar o ticket histórico.

**Integração entre repos:** o protocolo atual é suficiente. Mudança de medição interna do DF não obriga alterar CQ/UI. Para custo genérico de pipe/coleta, preferir fixture de CQ com estado temporário e mesmo guard; nunca remover supervisão do DF como tratamento.

**Rollback:** remover somente instrumentação opcional e preservar evidência; não tocar nos gates. **Saída:** ranking interno com envelope e uma única hipótese priorizada para P02/P03/P05/P06.
