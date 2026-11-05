# Worktrees aninhadas

## Composição e recorte — 2026-11-05

Pedido: hierarquia física expansível e tamanho próprio sem contar worktrees filhas duas vezes. Candidata local para Marco experimentar; sem promoção main ou troca da instalação.

Need -> table -> Dashboard 01 DataTable + expansão oficial TanStack v9 + Button ghost -> parentId do inventário, busca que mantém ancestrais e tamanho próprio -> worktree hierarchy, gap aprovado por Marco neste pedido.

A expansão nativa da tabela usa linhas HTML válidas e disclosure acessível. Collapsible foi recuperado, mas envolver grupos de tr em wrappers/painéis quebraria a anatomia da tabela; usa-se o rowExpandingFeature instalado em vez de wrappers. Seleção e drawer mantêm IDs e ownership. Tamanhos usam uma passagem du por medição, subtraindo somente filhas diretas da mesma leitura. Cache distingue os limites da medição.

Terreno herdado da investigação desta conversa e conferido nos owners. Mudança localizada de porte médio; execução própria. Review do delta TSX conforme AGENTS. Validação focal e inspeção da candidata, sem CI de integração nesta etapa de experimentação.

## Correção de direção — 2026-11-05

Marco proibiu controlar geometria do componente. Retirados paddingInlineStart por profundidade, espaçador size-7 e wrapper flex/gap acrescentados nesta tarefa. Expansão usa uma coluna nativa da Table, Button ghost icon-sm e ícones Lucide por estado, sem rotação CSS. A célula de identidade volta à composição original. Sem recuo visual autoral. Nenhum aceite humano de aparência é alegado.

Marco ordenou encerrar testes no Chrome. Não retomar até nova ordem expressa para testes de ship. Nesta etapa ele testa a prévia no navegador interno do Codex. API própria18879 e Vite5194 permanecem reservados para essa experimentação; instalação8765 intacta. Nenhum merge/release/push foi feito. As evidências anteriores não validam o delta posterior a essa ordem.

## Recorte final definido por Marco — 2026-11-05

Menor invariante: a original não contabiliza o tamanho das worktrees aninhadas que já aparecem separadamente no inventário. Removida toda a expansão de UI, árvore, parentId público, alteração de seleção/busca e respectivos testes. UI, tipos e ledger restaurados à composição original. Desconto permanece no owner de medição, com cache sensível aos caminhos excluídos e uma só travessia de disco por medição. Mantidos testes focais da propriedade de tamanho; não executados novamente por ordem de Marco. A prévia continua reservada ao teste humano no navegador interno. Sem commit, push, merge, release ou instalação.

## Autoria encerrada → integração em main — 2026-11-05

Marco autorizou ship direto em main, cumprindo gates dessa base, e remoção da worktree. O catálogo check-main executa o mesmo check integral, com origin/main, árvore limpa, HEAD pinado e estabilidade. Retomadas somente as validações de fechamento exigidas.

Revisão do lifecycle: desconto de descendentes imediatas vivas, sem symlinks; valores de mãe/filhas da mesma travessia; cache e pending distinguem o conjunto excluído; mudança de limites não apresenta um total antigo incompatível; timeout/resultado parcial preservam somente valor anterior compatível; worker de medição permanece único e serial. Inventário conserva seu ciclo de atualização de 60s; não há promessa de snapshot atômico do disco.

Verificação focal após o recorte final: python3 -m unittest discover -s tests/backend -p test_worktrees.py — PASS, 8 testes (aninhamento, prefixo irmão, symlink, remoção sem prune, mudança de limites, coalescência de solicitações, timeout e leitura parcial).

Próximo passo contratado: commit/push da candidata, PR para main, ticket check-main elegível e ci-queue ship. Os recibos terminais e o merge serão referenciados na PR, sem alterar HEAD depois de produzir a prova. Nenhuma mudança de UI integra esta entrega.

PR de integração e recibo operacional: https://github.com/nmarcofernandess/ci-queue/pull/54. Este pacote conserva o snapshot de autoria concluída; ticket, veredito e merge ficam no recibo da PR para não mudar HEAD/base durante o fechamento. A limpeza depende de confirmar esse merge.
