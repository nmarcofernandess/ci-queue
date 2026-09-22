# P03 — Deduplicar seleção Jest sem misturar perfis

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** DietFlow. **Objetivo:** executar uma vez cada prova equivalente, sem trocar o Jest completo pelo related e sem apagar campanhas distintas.

## Arquivos

`scripts/ci/jest-scope.ts`, `scripts/ci/catalog-proof.ts`, `scripts/ci/jest-env.sh`, `scripts/ci/smoketest-local.sh`, testes `scripts/ci/__tests__/jest-scope.test.ts` e contratos do catalog-proof. Conferir `jest.config.cjs`, `jest.global-setup.cjs` e `package.json` como inputs, não reconfigurá-los por preferência.

## Pré-condição

F4-C01 (H/B0) e F4-C06 (gatilhos dos shells Q2) com owner/estado conhecidos. Se ainda abertos, não reimplementar ambos aqui. Mudar o mesmo mapa de seleção em duas lanes cria trabalho concorrente desnecessário.

## Execução

1. Ler o caso histórico `20260915122336-527ad689`:6forced+5related=10arquivos; isto não é19+259 casos e não descreve o conjunto atual. Coletar as listas reais do H atual pela entrada diagnóstica admitida; `--listTests` pode carregar projeto e não é licença para contornar fila.
2. Produzir matriz por **perfil efetivo**, não só path: config, env/opt-ins, bootstrap/globalSetup, comando Node/flags, timezone, base, razão de seleção. Listar interseções catalog∩forced∩related. Distinguir seleção redundante de execução intencional em mais de um ambiente.
3. Só dentro do mesmo perfil, formar união determinística preservando todas as razões de seleção. Perfis diferentes permanecem separados. Preservar `--no-sparkplug`, pretest/Prisma, default/override de workers e estratégia de falha. Não trocar para `npx jest` sem os contratos da entrada atual.
4. Fazer RED com arquivo selecionado por duas razões no mesmo perfil: ambas razões continuam no relatório, a execução equivalente não duplica. Outro caso com mesmo path e perfis diferentes deve continuar duplo. Testar nenhum related, somente forced, catalog+related, fixture filesystem, delete/rename, seleção vazia desconhecida e falha em qualquer grupo.
5. Incluir um caso em que retirar um teste realmente perde uma falha introduzida por input inválido. Um teste que só compara o array esperado não prova equivalência de cobertura.
6. Medir overhead de seleção + preparo + runner. Comparar before/after por perfil e população, não calcular economia de tempo pela quantidade de arquivos. Se as interseções equivalentes forem pequenas ou o listing custar mais, não fazer mudança só para reduzir uma contagem.

## Aceite

A união dos pares `(perfil, arquivo/caso)` obrigatórios é idêntica; nenhuma campanha perde opt-in; falhas propagam; razões de seleção continuam verificáveis; tempos e comandos do relatório correspondem ao que rodou. Prova focal e smoke de entrega conforme o owner, sem Full adicional.

**Integração:** não muda CQ, protocolo ou o significado de `full`. Não transformar related em total nem cortar imports transitivos para forçar subset menor. Corrigir documentação quantitativa apenas para a tupla medida.

**Rollback:** restaurar a composição anterior dos grupos por revert, manter listas e métricas. Não remover testes, logs ou cache para simular retorno ao baseline.
