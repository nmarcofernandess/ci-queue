# P06 — Separar preparação E2E/FlowUI e medir Q1

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** DietFlow para E2E/FlowUI/proofs; Spec121 para recursos/disco; CQ apenas seus próprios logs/cópias. **Natureza:** medição e diagnóstico; nenhuma retenção ou substituição de runtime/banco automática.

## Arquivos

`scripts/ci/e2e-local-stack.sh`, `scripts/ci/_local-stack-lib.sh`, `scripts/ci/preflight-local-stack.sh`, `scripts/ci/playwright-invocation.sh`, `scripts/ci/playwright-discover.sh`, `scripts/ci/playwright-live-aggregate.ts`, `scripts/ci-flowui.ts`, `scripts/proof/aggregate-care-downloads.ts`, `package.json`, `ci-queue.json`. Testes de wrapper/receipt/progresso já donos em `scripts/ci/__tests__/` e `scripts/__tests__/`.

## Execução

1. Usar P00/P01. No AP17: Supabase100811ms, Next762211ms, Playwright2674085ms, FlowUI+Care322000ms. São envelopes, não tempos puros de DB/servidor/Vitest. Q2 mudou a fronteira de discovery dentro do preparo; incluir versão da fronteira no comparativo.
2. Separar Chromium ensure/install, Next build, start, espera inicial5s e health; Supabase start/health/generate/migrate/seed/realtime/discovery; Vitest Care, Storybook build, assert/captura e Careaggregate. Não eliminar healthchecks, seed ou browser preparation para melhorar medição.
3. Testar a instrumentação com executáveis de fixture sem DB/Next real; cobertura de failed/prep, sinal, cleanup, duas invocações e falha de pipeline. O outcome original é preservado. Não atribuir markers de fixture ao progresso real do job pai.
4. Se precisar medir runtime real, escolher **uma receita focal oficial já existente** que utilize esse wrapper, na janela do operador. Mesmos testes/argv no antes/depois. Não a chamar de Full; um focal não mede toda a população nem sua acumulação de heap. Não iniciar a stack se houver owner concorrente.
5. Observar o cache existente antes de propor novo: o wrapper remove `.next/standalone`, não todo `.next`. Preservar isolamento de worktree; não symlinkar diretório de build ativo entre lanes. Frio/quente precisam de namespace e política controlada, sem limpar cache global. `next-dev` não substitui `next-start` na prova canônica.
6. Tratar Q1 só como coleta: obter operação/path ENOSPC, bytes físicos e lógicos com metodologia, por owner, evitando dupla contagem. Ler somente metadados; não varrer o disco repetidamente com job ativo. Classificar scratch, logs, tickets, cópias e proofs segundo seus leitores reais. Verificar que cada proof tem cópia durável/manifest antes de discutir futura retenção.
7. Para custo do worker copiar/transportar logs, usar fixture do CQ com estado temporário/volume conhecido em outro recorte. Não somar931ms de cópia do19/09 aos bytes do inventário20/09 como se fossem a mesma amostra. Não executar cleaner.

## Aceite / próximos cortes

Entregar decomposition atual, cache manifest e tabela `path → produtor → leitores → bytes lógicos/físicos → uso ativo → durabilidade`. `unknown` continua unknown. Nenhuma política de retenção é criada; snapshot/templateDB, novo cache e mudanças Colima só podem virar propostas se a medição mostrar benefício suficiente e equivalência recuperável.

**Integração:** somente instrumentação/provas focais eventualmente autorizadas. Nenhum knob de runtime, opção de build ou filtro muda. Se houver proposta vencedora, abrir corte próprio para revisão antes de implementar. **Rollback:** remover instrumentação diagnóstica que perturbe o comportamento, mantendo evidências; não tocar no estado do DB/host/filas para “voltar ao baseline”.
