# Etapa 1B: decisões de produto e review da base

**Estado:** especificação para execução, não implementação nem homologação.
**Base auditada:** `497acb862348e8f926f5af3fe70c3b9e18aa63cd`, CI Queue independente.
**Data da investigação:** 15/09/2026.
**Objetivo:** fechar Análise e contexto de projetos como produto local, sem expandir o motor.

## 1. Por que este pacote existe

O pedido novo não revoga a correção estrutural dos drawers. Ele identifica problemas que uma biblioteca visual não resolve sozinha: qual população um gráfico representa, como filtros se acumulam, a quem pertencem os registros e o que significa selecionar um projeto.

A entrega anterior centralizou identidade, drawers, fichas, indicadores e gutters. Esses proprietários permanecem. Agora se acrescentam proprietários de **contexto e seleção**, com contratos que impeçam cada página de interpretar o projeto de forma diferente.

Este é um complemento da etapa 1, chamado 1B para não confundir com a etapa 2 de cronômetros. Não exige aguardar as cinco etapas originais para integrar em `dev`.

## 2. Constatações no código, não hipóteses

Os caminhos abaixo foram lidos na revisão indicada. Os links de fonte estão no arquivo 05.

| ID | Constatação | Consequência |
| --- | --- | --- |
| A-01 | `analysis-page.tsx` envia as contagens brutas ao BarChart empilhado; Y não tem domínio percentual. | Preset muito frequente comprime visualmente os demais. Mudar somente o Tooltip não resolve. |
| A-02 | `analysis.py` calcula `total` com quatro estados, mas `passRate` usa apenas passou + falhou. | Reutilizar passRate para os segmentos criaria uma porcentagem com denominador errado. |
| A-03 | `history.py/build_preset_history` ordena por data do último verde canônico, com desempate alfabético. | Os primeiros itens do menu não são os dez mais executados. `runCount` existe, mas não determina essa ordem. |
| A-04 | Análise usa um único estado `preset` e um único filtro remoto. | Seleção múltipla não é apenas mudar o ícone de check: requer um modelo de seleção e de atualização. |
| A-05 | O catálogo de histórico contém presets históricos não declarados; `read_analysis` rejeita um filtro de preset que não está na configuração atual. | Um item oferecido no menu pode falhar ao ser selecionado. Resultados precisa aceitar o universo histórico; Duração mantém a regra de receita comparável. |
| P-01 | `server.py` carrega um único ProjectConfig no início e todos os endpoints usam esse objeto. | Há separação de registros por ID, mas não existe um produto multi-projeto selecionável no browser. |
| P-02 | `enqueue.ts` grava projectId/projectName/argv/cwd no ticket; `worker.ts` drena a raiz global sem escolher configuração de projeto. | O motor já tem a fronteira necessária. Não criar worker, fila ou daemon por projeto. |
| P-03 | `state/dashboard.json` já guarda Meta por projectId, com lock, revisão e escrita atômica. | Reutilizar o padrão de persistência; não introduzir banco ou duplicar Meta no registry. |
| P-04 | `lookup_job` permite terminal sem projectId mesmo numa consulta de projeto. | O novo contexto explícito precisa separar acesso de projeto e arquivo não atribuído, inclusive log e diagnóstico. |
| P-05 | `useApiQuery` e vários consumidores usam chaves como worktrees, analysis-presets e sidebar-bridge sem projeto. | Apenas acrescentar um dropdown causaria mistura de caches, estados e respostas atrasadas. |
| P-06 | Worktrees descobre o projeto por uma chamada extra a dashboard-state; a seleção usa chave por projeto, mas a inicialização de estado ocorre no mount. | A troca deve remontar/reidratar a fronteira correta e eliminar a descoberta indireta do contexto. |
| P-07 | BridgeIndicator consulta status a cada 10s. | Estado da conexão está indevidamente acoplado à leitura de dados do projeto. Usar health global leve. |
| U-01 | SelectContent usa item-aligned por padrão e limita altura ao espaço disponível inteiro; SelectTrigger é w-fit. | O menu pode ficar enorme e textos longos podem determinar uma largura inadequada. É preciso um orçamento por composição. |
| C-01 | O leitor Python aceita presets vazio; `src/contracts/config.ts` rejeita presets vazio. | Não criar um arquivo de configuração vazio e afirmar que a CLI passa a executá-lo. Cadastro sem receitas deve ser representado sem config vinculada. |

### O que significa “Legado sem projeto (734)”

O registro de convergência fornecido relata 2.402 tickets sem projectId: 1.668 receberam atribuição com evidência de commit; **734 continuaram sem atribuição comprovada**. O vínculo foi guardado em `state/legacy-projects.json`, sem reescrever os tickets originais.

Isso explica a contagem do print; não é uma nova medição do Mac nem prova de que todos esses registros pertencem ao projeto selecionado. O dado deve continuar disponível, mas como **Histórico sem projeto**, não como uma advertência permanente dentro de qualquer projeto.

## 3. Decisões fechadas: Análise

### 3.1 Resultados em porcentagem por preset

Cada barra com amostra positiva soma 100%. Para o preset p:

```text
N(p) = passou(p) + falhou(p) + cancelado(p) + interrompido(p)
percentual(p, estado) = 100 × quantidade(p, estado) / N(p)
```

O denominador não é o total de todos os presets; selecionar outro preset não muda a porcentagem daquele que já estava visível. Não excluir cancelados/interrompidos para melhorar a taxa.

- Eixo Y: 0–100%, ticks 0/25/50/75/100.
- Quatro séries e suas cores semânticas atuais.
- Arredondamento somente na apresentação; no cálculo/render usar precisão original.
- N=0: sem barra, não 0% de falha nem 100% de sucesso. Vazio nomeado.
- Não usar altura mínima artificial para tornar segmentos zero visíveis.
- A tabela conserva as quatro contagens e o total. Ela é a alternativa exata e acessível ao gráfico.
- Tooltip: título completo do preset, `N execuções no período` e, para cada estado, `quantidade · percentual`. Exemplo: `Passou: 950 · 95%`, total 1.000.
- Um preset com 1/1 e outro com 950/1.000 podem ter barras parecidas, mas a amostra aparece no Tooltip e na tabela. Não vender isso como confiabilidade estatística.
- Em toque, a mesma informação deve poder ser aberta tocando/focando a barra, ou pela célula de resumo focável da tabela. Não criar outra série nem depender exclusivamente de hover.
- Título: **Resultados por preset**. Descrição curta: **Distribuição percentual; quantidades no detalhe e na tabela.**

A altura de Chart continua limitada. Dez barras devem caber na largura usual; mais barras conservam scroll horizontal local e nomes legíveis. Não esticar a página nem voltar a aspect-video para um gráfico largo.

### 3.2 Multi-seleção em Resultados

O seletor é um Popover com busca local, lista de Checkboxes e atalhos. Não um Select que fecha após cada escolha. Não exige novo pacote de multi-select.

```text
[Resultados | Duração] [Todo o período v] [10 mais executados v]

                         Buscar preset...
                         [x] smoketest             1.000
                         [x] static                  700
                         [ ] full                    230
                         ... lista com rolagem ...
                         [10 mais executados] [Todos] [Limpar]
```

O número à direita é quantidade terminal válida no período, não quantidade de verdes. A busca filtra opções, não a população do gráfico nem a seleção já feita.

Estados distintos:

| Modo | Significado |
| --- | --- |
| top10 | Escolha automática dos até dez maiores totais positivos no projeto/período. |
| all | Todos os presets com dados naquele projeto/período, inclusive novos que apareçam em atualização posterior. |
| custom | Conjunto explícito de nomes. Vazio significa nenhum, nunca todos. |

Regras:

- Abrir pela primeira vez sem estado restaurado usa top10.
- Ordenação: total decrescente; empate pelo nome em comparação determinística de string. Não por verde recente.
- Marcar/desmarcar qualquer opção transforma o conjunto efetivamente selecionado em custom.
- Não promover custom para all apenas porque hoje contém todas as opções. All também significa incluir opções futuras.
- Atalho Todos aplica-se ao universo completo do projeto/período, não somente aos resultados da busca textual.
- Limpar cria custom vazio e mostra **Selecione ao menos um preset**.
- Top10 com quatro presets mostra os quatro. Com zero, mostra ausência de execuções. Dez não é um teto.
- Preset histórico removido do catálogo continua em Resultados. Não é autorizado a executar por estar no gráfico.
- Preset custom sem dados no período permanece selecionado e é identificado como **Sem execuções neste período**. Não substituí-lo silenciosamente pelo próximo do ranking.

### 3.3 Atualização sem menu que foge do mouse

Uma leitura agregada de Resultados por projeto/período abastece gráfico, tabela, opções e ranking. Selecionar dez caixas não produz dez GETs e não relê a pasta do histórico dez vezes.

- Seleção visual e gráfico reagem imediatamente aos agregados já disponíveis.
- O menu permanece aberto; Escape/clique fora fecham sem desfazer escolhas. Não há botão Aplicar.
- Ao abrir, congelar ordem/opções/contagens apresentadas no menu e o snapshot usado por aquela seleção. Resposta de polling recebida durante a edição fica pendente e é aplicada ao fechar. Só manter a mais recente para a mesma chave.
- Não bloquear a rede nem criar fila persistente de eventos. Trata-se de um estado transitório do componente.
- Ao fechar, top10 recalcula; custom preserva nomes; all incorpora o universo atual.
- Mudou projeto/período: fechar o menu, descartar resposta pendente da chave anterior e consultar a nova chave. Nunca mostrar números do projeto A sob o nome B.
- Polling de Análise: uma chamada por 30s enquanto a view está ativa e o documento visível, sem sobreposição. Voltar ao foco permite uma revalidação coalescida. Não acrescentar polling por checkbox.
- Erro de refresh da mesma chave preserva último dado válido com erro local. Troca de chave sem cache válido mostra loading, não o dado anterior com label novo.

### 3.4 Duração não muda de população

Duração continua com um preset declarado, verdes canônicos da receita atual, início e duração válidos, mediana/faixa/amostra e scatter sem linha. Tem seleção separada da lista de Resultados. Alternar a tab não perde o conjunto marcado em Resultados.

Não calcular uma mediana que mistura smoketest, full e static. Catálogo ausente/ilegível tem estado próprio e ação para vincular/corrigir configuração; não se apresenta como “nenhum ponto”. Preset histórico não declarado pode participar dos Resultados, não de uma comparação canônica de duração.

## 4. Decisões fechadas: projeto e lifecycle

### 4.1 Seletor global no header

```text
┌──────────────────────────────────────────────────────────────────┐
│ [recolher]  Análise                         [pasta DietFlow     v] │
├──────────────────────────────────────────────────────────────────┤
│ [Resultados | Duração] [Período v] [Presets selecionados v]        │
│                                                                  │
│ Gráfico e tabela do projeto selecionado                           │
└──────────────────────────────────────────────────────────────────┘

Sidebar
  CI Queue
  Status
  Worktrees
  Análise
  ...
  [computador  Ambiente local / Bridge online                  v]
    menu: estado da Bridge; Tema Claro / Escuro / Sistema
```

Projeto não fica dentro do Card do Histórico, porque afeta Current, Fila, Histórico, Verdes, Worktrees, Análise, Meta, Pendências e detalhes. Máquina e Bridge continuam fatos globais do host.

Não criar agora “Todos os projetos” para agregar métricas homônimas. A fila é global; as superfícies são recortadas por projeto. Havendo ocupação de outro projeto, preservar aviso compacto de ocupação global, sem fingir que a máquina está livre.

### 4.2 Lifecycle mínimo que entra agora

**Cadastrar → selecionar → renomear no painel → corrigir vínculo → arquivar → restaurar.** Não apagar repositórios, tickets, logs, Meta nem pendências.

Cadastro em um único Drawer de gerenciamento:

- Pode receber uma pasta Git. Git é inspecionado apenas naquela pasta, com comandos de leitura e timeout.
- Se houver `ci-queue.json` na raiz observada, oferecer seu vínculo no mesmo formulário. Também aceitar caminho explícito de config fora do repo.
- Com config válida, o project.id existente é preservado.
- Sem config, criar somente um ID estável e cadastro de pasta. Não fabricar um arquivo de receitas nem exigir usuário/OAuth. Worktrees, histórico e Resultados podem operar; capacidades canônicas exigem vincular receitas.
- Pode vincular uma identidade já existente nos tickets, escolhida explicitamente na lista **Com registros, sem cadastro**. Esse vínculo não atribui tickets sem ID.
- Cadastro sem qualquer execução é um estado válido e deve sobreviver a restart.
- Uma segunda worktree do mesmo git-common-dir aponta ao projeto já cadastrado; não cria outra entrada.
- Outro clone com o mesmo project.id, mas diretório Git comum diferente, não é automaticamente fundido. Mostrar conflito e oferecer correção explícita do vínculo existente. Múltiplos clones por projeto ficam fora deste corte.

Renomear muda **o nome de exibição local**, não o project.id, o nome do repo, o remoto ou o conteúdo dos tickets/config externa.

Relocalizar/corrigir vínculo pede a nova pasta e, quando necessário, a nova config. Validar novamente o ID e o repositório. Se config.repository.path ainda aponta a outro lugar, não sobrescrever a config nem ignorá-la silenciosamente: explicar a inconsistência; permitir corrigir o arquivo externamente ou desvincular receitas e manter a pasta como contexto de inspeção.

Arquivar significa retirar da lista ativa do painel. Não cancela nem impede jobs enviados pela CLI. O aviso de confirmação explica isso. Histórico continua preservado e consultável pelo gerenciamento de arquivados. Restaurar reativa o cadastro, sem criar outro ID. Não há exclusão definitiva neste pacote.

### 4.3 Históricos sem cadastro e sem projeto são coisas diferentes

- **Com projectId, sem cadastro:** há identidade histórica, mas falta vínculo local de pasta/config. Pode ser cadastrado explicitamente mantendo o ID.
- **Sem projectId após aplicar o ledger:** não há atribuição comprovada. Vai para Histórico sem projeto; não vira projeto de ID “legacy”.
- **Projeto arquivado:** há identidade e cadastro, apenas fora da lista ativa. Não é legado.
- **Pasta/config ausente:** há identidade e cadastro recuperável. Histórico não desaparece nem é movido para o bucket sem projeto.

O seletor oferece **Histórico sem projeto** separado das entradas de projeto. Sem número caro no header: a contagem real aparece quando o arquivo é aberto. Essa escolha abre Status em modo de arquivo, somente histórico terminal, com busca/período/resultado e detalhes reais.

Nesse contexto não há Últimos verdes, Meta, Pendências, Worktrees ou gráfico misturando origens. Navegar a uma view que exige projeto mostra um Empty específico com ação de escolher projeto; não usa DietFlow como fallback.

## 5. Backend autorizado e backend proibido

### Entra

Registry local pequeno, bootstrap compatível com --config, resolução imutável por requisição, escopo explícito de detalhe/log, capabilities de projeto, endpoints protegidos de cadastro e um modo leve de agregados de Resultados. São requisitos para fazer o pacote funcionar, não adiantamento das outras etapas.

### Não entra

Worker por projeto; trocar algoritmo da fila; priorização; parar jobs ao arquivar; SQLite/Redis/event bus; reescrever o cache completo do histórico; coletar novas durações; otimizar scanners/gates do DietFlow; implantar app nativo/MCP/submit; OAuth/contas/perfis/permissões de equipe; varrer HOME; clone/fetch/push/hooks automáticos.

Também não alterar o contrato dos tickets enfileirados: argv, cwd, flags e identidade permanecem snapshots. O cadastro do painel não passa a reinterpretar o que já foi admitido no motor.

## 6. Proteção de consistência

Toda função HTTP de domínio recebe Scope explicitamente; toda chave de cache inclui esse Scope. Não acessar um “projeto atual” global dentro do servidor ou resolver o projeto apenas quando a resposta chegar.

O header, a página e os drawers compartilham uma única fonte de contexto por aba. Chaves de seleção/paginação/rascunho/cursor não atravessam projetos. Resposta atrasada de A não alimenta B. Duas abas em A e B não disputam um “activeProject” no servidor.

O menu de ambiente usa os componentes oficiais de Sidebar/DropdownMenu e o ThemeProvider existente. Bridge é liveness global obtido por health, não validade do repo nem existência de receita.

## 7. O que a pesquisa externa mudou

Gait declara publicamente app macOS com monitoramento multi-repo. Não é necessário supor que ele não ofereça isso; o que não foi auditado é sua implementação interna. Mergetrain também possui Hub multi-repo e separa seu roster da integridade das filas dos repos.

Essas referências reforçam duas decisões: registrar projetos fora dos repositórios e impedir que um vínculo quebrado derrube o shell inteiro. Não justificam importar o scheduler, banco, gates de deploy ou políticas de push dessas ferramentas.

O diferencial a investigar para CI Queue não é “tem uma lista de comandos”. É reduzir o trabalho humano entre agentes, contexto de projeto, limites da máquina e prova entendível do resultado. Isso é direção de produto, não alegação de exclusividade de mercado.
