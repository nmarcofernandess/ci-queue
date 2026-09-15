# CI Queue · Etapa 1: consistência visual e composição compartilhada

> **Plano de implementação para o executor local.** Executar as tarefas na ordem e marcar os checkboxes neste arquivo. A implementação está autorizada até o PR **draft** com código, provas e revisão interna concluídos. O merge em `dev` está descrito, mas só é executado depois do review e da autorização explícita de Marco para a candidata final. Não iniciar a etapa 2.

**Objetivo:** corrigir a interface inteira como um sistema visual, eliminando decisões duplicadas sobre identidade, drawers, linhas de progresso, tabelas e estados, sem alterar a operação do executor nem criar uma plataforma de fiscalização de layout.

**Arquitetura:** conservar os primitivos shadcn `radix-nova`; concentrar as poucas composições repetidas em módulos compartilhados; restringir seus desvios por tipos e pelo ESLint existente; verificar comportamento e geometria no Playwright existente e inspecionar a aplicação renderizada completa.

**Execução por agente:** usar a skill de execução de planos já disponível, se houver, sem replanejar nem adicionar aprovações por tarefa. A primeira parada humana obrigatória é o PR draft; a tarefa de merge tem autorização própria.

**Stack observada:** Vite, React, TypeScript, Tailwind 4, shadcn/Radix Nova, Lucide, TanStack Table v9, Vitest e Playwright. Usar os lockfiles do repositório, não as versões de exemplos externos.

**Repositório exclusivo da entrega:** `nmarcofernandess/ci-queue`.

**Revisão auditada:** `20de7eb5faa73c31b1cf721ccfb3880248d8f649`. O único delta publicado desde a revisão da análise anterior, `23eab9c`, foi adicionar `docs/troubleshooting/log-examples/CI-QUEUE-VERDADE.tsv`. O código de UI revisado permanece o mesmo nesse comparativo.

**Contrato implementado:** pedido atual de Marco + este plano, limitado à etapa 1; comportamentos preservados em `docs/ui/PRODUCT-CONTRACT.md`; composições em `docs/ui/COMPOSITION-LEDGER.md`. Referências e limites da auditoria estão na seção 15.

**Destino deste arquivo no projeto:** `docs/superpowers/plans/2026-09-15-ci-queue-ui-consistencia.md`.

---

## 0. Mandato, fronteira e ponto de parada

### 0.1 O que executar agora

Entregar as correções visuais em **todos os consumidores afetados**, as composições compartilhadas especificadas, os testes e lints proporcionais, `.context`, a atualização de `AGENTS.md`, `DESIGN.md`, documentação canônica reconciliada e um PR draft contra `dev` com evidência visual da candidata final.

Não devolver apenas diagnóstico, proposta, protótipo, screenshot isolado, lista de pendências ou uma implementação que exige Marco localizar as cópias esquecidas. Este documento já contém a rota. A primeira leitura local serve para verificar diferenças desde a revisão auditada, não para começar outro planejamento.

Se houver skill de execução de planos instalada, usá-la sem introduzir novas aprovações por tarefa. Não instalar Superflow, Superpowers, Storybook ou outra ferramenta para executar esta entrega. Não há obrigação de abrir subagentes ou contratar revisores adicionais. Se houver delegação, a integração e a prova do conjunto continuam sendo responsabilidade do executor.

### 0.2 Exclusões explícitas

Não alterar nesta etapa:

- API, endpoints, payloads, cache, indexação, polling, coleta, persistência, históricos, logs, locks, workers, cancelamento, supervisão, instalação ou mecanismos de atualização do produto instalado.
- Receitas, emissores, cronômetros, testes ou qualquer arquivo do DietFlow. Não otimizar smoketest. Não adicionar duração que o backend não publicou.
- Filtros, população estatística, semântica dos verdes, estados de negócio, contadores, contratos temporais ou regras de Meta/Pendências.
- Navegação, funcionalidades e escopo aprovados. Não ressuscitar Recursos, Problemas, gráficos de máquina, botões Atualizar, execução/cancelamento de jobs ou ações de administração de worktrees.
- Dependências de runtime, versões de shadcn/TanStack, framework de UI, configuração de produção ou estilos de outro registry.

São permitidas alterações no **workflow de validação existente**, em scripts/testes estritamente necessários para a prova desta UI e na documentação do projeto. A correção da classificação invertida do workflow faz parte dessa fronteira, não de uma reforma do backend.

### 0.3 Fluxo completo e autorização

```text
main publicado (somente leitura como base)
        |
        +--> dev do CI Queue, se ainda não existir
                  |
                  +--> codex/ui-consistency-phase1
                               |
                     implementação de toda a etapa 1
                               |
                     testes + revisão visual do conjunto
                               |
                       PR DRAFT para dev
                               |
                    PARAR: review de Marco
                               |
                  rodada consolidada de fixes, se solicitada
                               |
                   candidata final + autorização de merge
                               |
                         merge em dev
```

A consulta remota encontrou **somente `main`**. Como o destino solicitado é `dev`, criar `dev` no **CI Queue** a partir do `origin/main` verificado, apenas se ela continuar inexistente. Não usar `dev` do DietFlow nem substituir silenciosamente o destino por `main`.

Não configurar auto-merge. Não tornar o PR ready antes do review. Não publicar release, não trocar o serviço instalado e não promover `main`. Merge de código em `dev` não significa atualização da instalação local.

---

## 1. Review realizado: problemas e correções determinadas

As constatações abaixo vêm do código publicado e dos prints fornecidos. Onde a reprodução no navegador ainda é necessária, isso está indicado. Não são alegações de que os testes da candidata já foram executados.

| ID | Problema identificado | Âncora de código | Correção determinada | Prova |
|---|---|---|---|---|
| UI-01 | A identidade de execução centraliza 48/44/16 px somente no ícone; título, metadados e composição continuam definidos separadamente. | `features/shared/run-table.tsx`: `indicatorSizes`/`JobStatusIcon`; `status/status-page.tsx`: `CurrentExecution`; `shared/job-drawer.tsx`: header. | Centralizar a identidade completa, não apenas o SVG. Aplicar a escala da seção 4 aos consumidores. | Comparação de identidade atual/drawer/tabela; ausência de overrides locais. |
| UI-02 | Worktree usa outra montagem: pasta de 16 px na primeira linha e subtítulo fora do alinhamento da identidade de execução. Meta, Pendências e Commit também repetem o shell. | `worktrees/worktrees-page.tsx`: `WorktreeDrawer`; `status/status-state-drawer.tsx`; `status/green-commit-table.tsx`. | Um shell e um header compartilhados para as cinco superfícies. O conteúdo e a presença de mídia continuam semânticos. | Abrir Execução, Worktree, Meta, Pendências e Commit na mesma viewport e comparar. |
| UI-03 | Na árvore, só nós com filhos recebem a coluna do chevron. Folhas irmãs começam mais à esquerda. | `shared/job-drawer.tsx`: `ProgressNodeRow`. | Coluna de expansão reservada em todos os irmãos. Folha não recebe botão falso. | Coordenadas de ícone/título iguais entre irmãos; teclado só encontra expanders reais. |
| UI-04 | Existem seletores independentes de ícones de estado para job, árvore e faixa atual. A cor já tem helper, a representação completa não. | `JobStatusIcon`, `StageGlyph`, `stageIcon`, `shared/status-color.ts`. | Extrair descritores semânticos e um indicador compartilhado. Não reinterpretar estado de negócio. | Mesmo estado e mesma função visual resultam na mesma representação; nó não concluído de job terminal não anima. |
| UI-05 | A tabela remove o padding de `CardContent` enquanto seu header mantém padding. O alinhamento depende de ajustes independentes nas células. | `shared/run-table.tsx`: `<CardContent className="px-0">`; `components/ui/card.tsx`. | Adotar a política única de tabela até a borda, com primeira/última célula alinhadas ao gutter da superfície, dentro de `DataTableFrame`. | Conteúdo da primeira/última célula alinhado ao header e ao limite da superfície, sem overflow da página. |
| UI-06 | Fichas de execução, worktree e commit têm construções distintas. SHA/caminho longos podem produzir distribuição ruim; o print mostra quebra residual do SHA. | `JobDetailsTable`; corpo de `WorktreeDrawer`; ficha em `GreenCommitDrawer`. | `FactsTable` com duas colunas, labels previsíveis, valores completos quebráveis e mesma densidade. | SHA de 40 e 64 caracteres, caminho longo e labels extensos em 390/700/820/1440 px. |
| UI-07 | `data-icon` booleano não seleciona as regras do Button para `inline-start`/`inline-end`. Nem toda ocorrência precisa do atributo. | Chamadores dos botões; `components/ui/button.tsx`. | Corrigir atributo conforme o papel do ícone. Ícone isolado não recebe posição fictícia. | Lint rejeita forma booleana; ações mantêm tamanhos/ícones herdados do Button. |
| UI-08 | O hook escolhe bottom abaixo de 768 px; os consumidores aplicam `sm:w-[36rem]` desde 640 px. A faixa 640–767 mistura bottom com largura desktop. | `hooks/use-mobile.ts`; os quatro arquivos que hospedam drawers. | Dimensões dependem da direção efetiva, num proprietário único, não de outro breakpoint. | Testes em 639, 640, 700, 767 e 768 px, incluindo resize com drawer aberto. |
| UI-09 | O header primitivo centraliza texto no bottom/top. Execução recebeu correção local; outros headers não compartilham a correção. | `components/ui/drawer.tsx`: `DrawerHeader`; headers das features. | Alinhamento de identidade à esquerda no header compartilhado, para todas as direções do detalhe. | Título e descrição à esquerda em todos os drawers, inclusive mobile. |
| UI-10 | `AGENTS.md`, skill e ledger já existem; não falta uma primeira instrução sobre shadcn. Faltam donos únicos para composição e regras mecânicas proporcionais. | `AGENTS.md`, `.agents/skills/ci-queue-shadcn/SKILL.md`, `ui/eslint.config.js`. | Atualizar as instruções, criar mapa `.context` enxuto e `DESIGN.md`, apontando para código realmente usado. | Cadeia de leitura leva aos componentes e testes certos; nenhum segundo catálogo de valores. |
| UI-11 | O workflow classifica uma alteração exclusivamente em `docs/` como `docs_only=false`, e alterações de código como `true`; assim, pode pular o check completo da UI. | `.github/workflows/ci.yml`: `Classify changed paths`. | Corrigir a inversão, testar o classificador e incluir PRs para `dev` no mesmo workflow. | Casos docs-only, UI, misto, testes, governança e conjunto vazio classificados corretamente. |
| UI-12 | Os testes existentes cobrem comportamento e alguns alinhamentos, mas não a congruência entre todas as famílias nem 640–767 px. | `tests/browser/dashboard.spec.ts`; `playwright.config.ts`. | Acrescentar poucos testes sistêmicos e uma prova visual organizada, reaproveitando a infraestrutura atual. | Matriz da seção 9 completa e inspecionada na candidata final. |

**Não corrigir um print isoladamente.** UI-01/02/03/04 devem desaparecer por mudança do proprietário compartilhado e migração dos consumidores, não por novos `className` espalhados.

---

## 2. Comportamentos que esta refatoração deve preservar

As decisões posteriores de `PRODUCT-CONTRACT.md` prevalecem sobre desenhos históricos anexados. Em particular, a execução atual tem **faixa horizontal de etapas abaixo da identidade**, não a antiga lista vertical lateral.

### 2.1 Status e tabelas

- Execução atual só recebe `running`; seu vazio compacto permanece. Fila só recebe `queued`; histórico só recebe terminais.
- Preset/título e olho são os triggers definidos. Linha, metadados, checkbox e áreas vazias não passam a abrir drawer.
- Assunto do commit continua somente na execução atual. Não duplicar fatos para preencher espaço.
- Fila/Histórico/Últimos verdes conservam colunas, seleção aplicável, filtros, cursores, agrupamento, origem e URL. Não converter tabelas em cards no mobile.
- Faixa de etapas conserva raízes, rolagem horizontal, acompanhamento da etapa ativa e pausa quando o usuário navega manualmente. A referência de oito etapas visíveis é a largura desktop de 1600 px, não qualquer largura.
- Não há percentual ou ETA de execução. O progresso `x de y` da Meta continua legítimo.

### 2.2 Drawers e interação

- Cinco superfícies: Execução, Worktree, Meta, Pendências e Commit de últimos verdes.
- Execução conserva Progresso/Log, ficha de quatro campos, árvore completa, `failureReason`, flaky, diagnóstico no Popover e as duas ações existentes.
- Header, tabs e footer ficam fixos dentro do drawer; somente o centro rola. Conteúdo longo não empurra ações para fora da viewport.
- Seleção nativa de texto funciona. Arrastar conteúdo não fecha o drawer. Preservar a correção existente `handleOnly`/`select-text!`; não “limpar” essa exceção junto de overrides desnecessários.
- X, Escape e overlay continuam fechando conforme o comportamento existente. Ao entrar em um drawer de execução a partir de Meta/Commit/Pendências, não deixar overlays ou foco órfãos.
- Não acrescentar botão Fechar no footer, abas artificiais em Worktree ou ações de job.
- Worktree conserva Abrir pasta e Copiar caminho/contexto; seleção e medição continuam usando os mecanismos atuais.
- Meta conserva leitura, edição, cancelamento, persistência, erro que preserva rascunho e confirmação de remoção. Pendências continua somente leitura.

### 2.3 Honestidade e estados

- `durationMs` e contadores já publicados permanecem visíveis. Ausência não vira zero, cálculo novo ou texto de sucesso.
- Esta etapa **não** resolve duração ausente. Também não muda o contrato para tornar a ausência permanentemente aceitável. Esse trabalho pertence à etapa 2.
- Nó concluído mantém o resultado mesmo se o job termina cancelado. Nó pendente/em execução num job terminal não anima nem ganha conclusão inventada.
- Erro não vira vazio; atualização não apaga dados bons; um item indisponível não mostra outro item como fallback.
- Análise mantém Resultados/Duração, dados e gráficos atuais. Apenas composições visuais compartilhadas e desvios comprovados de apresentação podem ser corrigidos aqui.

---

## 3. Arquitetura e mapa de arquivos

```text
ui/src/components/ui/                 primitivos instalados
              |
ui/src/features/shared/
    presentation.ts                  escala + descritores de mídia/estado
    status-indicator.tsx             indicador sem layout de feature
    entity-identity.tsx              mídia + título + metadados
    detail-drawer.tsx                shell/header/tabs/body/footer
    facts-table.tsx                  fichas de campos, não listas
    data-table-frame.tsx             apresentação comum das tabelas de listas
    progress-tree.tsx                árvore recursiva do drawer
    execution-stages.tsx             faixa horizontal da execução atual
    async-state.tsx                  estados já existentes, refinados
              |
status / worktrees / analysis         dados, decisões e callbacks das features
```

Não criar um design system paralelo. Esses módulos pertencem à composição da UI do produto e continuam montados com os primitivos existentes. Não introduzir providers, registry dinâmico, renderização por JSON, engine de temas ou dispatcher de componentes.

### 3.1 Criar

| Arquivo | Responsabilidade limitada |
|---|---|
| `ui/src/features/shared/presentation.ts` | Escala da identidade e descritores dos indicadores. Nenhum fetch ou dado de execução. |
| `ui/src/features/shared/status-indicator.tsx` | Renderizar um descritor de estado com nome acessível, ícone, tom e tamanho semântico. |
| `ui/src/features/shared/entity-identity.tsx` | Composição única de mídia/título/metadados nas apresentações atual, drawer e tabela. |
| `ui/src/features/shared/detail-drawer.tsx` | Composição única dos cinco drawers; reexportar somente os slots de uso necessários. |
| `ui/src/features/shared/facts-table.tsx` | Ficha uniforme, valores completos e quebra de textos técnicos. |
| `ui/src/features/shared/data-table-frame.tsx` | Table oficial com política de gutter, cabeçalho e densidade; sem lógica de dados. |
| `ui/src/features/shared/progress-tree.tsx` | Extrair árvore de `job-drawer.tsx`, corrigir alinhamento e preservar interação. |
| `ui/src/features/shared/execution-stages.tsx` | Extrair faixa de `status-page.tsx`, preservar scrolling/follow e compartilhar indicadores. |
| `.context/domains/manifest.yaml` | Mapa de entrada e consumidores reais, sem duplicar negócio. |
| `.context/patterns/ui-composition.yaml` | Quando usar cada composição e quais arquivos abrir ao modificá-la. |
| `DESIGN.md` | Linguagem visual do produto, papéis, composição, exemplos e exceções. |
| `scripts/ci/classify-docs-only.sh` | Classificador pequeno usado pelo workflow, sem conhecer layout. |
| `tests/ui/ci-scope.test.ts` | Regressões da classificação do workflow. |
| `tests/ui/ui-policy.test.ts` | Casos positivos/negativos das restrições de UI usando o ESLint instalado. |
| `tests/ui/presentation.test.ts` | Descritores e invariantes semânticos, não dimensões de cada ícone. |
| `tests/browser/ui-consistency.spec.ts` | Verificação sistêmica das famílias e dos breakpoints. |
| `tests/browser/fixtures/ui-consistency.ts` | Fixtures isoladas e determinísticas, exclusivamente para os testes. |
| `docs/ui/evidence/etapa-1/README.md` | Índice de provas e registro da revisão interna final. |

Os screenshots selecionados moram em `docs/ui/evidence/etapa-1/screens/`. Relatórios completos e temporários ficam ignorados pelo Git. Não criar arquivos vazios para satisfazer esta tabela: um módulo deve estar efetivamente implementado e consumido.

### 3.2 Modificar

- `AGENTS.md`; `.agents/skills/ci-queue-shadcn/SKILL.md`; `docs/ui/PRODUCT-CONTRACT.md`; `docs/ui/COMPOSITION-LEDGER.md`.
- `ui/src/components/ui/drawer.tsx`, somente na extensão de tamanho de conteúdo explicada em 5.3; preservar as correções de seleção e os comportamentos oficiais.
- `ui/src/features/shared/run-table.tsx`, `job-drawer.tsx`, `async-state.tsx`.
- `ui/src/features/status/status-page.tsx`, `status-state-drawer.tsx`, `green-commit-table.tsx`.
- `ui/src/features/worktrees/worktrees-page.tsx` e `ui/src/features/analysis/analysis-page.tsx`, somente nos consumidores visuais desta etapa.
- `ui/eslint.config.js`; `.github/workflows/ci.yml`; `tests/browser/dashboard.spec.ts` apenas onde a refatoração exigir adaptar seletores sem enfraquecer asserts.
- `.gitignore` para relatórios/temporários novos, se necessário. Não ignorar provas curadas.

`ui/src/index.css`, `components/app-sidebar.tsx`, `components/site-header.tsx` e os demais primitivos são arquivos de **inspeção**. Não os reestilizar sem um desvio concreto da mesma família. Tokens de cor já existentes devem ser reutilizados, não substituídos.

---

## 4. Decisões visuais desta entrega

Estas são decisões explícitas de produto para esta correção. Não afirmar que os números são variantes oficiais do shadcn nem que a nova candidata já recebeu aprovação visual de Marco.

### 4.1 Escala de identidade

| Apresentação | Título | Metadados | Mídia/indicador | Uso |
|---|---|---|---|---|
| `current` | `text-xl leading-6 font-semibold` | `text-xs leading-4 text-muted-foreground` | `size-10`, 40 px na escala normal | Identidade da execução ativa. |
| `drawer` | `text-base leading-5 font-medium` | `text-xs leading-4 text-muted-foreground` | `size-9`, 36 px | Execução e Worktree; mesmo header nos demais drawers. |
| `table` | `text-sm leading-5 font-medium` | Não acrescentar segunda linha à tabela de execuções. | SVG `size-4`; área reservada estável | Células de identidade/estado em listas. |
| Etapa de progresso | `text-sm leading-5 font-medium` | `text-xs` somente para detalhe secundário | SVG `size-5`, 20 px | Raízes da faixa e linhas da árvore. Não é uma quarta identidade de página. |

Sem gap vertical artificial entre título e metadados da identidade. A soma das duas linhas normais fica próxima da mídia. Quando o texto quebra, cresce o texto, não o ícone. Alinhar a mídia ao topo; não encolher tipografia dinamicamente, aplicar altura rígida ao texto ou ampliar o SVG conforme `scrollHeight`.

Não aplicar esta escala a todos os botões, badges, gráficos e ícones da aplicação. O X e o chevron seguem o Button; a mídia de um `Empty` segue seu papel. Consistência é mesma função com mesma regra, não todos os SVGs com a mesma dimensão.

Meta, Pendências e Commit atualmente não precisam ganhar um ícone decorativo apenas para preencher a coluna. Quando não houver mídia, o header começa no gutter normal. Execução e Worktree, que têm mídia, compartilham sua geometria.

### 4.2 Drawers

- Uma largura desktop de **36rem**, já presente no contrato; não crescer o drawer para compensar componentes desproporcionais.
- Direção `bottom` abaixo de 768 px e `right` a partir de 768 px, usando o hook atual.
- No bottom, largura da viewport e altura de 80dvh; no right, altura da viewport e largura limitada a 36rem. As regras dependem da direção efetiva.
- Header, tabs e footer usam `p-4`/gutter equivalente de 16 px na escala padrão. O body usa o mesmo gutter. Evitar soma acidental de padding do body e da sua primeira superfície.
- Conteúdo central com `min-h-0` e overflow delimitado. Não dar altura mínima “de tela” a fichas curtas nem centralizá-las verticalmente. O espaço vazio restante de um drawer lateral de altura inteira não autoriza aumentar conteúdo ou inventar dados.
- Header sempre à esquerda; X com `Button variant="ghost" size="icon-sm"`, nome acessível e sem resize manual do SVG.
- Footer compartilha wrapping e alinhamento: ações no fim, gap do componente, sem distribuição arbitrária diferente por feature. Remoção da Meta pode ocupar o início quando já for uma ação separada. Não criar footer para Pendências se não há ação.

### 4.3 Árvore e faixa

```text
expansão   estado   nome e detalhe                  duração real
   ▸         ✓      Static                          29m 7s
             ✓      Jest                             1m 50s
             ✓      Artefatos
```

A primeira coluna existe para todos os irmãos, inclusive folhas. Sua largura é a largura do `icon-sm`, não uma margem ad hoc por label. Usar `Button icon-sm` apenas quando há filhos. A segunda coluna e o início do título permanecem alinhados.

Cada linha tem altura mínima confortável de aproximadamente `min-h-9`; pode crescer para detalhe, retry ou nome longo. Duração tem `shrink-0`, dígitos tabulares e não empurra o estado para fora da linha. A área do título tem `min-w-0`.

A indentação pertence ao grupo de filhos. Não acumular mais uma indentação no botão, no ícone e no conteúdo. Conectores são discretos com `border-border`/`Separator`, sem criar uma engine de desenho.

A faixa horizontal atual mantém ícones/nomes legíveis e seu gutter interno. Não usar margens negativas para alinhar com o Card. Oito itens cabem na referência de 1600 px; em larguras menores, a faixa rola sem aumentar `documentElement.scrollWidth`.

### 4.4 Tabelas e fichas

**Listas dentro de Card:** bordas/separadores podem ir até a borda; conteúdo da primeira e da última célula fica recuado pelo mesmo `--card-spacing` do header. `CardContent px-0` só é usado com `DataTableFrame placement="card"`, que assume esse recuo. Não é uma exceção livre para cada feature.

**Lista dentro de body já recuado:** `DataTableFrame placement="body"`; não aplicar novamente o gutter de Card. Cabeçalho discreto, sem faixa de fundo nova; densidade e ações iguais às demais listas.

**Ficha:** `FactsTable`, sem novo card arredondado ao redor. Duas colunas, primeira com largura previsível (`w-32` como partida canônica), valores à esquerda. Texto técnico fica completo e quebrável. Não truncar permanentemente SHA/caminho em drawer, inserir quebras manuais ou diminuir toda a fonte para esconder overflow.

Tabelas de lista conservam as colunas existentes e sua rolagem horizontal. Não impor a largura de uma tabela de seis colunas à ficha de dois campos.

### 4.5 Botões, cores e estados

- `default`: ação principal de formulário, como Salvar/Declarar meta.
- `outline`: ação secundária explícita, cópia, Abrir pasta, Cancelar/Editar conforme contexto existente.
- `ghost`: olho, X, expansão e ações discretas já previstas.
- `link`: título que abre detalhe; uma variante local de identidade pode remover sua altura/padding dentro do proprietário compartilhado.
- `destructive`: remoção, com confirmação existente. Não usar vermelho para uma ação apenas secundária.
- Botões de texto usam tamanho padrão, ações icon-only usam `icon-sm`; não simular um novo botão com `h-* px-*` em cada consumidor.
- Em botão com texto, ícone inicial usa `data-icon="inline-start"`, final usa `inline-end`; ícone isolado não precisa de `data-icon`.
- Cor vem de `success`, `destructive`, `warning`, `muted-foreground` e tokens existentes. Não inventar paletas por tela nem usar cor como única identificação.
- Vazio/erro continuam usando `Empty` e as composições atuais; loading usa Skeleton adequado à região. Reaproveitar `async-state.tsx` em vez de criar uma segunda família. Não tornar todo estado vazio uma ilustração grande.

---

## 5. Contratos dos componentes

### 5.1 `presentation.ts` e `StatusIndicator`

Remover a propriedade de `JobStatusIcon` de dentro da tabela. A tabela é consumidora, não dona da semântica global de estado.

`presentation.ts` exporta a escala de identidade e descritores de estado. Reutiliza `statusColor()` em vez de duplicar sua tabela de cores. Se o mesmo significado tiver representações diferentes hoje, definir uma única representação aqui, preservando a distinção entre passed, failed, interrupted, cancelled, queued, running, pending e skipped.

Interface orientadora:

```ts
export type IdentityPresentation = "current" | "drawer" | "table"
export type IndicatorPresentation = IdentityPresentation | "stage"

export type StateDescriptor = {
  Icon: import("lucide-react").LucideIcon
  label: string
  colorClass: string
  animated: boolean
}

// Importar JobStatus e ProgressNode de ../../lib/types como tipos;
// usar import relativo ./status-color para o helper puro, sem alias novo no Vitest.
export function describeJobState(status: JobStatus | undefined): StateDescriptor
export function describeProgressState(
  nodeStatus: ProgressNode["status"],
  jobStatus: JobStatus | undefined,
): StateDescriptor
```

Mapa determinado para o estado do job, preservando os símbolos já usados: `passed → CheckCircle2Icon`, `running → LoaderCircleIcon`, `failed/interrupted/cancelled → XCircleIcon`, `queued → CircleDotIcon` e ausência → `MinusCircleIcon`. Rótulos vêm do `statusLabel` existente; cores vêm de `statusColor`, não de outro mapa. Em progresso, `passed/failed/running` usam os mesmos símbolos; `pending/skipped` usam `CircleDotIcon`, com seu próprio rótulo. Só `running` confirmado como vivo anima. Conservar literalmente os rótulos atuais de cancelamento/encerramento sem conclusão ao apresentar nós incompletos num job terminal. A distinção entre domínio e apresentação permanece nos dois descritores.

Nos testes puros do root, importar `presentation.ts` por caminho relativo. Imports de tipos são apagados na compilação; imports de helpers vizinhos devem ser relativos. Não adicionar Vitest config, duplicar React/Lucide no root nem alterar alias da aplicação apenas para executar esse teste.

`StatusIndicator` recebe `descriptor` e `presentation`, não `size={44}`, `className`, `style`, `strokeWidth` ou cor livre. O ícone decorativo interno fica `aria-hidden`; o wrapper expõe o label. Em tabela, conservar Tooltip acessível por teclado, sem transformar o indicador num botão que abre drawer.

`describeProgressState` preserva o tratamento atual de etapa não concluída em ticket terminal. Não modificar o objeto de progresso recebido. Um passado concluído não é apagado porque o pai foi cancelado.

### 5.2 `EntityIdentity`

Responsabilidade: compor `ItemMedia + ItemContent`, título e metadados como **um conjunto**. Ela não busca dados nem decide como calcular tempo.

Contrato público:

```ts
type IdentityMedia =
  | { kind: "state"; descriptor: StateDescriptor }
  | { kind: "worktree" }

type EntityIdentityProps = {
  presentation: IdentityPresentation
  title: string
  description?: React.ReactNode
  media?: IdentityMedia
  badge?: React.ReactNode
  onOpen?: () => void
  monospaceTitle?: boolean
}
```

Regras de implementação:

- `drawer`: renderizar `DrawerTitle` e `DrawerDescription`, preservando a semântica acessível. O título não é outro trigger.
- `current`: título abre o drawer; o olho continua uma ação separada no layout atual. Não deixar um Button de tamanho padrão impor altura extra ao título.
- `table`: título compacto; mídia permanece na célula de estado já existente. Não colapsar Estado/Execução/Revisão numa célula gigante.
- `description` é conteúdo, não nova superfície: aceitar o `JobTimeline` existente, texto e spans sem estilo de layout. Não passar um Card, toolbar ou div com classes que refaçam a identidade.
- `badge` permite o Badge semântico já existente, como Limpa/Suja. Seu slot quebra de forma previsível em largura estreita, sem esmagar o título ou deslocar o X.
- `monospaceTitle` só para identidade técnica, como o SHA curto no drawer de Commit.
- Não expor `className`, `style`, tamanhos livres ou `...HTMLProps` na API pública. O proprietário aplica as variantes.

Uso de execução, sem alterar o relógio:

```tsx
<EntityIdentity
  presentation="current"
  title={current.preset || "Preset não informado"}
  media={{ kind: "state", descriptor: describeJobState(current.status) }}
  description={<JobTimeline job={current} />}
  onOpen={() => onOpenJob(current.id)}
/>
```

Branch/SHA, assunto e fatos adicionais continuam nos lugares aprovados. Não transformar todas as linhas do card em metadados do header.

### 5.3 `DetailDrawer`

Compor os primitivos existentes. Não reimplementar portal, focus trap, dismiss, animação, overlay, gestos ou ARIA.

Exports necessários:

```tsx
<DetailDrawer onClose={onClose}>
  <DetailDrawerHeader
    title="Título"
    description="Descrição real"
    closeLabel="Fechar worktree"
    media={{ kind: "worktree" }}
    badge={badgeExistente}
  />
  <DetailDrawerBody>{conteudoExistente}</DetailDrawerBody>
  <DetailDrawerFooter>{acoesExistentes}</DetailDrawerFooter>
</DetailDrawer>
```

`DetailDrawerHeader` usa `EntityIdentity presentation="drawer"`; seu `children` opcional serve apenas ao conteúdo adicional já existente no header, como `Progress` da Meta. Não adicionar props específicas de formulário ao shell.

`DetailDrawerTabs` é um slot fixo para o cabeçalho das Tabs da execução. As Tabs continuam sendo as oficiais, controladas por `JobDrawer`.

`DetailDrawerBody` usa o `ScrollArea` oficial para conteúdo normal, com inner container recuado. Para o Log, aceitar `scroll="managed"`: o viewer existente continua dono do scroll/seguir/pausar, sem empilhar dois scrollers. O container do viewer passa a usar o mesmo padding do body. Não alterar `use-live-log.ts`, offset, buffer ou polling.

**Dimensão do primitivo:** adicionar a `DrawerContent` uma opção restrita `size="detail"`, usada somente por `DetailDrawer`. Separar os estilos direcionais do tamanho default e do detail, sem empilhar `sm:max-w-sm` com `max-w-[36rem]!`. O default permanece compatível com o primitivo instalado; a variante detail usa direita/base como descrito em 4.2. Assim a adaptação sistêmica é explícita e as features deixam de passar dimensões.

A variante não usa o breakpoint `sm` para determinar o tamanho quando a direção já está em `data-vaul-drawer-direction`. Não acrescentar nova prop para cada largura, padding ou posição.

Preservar `handleOnly`, `select-text!`, estilos de foco e overlay existentes. A exceção de seleção está justificada por um comportamento do Vaul; não é equivalente a aumentar SVG por seletor descendente.

### 5.4 `FactsTable`

```ts
type FactRow = {
  id: string
  label: string
  value: React.ReactNode
  technical?: boolean
}

type FactsTableProps = {
  caption: string
  rows: readonly FactRow[]
}
```

Montar `Table`, `TableCaption` acessível, `TableBody`, `TableRow`, `TableHead scope="row"` e `TableCell`. `technical` controla a fonte monoespaçada e a quebra; não há `className` por linha.

Migrar:

- Execução: Ticket, Branch, SHA, Diretório.
- Worktree: Caminho, SHA, Alterações, Em relação à base, Tamanho.
- Commit: SHA, Branches, Origem, antes da sua lista de execuções.

Manter os valores e a interpretação de ausência das funções atuais. Não acrescentar copiar em toda célula, nova seção “Detalhes técnicos” ou campos que não existem.

### 5.5 `DataTableFrame`

Interface pequena:

```ts
type DataTableFrameProps = {
  placement: "card" | "body"
  label: string
  children: React.ReactNode
}
```

É o `Table` oficial com apresentação comum; não é outro modelo de dados. Mantém `TableHeader/TableBody` e as colunas atuais. O modelo TanStack v9 existente, `useTable`, `tableFeatures` e `table.FlexRender` não são substituídos nem rebaixados para v8.

O frame é dono de densidade das linhas, fonte/cor do header, gutter da primeira/última célula e rolagem do Table. Para as listas desta entrega, usar `table-fixed` e largura mínima canônica de `40rem` no frame; as fichas não usam esse limite. Preservar larguras específicas das colunas nas definições atuais. Se a tabela de contagens tiver menos colunas, seu corpo permanece legível com a mesma política de rolagem, sem esticar a página. As features ainda podem definir largura e comportamento **de coluna** onde o significado exige, mas não redefinem tipografia, cor ou espaçamento de toda a tabela.

Aplicar em RunTable, tabela de commits, lista do drawer de Commit, Worktrees e tabela de contagens da Análise. A lista de commits pode conservar seu modelo de agregação/renderização atual; esta tarefa não reescreve o agrupamento para impor uma abstração de dados.

Não adicionar uma borda arredondada duplicada quando o Card/body já delimita a superfície. Não criar uma segunda barra horizontal ao redor de um Table que já possui seu container de overflow.

### 5.6 `ProgressTree`

Recebe os nós já publicados e o status do job; não consulta API, não cria catálogo e não calcula contadores/durações.

```ts
type ProgressTreeProps = {
  nodes: readonly ProgressNode[]
  jobStatus: JobStatus | undefined
}
```

Extrair o mapa `parentId -> filhos` e a seleção de raízes do código atual. A representação continua recursiva e preserva nós de profundidade arbitrária dentro do contrato existente.

Composição orientadora de uma linha:

```tsx
<Item className="min-w-0 flex-nowrap gap-2 border-0 px-0 py-1">
  <div className="flex size-7 shrink-0 items-center justify-center">
    {hasChildren ? (
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Expandir ${node.label}`}>
          <ChevronDownIcon />
        </Button>
      </CollapsibleTrigger>
    ) : null}
  </div>
  <ItemMedia>
    <StatusIndicator descriptor={descriptor} presentation="stage" />
  </ItemMedia>
  <ItemContent className="min-w-0">
    <ItemTitle data-slot="progress-label" className="min-w-0 break-words">
      {node.label}
    </ItemTitle>
    {node.detail ? (
      <ItemDescription>
        {typeof node.detail === "string"
          ? node.detail
          : `${node.detail.completed} de ${node.detail.total}`}
      </ItemDescription>
    ) : null}
    {(node.retryCount ?? 0) > 0 ? (
      <Badge variant="outline">Flaky detectado</Badge>
    ) : null}
  </ItemContent>
  {typeof node.durationMs === "number" ? (
    <ItemActions className="shrink-0 text-sm text-muted-foreground tabular-nums">
      {formatDuration(node.durationMs)}
    </ItemActions>
  ) : null}
</Item>
```

O trecho fixa a composição e os conteúdos. Adicionar `min-h-9` ao Item e os slots de prova descritos abaixo. O indicador é exposto por um wrapper com `data-slot="progress-indicator"`. No proprietário da linha, remover o `line-clamp-1` herdado do ItemTitle quando necessário para permitir quebra do nome longo; não introduzir fonte menor como compensação.

Girar o chevron segundo `data-state` do trigger, mantendo os dois estados testáveis. Abrir/fechar não pode mudar a coluna do ícone. O clique de expansão não fica espalhado pela linha inteira.

Usar slots estáveis para as provas: `data-slot="progress-row"`, `progress-label`, `progress-indicator` e `data-node-id={node.id}`. Esses atributos nomeiam estrutura, não um catálogo permanente de todos os testes.

### 5.7 `ExecutionStages` e estados assíncronos

Extrair a faixa atual praticamente intacta, trocando apenas indicador e decisões de espaçamento pela composição compartilhada. Preservar refs, eventos, acompanhamento e índice de etapa. O componente continua específico da faixa; não forçar a árvore vertical a virar faixa por uma prop `mode` cheia de condicionais.

`async-state.tsx` continua o dono dos estados reutilizáveis. Refinar usos inconsistentes, sem introduzir provider. O vazio compacto de execução atual pode continuar `Item`, e a fila livre `Empty`, como o contrato determina; não são obrigados a compartilhar o mesmo JSX porque ambos contêm pouco texto.

---

## 6. Lint, tipos e gates: proteção proporcional

### 6.1 Tipos produzem o primeiro limite

As composições novas não estendem `HTMLAttributes` irrestritamente e não aceitam `className`, `style`, `iconSize`, `fontSize` ou `padding` livres. Passar essas props diretamente deve falhar no typecheck. Isso elimina a necessidade de um teste visual para cada ícone.

Não usar `as any` ou spread de props HTML para contornar esse limite. Slots de conteúdo não ganham autorização para redefinir a composição externa.

### 6.2 Usar regras existentes do ESLint

Aproveitar `no-restricted-imports` e `no-restricted-syntax`. **Não instalar plugin novo nem desenvolver um parser de Tailwind/ts-morph.**

Restrições:

1. Fora de `ui/src/components/ui/**`, bloquear imports diretos de `vaul`, `radix-ui` e `@radix-ui/*` para remontar primitives que já existem instalados.
2. Nas features consumidoras, bloquear `@/components/ui/drawer` e equivalentes relativos. Somente `detail-drawer.tsx` pode montar o shell; `entity-identity.tsx` pode importar `DrawerTitle`/`DrawerDescription` para a semântica. As exceções são os dois arquivos, não a pasta inteira `shared`.
3. Bloquear `data-icon` booleano no código autoral. Valores admitidos são as strings `inline-start` e `inline-end`; em icon-only, remover o atributo. Não aplicar essa migração em massa aos primitivos oficiais que não precisem de mudança.
4. Bloquear, fora dos primitivos e dos proprietários explícitos, seletores de classes que redimensionam SVG descendente. A regra deve mirar a classe/expressão JSX, não strings em documentação. A lista curta de proprietários pode conter `entity-identity`, `status-indicator` e `presentation`; não uma whitelist por tela ou por ícone.

Aplicar os blocos abaixo **além** dos presets já existentes de TypeScript/React, sem substituí-los. Paths de configuração são relativos a `ui/`. Imports estáticos e reexports têm a mesma restrição; import dinâmico não é a capacidade de `no-restricted-imports` e não deve ser usado para contornar a regra.

```js
const rawPrimitivePatterns = [
  {
    group: ["vaul", "radix-ui", "radix-ui/*", "@radix-ui/*"],
    message: "Use os componentes instalados de @/components/ui; não remonte primitivas na feature.",
  },
]
const drawerPattern = {
  group: ["**/components/ui/drawer", "**/components/ui/drawer.*"],
  message: "Use DetailDrawer; a composição dos detalhes tem um proprietário único.",
}
const iconPositionRules = [
  {
    selector: "JSXAttribute[name.name='data-icon'][value=null]",
    message: "Use inline-start/inline-end em ícone com texto; remova data-icon em icon-only.",
  },
  {
    selector: "JSXAttribute[name.name='data-icon'][value.type='Literal'][value.value!='inline-start'][value.value!='inline-end']",
    message: "data-icon aceita somente inline-start ou inline-end.",
  },
  {
    selector: "JSXAttribute[name.name='data-icon'][value.type='JSXExpressionContainer']",
    message: "A posição do ícone é declarativa: escreva o atributo literal inline-start/inline-end.",
  },
]
const descendantSvgSizeRule = {
  selector: "JSXAttribute[name.name='className'] :matches(Literal[value=/svg[^ ]*:(size|w|h|min-w|min-h|max-w|max-h)-/], TemplateElement[value.raw=/svg[^ ]*:(size|w|h|min-w|min-h|max-w|max-h)-/])",
  message: "Não redimensione SVG descendente na feature; use a apresentação do componente dono.",
}

// Acrescentar estes objetos ao array de defineConfig já existente.
const uiPolicyBlocks = [
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: rawPrimitivePatterns }],
      "no-restricted-syntax": ["error", ...iconPositionRules],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: [
      "src/features/shared/detail-drawer.tsx",
      "src/features/shared/entity-identity.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [...rawPrimitivePatterns, drawerPattern],
      }],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: [
      "src/features/shared/entity-identity.tsx",
      "src/features/shared/status-indicator.tsx",
      "src/features/shared/presentation.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...iconPositionRules, descendantSvgSizeRule],
    },
  },
]
```

Integrar `...uiPolicyBlocks` dentro do `defineConfig([...])`. As listas compartilhadas evitam que um bloco posterior apague a restrição comum ao especializar a regra. Não aplicar os exemplos isoladamente e perder as demais configurações.

A regra de SVG cobre os literais conhecidos, como `[&_svg]:size-12`, `[&>svg]:w-10`, além de templates/condicionais presentes em `className`. A composição programática de classes em outro arquivo não é análise coberta por esse seletor. Os testes de política devem confirmar a árvore AST produzida pelo parser instalado; ajustar somente a sintaxe do seletor se necessário, mantendo os casos negativos exigidos. Não instalar um parser extra nem construir análise de fluxo de CSS para fechar essa lacuna.

**Não proibir genericamente** todo `size-*`, `text-*`, valor arbitrário ou `!` do repositório. Layout responsivo, charts, colunas e a correção de seleção do Vaul têm usos legítimos. Proibir escapes identificados é diferente de impedir CSS.

### 6.3 Testar a política, não confiar na aparência do config

`tests/ui/ui-policy.test.ts` executa o ESLint realmente instalado em `ui/`, com snippets via stdin e `--stdin-filename` dentro da família testada. Não precisa de nova dependência no root.

Exemplo da chamada de teste:

```ts
const result = spawnSync(
  process.execPath,
  ["node_modules/eslint/bin/eslint.js", "--stdin", "--stdin-filename", "src/features/status/policy-case.tsx", "--format", "json"],
  { cwd: uiRoot, input: snippet, encoding: "utf8" },
)
```

Conferir o `ruleId`/mensagem pretendido, não apenas exit diferente de zero: erro de parser não prova a regra.

Casos mínimos: import de Vaul bloqueado; Drawer direto bloqueado inclusive com alias/namespace/relativo; DetailDrawer permitido; `data-icon` booleano bloqueado; inline-start/end permitidos; icon-only sem atributo permitido; seletor descendente de SVG numa feature bloqueado; exceção justificada no proprietário permitida. Nenhum teste escreve snippets temporários em `ui/src` real.

### 6.4 Corrigir o workflow existente

Criar o classificador com entrada via stdin:

```bash
#!/usr/bin/env bash
set -euo pipefail
seen=0
only_docs=1
while IFS= read -r changed_path || [ -n "$changed_path" ]; do
  [ -n "$changed_path" ] || continue
  seen=1
  case "$changed_path" in
    docs/*) ;;
    *) only_docs=0 ;;
  esac
done
if [ "$seen" -eq 1 ] && [ "$only_docs" -eq 1 ]; then
  printf 'true\n'
else
  printf 'false\n'
fi
```

No step atual que já determina `changed`:

```bash
docs_only="$(printf '%s\n' "$changed" | bash scripts/ci/classify-docs-only.sh)"
printf 'docs_only=%s\n' "$docs_only" >> "$GITHUB_OUTPUT"
```

Adicionar `dev` a `pull_request.branches`, preservando `main`. Manter o gatilho push existente em `main`; não acrescentar um segundo ciclo redundante de push em `dev` nesta tarefa. Conservar permissões read-only, concorrência, jobs e timeout atuais.

Casos do classificador, testados em `tests/ui/ci-scope.test.ts`:

| Entrada | docs_only |
|---|---|
| somente `docs/ui/PRODUCT-CONTRACT.md` | true |
| dois arquivos em `docs/` | true |
| `ui/src/features/shared/entity-identity.tsx` | false |
| docs + código | false |
| `tests/browser/ui-consistency.spec.ts` | false |
| `.context/patterns/ui-composition.yaml` ou `AGENTS.md` ou `DESIGN.md` | false |
| `.github/workflows/ci.yml` | false |
| conjunto vazio/indeterminado | false |

O classificador deve consumir toda a entrada, inclusive depois de encontrar código, para não gerar SIGPIPE no produtor. Testar também dez mil paths com uma alteração de UI e arquivo final sem newline. Não usar contagem de arquivos como heurística.

Não basta verde do job Documentation. O PR com código desta etapa deve executar **Complete check**, que já chama `npm run check`.

### 6.5 Nenhum novo sistema de CI

Os testes novos entram nos caminhos já cobertos por `test:ui` e `test:browser`. `check:ui` continua lint + build. Não adicionar um workflow, daemon, agendador, screenshot service, catálogo de pixels por componente ou score de conformidade.

---

## 7. Documentação utilizável: `.context`, `AGENTS.md` e `DESIGN.md`

### 7.1 Fontes únicas

| Documento | Responde | Não deve virar |
|---|---|---|
| `AGENTS.md` | O que ler antes de alterar; fronteiras de produto; regras gerais. | Manual completo de todos os componentes. |
| `.context/domains/manifest.yaml` | Onde está cada superfície e quais padrões consome. | Espelho de payloads/backend. |
| `.context/patterns/ui-composition.yaml` | Qual composição usar, import correto, dono e consumidores afetados. | Segunda tabela de pixels. |
| `DESIGN.md` | Hierarquia, densidade, linguagem de ações, gutters, estados e exemplos de composição. | Outra implementação CSS. |
| `PRODUCT-CONTRACT.md` | Comportamento vigente aprovado. | Histórico cronológico de screenshots. |
| `COMPOSITION-LEDGER.md` | Composição oficial escolhida e adaptação autorizada. | Outra fonte concorrente da escala. |
| Plano + evidências da etapa 1 | Execução/checklist e prova desta entrega. | Manual permanente ou aprovação humana fictícia. |

A inspiração no DietFlow é **axiomas + ponteiros + padrão + código real**. Não copiar seus componentes HeroUI, regras clínicas, deploy, dependências ou seu verificador pesado de arquitetura.

### 7.2 Conteúdo do manifest

Usar esta estrutura, ajustando somente paths efetivamente existentes ao terminar a implementação:

```yaml
version: 1
project: ci-queue
read_first:
  - AGENTS.md
  - DESIGN.md
  - docs/ui/PRODUCT-CONTRACT.md
patterns:
  ui: .context/patterns/ui-composition.yaml
system_map:
  status:
    route: "#status"
    entry: ui/src/features/status/status-page.tsx
    patterns: [ui]
    related:
      - ui/src/features/shared/run-table.tsx
      - ui/src/features/shared/job-drawer.tsx
      - ui/src/features/status/status-state-drawer.tsx
      - ui/src/features/status/green-commit-table.tsx
  worktrees:
    route: "#worktrees"
    entry: ui/src/features/worktrees/worktrees-page.tsx
    patterns: [ui]
    related:
      - ui/src/features/shared/detail-drawer.tsx
      - ui/src/features/shared/facts-table.tsx
      - ui/src/features/shared/data-table-frame.tsx
  analysis:
    route: "#analysis"
    entry: ui/src/features/analysis/analysis-page.tsx
    patterns: [ui]
    related:
      - ui/src/components/ui/chart.tsx
      - ui/src/features/shared/data-table-frame.tsx
  shell:
    entry: ui/src/App.tsx
    related:
      - ui/src/components/app-sidebar.tsx
      - ui/src/components/site-header.tsx
  data_boundary:
    entry: ui/src/lib/api.ts
    types: ui/src/lib/types.ts
    rule: "Features consomem os fatos atuais; composições visuais não fazem fetch."
```

### 7.3 Conteúdo do pattern

```yaml
pattern: ui-composition
version: 1
status: active
updated: 2026-09-15
foundation:
  registry: radix-nova
  primitives: ui/src/components/ui
  behavior: docs/ui/PRODUCT-CONTRACT.md
  visual_language: DESIGN.md
  official_compositions: docs/ui/COMPOSITION-LEDGER.md
read_when:
  - "Criar ou alterar identidade, drawer, tabela, árvore, ação ou estado visual."
  - "Modificar um primitivo consumido por mais de uma superfície."
composition:
  identity:
    source: ui/src/features/shared/entity-identity.tsx
    variants_source: ui/src/features/shared/presentation.ts
    use: "Mesma identidade com apresentações current/drawer/table; passar conteúdo, não estilo."
  drawer:
    source: ui/src/features/shared/detail-drawer.tsx
    consumers:
      - ui/src/features/shared/job-drawer.tsx
      - ui/src/features/worktrees/worktrees-page.tsx
      - ui/src/features/status/status-state-drawer.tsx
      - ui/src/features/status/green-commit-table.tsx
  facts:
    source: ui/src/features/shared/facts-table.tsx
    use: "Ficha de metadados de detalhe, sem card adicional."
  table:
    source: ui/src/features/shared/data-table-frame.tsx
    use: "Tabela de lista com placement card/body; não mudar modelo de dados."
  progress:
    tree: ui/src/features/shared/progress-tree.tsx
    strip: ui/src/features/shared/execution-stages.tsx
    indicator: ui/src/features/shared/status-indicator.tsx
  states:
    source: ui/src/features/shared/async-state.tsx
change_protocol:
  - "Localizar os consumidores do proprietário antes de editar."
  - "Alterar a composição compartilhada e migrar todos os consumidores afetados."
  - "Não corrigir a estrutura só no local mostrado no print."
  - "Verificar a família inteira no browser, incluindo estados e largura intermediária."
enforcement:
  lint: ui/eslint.config.js
  semantics: tests/ui/presentation.test.ts
  browser: tests/browser/ui-consistency.spec.ts
```

Não inventar um gate novo para cada linha do YAML. Verificar sintaxe com o Prettier já instalado em `ui/` e conferir os ponteiros no review. A prova arquitetural é que a UI usa os módulos indicados, não que um campo do YAML diz `active`.

### 7.4 Atualizar `AGENTS.md`, não recriá-lo

Preservar as fronteiras do executor, os contratos de processo e a orientação de TanStack v9. Integrar este bloco ao método de alteração de UI, removendo redundâncias com o texto atual:

> Antes de alterar UI, ler `DESIGN.md`, localizar a superfície em `.context/domains/manifest.yaml` e abrir `.context/patterns/ui-composition.yaml`. Recuperar a composição instalada e seus consumidores antes de escrever JSX. A feature passa dados e ações; o proprietário compartilhado decide geometria e apresentação. Quando uma correção pertence a uma família, verificar todos os seus consumidores nesta entrega. Tipos/lint comprovam limites mecânicos; a candidata renderizada comprova composição. Não declarar aprovação humana com base em revisão do próprio agente. Para este produto, trabalho solicitado em `dev` não autoriza promoção de `main` nem atualização da instalação.

Atualizar também a skill local para apontar a essa cadeia, sem manter uma segunda lista divergente de tamanhos. Esta autorização permite criar as composições nomeadas neste plano; não é necessário pedir aprovação de novo para cada uma.

### 7.5 Conteúdo obrigatório de `DESIGN.md`

Escrever em PT-BR com estas seções, preenchidas a partir das decisões já fixadas:

1. **Fundação:** `radix-nova`, componentes instalados, tokens semânticos e fontes existentes. Importar antes de criar.
2. **Hierarquia:** papéis current/drawer/table, dono em `presentation.ts`, nomes de variantes e justificativa; as classes/valores executáveis permanecem no código. Não duplicar uma segunda configuração numérica.
3. **Composição de identidade:** exemplos de uso e descrição do que acontece quando o texto quebra; diferença entre mídia de identidade e ícone de ação.
4. **Drawers:** shell, direita/base, dimensionamento por direção, região central rolável, seleção de texto e ações.
5. **Tabelas/fichas:** diferença entre `DataTableFrame` e `FactsTable`; placement card/body e propriedade do gutter.
6. **Progresso:** raiz/faixa versus árvore, coluna de expansão reservada, tempo somente publicado, sem percentual ou estado inventado.
7. **Ações:** tabela default/outline/ghost/link/destructive e `data-icon` inicial/final; exemplos Salvar meta, Copiar, olho e X.
8. **Estados:** loading, vazio, erro, refresh, indisponibilidade, foco, hover, teclado e redução de movimento.
9. **Alterações:** como localizar consumidores, quando um wrapper se justifica e quando usar apenas o primitivo existente.
10. **Exceções:** `handleOnly`/`select-text!`; tamanho detail do Drawer; largura de colunas; altura limitada de Chart. Cada exceção aponta seu proprietário e motivo.
11. **Prova:** comandos existentes e índice das evidências. Screenshot não é aprovação humana automática.

### 7.6 Reconciliar sem falsificar a história

Em `COMPOSITION-LEDGER.md`, a seção que chama 48/44/16 de escala vigente deve passar a apontar a substituição desta etapa. Não deixá-la ativa ao lado da nova escala. Preservar referência histórica no Git, sem reescrever quem aprovou o quê.

`PRODUCT-CONTRACT.md` ganha a propriedade comum de composição e preserva seus comportamentos. Não migrar o TSV histórico inteiro, mover suas linhas para um novo roadmap nem declarar todos os 72 IDs revalidados. O plano é só da etapa 1.

---

## 8. Plano de execução, tarefa por tarefa

Cada tarefa tem implementação, verificação e saída. Não pedir go entre tarefas já autorizadas. Se um teste falhar por causa do patch, corrigir antes de seguir. Não transformar falha conhecida da etapa em “fora do escopo” para terminar verde.

### T0 · Preparar a lane e registrar o delta local

**Arquivos:** plano de execução; nenhum arquivo de produto nesta tarefa.

- [x] Confirmar `pwd`, remoto, branch, alterações locais e worktrees. Não executar `reset --hard`, limpeza ou stash automático de trabalho alheio.
- [x] Ler o `AGENTS.md` existente, skill local, contrato e ledger atuais; comparar a revisão local com a auditada.
- [x] Registrar diferenças que alterem algum achado UI-01…UI-12. Uma correção já presente é preservada, não reaplicada por substituição textual.
- [x] Confirmar branches remotas. Usar `origin/dev` existente; se continuar ausente, criá-la a partir do `origin/main` verificado.
- [x] Criar worktree isolada para `codex/ui-consistency-phase1`; não codar diretamente em `main` ou `dev`.
- [x] Instalar dependências pelos lockfiles na lane, sem upgrade.
- [x] Copiar este plano para seu destino, mantendo uma única checklist de execução.

Comandos de reconhecimento:

```bash
pwd
git remote -v
git status --short --branch
git worktree list --porcelain
git fetch origin
git ls-remote --heads origin main dev
git log --oneline -5
```

Se `dev` não existir e o worktree principal estiver preservado, `git push origin origin/main:refs/heads/dev` cria apenas a referência solicitada. Em seguida fazer fetch e criar a lane de `origin/dev`. Se outra operação criar `dev` no intervalo, reutilizar a referência real após fetch; nunca forçar a referência.

Na criação inicial, depois de confirmar `origin/dev`:

```bash
git fetch origin
lane_path="../ci-queue-ui-consistency-phase1"
# Executar só se a branch e o destino ainda não existirem.
(
  set -e
  test ! -e "$lane_path"
  if git show-ref --verify --quiet refs/heads/codex/ui-consistency-phase1; then
    printf 'A branch já existe; confira a worktree antes de retomar.\n' >&2
    exit 1
  fi
  git worktree add -b codex/ui-consistency-phase1 "$lane_path" origin/dev
  cd "$lane_path"
  npm ci
  npm --prefix ui ci
)
# Depois do sucesso, passar o cwd da ferramenta para a lane criada.
```

Se a lane já existir, verificar seu vínculo com esta entrega e retomá-la sem sobrescrever. Cada comando de criação deve ter sua pré-condição conferida; não colar o bloco numa sessão que ignore falhas de `test`. Não copiar `node_modules` de outra árvore.

**Saída:** lane isolada, base identificada e delta local documentado. Nenhum serviço reiniciado.

### T1 · Capturar baseline e escrever as regressões da família

**Arquivos:** `tests/browser/fixtures/ui-consistency.ts`, `tests/browser/ui-consistency.spec.ts`, `tests/ui/presentation.test.ts`, evidência inicial.

- [x] Reutilizar o padrão de `page.route('**/api/**')` dos testes atuais; criar fixtures determinísticas descritas em 9.1.
- [x] Fotografar a candidata inicial nas superfícies do review, sem alterar o state root real.
- [x] Escrever testes inicialmente vermelhos para alinhamento entre irmãos, família de drawers e breakpoint intermediário.
- [x] Anotar quais testes reproduzem falha atual e quais são coberturas novas sem falha prévia. Não forçar um teste a falhar artificialmente.
- [x] Conferir que os testes verificam a causa desejada, não somente a existência de um componente.

```bash
npm run test:browser -- tests/browser/ui-consistency.spec.ts
npx vitest run tests/ui/presentation.test.ts
```

Não interpretar uma suíte não encontrada como teste verde.

**Saída:** reprodução objetiva antes da alteração e fixtures sem dependência da máquina real.

### T2 · Centralizar apresentação e identidade

**Arquivos:** `presentation.ts`, `status-indicator.tsx`, `entity-identity.tsx`; imports de `run-table.tsx`, `status-page.tsx`, `job-drawer.tsx` e tabela de commits.

- [x] Implementar descritores e escala da seção 4, reutilizando as cores existentes.
- [x] Implementar `StatusIndicator` e `EntityIdentity` com as APIs fechadas.
- [x] Remover as implementações duplicadas de `JobStatusIcon`, `StageGlyph` e `stageIcon` dos consumidores migrados.
- [x] Migrar identidade atual, identidade do drawer e células de tabela, sem alterar colunas nem conteúdo temporal.
- [x] Preservar `JobTimeline` e seu relógio, apenas mudando a tipografia do proprietário externo.
- [x] Executar testes de representação e typecheck/build da UI. Conferir visualmente a escala sem mexer em cada call site.

```bash
npx vitest run tests/ui/presentation.test.ts
npm --prefix ui run lint
npm --prefix ui run build
```

**Saída:** nenhuma tabela é dona do indicador global; identidade não é mais montada com três conjuntos independentes de estilo.

### T3 · Migrar os cinco drawers e as fichas

**Arquivos:** `components/ui/drawer.tsx`, `detail-drawer.tsx`, `facts-table.tsx`, quatro arquivos consumidores de drawers.

- [x] Implementar tamanho `detail` no primitivo e o shell compartilhado; manter default e exceções de seleção.
- [x] Implementar header/body/tabs/footer; aplicar dimensionamento pela direção e alinhamento à esquerda.
- [x] Migrar Execução e Worktree, inclusive fichas e footers.
- [x] Migrar Meta e Pendências sem alterar formulário, mutações, confirmação ou read-only.
- [x] Migrar Commit, incluindo sua ficha, abrindo execução local pelo caminho atual.
- [x] Preservar a propriedade de scroll do Log e sua seleção nativa; não introduzir wrapper que quebre altura/flex.
- [x] Remover dimensões, paddings estruturais e headers antigos dos consumidores. Não manter o componente antigo como alternativa de uso.
- [x] Executar testes de família, largura intermediária, scroll fixo, foco, Meta e seleção de texto.

```bash
npm run test:browser -- tests/browser/ui-consistency.spec.ts
npm run test:browser -- tests/browser/dashboard.spec.ts
```

**Saída:** os cinco drawers usam o mesmo shell. Uma alteração de header se propaga sem procurar cinco JSXs independentes.

### T4 · Corrigir árvore e faixa de etapas

**Arquivos:** `progress-tree.tsx`, `execution-stages.tsx`, `job-drawer.tsx`, `status-page.tsx`.

- [x] Extrair a árvore e implementar a coluna de expansão reservada, com conectores e indentação únicos.
- [x] Preservar os três níveis das fixtures atuais e testar mais um nível; não achatar nós.
- [x] Preservar detalhe/contadores, retry, duração disponível e identificação de término incompleto.
- [x] Extrair faixa atual e trocar somente seus indicadores e decisões de espaço. Manter follow/pause.
- [x] Testar todos os irmãos alinhados, folhas sem botões falsos, nomes longos, duração disponível/ausente e cancelamento terminal.
- [x] Conferir faixa real no Card, em 1600 e 390 px, sem invadir gutter e sem overflow da página.

**Saída:** Static/Jest/Artefatos obedecem à mesma linha; a faixa não fica visualmente desconectada da árvore.

### T5 · Normalizar tabelas, ações e estados dos consumidores

**Arquivos:** `data-table-frame.tsx`, `run-table.tsx`, `green-commit-table.tsx`, `worktrees-page.tsx`, `analysis-page.tsx`, `async-state.tsx`.

- [x] Implementar placements card/body, migrar tabelas de listas e remover bordas/gutters duplicados.
- [x] Preservar larguras/semântica de coluna, dados, busca, seleção, cursor e agrupamento. Não trocar o modelo TanStack.
- [x] Corrigir botões de texto e ícones de ação para usar o tamanho/variante nativos; migrar `data-icon` conforme a posição real.
- [x] Revisar vazio/loading/erro nas três páginas e nos drawers; reutilizar a família existente sem expandir uma faixa compacta em card gigante.
- [x] Inspecionar Resultados e Duração após o frame de tabela compartilhado, sem alterar cálculo, série, filtro ou comportamento.
- [x] Verificar título/olho versus linha inerte, menus e checkboxes. Nenhum campo ganha ação nova por causa do wrapper.

**Saída:** toda tabela da família respeita seu gutter; botões e estados não recebem personalizações independentes sem necessidade.

### T6 · Aplicar lint e corrigir o gate que pode pular a UI

**Arquivos:** `ui/eslint.config.js`, `tests/ui/ui-policy.test.ts`, `scripts/ci/classify-docs-only.sh`, `tests/ui/ci-scope.test.ts`, `.github/workflows/ci.yml`.

- [x] Escrever casos positivos/negativos da política e do classificador.
- [x] Aplicar as restrições da seção 6, verificando o flat config efetivo e as exceções restritas.
- [x] Corrigir todos os consumidores que a política sinalizar; não adicionar suppressions para manter duplicatas da refatoração.
- [x] Corrigir classificação docs-only e aceitar PRs para `dev` no workflow existente.
- [x] Executar os testes novos, lint e check da UI. Confirmar no diff que não surgiu outro workflow/job/matriz.

```bash
npx vitest run tests/ui/ui-policy.test.ts tests/ui/ci-scope.test.ts
npm run check:ui
```

**Saída:** proteção mecânica funcional e check completo realmente executável para o PR de UI.

### T7 · Fechar os mapas e a documentação canônica

**Arquivos:** dois YAMLs `.context`, `AGENTS.md`, skill local, `DESIGN.md`, `PRODUCT-CONTRACT.md`, `COMPOSITION-LEDGER.md`.

- [x] Escrever os documentos da seção 7 com os imports/exports finais, não nomes planejados que ficaram órfãos.
- [x] Marcar a escala anterior como substituída; não contradizer os comportamentos mais recentes.
- [x] Validar sintaxe e formatação dos YAMLs com o Prettier instalado.
- [x] Abrir todos os paths locais apontados pelo manifest/pattern e confirmar os consumidores com busca no código.
- [x] Conferir que documentação não está obrigando importar dados/implementação do DietFlow.
- [x] Conferir que o TSV histórico não foi reescrito como prova de tudo que ainda não foi auditado.

```bash
(cd ui && npm exec prettier -- --check ../.context/domains/manifest.yaml ../.context/patterns/ui-composition.yaml)
git diff --check
rg -n 'DetailDrawer|EntityIdentity|StatusIndicator|DataTableFrame|FactsTable' ui/src/features
```

**Saída:** o próximo agente encontra o proprietário correto sem depender da memória do chat.

### T8 · Verificar a candidata completa, corrigir e abrir o PR draft

**Arquivos:** evidências, screenshots curados, documentação de execução e quaisquer fixes necessários da etapa.

- [x] Terminar todas as migrações antes da inspeção final. Não somar screenshots antigos de componentes testados separadamente e chamar isso de revisão integrada.
- [x] Executar a matriz da seção 9 e abrir as imagens geradas. Corrigir cada desvio desta etapa encontrado no review interno.
- [x] Executar `npm run check` da candidata final, incluindo core/backend/release/install já existentes. Esses testes são regressão, não autorização para mexer nesses subsistemas.
- [x] Servir o bundle compilado em preview separado e inspecionar a aplicação com API instalada em leitura, identificando revisão/URL. Não apontar o serviço instalado para a worktree.
- [x] Criar/atualizar o índice de evidências com capturas da candidata final, resultados dos testes e limitações reais.
- [x] Fazer review do diff: sem backend/receita/polling, sem estilo autoral duplicado, sem lints relaxados, sem dependência nova de runtime.
- [x] Publicar a branch e abrir PR **draft** contra `dev`; não fazer merge.
- [x] Confirmar no GitHub a base, o HEAD, o estado draft e a execução do job Complete check.
- [x] Informar a Marco: implementação e revisão interna concluídas, aguardando seu review; incluir o pacote da seção 11.

**Saída:** PR draft revisável, sem pendência conhecida da etapa 1 escondida como “polimento futuro”.

### T9 · Após review de Marco: fixes finais e merge em `dev`

Executar esta tarefa **somente depois** do review. Incluir todos os comentários num lote de correção, sem reabrir redesign global.

- [ ] Aplicar os fixes solicitados, se houver, no mesmo PR.
- [ ] Reexecutar os testes afetados e recapturar as superfícies alteradas; se o dono compartilhado mudar, conferir todos os seus consumidores.
- [ ] Executar o check completo no HEAD final e atualizar a evidência. Não reaproveitar o verde de outro SHA.
- [ ] Obter autorização explícita para merge da candidata final; só então tornar o PR ready.
- [ ] Confirmar base `dev`, HEAD autorizado, check completo verde e ausência de mudanças adicionais.
- [ ] Fazer merge para `dev` sem force push. Verificar PR `merged` e inclusão das mudanças no remoto.
- [ ] Registrar merge SHA, PR, HEAD aprovado e a declaração de que `main`/instalação não foram alterados.
- [ ] Não apagar automaticamente worktree/branch e não iniciar etapa 2.

Comandos de confirmação, usando o número real do PR criado:

```bash
gh pr view --json number,url,isDraft,baseRefName,headRefOid,state
gh pr checks
```

Para merge, usar o método já permitido pelo repositório e a opção de vincular ao HEAD aprovado quando disponível, como `--match-head-commit`. Não inventar resultado ou substituí-lo por “o push terminou”.

---

## 9. Verificação visual e funcional do conjunto

### 9.1 Fixtures determinísticas

Construir as fixtures sobre o contrato real da API nos testes existentes; não introduzir dados fictícios no bundle de produto.

Cenários obrigatórios:

| Cenário | Dados necessários |
|---|---|
| Atual vivo | Job running, data fixa, branch longa, assunto, doze raízes na faixa para provar scroll. |
| Histórico terminal | Passed/failed/cancelled/interrupted; SHA 40/64 caracteres; registro sem duração; cancelado antes do início. |
| Árvore | Static com Gates e filhos, Jest e Artefatos como irmãos; pelo menos quatro níveis num ramo; labels longos; contadores e retry. |
| Término incompleto | Job terminal, alguns nós ainda pending/running e outros já passed. |
| Worktrees | Duas ou mais linhas, limpa/suja, caminho longo, tamanho disponível/medindo/erro com último valor. |
| Meta | Ausente; existente longa; edição; requisito inexistente; erro de salvar; remoção com confirmação. |
| Pendências | Vazia e preenchida com motivo longo, PR e tentativa posterior. |
| Commit | Múltiplas execuções; mistura de ticket local e resumo somente Git; branches longas. |
| Log | Texto longo, seguir/pausar, seleção de texto, cursor e terminal; diagnóstico como Popover. |
| Análise | Resultados com vários presets e Duração com pontos/ausência; não alterar cálculos. |

Usar relógio/data e timezone fixos nos testes de prova. A chave de tema real é `ci-queue-theme`. Os testes funcionais de animação/follow não devem ser neutralizados para facilitar screenshots.

Para capturas estáticas, esperar fonte carregada e estabilização da UI. É permitido desabilitar animações **na captura**, sem remover feedback/estados do produto. Não mascarar justamente header, ícone, padding ou área cuja consistência está sendo avaliada.

### 9.2 Poucos testes sistêmicos, não testes por SVG

Adicionar estes grupos em `ui-consistency.spec.ts`:

1. **Família de drawers:** os cinco abrem com shell comum, header à esquerda, descrição, X, foco, gutters e corpo contido. Comparar a geometria dos headers de Execução/Worktree, que têm mídia, e os sem mídia entre si.
2. **Breakpoint e overflow:** 639/640/700/767/768 px; mesma direção implica a mesma política de tamanho. Redimensionar com drawer aberto. A página não cresce horizontalmente.
3. **Árvore:** irmãos compartilham x de indicador e label; expanders reais alteram `data-state`; folhas não recebem botão; conectores não alteram a coluna; não há spinner vivo em registro terminal.
4. **Superfícies e ações:** gutters de tabela/card, fichas longas, current/tabela/drawer, nomes acessíveis, triggers e linhas inertes; preservação dos estados assíncronos.

A maioria das dimensões deve ser verificada **por relação ou token computado**, não por cópia de número em cada assert. Exemplo: comparação entre dois headers que usam a mesma variante; conteúdo dentro do body; tabela alinhada ao header; current maior que drawer e drawer maior que tabela. A escala executável fica no componente.

Exemplo de prova da linha, com slots estáveis da seção 5.6:

```ts
const staticLabel = drawer.locator('[data-slot="progress-row"][data-node-id="static"] [data-slot="progress-label"]')
const jestLabel = drawer.locator('[data-slot="progress-row"][data-node-id="jest"] [data-slot="progress-label"]')
// Os IDs static/jest são da fixture, não catálogo do frontend.
const staticBounds = await staticLabel.boundingBox()
const jestBounds = await jestLabel.boundingBox()
expect(staticBounds).not.toBeNull()
expect(jestBounds).not.toBeNull()
expect(Math.abs(staticBounds!.x - jestBounds!.x)).toBeLessThanOrEqual(1)
```

Se houver nomes repetidos nos filhos, usar `data-node-id` em vez de fazer `.first()` esconder a ambiguidade. O teste deve atingir os irmãos definidos na fixture.

Não usar `waitForTimeout` para decidir que um layout carregou; aguardar o conteúdo/estado esperado. Testes de fronteira temporal já existentes podem conservar esperas cuja ausência de novos requests é o objeto da prova.

### 9.3 Matriz de inspeção visual

| Superfície | 1440 px claro/escuro | 390 px claro/escuro | Complemento |
|---|---|---|---|
| Status com execução atual, fila e histórico | Obrigatório | Obrigatório | Faixa de 12 etapas em 1600 px; follow/manual. |
| Status vazio e histórico filtrado vazio | Obrigatório | Obrigatório | Erro local sem vazio falso. |
| Drawer Execução / Progresso | Obrigatório | Obrigatório | Árvore aberta e colapsada; 700 px. |
| Drawer Execução / Log + Diagnóstico | Obrigatório | Obrigatório | Log longo; header/tabs/footer estáveis; seleção. |
| Worktrees / seleção / Copiar | Obrigatório | Obrigatório | Checkbox não abre drawer; último tamanho permanece. |
| Drawer Worktree | Obrigatório | Obrigatório | Comparação direta com Execução; 700 px. |
| Meta: leitura e edição | Obrigatório | Obrigatório | Erro preserva rascunho; confirmação e foco. |
| Pendências | Obrigatório | Obrigatório | Motivo longo; read-only. |
| Commit | Obrigatório | Obrigatório | Ficha + lista; abrir ticket real, não inventar log Git. |
| Análise Resultados/Duração | Obrigatório | Obrigatório | Filtros abertos e tabela de contagens. |

Também verificar 820 px como largura intermediária habitual e tema Sistema com preferência claro/escuro. A inspeção completa pode ocorrer em poucos testes parametrizados; não criar um job de CI por cenário.

### 9.4 O que o executor deve olhar, além dos asserts

Abrir os screenshots e navegar na candidata final. Conferir:

- Hierarquia sem ícone desproporcional, subtítulo esmagado ou lista de etapas com densidade diferente da ficha.
- Mesma função visual com mesma composição entre superfícies; diferenças legítimas de current/drawer/table identificáveis.
- Alinhamento de mídia, título, descrição, ações e conteúdo; nenhum ajuste é compensação de outra margem.
- Longos nomes/caminhos/SHAs, badge que quebra, zoom de 200%, foco e teclado sem esconder a ação necessária.
- Inputs, buttons, Popover/Select/Dropdown e Empty reconhecíveis como a família instalada, sem cores ou bordas improvisadas.
- Alterações compartilhadas não degradaram Worktrees, Meta, Pendências, Commit e Análise enquanto o foco estava no JobDrawer.

Uma screenshot é evidência de uma superfície e revisão. Não é um teste automático de beleza. Não atualizar snapshots cegamente para aceitar o que o código produziu. Esta entrega não exige baselines pixel-perfect de todos os cenários; geometry/behavior mais inspeção integrada são a proteção escolhida.

---

## 10. Comandos e prova da candidata

### 10.1 Verificação local

```bash
npm --prefix ui run lint
npm --prefix ui run build
npm run test:ui
npm run test:browser
npm run check
git diff --check
```

Usar testes focais durante a implementação; não repetir `npm run check` completo após cada ajuste de 4 px. O check completo é obrigatório no fechamento da candidata.

O Playwright atual usa servidor isolado em `127.0.0.1:5191` e `workers: 1`. Não reaproveitar o browser da instalação como fixture, não matar outro processo que esteja na porta e não mexer na quantidade de workers do executor.

Para prova do build, usar preview Vite de `ui/dist` numa porta livre separada. A configuração auditada em `ui/vite.config.ts` já lê **`CI_QUEUE_API_ORIGIN`** e seu fallback é `127.0.0.1:8876`, não a instalação histórica `8765`. `preview.proxy` herda `server.proxy`; portanto, não é necessário criar outra bridge ou editar o serviço.

Depois de confirmar que `8765` continua sendo a API instalada e que `5192` está livre:

```bash
CI_QUEUE_API_ORIGIN=http://127.0.0.1:8765 \
  npm --prefix ui run preview -- --host 127.0.0.1 --port 5192 --strictPort
```

O processo serve apenas a candidata compilada; não faz cutover. Conferir no navegador a resposta a `/api/status` pela prévia e a aplicação renderizada. Porta ocupada exige outra porta livre e URL registrada, nunca encerrar um serviço desconhecido. Provar formulários, ações nativas e erros mutáveis por fixtures isoladas, não alterando a Meta ou abrindo pastas reais para tirar screenshot. Nenhum afrouxamento de Origin/CSRF é autorizado para o preview. Mostrar a URL real no PR.

### 10.2 O que salvar

Em `docs/ui/evidence/etapa-1/README.md`:

- revisão base auditada, revisão local de partida, branch e HEAD do código capturado;
- versões usadas pelos lockfiles e ambiente da captura, viewport e tema;
- tabela UI-01…UI-12 com arquivo corrigido, teste/captura e resultado;
- links para screenshots curados da família final, não somente para logs do runner;
- comandos executados, resultados e identificação de qualquer falha anterior ao patch;
- comparação antes/depois dos headers de Execução/Worktree, árvore e alinhamento da tabela;
- conclusão da revisão interna, lacunas reais e campo separado **Review de Marco: aguardando**.

Não registrar tokens, caminhos pessoais, logs reais completos ou dados privados nas imagens versionadas. Usar fixtures sintéticas para as provas compartilhadas. A inspeção read-only com dados reais confirma integração e pode ser descrita sem publicar aqueles dados.

Se as evidências gerarem um commit posterior ao código capturado, registrar os dois SHAs e provar que o diff intermediário é somente documental. Rodar o check final no HEAD do PR. Não declarar que uma captura pertence a um SHA ainda inexistente.

---

## 11. Formato da entrega ao encerrar T8

O relato ao Marco deve conter, nesta ordem:

1. **PR draft:** URL, base `dev`, branch e HEAD.
2. **Implementado:** correções de UI-01…UI-12 e composições realmente consumidas.
3. **Verificado:** comandos, resultados, job Complete check e link do índice visual.
4. **Para olhar:** comparação dos cinco drawers, current/tabela e árvore; URL do preview identificado.
5. **Limite:** “Implementação e revisão interna da etapa 1 concluídas. Aguardando seu review. Sem merge, release, instalação ou trabalho da etapa 2.”

Não pedir que Marco faça o inventário que o executor deveria ter feito. Não afirmar “100% consistente” com base apenas em lint/build. Não declarar que a instalação foi atualizada quando só existe preview.

Após T9, acrescentar PR merged, SHA do merge e confirmação de `dev`. A etapa só termina como **entregue em dev** depois disso.

---

## 12. Aceite rastreável

| Obrigação | Implementação | Verificação |
|---|---|---|
| Mesma família de identidade | T2 | Descritores + comparação current/drawer/tabela. |
| Cinco drawers, não apenas o print | T3 | Matriz de família, foco, seleção e scroll. |
| Proporção compacta e coerente | T2–T5 | Inspeção integrada dos temas/larguras. |
| Coluna estável de expansão | T4 | Coordenadas entre irmãos + interação. |
| Padding de tabela/card coerente | T5 | Gutter computado e ausência de overflow. |
| Fichas técnicas legíveis | T3 | SHA/caminho longo em desktop/mobile. |
| Botões e ícones obedecem ao sistema | T2/T5/T6 | Variantes nativas, política de lint e teclado. |
| Falta de duração não inventada | T4 | Fixture com/sem `durationMs`; nenhuma mudança de backend. |
| Proteção sem sistema paralelo | T6 | ESLint/tipos e Playwright existentes; nenhum novo workflow. |
| Gate realmente testa código | T6 | Classificador e job Complete check do PR. |
| Contexto permanente útil | T7 | Mapa, DESIGN e AGENTS apontam para código usado. |
| Sem regressões de comportamento | T3–T8 | Suíte antiga preservada + matriz de estados. |
| Review humano antes de integrar | T8/T9 | PR draft, sem auto-merge, autorização para HEAD final. |
| Entrega em dev sem promoção indevida | T0/T9 | Base correta, PR merged e remoto verificados. |

---

## 13. Tratamento de obstáculos sem abandonar o resultado

**Código local mudou:** conferir o delta contra as âncoras e preservar o comportamento posterior. Atualizar os paths do plano se um componente foi movido. Não usar isso como motivo para redesenhar o sistema ou ignorar a obrigação.

**Mudança compartilhada afeta outra página:** corrigir o consumidor dentro desta etapa e repetir sua prova. Não criar uma exceção local para manter a aparência anterior sem justificar diferença semântica.

**Teste antigo depende do markup duplicado:** atualizar o seletor para o comportamento/slot real, preservando o assert. Não remover a prova de texto selecionável, chevron, linha inerte ou estado terminal.

**Teste de core/backend falha sem relação com o patch:** documentar reprodução em revisão/base comparável e preservar a falha. Não mexer no motor por iniciativa própria. T8 não pode afirmar check completo verde; apresentar o bloqueio real com evidência.

**Falta de ferramenta de browser local:** testes automatizados sem inspeção renderizada não substituem a prova visual. Usar a ferramenta disponível do executor para abrir o browser ou as imagens; se isso realmente não estiver acessível, declarar a limitação em vez de fabricar aprovação.

**Nova decisão de produto necessária:** só interromper se resolver o problema exigir sair das escolhas deste plano, alterar dados/ações ou mexer numa área excluída. Correção de um bug introduzido pela própria implementação não é nova decisão.

---

## 14. Checklist de fechamento do executor

- [x] Todos os UI-01…UI-12 têm desfecho comprovado, sem confundir histórico com estado atual.
- [x] Nenhum dos cinco drawers ficou na composição anterior.
- [x] Identidade completa é compartilhada; seus consumidores não escolhem dimensões internas.
- [x] Árvore não desloca folhas; chevrons são funcionais; estados/tempos preservados.
- [x] A tabela não atravessa o gutter por decisão local despercebida.
- [x] Bottom e right não misturam breakpoints.
- [x] Tipos/lints testados e sem suppressions que escondam o patch.
- [x] Workflow não pula o check de código; PR contra dev coberto.
- [x] `.context`, AGENTS, DESIGN e docs canônicas não se contradizem.
- [x] Prova visual feita depois da integração de todas as mudanças, em temas e larguras.
- [x] Testes da candidata final e screenshots têm revisão identificável.
- [x] PR draft aberto, HEAD informado, review humano ainda distinguido da revisão interna.
- [x] Nenhuma alteração de backend, DietFlow, release, instalação ou etapa 2.
- [ ] Após autorização, merge em dev confirmado; main permanece fora desta entrega.

---

## 15. Fontes da revisão e limites

### Código do CI Queue

As âncoras abaixo foram lidas na revisão `20de7eb5faa73c31b1cf721ccfb3880248d8f649` ou na revisão `23eab9c`, cujo código é idêntico no comparativo observado:

- `AGENTS.md`; `docs/ui/PRODUCT-CONTRACT.md`; `docs/ui/COMPOSITION-LEDGER.md`.
- `ui/src/components/ui/drawer.tsx`, `item.tsx`, `button.tsx`, `card.tsx`.
- `ui/src/features/shared/run-table.tsx`, `job-drawer.tsx`, `status-color.ts`, `live-time.tsx`, `async-state.tsx`.
- `ui/src/features/status/status-page.tsx`, `status-state-drawer.tsx`, `green-commit-table.tsx`.
- `ui/src/features/worktrees/worktrees-page.tsx`.
- `ui/src/hooks/use-mobile.ts`, `ui/src/App.tsx`, `ui/src/main.tsx`, `ui/vite.config.ts`.
- `ui/eslint.config.js`, `package.json`, `ui/package.json`, `playwright.config.ts`, `tests/browser/dashboard.spec.ts`, `.github/workflows/ci.yml`.
- A árvore publicada de `ui/src/features` foi consultada para confirmar as superfícies existentes. Arquivos indicados apenas como consumidores de apresentação, como Análise, devem ser lidos integralmente pelo executor antes de modificados; não há aqui alegação de revisão linha a linha de toda a aplicação.

### Materiais fornecidos

`LAYOUT-DECRETADO.md` conserva a precedência da correção mais recente de Marco e o uso de composições oficiais. `STATUS-VERDADE.md` e o README de evidências registram o fechamento anterior, não aprovam esta candidata. `HANDBOOK-LAYOUT-CONTINUACAO.md` é explicitamente histórico. `martelo-do-marco.md` não prevalece sobre decisões posteriores como Abrir pasta, linha inerte e a configuração atual da Análise.

### Referência do DietFlow

Foram consultados `AGENTS.md` e `.context/patterns/modal.yaml` para recuperar o método de axiomas, ponteiros, padrões, fontes e consumidores. O plano adapta o método de documentação, não a implementação HeroUI nem sua infraestrutura de gates.

### Documentação oficial usada como referência técnica

- shadcn: Button, Item, Drawer e Table, em `ui.shadcn.com/docs/components/radix/`.
- ESLint: `no-restricted-imports` e `no-restricted-syntax`, em `eslint.org/docs/latest/rules/`.
- Playwright: Visual comparisons, em `playwright.dev/docs/test-snapshots`.
- Vite: Preview Options, em `vite.dev/config/preview-options`, especificamente herança de `preview.proxy`.

A documentação pública não substitui a versão instalada nem autoriza copiar outro estilo de registry. As classes de escala propostas neste plano são decisões desta etapa, não defaults oficiais.

**Limite factual:** esta revisão não executou o navegador nem os testes no Mac de Marco. A verificação pós-implementação descrita é trabalho obrigatório do executor local e deve produzir evidência real antes de declarar a implementação pronta para o review.

## Registro de execução

- T0: principal limpa em `20de7eb5faa73c31b1cf721ccfb3880248d8f649`, igual à auditoria. `origin/dev` criada sem force a partir de `origin/main` nesse SHA. Lane `codex/ui-consistency-phase1` em worktree própria; dependências instaladas por ambos os lockfiles, sem upgrade. Nenhum serviço alterado.
- T1 em execução: baseline isolada antes de trocar consumidores. Novos proprietários não importados não alteram a captura inicial.

### Integração e revisão interna — 15/09/2026

- T1: baseline sintética sobre `20de7eb5`, com quatro capturas Execução/Worktree
  em 700/1440 px. Falhas reproduzidas: irmãos da árvore com diferença de 32 px,
  bottom de 576 px em viewport de 700 px, alinhamento do header Worktree e
  caminho cortado. A matriz adicional cobre estados sem pressupor defeito anterior.
- T2–T5 implementados nos proprietários comuns; inspeção final em curso.
- Revisão interna corrigiu padding vertical das fichas, wrapping do título
  current e semântica acessível do indicador de estado.
- O teste existente de follow avançava 6 s contra polling de 10 s já presente
  na base. Corrigido somente o teste, com confirmação da etapa recebida antes
  de verificar scroll automático/manual; produção e relógios preservados.
- T6: lint e 41 testes de UI passaram, incluindo classificador e política.
- T7: YAMLs válidos/formatação conferida pelo Prettier instalado; 41 ponteiros
  locais conferidos, todos existentes. TSV histórico não alterado.
- T8 permanece aberto até capturas finais inspecionadas, check completo e
  confirmação do Complete check no PR draft. T9 não autorizado.

### Revisão integrada final

Código e capturas em `6eab3d67f2479ba898e2346d84df24522cd8167a`; check completo verde e inspeção das cinco famílias concluída. Índice: [evidências](../../ui/evidence/etapa-1/README.md). Pendências recebeu badge abaixo do contexto após revisão mobile. PR draft [#5](https://github.com/nmarcofernandess/ci-queue/pull/5) aberto contra dev. Complete check iniciou (run 35001688609); o fechamento exige sucesso também no HEAD final. T9 permanece não autorizado. A entrega do pacote de review conclui T8; o review humano permanece aguardando.
