# C02 — reconciliar instruções e estado, sem fechar a 121

**Entrega:** Remover contradições operacionais atuais e registrar a fronteira de prova de cada minispec.

**Owner:** DietFlow nos contratos consumidores/status; CI Queue somente seus manuais/roadmap.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Arquivos

DF: `.claude/CLAUDE.md` (alvo de AGENTS), `.context/patterns/ci.yaml`, `docs/ci/README.md`, `docs/ci/CI-QUEUE-CONSUMIDOR.md`, `specs/121-harness-resource-exhaustion/status.md`, `RESULTADO-EXPERIMENTOS.md` e os `status.md` de M01–M07. `specs/125-full-ap17-fixes/status.md`/`progress.md` somente nas alegações Full/harness e estado de integração. CQ: `docs/ROADMAP.md`, `docs/CONTRACTS.md`, `docs/CONSUMER-QUICKSTART.md` apenas onde há erro vivo demonstrado.

Não substituir o TSV72 original por esta auditoria. Referenciá-lo como fotografia datada e anexar censo/ponteiros do novo estado, sem outro manual.

## Decisões fechadas

- Correção mais recente do operador + código/config/testes do dev governam o procedimento.
- Full informativo/advisory não é executado por causa de um parágrafo-resumo; confirmar policy do ship atual antes de mudar o texto.
- Guard opt-in nos agregados impede o bypass no Mac. Fixture interna temporária não significa rodar suíte real fora da fila.
- M06 concluída daquele corte e M07 implementada no produto não implicam Spec 121 concluída. M03/M04/M05 precisam de evidência específica.
- Boot de 20/09 é prova da release indicada; não é boot automático do dev de 21/09.

## Execução

- [ ] Produzir tabela curta `trecho atual → regra vigente → fonte → alteração` antes da edição. Distinguir instrução ativa de registro histórico que precisa só de data/aviso.
- [ ] Conferir `.claude/CLAUDE.md` §8/Full versus o trecho informativo e `scripts/ship/ship.ts`. Unificar o procedimento sem retirar a opção explícita de Full do operador.
- [ ] Corrigir `dirty_campaign`/direto em ci.yaml onde conflita com a adoção atual da fila; conservar contexto Cloud/Actions explicitamente suportado.
- [ ] Atualizar índice vivo da 121 e M07 com implementação/cap/testes atuais; manter campo operacional de cenário instalado como NÃO COMPROVADO sem receipt. Corrigir referências ativas a `status.json` inexistente para o owner atual `status.md`; não reescrever JSON citado como fato de uma data passada.
- [ ] Na 125, conservar números/tickets, mas remover inferências universais como “serialização 100% estável” da orientação ativa. Consultar PR1294/ancestry antes de atualizar “pronto para merge”. Não revisar o domínio clínico A-P17.
- [ ] Roadmap CQ: distinguir implementado em código, validado em fixture, instalado com receipt e direção futura. Não anunciar submit/MCP/OAuth nem grafo novo como existente.
- [ ] Conferir 72 IDs/categorias do censo novo; links de ponteiros e consistência do formato dos status. Não exigir handbook novo por minispec.
- [ ] Usar gates documentais/spec/context já presentes. Não inventar teste de snapshot de prose inteira nem rodar Full para corrigir Markdown.

## Aceite

Uma instrução atual por ação; nenhum fluxo manda executar por fora da fila no host que exige guard. A 121 permanece aberta. Toda frase de instalação/causalidade tem revisão e prova identificadas, ou lacuna explícita. Entrega diff documental, matriz de decisões e resultados dos gates focais; não modifica regras clínicas, execução, testes ou configuração operacional para satisfazer texto antigo.

## Atualizações já integradas que esta reconciliação deve preservar

A PR #18 já mudou o contrato visual de retry/flaky: indicador, tooltip e nome acessível substituem badge junto ao nome. Não reintroduzir a badge por fidelidade ao TSV histórico. O censo final classifica essa linha como substituição deliberada.

No dev DietFlow final, research J/K e 56 gates Static entraram com a 123/04. Inserir a evidência nova no índice datado da 121, sem transformar mitigação Linux em causa comprovada do Mac. A causa-raiz permanece aberta. A própria comparação 125 entre serial verde e serial exit 139 impede escrever que serialização curou universalmente o SIGSEGV.
