# Roadmap do CI Queue

Fonte canônica de direção. Campanhas e evidências não criam um segundo roadmap.

## Direção de produto

CI Queue evolui como produto local de execução e inspeção para desenvolvedores
e agentes. Uma instalação atende vários projetos, com fila e limites globais,
executor independente e contexto explícito de projeto.

O consumidor permanece responsável por receitas, preparação, testes e política
de aprovação. O produto preserva tickets, logs, resultados e proveniência sem
depender do checkout de um consumidor específico.

## Fotografia atual — 21/09/2026

Esta é uma fotografia do `dev@550409a92f359cffc3e75f34712d39133b8ab130`, não
uma afirmação sobre a instalação de qualquer Mac.

| Camada | Estado delimitado |
|---|---|
| Implementado em `dev` | Contexto global de projeto; cadastro local e vínculo de receitas; lifecycle de worktrees; histórico não atribuído; Análise/Resultados com filtros e seleção; duração observada, retry e projeções `active`/`planned` do progresso. Q2/Q3 e a PR visual #18 estão integrados. |
| Testado por código/fixture | Contratos de fila, API e projeções têm suites proprietárias; a geometria #18 tem testes browser versionados. Isso não é uma prova única do produtor DietFlow ao worker, API e UI compilada. |
| Instalação | Requer receipt próprio com revisão, manifest, CLI, API e serviços. Nenhum recibo atual é inferido de um merge ou de uma fixture. |
| Próximo | C01 fecha as fronteiras Git/B0; C03 a cadeia integrada; C04 o refresh; C05 recursos/retenção; C06 seleção. Medir latência de API/navegação e custo do consumidor continua trabalho futuro, sem prometer ganho antes da medição. |

O produto não precisa reabrir a etapa 1B para registrar esses limites. Código,
fixture, instalação e direção futura permanecem fatos diferentes.

## Próximas prioridades já identificadas

Captação de duração de subetapas; latência da API e navegação; auditoria das
obrigações restantes; investigação temporal dos gates do consumidor. A meta de
reduzir smoke depende de medição, não de promessa comercial.

## Evolução futura, fora do corte atual

Experiência de instalação e atualização local mais simples; gerenciamento do
serviço; integração de CLI e MCP com o mesmo contrato; registro explícito de
projetos; submissão genérica com preservação de argumentos; integração opcional
com receitas existentes e fluxos de agentes.

A forma desejada `ci-queue submit --cwd "$PWD" -- npm run test` é uma intenção
de ergonomia, não um comando entregue neste pacote. Uma execução genérica
bem-sucedida não deve se tornar automaticamente um verde canônico de uma
receita diferente.

Inspiração de jornada: instalar uma vez, vincular projeto, reconhecer
capacidades disponíveis, acompanhar execução e inspecionar resultado. Não
instalar hooks, interceptar push ou alterar Git automaticamente por imitação
de outra ferramenta.

Conta, OAuth, colaboração hospedada, telemetria, licenciamento, execução
remota e políticas de equipe não estão decididos nem autorizados. Não criar
placeholders de UI para essas possibilidades.

## Inspiração documentada

As referências abaixo informam recortes deste produto. Não são contrato de
compatibilidade nem prova de desempenho.

| Fonte | O que foi lido | O que não entra agora |
| --- | --- | --- |
| Gait | Anúncio público de monitoramento multi-repo no app macOS. | Implementação interna ou benchmark de velocidade. |
| Pueue | Cliente separado do daemon; execução independente do terminal. | Substituir o motor que já funciona. |
| Dagu | Orquestração separada das regras dos scripts consumidores. | Framework completo de workflows. |
| local-ci | Reproduzir GitHub Actions envolve runner, ambiente e caches. | Compatibilidade universal com CI existente. |
| Mergetrain | Registry separado, Hub multi-repo e falha isolada por repositório. | Política de integração, banco e ownership de push. |
