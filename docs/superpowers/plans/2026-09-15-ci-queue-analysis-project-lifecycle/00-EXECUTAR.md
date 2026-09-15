# Executar: Análise proporcional e contexto local de projetos

Você executará este pacote no repositório `nmarcofernandess/ci-queue`. Não é pedido para propor outro plano. As decisões de produto estão fechadas nos arquivos acompanhantes; adapte apenas detalhes mecânicos necessários ao código efetivamente encontrado.

## Missão

Entregar três mudanças integradas: Resultados com barras percentuais e contagens preservadas; seleção múltipla de presets, inicialmente os dez mais executados; e um lifecycle local mínimo de projetos, com seletor global e menu de ambiente no rodapé. Concluir implementação, testes e inspeção da candidata. Publicar em PR draft e parar para o review de Marco.

## Ler nesta ordem

1. `01-DECISOES-E-REVIEW.md`: diagnóstico, escopo e comportamento aprovado.
2. `02-CONTRATOS.md`: identidade, isolamento, API, persistência, migração e UI.
3. `03-PLANO-EXECUTAVEL.md`: tarefas e verificações na ordem de execução.
4. `04-ACEITE-E-CENARIOS.md`: denominador de aceite, sem substituir pelos testes que forem mais fáceis.
5. `05-ROADMAP-E-FONTES.md`: texto para reconciliar o roadmap e fontes da investigação.
6. `fixtures/analysis-cases.json`: casos sintéticos para adaptar à suíte existente, não dados para a aplicação instalada.

No repo, ler também `AGENTS.md`, `DESIGN.md`, `.context/domains/manifest.yaml`, `.context/patterns/ui-composition.yaml`, `.agents/skills/ci-queue-shadcn/SKILL.md`, `docs/CONTRACTS.md`, `docs/ui/PRODUCT-CONTRACT.md` e `docs/ui/COMPOSITION-LEDGER.md`.

## Referência e branch

Referência auditada: `497acb862348e8f926f5af3fe70c3b9e18aa63cd`, PR #5, branch `codex/ui-consistency-phase1`, base `dev`. Na consulta usada para este pacote, o PR estava draft e não mergeado. Não assuma que a situação continua igual.

- Se #5 continua aberto e contém essa revisão, continuar na mesma lane/PR, com commits novos e seção explícita “Etapa 1B”. A mudança do pedido amplia o escopo do draft; não desfaz os aceites técnicos anteriores.
- Se #5 já entrou em `dev`, partir da `dev` atualizada numa nova branch `codex/analysis-project-lifecycle`, com novo PR draft para `dev`.
- Não mergear #5 apenas para conseguir começar. Não trocar a base para `main`. Preservar trabalho local posterior e registrar o delta antes de editar.

## Decisões que não podem ser delegadas de volta ao usuário

- Porcentagem é por preset: denominador = passou + falhou + cancelado + interrompido. O gráfico não usa participação no volume global nem o `passRate` antigo de denominador diferente.
- Tooltip mostra percentual, quantidade e total do preset. A tabela mantém contagens exatas.
- Multi-seleção vale para **Resultados**. **Duração continua com um preset declarado por vez**, preservando comparabilidade e scatter sem linha.
- Padrão: dez presets com mais execuções terminais válidas no projeto e período escolhidos. Dez é um padrão, não limite de seleção nem de agregação.
- Escolher checkboxes não faz requisição por item. O painel recebe agregados por projeto/período e faz a seleção localmente. O menu não fecha nem reordena opções enquanto a pessoa seleciona.
- Projeto fica no header global, à direita. O rodapé contém um menu de ambiente com Bridge e tema, sem usuário fictício.
- Projetos são cadastros locais. GitHub/OAuth não é requisito. Worktree não é outro projeto. A fila e o worker permanecem globais.
- É possível cadastrar uma pasta Git sem receitas: histórico, resultados e inventário funcionam; as capacidades que exigem catálogo apresentam ausência explícita. Não produzir `ci-queue.json` vazio fingindo compatibilidade com a CLI atual.
- Histórico sem projeto permanece consultável, separado. Não atribuir os 734 registros a DietFlow por semelhança de nome, pasta ou comando.
- Trocar projeto é contexto **da requisição e da aba**, nunca mutação de `ApiContext.config` compartilhado pelo servidor.

## Limites

Não fazer release, atualizar instalação, reiniciar o daemon instalado, criar outro worker, introduzir scheduler, OAuth, usuário, conta, telemetria, envio de comandos pelo browser ou endpoint genérico de shell. Não implementar `submit`, MCP, cronômetros de subitens, indexação global do histórico, otimização do smoke ou as etapas 2–5. As intenções futuras entram no roadmap, não em controles vazios na UI.

Não reduzir a proteção de Origin/Host/CSRF para fazer a prévia funcionar. Não enfraquecer verde canônico, isolamento por projeto ou testes existentes. Não adicionar testes por ícone nem um novo workflow de “CI da UI”. Usar os checks atuais, acrescentando regressões de negócio e integração.

## Autonomia e parada

Execute as tarefas sequencialmente, com testes focais e commits coerentes. Não peça aprovação por tarefa. Use subagentes somente se houver uma frente realmente independente; quantidade de agentes não é entregável. Se houver impedimento factual, registre comando, arquivo e evidência; não substitua a missão por uma nova campanha de planejamento.

O plano inclui a etapa de merge, mas **o merge só ocorre depois do aceite de Marco da candidata final e autorização explícita**. Este prompt não concede essa autorização antecipadamente.

## Retorno exigido

Entregar PR draft/base/HEAD, resumo por ID de aceite, testes efetivamente executados e resultados, SHA capturado, índice visual aberto e inspecionado, URL da prévia e identificação **da UI e da API candidatas**, confirmação do check remoto e limites restantes. Relatar que estado/arquivos reais não foram modificados. Um `200` da página ou da API instalada antiga não prova o pacote novo.

Não chamar revisão interna de aprovação humana. Não encerrar apenas com “todos os testes passaram”: demonstrar os caminhos de Análise, troca de projeto e lifecycle.
