# Linguagem visual do CI Queue

## Fundação

A interface usa os componentes instalados `radix-nova`, Tailwind 4, Geist e
Lucide. Recuperar a composição antes de escrever JSX. Cores vêm dos tokens
semânticos existentes; não há paleta por feature. O comportamento vigente mora
em [PRODUCT-CONTRACT](docs/ui/PRODUCT-CONTRACT.md); a seleção oficial em
[COMPOSITION-LEDGER](docs/ui/COMPOSITION-LEDGER.md).

## Hierarquia

`ui/src/features/shared/presentation.ts` é o único dono executável da escala.
`current` destaca o trabalho vivo, `drawer` identifica o detalhe sem competir
com seu conteúdo e `table` permite comparar várias execuções. `stage` identifica
um nó de progresso, não outra identidade de página. Os valores são decisões de
produto sobre Nova, não variantes oficiais inventadas.

## Composição de identidade

`EntityIdentity` compõe ItemMedia e ItemContent; em drawer mantém DrawerTitle e
DrawerDescription para acessibilidade. A feature fornece conteúdo e callbacks:

```tsx
<EntityIdentity
  presentation="current"
  title={current.preset || "Preset não informado"}
  media={{ kind: "state", descriptor: describeJobState(current.status) }}
  description={<JobTimeline job={current} />}
  onOpen={() => onOpenJob(current.id)}
/>
```

Em `current` e `drawer`, texto longo quebra sem aumentar a mídia nem comprimir a
tipografia; a mídia alinha ao topo e a badge pode quebrar sem deslocar o X. Em
`table`, título e badge dividem uma única linha: a badge preserva sua largura e
o título usa ellipsis dentro da área flexível, mantendo o nome completo no nome
acessível e no atributo `title`. Ícone de ação pertence ao Button; ícone de
identidade pertence a StatusIndicator. Em tabela o estado permanece em sua
célula: não reunir todas as colunas num card.

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
aplicar esse recuo novamente. Listas conservam rolagem horizontal e larguras de
coluna sem esticar a página. Cada consumidor reserva larguras semânticas para
seu conteúdo; a ação final inclui o Button e os paddings efetivos. Datas de
tabela mostram o valor absoluto compacto e deixam o relativo no Tooltip.
TanStack v9 continua dono da seleção e das linhas.
`FactsTable` é ficha de duas colunas, sem largura mínima de lista nem card
interno. SHA e caminhos permanecem completos e quebráveis, não truncados.

## Progresso

`ExecutionStages` apresenta raízes na faixa horizontal; `ProgressTree` apresenta
a árvore recursiva. Toda linha reserva uma coluna para expansão, mas folhas
não recebem botão falso. Indentação pertence ao grupo de filhos. Indicadores
compartilham descritores; nós concluídos não perdem seu resultado quando o job
é cancelado. Tempos são somente os publicados. Não inferir percentual, ETA,
conclusão nem duração ausente. A faixa preserva follow e pausa manual.

## Ações

| Variante | Papel |
| --- | --- |
| default | Salvar ou declarar Meta, ação principal de formulário. |
| outline | Copiar, Abrir pasta, Editar e Cancelar quando pertinentes. |
| ghost | Olho, X e expansão. |
| link | Título que abre detalhe, via EntityIdentity. |
| destructive | Remoção com confirmação existente. |

Em botão com texto, usar `data-icon="inline-start"` ou `inline-end`. Em olho e X,
Button icon-sm cuida do tamanho; não atribuir uma posição fictícia. O shell
centraliza wrapping das ações. Linhas e fichas não viram grandes botões.

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
- Definições de colunas: larguras semânticas podem variar; gutter e densidade
  pertencem a DataTableFrame.
- `analysis-page.tsx`: altura de Chart limitada para não crescer com viewport;
  ChartContainer mantém tokens e composição. Não substituir séries ou dados.

## Prova

Rodar `npm --prefix ui run lint`, `npm --prefix ui run build`, `npm run test:ui`
e `npm run test:browser` durante a integração, e `npm run check` na candidata
final. Tipos/ESLint testam limites mecânicos; inspeção renderizada confere a
família. [Índice visual](docs/ui/evidence/etapa-1/README.md) identifica revisão,
cenários e resultados. Revisão interna não equivale a aprovação de Marco.
