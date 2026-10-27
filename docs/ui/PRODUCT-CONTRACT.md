# Contrato de produto da interface

Esta é a fonte atual do comportamento aprovado da interface do CI Queue. O histórico das decisões permanece no Git; implementações rejeitadas e protótipos antigos não são contrato.

## Método de composição

A interface parte do Dashboard 01 oficial do shadcn no estilo `radix-nova`. Cada superfície deve recuperar uma composição oficial, selecionar a mais próxima e adaptar somente os dados e comportamentos do CI Queue. O mapa técnico está em `COMPOSITION-LEDGER.md`.

Primitivos isolados não bastam para declarar uma superfície como shadcn. Shell, tokens, tipografia, ícones, tabela, gráfico, menu, seleção, foco, hover, responsividade, vazio e erro devem permanecer coerentes com as composições oficiais selecionadas.

## Shell

- `SidebarProvider`, `Sidebar variant="inset" collapsible="offcanvas"`, `SidebarInset` e header vêm do Dashboard 01.
- O `SidebarTrigger` fica no header ao lado da marca. O seletor global de
  projeto fica à direita do mesmo header; ele não mora nas tabs do Histórico
  nem no rodapé. O seletor é um **filtro**: um projeto, **Todos os projetos**
  (acima da lista) ou **Histórico sem projeto**. `projectId=all` nunca significa
  Todos. Trocar o filtro não muda o job vivo da máquina.
- Navegação: Status, Worktrees e Análise.
- O rodapé da sidebar é o menu **Ambiente local**: estado da Bridge
  (`/health`, 10s) e as três escolhas de tema. Não há avatar, usuário, logout
  ou atalho desabilitado para GitHub.
- Não existe ação Recolher no rodapé nem divisória CSS improvisada entre sidebar e conteúdo.

## Status

A página não repete um título grande “Status” no corpo. A composição revisada
em 15/09/2026 foi aprovada por Marco em `8adb6f4` e permanece a composição de referência: Execução atual vazia e Fila
livre ocupam faixas compactas sem títulos redundantes, instruções ou cabeçalho
de tabela vazia. Execução ativa e Fila preenchida mantêm identificação própria.
O histórico usa `CardHeader` com modo, busca e filtros; “Execuções / Últimos
verdes” identifica a superfície sem repetir “Histórico”. A busca usa placeholder
curto e nome acessível com os campos pesquisáveis. Período, Resultado e Origem
usam `FilterSelect` direto; agrupamento só aparece em Últimos verdes. Os headers da
tabela usam texto secundário sem faixa de fundo. Não há card dentro de card.

Os indicadores usam cores semânticas consistentes em tabelas, etapas e drawers:
passou em verde (`success`), falhou em vermelho (`destructive`), rodando normal
em neutro (`muted-foreground`), retry em andamento em âmbar (`warning`) e
execução ainda ativa com falha no progresso em vermelho. Falha prevalece sobre
retry; no terminal prevalece a cor do resultado e o tooltip do mesmo indicador
registra **Flaky detectado** quando houve retry. Interrompido permanece em
âmbar; cancelado e aguardando em neutro. Ícone e rótulo continuam identificando o estado
independentemente da cor. Os tokens têm valores próprios para claro e escuro.

A página tem uma faixa de execução atual acima de um grid com coluna principal fluida e coluna direita finita.

### Execução atual

- A região permanece visível em qualquer filtro, inclusive Todos e sem projeto;
  vazia usa `Item` compacto com **Nenhuma execução em andamento** somente quando
  a máquina não tem `running`.
- Quando há ticket `running`, a identidade mostra preset, chip `Badge outline`
  com o nome do projeto dono, `branch · sha` (sem prefixo `branch:`) e o
  assunto do commit. As etapas vêm abaixo. Tempo decorrido e olho ficam no fim
  do `CardContent`: `Item` + `ItemContent` + `ItemActions`, número grande
  tabular (`Xm Ys`), rótulo `decorrido` e ` · média …` só quando o snapshot
  publica `durationReference.meanMs`. Sem amostra, a média some.
- Preset e o olho compartilhado (`InspectButton`, aria-label **Inspecionar**)
  abrem o drawer do ticket. O olho da execução atual existe só no `ItemActions`
  do bloco de tempo. Abrir o drawer **não** troca o seletor.
- Existe um único indicador de estado, no início da identidade.
- Job pausado: o indicador mostra **Pausado** em âmbar (`warning`), sem animação,
  com o motivo no tooltip; o número para no instante da pausa, descontadas as
  janelas anteriores, e o rótulo vira `pausado · …motivo`. A interface só observa:
  pausar e retomar são comandos da CLI, sem botão.
- As etapas formam uma faixa horizontal abaixo da identidade, com oito visíveis no desktop e rolagem lateral. Nomes e ícones legíveis, sem rótulos redundantes de estado; contagens e durações reais permanecem. A faixa acompanha a etapa ativa até o usuário voltar manualmente. Não existe percentual, ETA ou barra de progresso temporal.
- Ao terminar, o ticket sai imediatamente desta faixa e passa ao histórico. Um terminal ou queued nunca ocupa esta região.

### Fila e histórico

Últimos verdes aceita um projeto ou Todos; somente Histórico sem projeto desabilita o modo com tooltip **escolha um projeto**. Os cards **Metas** e **Pendências** permanecem visíveis em todos os filtros. Em Todos, agregam os projetos ativos preservando a identidade de cada dono.

A fila e o histórico compartilham a composição DataTable do Dashboard 01. Cada execução ocupa uma única linha: **Estado** por ícone, **Execução**, **Término/Entrada**, **Duração/Espera**, **Revisão** com SHA curto e branch e **Ações**. Preset e a ação ocular final abrem o drawer; a linha e os demais fatos são inertes.

Nas colunas compactas de Duração/Espera, o valor ausente aparece como `—`, sem fabricar duração zero. O contexto detalhado conserva a explicação por extenso quando pertinente.

A fila contém apenas tickets `queued` **da máquina**, na ordem da fila, e não possui busca ou filtros. O filtro de projeto não esconde a fila. Chip de projeto aparece quando o filtro não identifica o dono sozinho. Seu vazio usa o `Empty` oficial com o título **Fila livre** e sem repetir a última execução.

O histórico une tickets terminais e observações de execução directa (`recordKind=observed-execution`) do filtro atual: um projeto, atribuídos em Todos, ou sem `projectId` em Histórico sem projeto. Observação não é ticket: chip/rótulo distinguem a origem; drawer sem log de fila trata ausência como legítima. Em Todos o chip nomeia o dono. Contagens de Análise, Meta, Últimos verdes e prova de ship **não** incluem observações. Acima e fora da borda da tabela ficam:

1. ToggleGroup Execuções / Últimos verdes na primeira linha; no Histórico sem projeto o verde fica `disabled` com tooltip **escolha um projeto**;
2. InputGroup de busca na segunda linha, seguido dos Selects diretos de período e resultado;
3. em Últimos verdes, origem e agrupamento substituem resultado;
4. Limpar somente quando há filtro aplicado.

Execuções oferece período Todo período, Hoje, 48h, Semana ou 15 dias, e resultado Todos, Passou, Falhou, Cancelado ou Interrompido. Não existe intervalo livre, calendário, popover contendo select nem controle duplicado.

Últimos verdes inicia em origem Todos e oferece Todos, Máquina ou Git, com agrupamento Por preset ou Por commit. Por preset mostra uma linha por projeto e receita, sem contagem; em Todos a busca inclui projeto, preset, branch, SHA e ticket. A união Máquina + Git deduplica por `projectId + preset + ticketId`. Por commit mostra uma linha agregada por `projectId + headSha` e abre um drawer de 36rem com SHA, branches, origem e as execuções canônicas daquele commit e projeto. Tabela e drawer preservam o chip do projeto dono. Falha parcial mantém dados válidos e identifica os projetos sem cobertura; a leitura agregada faz uma requisição por recurso, sem fan-out no browser. Execuções vindas somente do Git permanecem legíveis e não fabricam log local. O período oculta o verde canônico atual fora da janela, nunca escolhe um verde anterior. Esse modo não pagina e a leitura Git nunca força rede por conta própria. Uma leitura do espelho Git com mais de 24 horas fica marcada como desatualizada sem deixar de estar disponível, e a nota da fonte diz quando o espelho foi lido. As duas tabelas e o drawer do commit trazem **Integração**: **Em `<base>`** quando a revisão está contida na ref local de rastreio da base, no `.git` comum do projeto; **Fora de `<base>`** só quando essa ref foi atualizada nas últimas 24 horas; **Desatualizado** quando a revisão está fora e a leitura é mais antiga; **Desconhecido** sem `.git`, sem a ref ou sem o commit. O tooltip diz a ref, o horário da última atualização pelo reflog e a origem dela. O painel não faz fetch para responder.

### Coluna direita

- **Máquina:** somente disco livre atual. Não exibe ação, estado “normal”, memória, idade da leitura ou refresh por card.
- **Metas:** título fixo, sem nome da branch. No histórico sem projeto, o card mostra **Selecione um projeto** e a ação desabilitada com tooltip **escolha um projeto**. Com um projeto selecionado, há uma única meta, formada por nome, descrição e presets acompanhados. O usuário não digita SHA. Cada requisito lê o último verde canônico da receita atual; o título de um requisito atendido abre esse ticket. O progresso `x de y` fica no corpo e é a quantidade real de presets com verde canônico. Só existe `candidateSha` quando todos os requisitos estão verdes na mesma revisão; verdes em revisões diferentes são mostrados como tal e não fabricam um candidato. A meta pode ser criada, editada e removida e nunca bloqueia CI ou merge. Não existe CTA de ship/merge no dashboard; integração é só `ci-queue ship` na CLI.

Em Todos, Metas mostra até três projetos com meta, ordenados por nome e ID,
com `ProjectChip mode="compact-context"` acima do título. Mostra requisitos
atendidos quando calculáveis e candidato curto quando presente; catálogo
indisponível é fato explícito, nunca progresso inventado. O vazio é **Nenhuma
meta declarada.** e a ação é **Abrir metas**. O drawer inicia em Todos, sem
mutação global; escolher um projeto local permite declarar, editar e remover
com `projectId` explícito, preservando drafts por projeto e revisão, sem mudar
o filtro do header.

- **Pendências:** título fixo, sem contador. No histórico sem projeto, o card mostra **Selecione um projeto** e a ação desabilitada com tooltip **escolha um projeto**. Com um projeto selecionado, mostra recomendações automáticas e não bloqueantes de validação, emitidas de forma idempotente por um consumidor para um preset declarado. Cada item preserva preset, motivo, revisão, data e PR quando houver, além da tentativa posterior mais recente. Não existem nota livre, título manual, tags, vínculo com arquivo, `progressNodeId`, botão **Nova pendência** nem edição no dashboard. Um verde canônico posterior da máquina ou de um slot Git verificado, cuja revisão contém a revisão recomendada, resolve o item automaticamente. Falha ao registrar ou publicar a recomendação permanece observável e nunca bloqueia o fluxo. O vazio de um projeto é **Nenhuma pendência**. Em Todos, mostra até três recomendações misturadas, ordenadas por createdAt decrescente e projectId + id no desempate, com ProjectChip compact-context acima do preset, PR e SHA curto. O vazio global é **Nenhuma pendência.** O drawer inicia em Todos; a seleção local filtra a leitura sem alterar o header e sem oferecer mutations. Falhas por projeto mantêm os dados válidos dos demais nas duas superfícies.

## Drawer de execução

- Drawer oficial à direita no desktop e embaixo no mobile.
- Header fixo: estado, preset, chip do projeto dono, data/hora, tempo relativo e duração. O drawer é o ticket, não o filtro: abrir um job alheio não troca o seletor.
- Tabs Progresso/Log fixas; footer de ações fixo; somente o conteúdo central rola.
- Progresso não repete estado, preset, início, duração ou saída. A tabela de detalhes contém somente Ticket, Branch, SHA e Diretório.
- Etapas preservam a árvore recursiva completa; nós com filhos usam `Collapsible` oficial. Tanto o chevron quanto o título do nó abrem e fecham os filhos, inclusive pelo teclado. Cada nó mantém identidade, parentesco, tipo, estado, duração, detalhe e retry quando publicados. Não existe barra temporal.
- `retryCount > 0` aparece no tooltip e nome acessível do indicador da execução e do nó; não cria badge junto do nome.
- `failureReason`, quando existe, aparece como `Alert` **Motivo da falha** depois do contexto e antes da árvore. O log continua sendo saída bruta.
- Log vivo abre acompanhando o final. Enquanto o usuário permanece no fim, novas linhas mantêm o scroll no fim; subir pausa o acompanhamento sem parar a leitura. **Acompanhar** ou **Ir ao fim** retoma conforme o job esteja vivo ou terminal.
- Diagnóstico abre em Popover no footer e permite copiar/baixar o bundle; nunca vira um card abaixo do log.
- Copiar contexto usa o mesmo conjunto de fatos visíveis e não inventa campos.
- Não existe botão Fechar redundante no footer; o X do header, Escape e overlay encerram a superfície; arrastar o conteúdo não fecha.

## Worktrees

- DataTable oficial com busca por pasta, branch ou SHA e seleção por Checkbox.
- A linha inteira não abre o drawer. O título da pasta e a ação ocular final abrem o mesmo drawer.
- Estado visível distingue Limpa e Suja; não existe estado inventado “Parada”.
- A seleção múltipla persiste por projeto e mostra uma barra de seleção com apenas Copiar.
- Copiar abre DropdownMenu com Copiar caminho e Copiar contexto.
- O drawer contém caminho, SHA, alterações, relação com a base e tamanho quando medido. Oferece Abrir e o mesmo menu Copiar.
- Inventário Git e tamanhos atualizam automaticamente a cada 60 segundos por uma única fonte. Medições de tamanho são serializadas e preservam o último valor válido quando uma atualização falha. Não existe ação manual de medir ou atualizar.
- Em Todos, a API agrega os projetos ativos, cada linha leva chip do dono, e a persistência de seleção usa `ci-queue:worktrees:all`. Reveal e a vista do drawer usam o `projectId` dono da linha. Sem projeto a rota continua exigindo um projeto.
- Carregamento navegado preserva dados anteriores; não pisca um empty state técnico a cada entrada na rota.

## Análise

A rota contém somente **Estatísticas**. Usa ToggleGroup **Resultados / Duração**,
`FilterSelect` de período e, em Resultados, um `SelectionPanel` de presets com
busca e checkboxes. Duração usa um `FilterSelect` próprio de receita declarada. Em Todos, Resultados
identifica cada barra por `projeto + preset` (rótulo `Nome · preset`) e Duração
escolhe um par namespaced; a URL custom nesse filtro é `projectId:preset`. Com um
projeto único a URL antiga `analysisPreset=check` permanece. Sem projeto a rota
é `PROJECT_REQUIRED`. Os controles alinham à esquerda e quebram em viewport estreita. Trocar a métrica
não mistura as seleções.

- **Resultados:** cada preset tem distribuição própria
  `(passou+falhou+cancelado+interrompido)` somando 100% quando o total é
  positivo. O volume global não é o denominador. O padrão inicial é até os dez
  presets com mais execuções terminais no projeto/período, com desempate pelo
  nome; dez é padrão, não teto. Checkbox filtra a resposta já carregada. O
  Tooltip, o clique na barra e a célula focável do preset mostram total,
  contagem e percentual; a tabela conserva as quantidades exatas. Custom vazio
  pede para selecionar um preset. Amostra zero não ganha barra.
- **Duração:** exige um único preset declarado (em Todos, o par `projectId:preset`) e mostra mediana, faixa e tamanho
  da amostra antes do scatter. Catálogo ausente ou ilegível pede vínculo de
  receitas, não “nenhum ponto”. Não mistura receitas nem relaxa verde canônico.

Charts usam `ChartContainer`, `ChartTooltipContent` e `ChartLegendContent` oficiais da configuração Nova. Recharts fornece apenas séries e eixos. A altura é limitada; não existe gráfico raw, tooltip artesanal, linha interpolada ou histórico de RAM/disco da máquina.

## Estados e verdade operacional

- Uma falha de leitura produz `Error`/`Empty` local e acionável; mensagens genéricas sobre fotografia antiga não se repetem pelo painel.
- Dados preservados durante refresh continuam visíveis sem banner redundante.
- Ausência de dado nunca vira zero, estado saudável ou texto técnico inventado.
- O Dashboard consome a API real; fixtures isoladas cobrem vazio, erro, execução viva e logs longos sem criar fatos de produto.

## Atualização dos fatos vivos

Datas relativas e duração ativa usam um relógio compartilhado no browser, sem
requests por tick. Running exige `startedAt`; cancelamento anterior ao início
mostra **Não iniciada**. O drawer relê um ticket enquanto está na fila ou em
execução e encerra essa leitura no terminal. O histórico acompanha a chegada de
novos terminais observada pelo Status.

O log usa `offset`/`nextOffset`, drena bytes pendentes antes de aguardar e para
quando o terminal foi drenado. O buffer de visualização guarda até quatro
milhões de caracteres recentes, com indicação de trecho anterior omitido;
o arquivo original e a exportação de diagnóstico não são alterados.

O collector registra `retryCount` ao observar `failed → running` do mesmo nó
no mesmo job. Repetir `running` não incrementa o contador. O fato permanece no
terminal e aparece na execução atual, histórico e árvore do drawer. O consumidor
continua responsável pelo veredito de flaky; observabilidade nunca fabrica verde.

Histórico sem projeto é um arquivo separado no seletor global, não um card do
projeto atual. A atribuição explícita é operacional e auditável, descrita em
`docs/INSTALL.md`; a UI não adivinha projeto por caminho nem oferece ação de
reclassificar os registros ainda sem evidência.

O cursor do log respeita linhas completas. Linhas maiores que o trecho de leitura podem ser omitidas com aviso, e a exportação limitada a 8 MiB declara quando preserva somente início e fim. A redação de chaves reconhecidas não substitui a obrigação do consumidor de não imprimir segredos.

### Identidade temporal e progresso encerrado — ajuste de 15/09/2026

Card atual mostra identidade, etapas e no fim do `CardContent` o elapsed grande
com olho. O drawer conserva `JobTimeline` (`início · Decorrido:`). Durante
execução, o card atualiza o elapsed localmente. Sem `durationReference.meanMs`
publicado, a média não aparece.
No drawer terminal, mostram indicador final, término, tempo relativo ao término
e **Duração:** apenas quando registrada. Nas tabelas, o tempo relativo fica
somente no tooltip da data; espera da fila é intervalo, sem prefixo “há”.

Etapas concluídas conservam seu resultado. Se o ticket encerrou e deixou etapas
pendentes/em execução no registro, elas não animam nem aparentam atividade viva;
a apresentação informa o encerramento sem inventar conclusão ou alterar arquivos.
O conteúdo do drawer permite seleção nativa de texto e não fecha por arraste.

## Proprietários de composição

Identidade completa, cinco drawers, fichas, tabelas e indicadores usam os donos
compartilhados mapeados em `.context/patterns/ui-composition.yaml`. DESIGN.md
explica a linguagem visual; presentation.ts contém a escala executável. Esta
centralização não altera filtros, tempos, ações, dados ou semântica aprovada.

## Duração nos nós de progresso

Árvore e faixa usam o mesmo conteúdo (`ProgressDuration`): emissor sem prefixo,
coletor com `≈`, ausência terminal como `—` com razão no Tooltip. Sem cronômetro
ao vivo em nós `running`.
