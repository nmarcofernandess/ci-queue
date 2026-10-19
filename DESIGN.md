# Linguagem visual do CI Queue

## Fundação

A interface usa os componentes instalados `radix-nova`, Tailwind 4, Geist e
Lucide. Recuperar a composição antes de escrever JSX. Cores vêm dos tokens
semânticos existentes; não há paleta por feature. O comportamento vigente mora
em [PRODUCT-CONTRACT](docs/ui/PRODUCT-CONTRACT.md); a seleção oficial em
[COMPOSITION-LEDGER](docs/ui/COMPOSITION-LEDGER.md).

## Contratos nativos

Os componentes de `components/ui` são a implementação instalada do shadcn.
Os owners de domínio conectam dados e ações a esses componentes. Uma tabela
continua composta por Table, TableHeader, TableBody, TableRow e TableCell; um
Item ou Card não substitui a linha.

Quando um componente perde espaçamento, encontre primeiro a classe que anulou
seu contrato. Retire a sobrescrita no owner e confira os consumidores. Não
acrescente padding, margem ou outro wrapper para compensar o reset. Use as
variantes e tamanhos disponíveis antes de alterar a geometria.

Preserve também o ciclo de vida e o teclado nativos. Um Select controlado
recebe o novo valor sem remount por key; o popup calcula o espaço disponível.
Tooltip informativo precisa de trigger alcançável pelo teclado. Seleção de
projeto deve ser informada à tecnologia assistiva, além da aparência.

Uma adaptação deve responder a uma necessidade demonstrada do produto. Largura
de coluna, quebra de nomes longos, contenção da rolagem e o gutter conjunto de
CardContent/DataTableFrame têm responsáveis definidos. A composição aceita da
fila vazia compacta e o conector de etapas continuam no ledger. Não transforme
esses casos em permissão para zerar o espaçamento dos demais componentes.

O lint `ui-composition/native-spacing` verifica usos importados dos componentes
nativos e owners de tabela, inclusive aliases. Ele rejeita padding zero nos
Items e nas células, resets de padding em descendentes de tabela, padding/gap
locais em PopoverContent, CardHeader e DrawerHeader/Footer e max-height fixa
no popup de FilterSelect. A regra inspeciona trechos estáticos de className.
Ela não segue classes calculadas em outros símbolos, CSS externo ou estilos
em runtime, nem compara a implementação instalada com o registry remoto.

Lint e tipos não certificam composição ou aparência. A leitura da fonte oficial
compatível, a conferência dos owners e a inspeção renderizada continuam
necessárias. Um exemplo parecido ou um documento dizendo que uma classe existe
não demonstra necessidade nem aprovação dessa adaptação.

## Hierarquia

`ui/src/features/shared/presentation.ts` é o único dono executável da escala.
`current` destaca o trabalho vivo, `drawer` identifica o detalhe sem competir
com seu conteúdo e `table` permite comparar várias execuções. `stage` identifica
um nó de progresso, não outra identidade de página. Os valores são decisões de
produto sobre Nova, não variantes oficiais inventadas.

## Composição de identidade

`EntityIdentity` compõe ItemMedia e ItemContent; em drawer mantém DrawerTitle e
DrawerDescription para acessibilidade. A feature fornece conteúdo e callbacks.
Na execução atual o tempo decorrido **não** mora na description: `ElapsedItem`
fecha o `CardContent`. Chip de projeto é `Badge outline` via `ProjectChip`.
`ProjectChip` exige modo literal e não aceita `className` do consumidor.
`inline` conserva a identidade na execução atual, nas tabelas de execuções,
Worktrees e Últimos verdes, e nos drawers de execução, worktree, commit,
Meta e Pendências. `compact-context` pertence somente aos previews laterais
de Metas e Pendências em Todos: `Badge outline` em linha própria acima do
título, texto visual truncável e Tooltip com nome completo, sem reduzir fonte
nem provocar rolagem horizontal. O owner decide a geometria dos dois modos.

Olho da família é `InspectButton` (label **Inspecionar**, tamanho em
`presentation.inspect`).

```tsx
<EntityIdentity
  presentation="current"
  title={current.preset || "Preset não informado"}
  media={{ kind: "state", descriptor: describeJobState(current.status) }}
  description={<>{branch} · {sha}</>}
  badge={<ProjectChip mode="inline" name={current.projectName} facts={projectChipFacts(current)} />}
  onOpen={() => onOpenJob(current.id)}
/>
```

Em `current` e `drawer`, texto longo quebra sem aumentar a mídia nem comprimir a
tipografia; a mídia alinha ao topo e a badge pode quebrar sem deslocar o X. Em
`table`, título e badge dividem uma única linha: a badge preserva sua largura e
o título usa ellipsis apenas no limite fixo da coluna, independente de sidebar ou viewport, mantendo o nome completo no nome
acessível e no atributo `title`. Ícone de ação pertence ao Button; ícone de
identidade pertence a StatusIndicator. Em tabela o estado permanece em sua
célula: não reunir todas as colunas num card. Botões preservam o padding da
variante nativa. Os títulos quebráveis da execução atual e da Análise crescem
com o conteúdo; os de tabela permanecem em uma linha. DrawerTitle e
DrawerDescription conservam a tipografia nativa.

O header global carrega o seletor de projeto à direita: um projeto, Todos os
projetos ou Histórico sem projeto. O rodapé da sidebar é
o ambiente local, não um usuário. Menus pesquisáveis usam `SelectionPanel`;
`ProjectSelectionPanel` é o dono da lista pesquisável de projetos ativos,
compartilhada pelo `ProjectSwitcher` e pelos drawers de Meta/Pendências.
O header muda o contexto global; o drawer aberto em Todos muda apenas seu
alvo local. SelectionPanel configura altura finita no ScrollArea nativo para
que listas longas rolem dentro do painel. Ler Todos é permitido; declarar, editar ou remover Meta exige
um projeto concreto escolhido nesse alvo. Histórico sem projeto conserva
as ações desabilitadas. Os botões de projeto expõem a seleção por `aria-pressed`.
Filtros simples usam `FilterSelect`, com valor controlado e altura de popup
calculada pelo Radix. Não aninhar Select em Popover para período.

## Drawers

Execução, Worktree, Meta, Pendências e Commit usam `DetailDrawer`. A direção
escolhida pelo hook existente controla também as dimensões: bottom é largura
inteira, right é painel lateral. Header, tabs e footer permanecem fixos; body
rola no ScrollArea oficial. Log usa body managed porque seu viewer já possui
scroll e acompanhamento. Selecionar texto nunca fecha o drawer. X, Escape e
overlay mantêm o dismiss oficial. O Drawer recebe foco ao abrir, contém a
navegação por Tab e devolve o foco ao trigger original pelo hook oficial de
close autofocus. Não criar footer sem ações.

## Tabelas e fichas

`DataTableFrame` é apresentação da Table oficial, sem modelo de dados próprio.
`placement="card"` recua as células externas pelo gutter do Card; `body` evita
aplicar esse recuo novamente e conserva o padding nativo das células. A altura
das linhas e os estados vazios usam o espaçamento dos componentes instalados,
sem seletores descendentes de densidade. Listas conservam rolagem horizontal
e larguras de coluna sem esticar a página. Cada consumidor reserva larguras semânticas para
seu conteúdo; a ação final inclui o Button e os paddings efetivos. Datas de
tabela mostram o valor absoluto compacto e deixam o relativo no Tooltip.
TanStack v9 continua dono da seleção e das linhas.
`FactsTable` é ficha de duas colunas, sem largura mínima de lista nem card
interno e preserva o padding nativo das bordas. SHA e caminhos permanecem
completos e quebráveis, não truncados.

## Progresso

`ExecutionStages` apresenta raízes na faixa horizontal; `ProgressTree` apresenta
a árvore recursiva. Cada cabeçalho expansível ocupa uma linha: seta, título e
contagem formam um único controle com sublinhado integral no hover/foco. Título
longo abrevia na largura restante, preservando a contagem; folhas podem quebrar
linha para mostrar o nome completo e não recebem botão falso. Indentação pertence
ao grupo de filhos, sem traço conector. Indicadores
compartilham descritores; nós concluídos não perdem seu resultado quando o job
é cancelado. Tempos são somente os publicados. Não inferir percentual, ETA,
conclusão nem duração ausente. A faixa preserva follow e pausa manual. Os Items
preservam o padding nativo; a largura das etapas pertence à faixa. Previews compactos de Metas e Pendências
usam Item xs, sem zerar seu espaçamento.

## Ações

| Variante | Papel |
| --- | --- |
| default | Salvar ou declarar Meta, ação principal de formulário. |
| outline | Copiar, Abrir pasta, Editar e Cancelar quando pertinentes. |
| ghost | Olho e X. |
| link | Título que abre detalhe, via EntityIdentity; expansão da árvore. |
| destructive | Remoção com confirmação existente. |

Em botão com texto, usar `data-icon="inline-start"` ou `inline-end`. Em olho e X,
Button icon-sm cuida do tamanho; não atribuir uma posição fictícia. O shell
preserva a disposição nativa do DrawerFooter. Linhas e fichas não viram grandes botões.

## Estados

Skeleton comunica carregamento; Empty comunica ausência real; ErrorState
comunica erro. Refresh preserva dados bons. Um ticket indisponível não mostra
outro como fallback. Foco visível e nomes acessíveis acompanham ações; hover
não é a única indicação de interação. Indicadores têm ícone e label, além da
cor, e respeitam redução de movimento. Menus e overlays mantêm teclado oficial.

## Alterações

Consultar `.context/domains/manifest.yaml` e o pattern de composição, localizar
o proprietário e todos os consumidores. Uma correção familiar é feita no dono,
não num className local. Usar primitivo diretamente quando não existe composição
repetida pertinente. Não adicionar providers, registries dinâmicos ou um design
system paralelo. APIs das composições não aceitam estilo arbitrário.

## Exceções

- `components/ui/drawer.tsx`: handleOnly e select-text! compensam o user-select
  do Vaul e preservam seleção; `size="detail"` é a única adaptação direcional.
- `DetailDrawerBody`: contenção de tamanho inline impede o wrapper de medição
  do ScrollArea de adotar a largura mínima de listas internas; a tabela conserva
  sua própria rolagem horizontal, sem cortar a ficha que a acompanha.
- Definições de colunas: larguras semânticas podem variar; o gutter pertence
  a DataTableFrame e a densidade vem dos componentes instalados.
- `analysis-page.tsx`: altura de Chart limitada para não crescer com viewport;
  ChartContainer mantém tokens e composição. Não substituir séries ou dados.

## Prova

Rodar `npm --prefix ui run lint`, `npm --prefix ui run build`, `npm run test:ui`
e `npm run test:browser` durante a integração, e `npm run check` na candidata
final. Tipos/ESLint testam limites mecânicos; inspeção renderizada confere a
família. [Índice visual](docs/ui/evidence/etapa-1/README.md) identifica revisão,
cenários e resultados. Revisão interna não equivale a aprovação de Marco.

Duração de nós de progresso: conteúdo único (`ProgressDuration`); emissor literal, coletor com `≈`, ausência `—`.
