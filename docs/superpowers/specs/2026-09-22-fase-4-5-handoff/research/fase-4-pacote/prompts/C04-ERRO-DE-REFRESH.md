# C04 — preservar dados na falha de refresh do Histórico

**Owner:** CI Queue. **Entrega:** corrigir apenas o estado assíncrono de RunTable, sobre a PR #18 já mergeada.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Contrato e arquivos

Leia `docs/ui/PRODUCT-CONTRACT.md`, `ui/src/features/status/status-page.tsx` (`useExecutionHistory`), `ui/src/features/shared/run-table.tsx` e `async-state.tsx`. Testes proprietários: `tests/browser/dashboard.spec.ts`; preservar `tests/browser/table-layout.spec.ts` da #18.

O hook conserva dados e erro; o renderer condiciona a tabela a `!error`. O esperado é manter as linhas da mesma consulta com uma falha local explícita. Uma primeira leitura falha, sem dados, continua sendo erro. Não reapresentar linhas do projeto anterior.

## Execução test-first

- [ ] Reproduzir com pelo menos 50 linhas carregadas e falha controlada na próxima resposta da mesma query. RED exige linhas ainda visíveis e erro local acessível, não somente estado interno do hook.
- [ ] Implementar a menor distinção entre erro inicial e erro de revalidação. Usar a composição existente; dado anterior não pode parecer uma confirmação recente do servidor.
- [ ] Cobrir segunda página já carregada e falha de refresh: não descartar rows/cursor apenas pela falha. Retentativa bem-sucedida remove o erro e reconcilia a geração.
- [ ] Cobrir troca A→B e erro inicial de B: nenhuma linha de A apresentada como B. Repetir com mudança de filtro que define uma consulta diferente.
- [ ] Exercitar os consumidores Fila/Últimos verdes do mesmo componente sem alterar suas fronteiras. Não modificar cores, colunas, sticky ou posicionamento de badges.
- [ ] Rodar os testes browser focais pelo fluxo oficial de fila, além do lint/build da UI. Identificar o build servido; não reutilizar preview desconhecido. Não executar Full do DietFlow.

## Aceite e saída

Mesmo scope/query: dados anteriores + erro explícito; novo scope/query: nenhum fallback cruzado; recuperação correta; geometria da #18 preservada. Entregar patch, IDs dos testes, RED/GREEN, HEAD/tree e receipt focal ao orquestrador. Sem install, ready ou merge.
