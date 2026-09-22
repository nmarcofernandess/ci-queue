# P05 — Piloto de custo/estabilidade Jest, uma variável

## Contrato comum deste corte

Você atua no Codex com o checkout local do owner, não no ambiente do revisor externo. Reconfirme `origin/dev` e a identidade do remote; a auditoria de21/09 fixou CQ `550409a92f359cffc3e75f34712d39133b8ab130` e DF `ffc99748f796d8f7923c9e46161b2a4dc735eef8`. Não reancore cegamente numa revisão antiga. Leia AGENTS (DF: alvo `.claude/CLAUDE.md`), contratos e patterns dos arquivos tocados. Use worktree própria quando houver implementação; não altere a worktree canônica ou outra lane.

A fila oficial é a única entrada para receitas reais neste host. Fixtures de testes usam estado temporário e identidade própria; nunca segundo worker no state do operador. Antes de enfileirar, leia ocupação/recursos e confirme janela com o operador. Não contorne guard com env fabricado, `--executor direct` ou subprocesso pesado fora da fila. Ausência de capacidade/receipt é lacuna; não é verde.

Não alterar cobertura, assertions, retries, timeouts, grep-invert, protocolo de progresso ou política de ship para obter velocidade. Não instalar, mudar Node/Colima, limpar caches globais/state, abrir campanha Full, promover stage/main/PROD ou assumir autorização de merge. Atualize apenas docs do owner deste corte; a Spec121 não será declarada concluída. Preserve todos os resultados vermelhos/abortados e os hashes das evidências.

**Antes/depois:** registrar H_A/H_B, B0, delta exato, hashes da árvore de produto e gerados, lockfiles, argv/config/env efetivos redigidos, runtime, workers, população, caches, banco, host e carga. H_A e H_B só diferem pelo tratamento autorizado. Um par serve à triagem; confirmar ganho em pares pequenos comparáveis, sem repetir Full. Mesmos gates e resultado; segurança/cleanup são aceite obrigatório. Se variar outra condição, separar a amostra.

**Integração:** entregar patch, relatório focal e critérios satisfeitos/não comprovados. PR/merge somente quando o operador autorizar, pelo fluxo existente do owner e para dev. Não retestar ou reimplementar o outro repo por conveniência. Rollback preserva evidências e reverte somente o delta aprovado, nunca faz limpeza global.

**Owner:** Spec121-M03/DietFlow; CQ apenas executa a receita admitida. **Natureza:** primeiro preparar desenho e verificar artefatos; só executar piloto na janela explicitamente autorizada.

## Arquivos

`specs/121-harness-resource-exhaustion/PLANO-EXPERIMENTO-SIGSEGV.md`, seu `harness/` e resultado dos experimentos; `scripts/jest/worker-memory-policy.cjs`, `scripts/ci/jest-env.sh`, `jest.config.cjs`, `jest.setup.js`, `package.json`; testes existentes `scripts/ci/__tests__/jest-worker-memory-policy.test.ts` e `jest-env.test.ts`. Logs/IPS exatos estão no P00.

## Reancoragem indispensável

O plano histórico comparava ativar `--no-sparkplug`; o package atual já o usa. Node24.20.0 Darwin também muda automaticamente o default de workers e a reciclagem. Não desligar a mitigação nem trocar versão seguindo o plano antigo sem atualizar o desenho. Não executar `--runInBand` ou Node direto presumindo equivalência: registrar processos/execArgv e o preparo realmente aplicado.

## Execução

1. Extrair assinatura e configuração do run `20260919055151-8c2dd256`; sem IPS, manter sinal observado e assinatura não comprovada. O Full final verde não é seu controle A/B.
2. Selecionar um único problema: (a) onde se gasta tempo no recorte Jest, ou (b) efeito de UMA variável de runtime/reciclagem sobre a assinatura. Começar por perfil sem tratamento quando faltam tempos por suíte. Não migrar framework.
3. Congelar recorte/ordem/config, Node/V8/hash, workers, flags, opt-ins, preparo, cache e carga. Um experimento de ambiente node/jsdom só inclui arquivos cujo comportamento e dependências permitam; nada de migrar uma pasta inteira pela extensão.
4. Usar entrada Jest-only temporária já prevista no harness da121 e admitida pela fila. Caso a entrada atual não comporte o recorte, parar para uma adaptação estreita autorizada; não inventar `ci:queue -- jest` nem bypass direto. Não iniciar Next/Supabase/Colima neste piloto.
5. Colher por PID/nascimento: arquivo em execução, heap/external quando o processo publicar, RSS, tempo, troca de worker, exit/signal e resultado. O host reporter sozinho não mede a memória dos filhos. Instrumentação idêntica nos braços, limitada e sem dumps de dados clínicos.
6. Caps do plano: piloto no máximo3runs,10min/run,30min total; ≥15GiB livres e sem carga pesada; paradas de recursos conforme M03. Dado ausente/cleanup incerto pausa. Não elevar caps ou adicionar swap. Tratamento adicional só após baseline e decisão do operador; não executar10pares automaticamente.
7. Se não reproduzir ou se a variação ocultar ganho, encerrar inconclusivo. Não reiniciar Full para buscar crash ou verde. Todos os abortos entram no ledger com censura.

## Aceite e decisão

Entregar perfil com n e limites, não “curou SIGSEGV”. Eventual mudança candidata requer configuração efetiva verificada em todos os filhos, oráculos funcionais preservados, redução medida de custo/risco e review independente. Runtime novo dentro24.x só com binário já disponível/autorizado e documentação de correção pertinente; não fazer upgrade/instalação neste prompt.

**Rollback:** manter política vigente até evidência; se houver tratamento experimental, voltar só esse fator entre braços com identidade registrada. Nunca apagar logs, remover suíte problemática ou afrouxar retries/timeouts. **Integração:** patch posterior separado; Full final exclusivamente com o selo RC115.
