# P07 — Integrar a leitura de performance ao selo RC115

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** orquestrador RC115, com registro de recursos na121. **Natureza:** coordenação e leitura de evidência. Este prompt **não autoriza enfileirar Full**.

## Arquivos

`specs/115-caminho-para-main/` (estado/selo e diretório de evidence do candidato), `specs/121-harness-resource-exhaustion/status.md` e minispecs dos cortes realmente executados, `specs/125-full-ap17-fixes/status.md`/`progress.md`, `docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md`, mais receipts dos P00–P06. Não reescrever todo o histórico nem os planos antigos.

## Execução

1. Receber do dono do RC o H/candidato, B0, gates e autorização de execução final. Sem isso, apenas registrar dependências e parar. Não criar outra fila de validação para a campanha de performance.
2. Conferir quais cortes de performance realmente foram implementados, testados e mergeados; um prompt/patch ou PR green não prova release instalada. Verificar capability CQ necessária pelo consumidor e árvore limpa do candidato. Não instalar como efeito colateral.
3. Quando o Full do selo existir, consumir o ticket real, receipt, logs e manifests do MESMO H. Não usar o Full AP17 como prova do candidato atual, nem o Full vermelho Cursor como controle de tempo.
4. Produzir relatório: espera, preparo, execução, finalização, publicação; contagens atuais de gates/suítes/casos; hashes de seleção e caches; skipped/retries; runtime/host/DB; recursos, falhas e cleanup. Comparar com histórico apenas como composição, a menos que todos os fatores necessários coincidam.
5. Escolher orçamento atualizado por estágio somente após o baseline atual. Com n=1, publicar referência observada e lacuna de variância; não p95, SLO ou garantia. Usar os pares focais dos cortes para relatar seu ganho, sem extrapolar a todo o Full.
6. Reconciliar documentação ativa: já existem54gates temporizados no ticket AP17; status125 completed é registro daquele fechamento. Qualificar “eficácia total/100% estável” onde usado como instrução atual, mantendo os eventos históricos intactos e com data. A investigação causal M03 e ENOSPC M05 só fecham com seus próprios critérios, não pelo verde do RC.

## Aceite e rollback

Um único Full canônico do candidato sob o owner do selo, quando autorizado; performance aproveita sua evidência. Cada conclusão material aponta arquivo+ticket/H/base. Não há nova obrigação de repetir Full nem alteração de ship.

Se a medição do candidato não for comparável, declarar isso sem invalidar a prova clínica correta. Se o gate clínico falhar, ele permanece vermelho; não remover caso/timeouts/skip para aprovar performance.

**Rollback:** documental por revert do texto novo incorreto, preservando receipts/manifests. Uma correção de produto que falhar volta ao respectivo owner/corte. Não limpar evidência nem fabricar nova aprovação da121/125.
