# Contrato de produto da interface

Esta é a fonte atual do comportamento aprovado da interface do CI Queue. O histórico das decisões permanece no Git; implementações rejeitadas e protótipos antigos não são contrato.

## Método de composição

A interface parte do Dashboard 01 oficial do shadcn no estilo `radix-nova`. Cada superfície deve recuperar uma composição oficial, selecionar a mais próxima e adaptar somente os dados e comportamentos do CI Queue. O mapa técnico está em `COMPOSITION-LEDGER.md`.

Primitivos isolados não bastam para declarar uma superfície como shadcn. Shell, tokens, tipografia, ícones, tabela, gráfico, menu, seleção, foco, hover, responsividade, vazio e erro devem permanecer coerentes com as composições oficiais selecionadas.

## Shell

- `SidebarProvider`, `Sidebar variant="inset" collapsible="offcanvas"`, `SidebarInset` e header vêm do Dashboard 01.
- O `SidebarTrigger` fica no header ao lado da marca.
- Navegação: Status, Worktrees e Análise.
- O rodapé contém somente Bridge online/offline e os três controles de tema Claro, Escuro e Sistema.
- Não existe ação Recolher no rodapé nem divisória CSS improvisada entre sidebar e conteúdo.

## Status

A página não repete um título grande “Status” no corpo. A composição revisada
em 15/09/2026 está disponível para aceite visual: Execução atual vazia e Fila
livre ocupam faixas compactas sem títulos redundantes, instruções ou cabeçalho
de tabela vazia. Execução ativa e Fila preenchida mantêm identificação própria.
O histórico usa `CardHeader` com modo, busca e filtros; “Execuções / Últimos
verdes” identifica a superfície sem repetir “Histórico”. A busca usa placeholder
curto e nome acessível com os campos pesquisáveis. Período, Resultado e Origem
usam Select direto; agrupamento só aparece em Últimos verdes. Os headers da
tabela usam texto secundário sem faixa de fundo. Não há card dentro de card.

Os indicadores usam cores semânticas consistentes em tabelas, etapas, drawers
e Resultados da Análise: passou em verde (`success`), falhou em vermelho
(`destructive`), rodando/interrompido em âmbar (`warning`) e cancelado/aguardando
em neutro (`muted-foreground`). Ícone e rótulo continuam identificando o estado
independentemente da cor. Os tokens têm valores próprios para claro e escuro.

A página tem uma faixa de execução atual acima de um grid com coluna principal fluida e coluna direita finita.

### Execução atual

- A região permanece visível; vazia usa `Item` compacto com **Nenhuma execução em andamento**.
- Quando há ticket `running`, preset e a ação ocular final abrem o mesmo drawer.
- Existe um único indicador de estado, no início do item.
- Abaixo: data e hora, tempo relativo e duração decorrida.
- Depois: branch e SHA; o assunto do commit aparece somente aqui.
- As etapas ficam lateralmente em telas largas e usam bolinhas/checks ligados por separadores. Não existe percentual, ETA ou barra de progresso temporal.
- Ao terminar, o ticket sai imediatamente desta faixa e passa ao histórico. Um terminal ou queued nunca ocupa esta região.

### Fila e histórico

Fila, histórico e últimos verdes usam a mesma composição DataTable do Dashboard 01. Cada execução ocupa uma única linha: **Estado** por ícone, **Execução**, **Término/Entrada**, **Duração/Espera**, **Revisão** com SHA curto e branch e **Ações**. Preset e a ação ocular final abrem o drawer; a linha e os demais fatos são inertes.

A fila contém apenas tickets `queued`, na ordem da fila, e não possui busca ou filtros. Seu vazio usa o `Empty` oficial com o título **Fila livre** e sem repetir a última execução.

O histórico contém apenas tickets terminais. Acima e fora da borda da tabela ficam:

1. busca por preset, branch, SHA ou ticket;
2. ToggleGroup segmentado Execuções / Últimos verdes;
3. select direto de período e de agrupamento Por preset/Por commit;
4. uma segunda linha de ToggleGroup exclusivo para resultado ou origem;
5. Limpar, somente quando houver filtro aplicado.

Execuções oferece período Todo período, Hoje, 48h, Semana ou 15 dias, e resultado Todos, Passou, Falhou, Cancelado ou Interrompido. Não existe intervalo livre, calendário, popover contendo select nem controle duplicado.

Últimos verdes inicia em origem Todos e oferece Todos, Máquina ou Git, com agrupamento Por preset ou Por commit. Por preset mostra uma linha por receita, sem contagem. Por commit mostra uma linha agregada por SHA e abre um drawer de 36rem com SHA, branches, origem e as execuções canônicas daquele commit. Execuções vindas somente do Git permanecem legíveis e não fabricam log local. O período oculta o verde canônico atual fora da janela, nunca escolhe um verde anterior. Esse modo não pagina e a leitura Git nunca força rede por conta própria.

### Coluna direita

- **Máquina:** somente disco livre atual. Não exibe ação, estado “normal”, memória, idade da leitura ou refresh por card.
- **Meta para main:** uma única meta, formada por nome, descrição e presets acompanhados. O usuário não digita SHA. Cada requisito lê o último verde canônico da receita atual; o título de um requisito atendido abre esse ticket. O progresso `x de y` é a quantidade real de presets com verde canônico. Só existe `candidateSha` quando todos os requisitos estão verdes na mesma revisão; verdes em revisões diferentes são mostrados como tal e não fabricam um candidato. A meta pode ser criada, editada e removida e nunca bloqueia CI ou merge.
- **Pendências:** recomendações automáticas e não bloqueantes de validação, emitidas de forma idempotente por um consumidor para um preset declarado. Cada item preserva preset, motivo, revisão, data e PR quando houver, além da tentativa posterior mais recente. Não existem nota livre, título manual, tags, vínculo com arquivo, `progressNodeId`, botão **Nova pendência** nem edição no dashboard. Um verde canônico posterior da máquina ou de um slot Git verificado, cuja revisão contém a revisão recomendada, resolve o item automaticamente. Falha ao registrar ou publicar a recomendação permanece observável e nunca bloqueia o fluxo. O vazio é **Nenhuma pendência**.

## Drawer de execução

- Drawer oficial à direita no desktop e embaixo no mobile.
- Header fixo: estado, preset, data/hora, tempo relativo e duração.
- Tabs Progresso/Log fixas; footer de ações fixo; somente o conteúdo central rola.
- Progresso não repete estado, preset, início, duração ou saída. A tabela de detalhes contém somente Ticket, Branch, SHA e Diretório.
- Etapas preservam a árvore recursiva completa; nós com filhos usam `Collapsible` oficial. Cada nó mantém identidade, parentesco, tipo, estado, duração, detalhe e retry quando publicados. Não existe barra temporal.
- `retryCount > 0` mostra **Flaky detectado** durante a repetição e depois do término.
- `failureReason`, quando existe, aparece como `Alert` **Motivo da falha** depois do contexto e antes da árvore. O log continua sendo saída bruta.
- Log vivo abre acompanhando o final. Enquanto o usuário permanece no fim, novas linhas mantêm o scroll no fim; subir pausa o acompanhamento sem parar a leitura. **Acompanhar** ou **Ir ao fim** retoma conforme o job esteja vivo ou terminal.
- Diagnóstico abre em Popover no footer e permite copiar/baixar o bundle; nunca vira um card abaixo do log.
- Copiar contexto usa o mesmo conjunto de fatos visíveis e não inventa campos.
- Não existe botão Fechar redundante no footer; o X do header e os gestos do Drawer encerram a superfície.

## Worktrees

- DataTable oficial com busca por pasta, branch ou SHA e seleção por Checkbox.
- A linha inteira não abre o drawer. O título da pasta e a ação ocular final abrem o mesmo drawer.
- Estado visível distingue Limpa e Suja; não existe estado inventado “Parada”.
- A seleção múltipla persiste por projeto e mostra uma barra de seleção com apenas Copiar.
- Copiar abre DropdownMenu com Copiar caminho e Copiar contexto.
- O drawer contém caminho, SHA, alterações, relação com a base e tamanho quando medido. Oferece Abrir e o mesmo menu Copiar.
- Inventário Git e tamanhos atualizam automaticamente a cada 60 segundos por uma única fonte. Medições de tamanho são serializadas e preservam o último valor válido quando uma atualização falha. Não existe ação manual de medir ou atualizar.
- Carregamento navegado preserva dados anteriores; não pisca um empty state técnico a cada entrada na rota.

## Análise

A rota contém somente **Estatísticas**. Usa ToggleGroup **Resultados / Duração**, seguido por selects diretos de Período e Preset, todos alinhados à esquerda e quebrando linha em viewport estreita.

- **Resultados:** barras verticais empilhadas por preset para Passou, Falhou, Cancelado e Interrompido. O backend agrega toda a população retida do período, sem teto silencioso de 200 registros. Quando há muitos presets, o gráfico mantém largura legível e rola horizontalmente; a tabela abaixo conserva todas as contagens exatas.
- **Duração:** exige um preset específico e mostra mediana, faixa e tamanho da amostra antes do scatter plot. Usa apenas execuções aprovadas e comparáveis, com duração válida.

Charts usam `ChartContainer`, `ChartTooltipContent` e `ChartLegendContent` oficiais da configuração Nova. Recharts fornece apenas séries e eixos. A altura é limitada; não existe gráfico raw, tooltip artesanal, linha interpolada ou histórico de RAM/disco da máquina.

## Estados e verdade operacional

- Uma falha de leitura produz `Error`/`Empty` local e acionável; mensagens genéricas sobre fotografia antiga não se repetem pelo painel.
- Dados preservados durante refresh continuam visíveis sem banner redundante.
- Ausência de dado nunca vira zero, estado saudável ou texto técnico inventado.
- O Dashboard consome a API real; fixtures isoladas cobrem vazio, erro, execução viva e logs longos sem criar fatos de produto.
