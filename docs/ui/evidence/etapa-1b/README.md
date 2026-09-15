# Etapa 1B — evidências da candidata

Implementação e revisão interna concluídas. Review humano de Marco aguarda;
merge, release, instalação e etapa 2 não estão autorizados.

## Procedência

- Pacote: Etapa 1B (contexto de projeto, Análise proporcional, multi-seleção
  de Resultados).
- Branch: `codex/ui-consistency-phase1`, destino `dev`.
- HEAD do código desta evidência: o commit que inclui este arquivo.
- Base de partida da lane: `497acb862` (PR #5 ainda draft).
- UI candidata: Vite/`ui/dist` desta worktree.
- API candidata: `python3 -m ci_queue_api.server` com `--state` temporário,
  porta `18876`. Não é o daemon instalado em `8765`.

## O que é real versus mock

| Cenário | Fonte |
| --- | --- |
| EV-01 / SC-01–02 (A/B) | UI Vite + API Python candidata, state temporário |
| AN-01–07, PR-01, UI-01, UI-02 | Playwright com fixtures HTTP |
| SC-03 Meta + revisão | `tests/backend/test_project_scope.py` |
| B1 registry / B2 escopo | `tests/backend/test_projects.py`, `test_project_scope.py` |
| Ranking e URL | `tests/ui/results-model.test.ts`, `analysis-state.test.ts` |

## Aceite coberto nesta lane

| ID | Prova |
| --- | --- |
| AN-01 | `analysis-selection` barras/contagens + `results-model` |
| AN-02 | `tests/ui/results-model.test.ts` e fixture de zero/terços |
| AN-03 | ranking determinístico; `clinical-readonly` é o 10º |
| AN-04 | checkbox sem GET extra; menu aberto |
| AN-05 | ordem congelada no menu; custom preserva IDs após ranking novo |
| AN-06 | custom vazio, Todos, histórico removido |
| AN-07 | Resultados e Duração independentes |
| PR-01 | shell sem projetos + cadastro sobrevive a reread do registry |
| PR-02–04 | `tests/backend/test_projects.py` |
| SC-01 | leituras paralelas A/B + EV-01 |
| SC-02 | job/log/export/diagnóstico de A ocultos em B |
| SC-03 | Meta salva em A não altera B; revisão 0 em A depois do save dá 409 |
| SC-04 | arquivo unassigned explícito; IDs `all`/`legacy` literais |
| UI-01 | 390/640/768/1440 + nome de 160 caracteres; sem scroll horizontal da página |
| UI-02 | busca/atalhos do menu; tema/Bridge no rodapé |
| UI-03 | suíte `ui-consistency` (R1–R3/V1) |
| SE-01 | CSRF/Origin/Host + GET não escreve registry |
| EV-01 | `analysis-integrated.spec.ts` contra API candidata |

## Limitações factuais

- A instalação macOS permanece na release anterior; esta lane não a atualiza.
- A prévia temporária não usa a fila real nem inicia worker.
- Check remoto do GitHub precisa da conta `nmarcofernandess`; a conta ativa
  `dietflowoficial` não resolve o repositório privado.
- Cronômetros, smoke e reforma de performance continuam fora do corte.

Aguardando Marco. Sem merge, main, release, instalação ou etapa 2.
