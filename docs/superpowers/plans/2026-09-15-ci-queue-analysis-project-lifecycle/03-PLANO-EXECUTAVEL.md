# CI Queue: Análise e lifecycle local de projetos

> **Para o executor:** executar este plano por tarefa, com o método de execução de planos já utilizado no projeto. A investigação e as decisões de produto estão neste pacote; não abrir outro ciclo de brainstorming nem pedir aprovação a cada tarefa.

**Objetivo:** entregar Análise percentual com multi-seleção e um contexto de projeto funcional em todas as views.
**Arquitetura:** um registry local pequeno e resolução imutável por requisição; uma fonte de contexto por aba; agregados únicos por projeto/período; composições shadcn compartilhadas e testes existentes.
**Stack:** Python da API existente, React/TypeScript/Vite, Tailwind 4, radix-nova, Lucide, Recharts, TanStack v9, unittest/Vitest/Playwright.
**Spec:** `01-DECISOES-E-REVIEW.md` e `02-CONTRATOS.md` deste pacote.

## Restrições globais

Preservar os fixes R1/R2/R3/V1 da revisão `497acb8`. Não tocar o motor para implementar um filtro do painel. Não escrever em tickets/logs/ledger legados. Nenhum Git de rede, recipe execution ou shell genérico via HTTP. Tema e conexão são globais; fatos de projeto não. Preservar os períodos atuais, a comparabilidade de Duração e o contrato de verde canônico.

O destino é `dev`. Implementação termina em PR draft, antes da autorização de merge. Nenhuma instalação ou promoção de main. A etapa 1B não inclui os cronômetros da etapa 2 nem o trabalho de performance das etapas seguintes.

## Mapa de arquivos e propriedade

### Novos proprietários de produção

| Arquivo proposto | Responsabilidade |
| --- | --- |
| `backend/ci_queue_api/projects.py` | Registry, validação de operações, bootstrap, probe restrito e persistência atômica. Pode separar probe em módulo próprio se ficar difícil manter funções curtas, sem novo serviço. |
| `backend/ci_queue_api/project_context.py` | Scope, ResolvedProject, capabilities e resolução imutável. |
| `ui/src/features/projects/project-context.tsx` | Provider/boundary, URL, contexto por aba e draft contextual. |
| `ui/src/features/projects/project-switcher.tsx` | Seletor global e navegação ao arquivo sem projeto. |
| `ui/src/features/projects/project-manager-drawer.tsx` | Cadastro, vínculo, rename, archive/restore e reparo. |
| `ui/src/features/shared/selection-panel.tsx` | Popover limitado, header/body/footer, foco e scroll; sem regra de projetos/presets. |
| `ui/src/features/shared/filter-select.tsx` | Select simples com orçamento de trigger/menu e nomes completos. |
| `ui/src/components/local-environment-menu.tsx` | Rodapé local, health e tema. |
| `ui/src/features/analysis/results-model.ts` | Percentuais, ranking, seleção pura e labels numéricos. |
| `ui/src/features/analysis/preset-multi-select.tsx` | Multi-seleção, busca e estabilidade durante interação. |
| `ui/src/features/analysis/analysis-state.ts` | Serialização/restauração independente de Resultados e Duração. |

### Modificar, sem reconstruir

API: `server.py`, `config.py`, `records.py`, `analysis.py`, `history.py`, `dashboard_state.py`, `validation_advisories.py`, `diagnostics.py`, `native_actions.py` e `worktrees.py` apenas onde a assinatura/guarda de contexto exigir.

UI: `App.tsx`, `components/site-header.tsx`, `components/app-sidebar.tsx`, `components/app-routes.tsx`, `lib/api.ts`, `lib/types.ts`, `features/status/status-page.tsx`, `status-state-drawer.tsx`, `green-commit-table.tsx`, `features/worktrees/worktrees-page.tsx`, `features/shared/job-drawer.tsx`, `features/analysis/analysis-page.tsx`.

Consultar chamadas reais ao alterar assinatura de API; esse mapa não autoriza esquecer consumidor que aparecer no grep. Não extrair os 38 KB de status-page inteiros “para organizar” sem relação com os deltas.

Testes novos: `tests/backend/test_projects.py`, `test_project_scope.py`, `test_analysis_results.py`; `tests/ui/results-model.test.ts`, `analysis-state.test.ts`, `project-context.test.ts`; `tests/browser/analysis-selection.spec.ts`, `project-lifecycle.spec.ts` e fixtures correspondentes. Ajustar os testes existentes atingidos, preservando suas asserções úteis.

## Dependências de execução

```text
B0 Referência/contratos
 ├─ B1 Registry e lifecycle
 │   └─ B2 Escopo HTTP/capacidades
 │        └─ B3 Contexto UI + isolamento de todas as views
 │             ├─ B4 Gestão/projeto/header/footer
 │             └─ B5 Agregados + Resultados percentuais
 │                  └─ B6 Multi-seleção/atualização/URL
 └─ B7 Limites de seletores + documentação (integrar depois de B4/B6)
      └─ B8 Prova integrada + PR draft
           └─ B9 Merge autorizado, separado da execução inicial
```

Não paralelizar B2/B3/B4 em três agentes alterando as mesmas assinaturas. Primeiro estabilizar o contrato, depois migrar consumidores. Funções puras de B5 podem ser implementadas em frente independente, mas isso não exige paralelismo.

## B0. Fixar candidata e incorporar o contrato novo

**Entrada:** repo/lane atual e pacote. **Saída:** base confirmada, roteiro versionado e mapa de substituições.

- [ ] Conferir o estado sem mutar branch principal:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -5 --oneline
gh pr view 5 --json state,isDraft,headRefName,headRefOid,baseRefName,mergedAt
```

- [ ] Aplicar a regra de branch de `00-EXECUTAR.md`. Comparar delta desde `497acb8`; não restaurar arquivos ignorando iterações locais.
- [ ] Salvar este plano em `docs/superpowers/plans/2026-09-15-ci-queue-analysis-project-lifecycle.md`, com links aos contratos de produto reconciliados. O pacote pode ficar como material desta campanha, sem duplicar permanentemente manuais.
- [ ] Registrar substituições autorizadas: eixo de contagens → percentual; preset single em Resultados → multi; footer de temas soltos → menu local; configuração única da API → registry/contexto; aviso legado no histórico do projeto → arquivo separado.
- [ ] Ler os proprietários da etapa 1 antes de JSX. Verificar `ui/components.json` e composição oficial, sem upgrade em massa.

**Prova:** baseline/base/HEAD e relação com PR #5 anotados. Não chamar esta tarefa de implementação.

## B1. Registry persistente e lifecycle local

**Arquivos:** projects.py, config.py no recorte de bootstrap/probe, testes test_projects.py.
**Interface produzida:** `read_registry(state_root)`, `bootstrap_registry(state_root, config_path)`, `probe_project(state_root, body)`, `mutate_registry(state_root, body)`. Os bodies e actions são os do contrato 02.

- [ ] Escrever testes de registro por config existente, pasta sem config, ID observado, restart idempotente, rename mantendo ID, archive/restore, relocalização, config ID divergente, duplicate common-dir, registry corrompido e conflito de revisão.
- [ ] Criar repositórios temporários reais com `git init` e uma linked worktree. O teste de identidade não pode apenas mockar um basename.

Exemplo de caso a incorporar ao unittest, usando helper temporário da suíte:

```python
class ProjectRegistryTests(unittest.TestCase):
    def test_registration_is_idempotent_and_keeps_external_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state-root"
            repo = root / "repo"
            repo.mkdir()
            subprocess.run(["git", "init", str(repo)], check=True,
                           capture_output=True)
            config = repo / "ci-queue.json"
            config.write_text(json.dumps({
                "schemaVersion": 1,
                "project": {"id": "alpha", "name": "Alpha"},
                "repository": {"path": str(repo)},
                "presets": {"smoke": {"argv": ["node", "--version"]}}
            }), encoding="utf-8")
            before = config.read_bytes()
            bootstrap_registry(state, config)
            first = read_registry(state)
            bootstrap_registry(state, config)
            second = read_registry(state)
            self.assertEqual(first, second)
            self.assertEqual(list(first["projects"]), ["alpha"])
            self.assertEqual(config.read_bytes(), before)
```

O exemplo usa funções novas já nomeadas acima; adaptar imports e helpers existentes, não mudar o comportamento testado.

- [ ] Rodar RED:

```bash
PYTHONPATH=backend python3 -m unittest discover -s tests/backend -p 'test_projects.py'
```

- [ ] Implementar schema/lock/atomicidade conforme 02. Não adicionar DEFAULT_ACTIVE_PROJECT compartilhado.
- [ ] O caso sem config grava configPath null. Acrescentar teste que verifica que nenhum `ci-queue.json` foi criado no repo e que o parser TypeScript não foi alterado para aceitar uma configuração executável vazia.
- [ ] O probe normaliza common-dir com timeout e ambiente Git saneado. Testar caminho com espaços, symlink equivalente, subpasta, pasta ausente, bare repo, timeout e configuração trocada depois do preview.
- [ ] Operações sobre ID existente preservam bytes de tickets/logs/legacy ledger e Meta. O teste deve comparar bytes/hash antes/depois das operações, não apenas contagem.
- [ ] Rodar GREEN e commit coerente.

**Parada da tarefa:** registry funciona isoladamente e não executa scripts nem altera repos. Sem UI ainda; não atualizar a instalação.

## B2. Resolver contexto por requisição e migrar o backend inteiro

**Arquivos:** project_context.py, server.py e readers listados no mapa.
**Consome:** registry B1. **Produz:** rotas de lifecycle e todos os endpoints de domínio com Scope validado/capabilities.

- [ ] Testar a matriz do contrato antes da migração. Dois projetos reais e um registro sem ID; uma atribuição legítima no ledger; nomes de preset iguais nos dois projetos.
- [ ] Testar simultaneamente leituras A e B no mesmo servidor ThreadingHTTPServer. Não basta alternar um config global e chamar funções sequencialmente.
- [ ] Fazer um ticket de A ser solicitado por `projectId=B` nas quatro rotas job/log/log-export/diagnostic e exigir ausência de bytes do ticket. Arquivo sem projeto precisa de seu contexto explícito.
- [ ] Migrar chamadas do servidor para resolver uma vez por request. Aplicar echo de contexto nas respostas. O estado da requisição não pode consultar o dropdown do browser.
- [ ] Separar leitura de fatos por ID da capacidade de resolver receitas. Results/history continuam mesmo sem pasta/config. Duração/verde canônico apresentam erro de catálogo quando necessário.
- [ ] Em dashboard-state e validation_advisories, separar documento por ID de decoração dependente de config. Não apagar Meta nem declarar pendência resolvida sem receita/ancestry verificáveis.
- [ ] Preservar medição serial/coalescida das Worktrees. Fazer seu alvo receber repositoryPath/baseRef do contexto de pasta válido; para pasta sem catálogo, usar HEAD como referência local explícita, sem fingir origin/main existente.
- [ ] Adicionar ao status `otherProjectOccupancy`, derivado dos registros já lidos, para diferenciar ocupação de outro projeto de ocupação do próprio. Não fazer novo scan só para esse booleano.
- [ ] Tornar --config opcional para shell vazio. Preservar o modo legado de bootstrap documentado. Health/build independentes de registry válido.
- [ ] Implementar as ações de projeto em POST com allowlist de campos por action. Preservar/reutilizar guards de sessão e ações; negar CORS amplo nos endpoints novos que expõem caminhos.
- [ ] Testar GET sem escrita, CSRF ausente, Origin malicioso, Host inválido, conflito409 e falha da pasta A sem quebrar B.

```bash
PYTHONPATH=backend python3 -m unittest discover -s tests/backend -p 'test_project*.py'
npm run test:backend
```

**Aceite da tarefa:** nenhum endpoint de projeto continua acidentalmente amarrado a `context.config` global. Revisar via busca:

```bash
rg -n 'context\.config|config\.project_id|lookup_job\(' backend/ci_queue_api
```

Esse grep é inventário manual; não criar gate textual que proíba usos legítimos em um leitor de config.

## B3. Contexto por aba, transporte e estado das views

**Arquivos:** project-context.tsx, api.ts, types.ts, App.tsx, app-routes.tsx e consumidores de API.
**Interface:** `ReadScope`, `useProjectContext()`, `requestScopeChange(scope)`, `ProjectScopeBoundary`; todos os getters/mutations de projeto recebem Scope.

- [ ] Testar URL, restore, dois projetos, IDs literais all/legacy, projeto desconhecido e ausência de contexto. Testar resposta atrasada descartada.
- [ ] Implementar transporte explícito. Exemplo de forma exigida:

```ts
export function getJob(scope: ReadScope, jobId: string) {
  return requestJson<JobRecord>("/api/job", { ...scopeQuery(scope), jobId })
}

export function getResults(scope: Extract<ReadScope, { kind: "project" }>,
                           bounds: { from?: string; to?: string }) {
  return requestJson<ResultsResponse>("/api/analysis", {
    ...scopeQuery(scope), ...bounds, metric: "results",
  })
}
```

A requestJson continua interna. Nenhuma função de domínio faz fallback para um projectId global quando falta argumento. Recursos globais têm funções separadas sem Scope.

- [ ] Acrescentar identity check antes de setData/cache. Chaves novas não podem usar o dado anterior durante um frame sob header novo. Usar keyed boundary e/ou resultado explicitamente associado à chave.
- [ ] Migrar Current/Fila/Histórico/Verdes/Meta/Pendências/JobDrawer/log/diagnóstico/Worktrees/Analysis juntos. Conferir nomes e assinaturas com busca, sem enumeração fixa de só dois drawers.
- [ ] Tirar a requisição dashboard-state usada por Worktrees somente para obter projectId. Manter a sessão de CSRF global e o snapshot único de Worktrees por escopo.
- [ ] Preservar filtros/busca/seleção por projeto. Reiniciar paginação no scope novo; não anexar página atrasada de A na lista B.
- [ ] Capturar scope/revisão no save de Meta e reveal. Testar save A lento seguido de navegação B: não aplicar toast de sucesso/estado de A como atualização de B; o documento A continua sendo o único alvo.
- [ ] Guardar drafts sujos em memória por projectId quando o contexto sai. Retorno não faz autosave nem troca expectedRevision. Não criar gerenciador persistente de workflows para isso.
- [ ] Eventos popstate/hashchange atualizam coerentemente URL/contexto/view. Mudança de localStorage em outra aba não altera a aba atual.

```bash
npx vitest run tests/ui/project-context.test.ts
npm --prefix ui run lint
npm --prefix ui run build
```

**Aceite:** duas abas A/B operam isoladas. Reload sem troca mantém contexto correto. Catálogo indisponível não remove histórico nem vira Bridge offline.

## B4. Projeto global, gerenciamento e ambiente local

**Arquivos:** project-switcher.tsx, project-manager-drawer.tsx, selection-panel.tsx, local-environment-menu.tsx, site-header.tsx, app-sidebar.tsx.
**Consome:** B1–B3. **Produz:** lifecycle alcançável e shell coerente.

- [ ] Compor SelectionPanel com Popover/ScrollArea/InputGroup/Button existentes; manter funções de domínio fora dele. Recuperar a composição oficial, sem instalar uma biblioteca paralela.
- [ ] ProjectSwitcher no header à direita, largura dinâmica limitada, label com ellipsis e nome completo acessível. Não mexer no lugar do SidebarTrigger nem colocar projeto no footer de “usuário”.
- [ ] Menu: busca por nome/ID/caminho, seleção exclusiva, Histórico sem projeto separado, Gerenciar projetos. Entradas arquivadas não ocupam a lista ativa; ficam na gestão.
- [ ] Gestão usa DetailDrawer compartilhado, com modos lista/cadastro/edição no mesmo drawer. Sem nova página de settings vazia. Forms de caminhos usam texto colável e ação Conferir pasta; não fingir que input file do navegador fornece caminho absoluto do host.
- [ ] Cadastro por pasta sem config mostra as capacidades reais; importar config preserva ID; registro observado é associação explícita. Conferir e Salvar são passos do mesmo formulário, não novo wizard de onboarding.
- [ ] Rename/archive/restore/relocate/link/unlink têm resultado real persistido e erro local. Falha e409 preservam conteúdo digitado. Cancelar não escreve.
- [ ] Arquivar informa que não cancela jobs/CLI, exige confirmação no AlertDialog instalado e retira o projeto da lista ativa. Se era o selecionado, manter contexto de arquivo/histórico identificado como arquivado, com ação Restaurar, sem saltar para outro projeto silenciosamente.
- [ ] Retirar “Legado sem projeto (N)” do Card de Histórico comum. O arquivo separado reutiliza RunTable e JobDrawer com scope unassigned, somente terminais, sem Meta/Verdes.
- [ ] Footer usa SidebarMenuButton e DropdownMenu. Estado online/indisponível/verificando vem de `/health`, uma assinatura global a cada10s; três escolhas de tema em RadioGroup. Nenhum GET status para alimentar o footer.
- [ ] Nenhum menu com Login, GitHub, usuário ou Configurações desabilitadas. O único gerenciamento extra entregue é de projetos e tem função completa.

```bash
npx playwright test tests/browser/project-lifecycle.spec.ts
npm --prefix ui run lint
npm --prefix ui run build
```

**Prova:** zero projetos; adicionar A/B; duas worktrees sem duplicação; sem config; config perdida; rename; relocalização; arquivar/restaurar; histórico sem projeto e menu de tema. Teclado e foco de DetailDrawer permanecem.

## B5. Agregados de Resultados e barras percentuais

**Arquivos:** analysis.py, api/types, results-model.ts, analysis-page.tsx; testes test_analysis_results.py e results-model.test.ts.
**Interface produzida:** ResultsResponse do contrato; funções `rankResults`, `projectPercentages`, `resolveSelection`.

- [ ] RED de percentuais incluindo cancelado/interrompido, totais muito diferentes, zero, terceiros e valores inválidos. Usar a fixture do pacote como entrada sintética.
- [ ] Implementar as funções puras. Núcleo esperado:

```ts
const states = ["passed", "failed", "cancelled", "interrupted"] as const
export function projectPercentages(row: ResultCounts) {
  if (states.some(key => !Number.isSafeInteger(row[key]) || row[key] < 0)) {
    throw new Error("Contagem de resultado inválida")
  }
  const total = states.reduce((sum, key) => sum + row[key], 0)
  if (total !== row.total || !Number.isSafeInteger(total)) {
    throw new Error("Total de resultado inconsistente")
  }
  return {
    ...row,
    percentages: total === 0 ? null : Object.fromEntries(
      states.map(key => [key, 100 * row[key] / total])
    ),
  }
}
export function rankResults(rows: ResultCounts[]) {
  return rows.filter(row => row.total > 0).toSorted((a, b) =>
    b.total - a.total || (a.preset < b.preset ? -1 : a.preset > b.preset ? 1 : 0)
  )
}
```

Ajustar retorno para tipagem sem casts frouxos na implementação. Não arredondar antes de desenhar. Valores muito pequenos positivos podem aparecer como `<0,1%` no texto; zero é `0%`.

- [ ] Backend metric=results agrega uma vez, não valida os nomes históricos contra presets atuais e não calcula pontos de duração. Acrescentar teste com mais de200 terminais e presets de A/B iguais.
- [ ] Manter a rota antiga sem metric compatível quando necessário; testar que duração/canonical não foram relaxados.
- [ ] ChartContainer/Tooltip/Legend oficiais permanecem. Bar dataKeys passam à projeção percentual; eixo0–100 e Tooltip preserva counts/total do payload original. Tabela exata e mesma ordem do gráfico.
- [ ] Testar tooltip e acesso equivalente por teclado/toque, nome longo, todas as séries e amostra1. Não desenhar barras inventadas para zero.

```bash
PYTHONPATH=backend python3 -m unittest discover -s tests/backend -p 'test_analysis_results.py'
npx vitest run tests/ui/results-model.test.ts
```

**Aceite:** preset com1000 eventos não determina a altura dos demais; cada totalpositivo soma100; filtrar outro preset não muda as porcentagens existentes.

## B6. Multi-seleção, ranking, atualização e URL

**Arquivos:** preset-multi-select.tsx, analysis-state.ts, analysis-page.tsx, fixtures/tests novos.
**Consome:** agregados B5 e SelectionPanel B4. **Produz:** modo top10/all/custom completo.

- [ ] RED de: top10 real, empate, menos de10, custom vazio, preset histórico removido, modoall com novo preset, URL com preset literalall, troca de período e retenção da seleção de Resultados ao entrar em Duração.
- [ ] Implementar resolveSelection em funções puras: top10 usa rankResults.slice(0,10), all usa todos os positivos, custom preserva os nomes deduplicados escolhidos e informa os que não têm amostra. Não mutar o array da resposta.
- [ ] MultiSelect usa Checkbox real e FieldLabel/semântica adequada. Sem botão e Checkbox interativos aninhados nem dois tab stops conflitantes na mesma opção. Busca local, contagem e atalhos conforme01.
- [ ] Menu open congela snapshot e ordem; novas respostas da mesma chave ficam pendingSnapshot até fechar. Troca de chave descarta pendingSnapshot antigo.
- [ ] Um request por projeto/período e revalidação30s ativa; selecionar caixas somente filtra em memória. Garantir polling semsobreposição e parar ao sair da view/document.hidden.
- [ ] Duração usa seu próprio FilterSelect e lista de receitas declaradas; não reaproveitar custom[] como uma mistura de durações.
- [ ] Persistir/restaurar estado por projeto e URL. Usar URLSearchParams.append para presets repetidos, validar entradas e preservar parâmetros de outras views.
- [ ] Teste de browser intercepta a rota de Resultados e conta chamadas; dez seleções durante intervalo sempolling precisam adicionar **zero** chamadas, não apenas “poucas”.
- [ ] Testar snapshot novo com outro ranking enquanto menu aberto: o item sob o ponteiro não muda de posição; fechar aplica dados novos sem trocar IDs custom.

```bash
npx vitest run tests/ui/results-model.test.ts tests/ui/analysis-state.test.ts
npx playwright test tests/browser/analysis-selection.spec.ts
```

**Aceite:** todas as transições da tabela de04 são demonstradas; não apenas checkbox marcando.

## B7. Consistência dos controles e documentação permanente

**Arquivos:** filter-select.tsx, consumidores de selects, docs listadas em02, .context.

- [ ] Migrar controles simples de filtros de Análise e Histórico para FilterSelect, respeitando opções e valores atuais. Conferir Select de receitas em Meta: adotar limite de menu/texto quando pertinente sem alterar o formulário ou escolher receita automaticamente.
- [ ] SelectionPanel cobre os dois menus pesquisáveis; não copiar seus máximos de largura/altura para cada feature.
- [ ] Fixar orçamento da tabela de Resultados: nome flexível legível e quatro contagens/total dentro das respectivas células. Preservar R1–R3 e foco/scroll. Não comprimir o título até zero para manter seis colunas num celular.
- [ ] Manter eslint e tests/ui/ui-policy. Acrescentar restrição de import apenas se o transporte interno novo permitir bypass das APIs scoped. Não criar gate que exija sizes em cada SVG.
- [ ] Reconciliar DESIGN/AGENTS/skill/context/CONTRACTS/PRODUCT-CONTRACT/ledger e exemplos de APIs/instalação-fonte. Atualizar fonte canônica de roadmap; se não existir, criar `docs/ROADMAP.md`, ligado no README. Usar05, sem duplicar uma versão local posterior que já exista.
- [ ] Incluir no mapa os donos de Scope, registro, filtros e menu local; a instrução “pensar em todos os consumidores antes de alterar” aponta a arquivos reais, não fica como slogan.
- [ ] Atualizar evidências e rastreabilidade do pacote com os IDs novos de04, sem reabrir os72 itens antigos nem marcá-los todos aprovados novamente.

```bash
npm --prefix ui run lint
npm --prefix ui run build
npm run test:ui
```

**Aceite:** textos/documentos não mandam simultaneamente usar single e multi, configúnica e multiprojeto, footer antigo e novo. Recursos futuros só no roadmap.

## B8. Prova integrada, revisão interna e PR draft

Não substituir testes HTTP reais por route.fulfill de todos os endpoints. Mocks provam UI; integração prova que a mesma seleção chega aos readers corretos.

- [ ] Rodar backend/funcionais em raiz temporária com dois repos Git e configfixture. Os testes não podem herdar CI_QUEUE_STATE_DIR apontando para a fila real. Reutilizar saneamento de ambiente já aprovado nos testes do produto.
- [ ] Criar no mínimo um cenário de browser servido pela API candidata real: cadastrar A/B, ler estatísticas separadas, trocar projeto, abrir ticket e receber404 ao cruzar projeto; escrever Meta em A sem modificar B; arquivar/restaurar.
- [ ] A fixture de API real pode ser processo subordinado ao teste, fechado em teardown. Não criar daemon permanente, novo agendador ou serviço instalado.
- [ ] Rodar suitecompleta na candidata:

```bash
npm run check
```

Não prescrever contagem fixa de testes; informar a contagem verdadeira e falhas/skips. Não repetir até verde sem corrigir causa.

- [ ] Compilar e servir a UI da lane com API da **mesma candidata**, em porta livre escolhida e informada pelo processo. A prévia antiga5192 contra a API instalada8765 não prova endpointsnovos. Usar configuração de proxy explícita e mesmaorigem. Não relaxar guards para expor a prévia.
- [ ] Estado da prévia é temporário: fixtures e, se necessário, cópias de registros autorizadas para inspeção. Não hardlinkar arquivos que possam ser escritos. Não iniciar worker na state root real. Projeto real pode ser inspecionado em leitura, sem modificar config, hooks, branches ou logs.
- [ ] Abrir e inspecionar imagens da matriz04. Captura nãoinspecionada não é evidência de qualidade. Comparar famílias ladoalado, menusabertos e longnames, não apenas screenshots das páginas felizes.
- [ ] Revisão interna de escopo/código/testes. Consertar problemas encontrados no próprio lote antes do retorno; não terceirizar cada contraste de padding para Marco.
- [ ] Gerar índice em `docs/ui/evidence/etapa-1b/README.md`, com SHA de código capturado, UI/API URLs/revisões, cenários reais versus mock e limites. Não apresentar imagens497 como prova do lifecycle novo.
- [ ] Atualizar título/corpo do PR para refletir etapa1B, contagematual e HEAD. Confirmar que o Complete check remoto executou para conteúdo equivalente da candidata.
- [ ] Parar em draft para review de Marco. Sem release, main, instalação ou etapa2.

## B9. Merge em dev, somente após autorização

Esta tarefa é parte do caminho de fechamento, **não** é autorizada pelo envio do pacote para execução.

- [ ] Confirmar aceitevisual/funcional de Marco e autorização explícita do HEAD final.
- [ ] Confirmar base dev e ausência de delta novo não revisado. Se base mudou, verificar integração e os checks aplicáveis; não reutilizar prova de outro conteúdo.
- [ ] Tornar ready e mergear pelo fluxo existente. Não ativar auto-merge como substituto da autorização.
- [ ] Registrar SHA do merge e ancestry da candidata. Sincronizar checkout apropriado sem trocar a branch de outra worktree.
- [ ] Encerrar etapa1/1B documentalmente. As etapas2–5 continuam independentes; nenhuma release/atualizaçãoinstalada é inferida do merge emdev.

## Retorno final da execução inicial

```text
Pacote: Etapa1B
PR/base/draft:
HEAD e base de partida:
B1 registry/lifecycle: resultado + testes
B2/B3 isolamento de escopo: resultado + cenário A/B
B4 shell/gestão/arquivo: resultado + evidências
B5/B6 percentuais/seleção: resultado + prova de requisições
B7 docs/roadmap: caminhos canônicos reconciliados
Check local: comando/resultados/HEAD
Check remoto: run/job/resultado e revisão testada
Prévia: UI candidata + API candidata + state temporário
Índicevisual/SHAcapturado:
Limitações factuais:
Aguardando Marco; sem merge/main/release/instalação/etapa2.
```
