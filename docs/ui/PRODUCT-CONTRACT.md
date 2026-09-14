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

A página tem uma faixa de execução atual acima de um grid com coluna principal fluida e coluna direita finita.

### Execução atual

- Só existe para um ticket realmente `running`.
- Preset é o título e somente esse título abre o drawer.
- O indicador de estado fica junto do título.
- Abaixo: data e hora, tempo relativo e duração decorrida.
- Depois: branch e SHA; o assunto do commit aparece somente aqui.
- As etapas ficam lateralmente em telas largas e usam bolinhas/checks ligados por separadores. Não existe percentual, ETA ou barra de progresso temporal.
- Ao terminar, o ticket sai imediatamente desta faixa e passa ao histórico. Um terminal ou queued nunca ocupa esta região.

### Fila e histórico

Fila e histórico usam o mesmo componente DataTable do Dashboard 01, com duas colunas:

- **Execução:** preset clicável, estado e, abaixo, data/hora, tempo relativo e duração.
- **Contexto:** ticket, branch e SHA.

Somente o título do preset abre o drawer. Data, duração, estado e contexto não são links.

A fila contém apenas tickets `queued`, na ordem da fila, e não possui busca ou filtros. Seu vazio usa o `Empty` oficial com o título **Fila livre** e sem repetir a última execução.

O histórico contém apenas tickets terminais. Acima e fora da borda da tabela ficam:

1. busca por preset, branch, SHA ou ticket;
2. ToggleGroup segmentado Execuções / Últimos verdes;
3. selects diretos do modo;
4. Limpar, somente quando houver filtro aplicado.

Execuções oferece período Todo período, Hoje, 48h, Semana ou 15 dias, e resultado Todos, Passou, Falhou, Cancelado ou Interrompido. Não existe intervalo livre, calendário, popover contendo select nem controle duplicado.

Últimos verdes oferece origem Máquina, Git ou Ambos e agrupamento Por preset ou Por commit. O padrão é último verde de cada preset. O período não escolhe um verde anterior e esse modo não pagina. A leitura Git nunca força rede por conta própria.

### Coluna direita

- **Máquina:** somente disco livre atual e a ação **Ocorrências e recursos**, que leva a Análise. Não exibe estado “normal”, memória, idade da leitura ou refresh por card.
- **Meta para main:** uma única meta, nome, descrição e progresso real `x de y`. A barra representa requisitos conhecidos, não tempo de execução. O drawer próprio permite criar, editar e remover a meta e escolher os presets acompanhados.
- **Pendências:** informações manuais livres, com título e texto reais. Não representam gate de Git/CI nem exigem arquivo, SHA ou classificador. Cada título abre a pendência no drawer próprio; **Ver pendências** abre a superfície geral. O vazio é **Nenhuma pendência**.

## Drawer de execução

- Drawer oficial à direita no desktop e embaixo no mobile.
- Header fixo: estado, preset, data/hora, tempo relativo e duração.
- Tabs Progresso/Log fixas; footer de ações fixo; somente o conteúdo central rola.
- Progresso não repete estado, preset, início, duração ou saída. A tabela de detalhes contém somente Ticket, Branch, SHA e Diretório.
- Etapas usam bolinhas/checks com conectores, sem barra temporal.
- Log pagina sem deslocar header, tabs ou footer.
- Diagnóstico abre em Popover no footer e permite copiar/baixar o bundle; nunca vira um card abaixo do log.
- Copiar contexto usa o mesmo conjunto de fatos visíveis e não inventa campos.
- Não existe botão Fechar redundante no footer; o X do header e os gestos do Drawer encerram a superfície.

## Worktrees

- DataTable oficial com busca por pasta, branch ou SHA e seleção por Checkbox.
- A linha inteira não abre o drawer. Somente o título da pasta abre.
- Estado visível distingue Limpa e Suja; não existe estado inventado “Parada”.
- A seleção múltipla persiste por projeto e mostra uma barra de seleção com apenas Copiar.
- Copiar abre DropdownMenu com Copiar caminho e Copiar contexto.
- O drawer contém caminho, SHA, alterações, relação com a base e tamanho quando medido. Oferece Abrir e o mesmo menu Copiar.
- Não há botões por linha nem idade de medição permanente. Remedir só é justificável quando a leitura não se atualiza rápido o suficiente.
- Carregamento navegado preserva dados anteriores; não pisca um empty state técnico a cada entrada na rota.

## Análise

A rota começa com Tabs **Estatísticas / Problemas**.

Estatísticas usa ToggleGroup **Resultados / Duração**, seguido por selects diretos de Período e Preset, todos alinhados à esquerda e quebrando linha em viewport estreita.

- **Resultados:** barras verticais empilhadas por preset para Passou, Falhou, Cancelado e Interrompido. O backend agrega toda a população retida do período, sem teto silencioso de 200 registros.
- **Duração:** exige um preset específico e mostra mediana, faixa e tamanho da amostra antes do scatter plot. Usa apenas execuções aprovadas e comparáveis, com duração válida.
- **Problemas:** reutiliza a DataTable de execução para failed/interrupted e abre o mesmo drawer. Mostra motivo somente quando existe evidência; não inventa classificador universal.

Charts usam `ChartContainer`, `ChartTooltipContent` e `ChartLegendContent` oficiais da configuração Nova. Recharts fornece apenas séries e eixos. A altura é limitada; não existe gráfico raw, tooltip artesanal, linha interpolada ou histórico de RAM/disco da máquina.

## Estados e verdade operacional

- Uma falha de leitura produz `Error`/`Empty` local e acionável; mensagens genéricas sobre fotografia antiga não se repetem pelo painel.
- Dados preservados durante refresh continuam visíveis sem banner redundante.
- Ausência de dado nunca vira zero, estado saudável ou texto técnico inventado.
- O Dashboard consome a API real; fixtures isoladas cobrem vazio, erro, execução viva e logs longos sem criar fatos de produto.
