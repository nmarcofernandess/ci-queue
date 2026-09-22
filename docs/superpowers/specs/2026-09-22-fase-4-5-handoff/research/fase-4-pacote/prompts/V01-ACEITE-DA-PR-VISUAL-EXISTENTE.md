# V01 — conferir o aceite da PR #18 já mergeada

**Owner:** revisor e owner da task visual existente. **Entrega:** rechecagem e evidência; não uma segunda implementação de tabelas.

## Bases e limites comuns deste corte

Auditoria em 21/09/2026: CQ dev `550409a92f359cffc3e75f34712d39133b8ab130` (#17 e #18 mergeados); DF dev `ffc99748f796d8f7923c9e46161b2a4dc735eef8` (#1305 integrado, seguido por #1274/#1300). Releia o dev vivo e registre HEAD/tree antes de atuar. Verifique ancestry dos HEADs Q2 `e410dff80aa7e3423b8dd73b23d813cae6635d90` e `d8048fb4f6c760eb0c607b098038846757ac43a3`. Não retome uma worktree antiga nem reimplemente correção posterior.

Use worktree isolada segundo `superpowers:using-git-worktrees`. Consulte AGENTS do repo; no DF leia o alvo `.claude/CLAUDE.md`. Para código use `superpowers:test-driven-development`: um comportamento, RED pelo motivo correto, mínimo GREEN, owner suite. Teste já verde é cobertura existente, não RED. Não enfraqueça assertion nem copie a implementação para calcular o esperado.

No Mac, a suíte real entra na fila oficial pelo preset/admissão apropriado; fixtures internas usam HOME/state temporários. Não comece segundo worker no state do operador. Confira execução existente antes de repetir comando. Preserve os SHAs/argv/runtime/cwd da prova. Não publique manualmente status verde.

Sem Full ritual, install/release ativa, limpeza de state/logs, stage/main/PROD, alteração de workers/Node/Colima/framework, merge ou ready. Autoria local e validação deste corte não autorizam push/PR/ship: devolver patch/receipt ao orquestrador. Retome depois de interrupção lendo estado real, não o histórico de outra máquina.


## Estado comprovado

PR #18 foi mergeada em `550409a92f359cffc3e75f34712d39133b8ab130`; HEAD da lane `17b379a55682489864d5d328ead68b1581d602fc`; base `24d6a2b417876db209db4519c3826566ab94a1e7`. O PR relata check `20260921133518-b846929f`, com 55 testes browser. A auditoria leu código e testes, mas não recebeu as capturas nem executou a suíte.

O contrato atual **remove a badge de flaky junto ao nome**. Flaky aparece no tooltip e nome acessível do indicador compartilhado. Terminal conserva a cor do resultado; em execução, falha no progresso precede retry. Não restaurar a badge para obedecer ao TSV antigo.

## Owners e provas existentes

Leia `docs/ui/PRODUCT-CONTRACT.md`, `COMPOSITION-LEDGER.md`, `.context/patterns/ui-composition.yaml`; `presentation.ts`, `status-indicator.tsx`, `entity-identity.tsx`, `data-table-frame.tsx`, `run-table.tsx`, `worktrees-page.tsx`, `index.css`; testes `tests/browser/table-layout.spec.ts`, `ui-consistency.spec.ts`, `dashboard.spec.ts` e `tests/ui/presentation.test.ts`.

Os testes novos já cobrem 1440/820/390, claro/escuro, largura útil do nome, alinhamento de colunas, rolagem local, nome/checkbox/olho no viewport ao fim, tooltip acessível de flaky e abertura por teclado. Não duplicar essa matriz como se não existisse.

## Rechecagem focal

- [ ] Receber índice de capturas, revisão da página servida e receipt do check acima. Não pedir novo merge ou install para preencher o relatório.
- [ ] Confirmar o contrato mais recente do Marco: nome da Worktree e olho ficam visíveis durante a rolagem; branch pode rolar e elidir com acesso ao valor completo.
- [ ] Conferir **meio** da rolagem, além das posições inicial/final já testadas. Verificar retângulos e hit-targets: dois elementos parcialmente no viewport não bastam se um cobre o outro. Nome, checkbox e olho continuam operáveis.
- [ ] Usar preset/projeto longos, Personalizado/Focal e flaky no indicador. Testar o acesso por teclado ao texto elidido e às ações. Não exigir que um nome arbitrariamente longo apareça integralmente sem elisão.
- [ ] Conferir widths intermediários e zoom, sem redesenhar tabelas por opinião. Acrescentar teste somente para lacuna reproduzida; não fixar classes ou internals de SVG.
- [ ] Provar a prioridade de falha do indicador com **API live** e progresso publicado por uma fixture, não só payload que injeta a árvore completa. Se o fato de falha/retry sumir na projeção leve, encaminhar ao owner C03 para um resumo genérico; não recolocar todos os cases no live.
- [ ] Manter foco/seleção, dados durante refresh e ausência de abertura por checkbox/linha. C04 já é dono do defeito funcional de refresh; coordenar, sem patch duplicado.
- [ ] Identificar o build navegado. A configuração padrão usa Vite dev e pode reutilizar um servidor; isso não comprova por si só a candidata compilada ou instalada.

## Saída

Parecer com critérios cobertos, capturas/HEAD e lacunas restantes. Se houver defeito real, arquivo/linha, reprodução e menor ação no mesmo owner. Se não houver, registrar conformidade nos cenários observados e preservar VISUAL-ACCEPTANCE separado do check automático. Sem PR nova, ready, merge ou instalação por este prompt.
