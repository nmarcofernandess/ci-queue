# Etapa 1B — evidências

PR #5 foi mergeada em `dev` em `4579a1b`. Tip incorporado:
`b52a575`. Árvore: `f07cefe`. O Complete check do run `35036577866`
concluiu com sucesso em `b52a575`.

Esta pasta descreve a evidência da lane que entrou. Não autoriza merge,
release, instalação nem etapas 2–5.

## Procedência

- Pacote: Etapa 1B (contexto de projeto, Análise proporcional,
  multi-seleção de Resultados) + correção posterior de localizadores
  (identidade em `project.id`, primary checkout independente do nome da
  branch, recuperação via common-dir, cadastro atualizável, escolha nativa
  de pasta).
- Merge auditado: `4579a1b22264d81a16324da6bc93788ba53c5530`.
- Branch desta correção pós-merge: `codex/1b-post-merge-review`.
- Release instalada relatada pelo operador: `0.1.0-b52a57533a74`.

## Aceite da lane mergeada

A suíte oficial da 1B executou no Complete check. A cobertura não incluía
os cenários F01–F10 desta revisão.

| ID | Prova na lane mergeada |
| --- | --- |
| AN-01–07 | `tests/ui/results-model.test.ts`, `analysis-selection` |
| PR-01–04 | `tests/backend/test_projects.py` |
| SC-01–04 | `tests/backend/test_project_scope.py` |
| SE-01 | CSRF/Origin/Host + GET não escreve registry |

## Correção pós-merge (esta branch)

Os furos estão nas fronteiras entre intenção persistida, configuração
resolvida, transporte HTTP e estado dos consumidores. Não há modelo novo
de projetos.

| Achado | Prova oficial |
| --- | --- |
| F01 diagnóstico sem catálogo | `test_diagnostic_stays_scoped_when_catalog_is_missing` |
| F02 path reutilizado | `test_reused_registered_path_is_not_treated_as_this_worktree` |
| F03 unlink revertido | `test_explicit_unlink_does_not_rediscover_or_heal_config`, `test_unlink_does_not_reuse_bootstrap_catalog` |
| F04 payload de link-config | `tests/ui/project-manager-state.test.ts` |
| F05 filtros de Análise | `tests/ui/project-context.test.ts` |
| F06 orçamento da tabela | consumidor Resultados em `analysis-page.tsx` |
| F07 edição arquivada | `editFormFromProject` no mesmo teste de manager |
| F08 recadastro sem catálogo | `test_reregister_same_common_dir_without_catalog_updates_locators` |
| F09 `scope=legacy` + `projectId` | `test_legacy_scope_does_not_override_explicit_project` |
| F10 erro de Análise | `mapResultRows` em `results-model.test.ts` |

## Limitações factuais

- A suíte integral do motor original não foi relida linha a linha.
- F06 é orçamento do consumidor, não reforma do `DataTableFrame`.
- Este índice não substitui merge, release ou reinstalação desta branch.
