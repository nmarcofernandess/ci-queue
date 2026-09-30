# Todos os projetos nas superfícies de Status

**Estado:** direção aprovada por Marco em 29/09/2026; implementação ainda não iniciada.  
**Base de código auditada:** `dev@604afa461d18a8310a09d9336622abfbe48662f2`.  
**Main observada:** `main@829218cdcd4603fccc5bd3ee626ae2bcde7f1b61`.

## Objetivo

Fazer `context=all` funcionar como a visão operacional completa do CI Queue no Status. Em **Todos os projetos**, o dashboard deve mostrar Metas, Pendências e Últimos verdes de todos os projetos ativos, sempre preservando a identidade do projeto dono.

O filtro global continua sendo contexto de leitura. Ele não vira um projeto sintético e não muda o dono de Meta, Pendência, receita, verde, ticket, worktree ou commit.

A experiência de um projeto selecionado deve continuar com a mesma semântica e a mesma composição visual atual. **Histórico sem projeto** continua separado e não ganha Meta, Pendências ou Últimos verdes.

## Resultado esperado

Em `context=all`:

- **Metas** mistura os resumos de projetos ativos no card lateral. Cada item identifica o projeto com o `ProjectChip`.
- **Pendências** mistura as recomendações não resolvidas, ordenadas globalmente por `createdAt` decrescente. Cada item identifica o projeto dono.
- **Últimos verdes** fica disponível. Máquina e Git continuam usando a regra canônica da receita atual de cada projeto.
- Agrupamento **Por commit** separa `projectId + headSha`. O mesmo SHA em dois projetos não vira um único grupo.
- Drawers abertos em Todos podem alternar entre **Todos os projetos** e um projeto concreto sem alterar o seletor global do header.
- Uma operação de Meta sempre exige um projeto concreto. O usuário escolhe o alvo no drawer antes de declarar, editar ou remover.
- Pendências continuam somente leitura. O seletor local do drawer filtra a lista; ele nunca cria ou edita uma pendência.
- Falha de um projeto não apaga dados válidos dos demais. A resposta agregada informa falhas por projeto.

## Fatos atuais que esta entrega preserva

O código atual já tem as fronteiras necessárias:

- `ReadScope` distingue `project`, `all` e `unassigned`.
- `state/dashboard.json` persiste Meta por `projectId`.
- `validation-plan.json` registra `projectId` em cada recomendação.
- tickets modernos carregam `projectId` e `projectName`.
- `build_preset_history()` só aceita um verde como canônico quando o ticket passou com a receita atual.
- slots Git validam o `projectId` do payload e recusam mismatch.
- `ProjectChip` é o dono visual do `Badge outline` de projeto.
- `EntityIdentity`, `RunTable`, `DetailDrawer`, `DataTableFrame`, `SelectionPanel` e os componentes instalados de `@/components/ui` continuam sendo os donos da composição.
- `context=all` já agrega Histórico, Worktrees e Análise no servidor.

A restrição atual de Meta, Pendências e Últimos verdes em Todos é uma limitação de projeção. Ela não deve ser removida transformando Todos em um catálogo global.

## Decisão de arquitetura

### Agregar por projeto no servidor

O browser faz uma requisição por recurso agregado. Ele não dispara uma requisição por projeto a cada polling.

Os endpoints existentes passam a aceitar `context=all`:

- `GET /api/dashboard-state?context=all`
- `GET /api/preset-history?context=all`
- `GET /api/remote-slots?context=all`

O servidor resolve os projetos ativos do registry e executa a semântica de cada projeto com seu próprio catálogo.

Não existe:

- Meta global;
- `candidateSha` global;
- receita global;
- verde canônico sem catálogo do projeto;
- merge de Pendências entre projetos antes de preservar `projectId`;
- inferência de projeto para registros sem identidade.

### Leitura agregada de dashboard

O contrato agregado deve representar cada projeto explicitamente:

```ts
type DashboardProjectState = {
  projectId: string
  projectName: string
  revision: number
  presets: string[]
  catalog: "linked" | "unlinked" | "invalid" | "missing"
  meta: DashboardMetaProjection | null
  pending: DashboardPending[]
  pendingError: string | null
}

type DashboardAllState = {
  schemaVersion: 2
  projects: DashboardProjectState[]
  projectErrors: ProjectReadError[]
  context: { kind: "all" }
}
```

`DashboardMetaProjection.checks` deve refletir a verdade existente. Quando o catálogo não permite calcular os checks, o tipo aceita ausência explícita em vez de fingir uma lista vazia.

O agregador lê `dashboard.json`, o plano de validação e o snapshot de histórico uma vez por requisição. Ele agrupa o histórico por `projectId`. Não implemente a visão Todos chamando um reader completo que releia o mesmo histórico para cada projeto.

Projetos arquivados não entram em Todos. O filtro explícito de um projeto arquivado mantém o comportamento já definido pelo lifecycle atual.

### Leitura agregada de verdes da máquina

`/api/preset-history?context=all` projeta os últimos verdes canônicos por projeto e preset. Cada linha preserva:

- `projectId`;
- `projectName`;
- `preset`;
- ticket;
- branch;
- `headSha`;
- horário;
- duração.

O cálculo canônico sempre recebe a receita do projeto dono. Dois projetos podem ter um preset chamado `full` com `argv` diferentes. Um ticket de A nunca certifica a receita de B.

Projeto sem catálogo utilizável não produz verde canônico. A resposta registra o problema daquele projeto e conserva os demais.

### Leitura agregada de verdes do Git

`/api/remote-slots?context=all` mantém o relatório de origem por projeto. O browser precisa distinguir:

- projeto com Git disponível;
- projeto com espelho ausente ou stale;
- projeto sem catálogo;
- projeto com payload inválido;
- projeto com verdes válidos.

A leitura continua local. Abrir Últimos verdes não força `fetch`.

Um slot só entra se o payload provar o próprio projeto. A agregação nunca corrige ou adota um slot de outro projeto.

## Composição de UI

Antes de escrever JSX, o executor deve seguir `.agents/skills/ci-queue-shadcn/SKILL.md` e registrar a seleção:

```text
identidade de projeto -> Badge + Tooltip via ProjectChip -> modo de apresentação
resumo lateral -> Card + ItemGroup/Item -> dados agregados -> gap Status já aprovado
seleção de alvo -> SelectionPanel + InputGroup + Button -> projeto local do drawer
detalhe -> DetailDrawer -> estado agregado ou de um projeto
verdes -> RunTable/DataTableFrame -> identidade de projeto preservada
```

O executor deve rodar, a partir de `ui/`:

```bash
npx shadcn@latest info --json
npx shadcn@latest docs badge
npx shadcn@latest docs item
npx shadcn@latest docs card
npx shadcn@latest docs popover
npx shadcn@latest docs drawer
npx shadcn@latest docs tooltip
```

Se a composição necessária não existir nos componentes instalados, pare a implementação daquele trecho e registre o gap. Não remonte Radix diretamente.

## Um único ProjectChip, com modos explícitos

`ProjectChip` continua sendo o único dono do chip de projeto. A entrega adiciona um modo obrigatório:

```ts
type ProjectChipMode = "inline" | "compact-context"
```

### `inline`

É o comportamento visual atual. Use em:

- execução atual;
- tabelas;
- drawer de job;
- drawer e tabela de worktree;
- Últimos verdes em tabela;
- drawer de commit;
- listas internas de drawers com largura suficiente.

Os consumidores atuais passam a declarar `mode="inline"` sem alteração visual intencional.

### `compact-context`

Use somente nos previews dos cards laterais **Metas** e **Pendências** quando `context=all`.

Esse modo:

- mantém `Badge variant="outline"`;
- preserva o Tooltip com o nome completo e os fatos existentes;
- aceita a largura do card sem criar overflow horizontal;
- trunca somente o texto visual quando necessário;
- ocupa uma linha de contexto própria acima do título do item;
- não reduz a fonte para fabricar espaço;
- não usa classe customizada no consumidor.

O card lateral tem aproximadamente 16rem na grade atual. Não coloque o chip na mesma linha do nome da Meta ou do preset da Pendência.

### Enforcement

`ProjectChip` não aceita `className`.

O ESLint deve falhar quando um consumidor:

- usa `ProjectChip` sem `mode`;
- passa `mode` por expressão dinâmica;
- tenta passar `className` para `ProjectChip`.

O TypeScript fecha os valores possíveis do modo. `tests/ui/ui-policy.test.ts` prova o lint real com o parser instalado.

`.context/patterns/ui-composition.yaml` deve listar os dois modos e seus consumidores. `DESIGN.md` e `docs/ui/COMPOSITION-LEDGER.md` devem explicar a mesma regra. Não crie uma variante local do chip em Status.

## Cards laterais em Todos

### Metas

O card mantém o título **Metas**.

Em Todos:

- mostra até três projetos com Meta declarada;
- ordena por `projectName` e `projectId` para resultado determinístico;
- cada preview usa `ProjectChip mode="compact-context"` em linha própria;
- mostra nome da Meta;
- mostra `x de y requisitos atendidos` quando checks estão disponíveis;
- mostra candidato curto somente quando o projeto tem `candidateSha`;
- catálogo indisponível aparece como fato, nunca como `0 de y`;
- se nenhum projeto ativo tem Meta, mostra **Nenhuma meta declarada.**;
- a ação passa a ser **Abrir metas**.

Projetos sem Meta não precisam ocupar o preview limitado. Eles aparecem no drawer e podem ser escolhidos para declarar uma.

Em um projeto selecionado, o card conserva o comportamento atual.

Em Histórico sem projeto, o card continua pedindo um projeto.

### Pendências

O card mantém o título **Pendências**.

Em Todos:

- mistura todas as recomendações não resolvidas;
- ordena por `createdAt` decrescente, com desempate determinístico por `projectId + id`;
- mostra no máximo três previews;
- cada preview usa `ProjectChip mode="compact-context"` em linha própria;
- preserva preset, PR e SHA curto;
- o título do preset continua abrindo a tentativa posterior quando `latestTicketId` existe;
- se não existir recomendação em nenhum projeto ativo, mostra **Nenhuma pendência.**;
- a ação continua **Ver pendências**.

Em um projeto selecionado, o card conserva o comportamento atual.

Em Histórico sem projeto, o card continua pedindo um projeto.

## Drawer de Meta e Pendências

O filtro global do header nunca muda quando o drawer abre ou quando o usuário escolhe um projeto dentro dele.

A lista de projetos deve usar uma composição compartilhada baseada em `SelectionPanel`. Não duplique a lista pesquisável do `ProjectSwitcher`.

Extraia a parte apresentacional comum da seleção de projeto para um dono em `ui/src/features/projects/`. O `ProjectSwitcher` continua responsável por mudar `ReadScope`. O seletor local do drawer apenas devolve:

```ts
type ProjectTarget =
  | { kind: "all" }
  | { kind: "project"; projectId: string }
```

### Meta

Ao abrir **Abrir metas** em Todos, o alvo inicial é `all`.

No alvo `all`:

- o drawer mostra os projetos ativos com Meta ou com estado vazio;
- cada item identifica o projeto;
- não existe botão global de salvar, editar ou remover;
- escolher um projeto muda somente o alvo local do drawer.

No alvo de projeto:

- reutilize a leitura e o editor atuais de Meta;
- declarar, editar e remover usam `projectId` explícito na mutation;
- trocar o alvo preserva os drafts por projeto e revisão, usando o mecanismo atual;
- fechar o drawer não muda o filtro global.

### Pendências

Ao abrir **Ver pendências** em Todos, o alvo inicial é `all`.

No alvo `all`, o drawer mostra todas as recomendações misturadas e com identidade do projeto. Escolher um projeto filtra a lista. Não existe criação, edição ou remoção manual.

## Últimos verdes em Todos

`HistoryPanel` permite Últimos verdes quando o scope é `project` ou `all`. `unassigned` continua desabilitado.

### Por preset

Cada linha em Todos leva `projectId` e `projectName`. `RunTable` usa o mesmo `ProjectChip mode="inline"` empregado no Histórico e nas Worktrees.

Busca inclui nome do projeto, preset, branch, SHA e ticket.

A união Máquina + Git deduplica somente dentro do mesmo projeto. A identidade inclui:

```text
projectId + preset + ticketId
```

### Por commit

`groupGreenCommits()` agrupa por:

```text
projectId + headSha
```

`GreenCommitGroup` carrega `projectId` e `projectName`.

A tabela de commits mostra o `ProjectChip mode="inline"` junto da identidade do commit. O drawer do commit mostra o mesmo projeto no header. As execuções do grupo pertencem a um único projeto.

### Falha parcial

Se ao menos uma fonte selecionada retorna dados válidos, a tabela permanece visível.

Problemas de projetos individuais aparecem como cobertura parcial com o nome do projeto. Um erro local de A não transforma os verdes válidos de B em erro global.

Se nenhuma fonte selecionada produz dados e todas falham, use o estado de erro atual.

## Tipos e fronteiras

Os tipos do browser devem tornar impossível confundir resposta de projeto e resposta agregada. Use união discriminada por `context.kind` ou por um campo equivalente explícito.

Não use casts para forçar `DashboardState` de projeto em Todos.

O cliente valida `context` pela infraestrutura atual de `requestScoped`.

Mutations continuam aceitando somente `ProjectScope`. `context=all` nunca escreve em `dashboard.json` sem um `projectId` concreto escolhido pelo usuário.

## Estados de erro

- Registry ilegível: falha a resposta agregada inteira.
- Projeto ativo sem catálogo: Meta e Pendências exibem o que for factual; verdes canônicos ficam indisponíveis para esse projeto.
- Espelho Git indisponível: verdes da máquina continuam válidos.
- Histórico corrompido: preserve a cobertura já existente e não invente verde.
- Projeto arquivado durante um drawer aberto: a próxima leitura deve remover o projeto de Todos. Uma mutation stale falha pelo contrato existente.
- Resposta tardia de outro scope ou outro alvo não substitui o estado visível.

## Documentação normativa a atualizar junto da implementação

Atualize somente depois de o comportamento existir e os testes focalizados passarem:

- `docs/ui/PRODUCT-CONTRACT.md`;
- `docs/ui/COMPOSITION-LEDGER.md`;
- `DESIGN.md`;
- `.context/patterns/ui-composition.yaml`;
- `docs/CONTRACTS.md`.

Remova as afirmações atuais de que Meta, Pendências e Últimos verdes exigem sempre um projeto concreto para leitura. Preserve a exigência de projeto concreto para mutations e para cálculo canônico interno.

## Critérios de aceite

1. `context=all` mostra previews misturados de Meta e Pendências com identidade de projeto.
2. Os cards laterais não ganham overflow horizontal em 390, 640, 820, 1440 e 1600 px.
3. O chip dos cards laterais ocupa uma linha própria. Nenhum consumidor cria uma versão local do chip.
4. O lint falha para `ProjectChip` sem modo, modo dinâmico ou `className`.
5. O drawer aberto em Todos permite escolher projeto sem alterar o seletor global.
6. Salvar Meta em Todos envia a mutation somente para o projeto escolhido.
7. Pendências permanecem somente leitura.
8. Últimos verdes funciona em Todos para Máquina, Git e ambas as origens.
9. Mesmo SHA em dois projetos gera dois grupos no modo Por commit.
10. Mesmo nome de preset em dois projetos usa a receita canônica de cada projeto.
11. Falha de um projeto preserva dados válidos dos outros.
12. Projeto único mantém a experiência atual.
13. Histórico sem projeto continua sem Meta, Pendências e Últimos verdes.
14. Nenhuma UI nova usa Radix diretamente, cor raw, z-index manual, SVG redimensionado no consumidor ou card dentro de card.
15. A documentação de composição lista o dono, os modos e os consumidores.
16. A candidata final passa pelos checks definidos no plano antes da promoção a `main`.

## Fora do escopo

- criar Meta global;
- criar ou editar Pendência manualmente;
- mudar a fila, o worker, o runner ou o ship;
- atribuir tickets sem projeto;
- buscar Git pela UI;
- adicionar banco;
- criar novo design system;
- mudar o layout geral do Status;
- refazer o `ProjectSwitcher`;
- alterar política de archive/restore;
- promover `dev` a `main` sem revisar todo o delta que já existe entre as branches.
