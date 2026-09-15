# Complemento 05 · Atualização do roadmap

Fonte: corpo da entrega de Etapa 1B. Substitui o anexo ausente
`05-ROADMAP-E-FONTES.md`.

Localizar a fonte canônica de roadmap no checkout. Se não houver documento
vigente, criar `docs/ROADMAP.md` e ligá-lo no README. Não criar dois
roadmaps concorrentes.

## Texto-base a incorporar

### Direção de produto

CI Queue evolui como produto local de execução e inspeção para desenvolvedores
e agentes. Uma instalação atende vários projetos, com fila e limites globais,
executor independente e contexto explícito de projeto.

O consumidor permanece responsável por receitas, preparação, testes e política
de aprovação. O produto preserva tickets, logs, resultados e proveniência sem
depender do checkout de um consumidor específico.

### Corte atual: etapa 1B

Contexto global de projeto; cadastro local com vínculo opcional de receitas;
reparo e archive/restore; arquivo de histórico não atribuído; Análise
proporcional e seleção múltipla em Resultados; menu local de tema e Bridge.

Esses itens só serão classificados como entregues após implementação,
testes, review e integração autorizada.

### Próximas prioridades já identificadas

Captação de duração de subetapas; latência da API e navegação; auditoria das
obrigações restantes; investigação temporal dos gates do consumidor. A meta
de reduzir smoke depende de medição, não de promessa comercial.

### Evolução futura, fora do corte atual

Experiência de instalação e atualização local mais simples; gerenciamento do
serviço; integração de CLI e MCP com o mesmo contrato; registro explícito de
projetos; submissão genérica com preservação de argumentos; integração
opcional com receitas existentes e fluxos de agentes.

A forma desejada `ci-queue submit --cwd "$PWD" -- npm run test` é uma
intenção de ergonomia, não um comando entregue neste pacote. Uma execução
genérica bem-sucedida não deve se tornar automaticamente um verde canônico
de uma receita diferente.

Inspiração de jornada: instalar uma vez, vincular projeto, reconhecer
capacidades disponíveis, acompanhar execução e inspecionar resultado. Não
instalar hooks, interceptar push ou alterar Git automaticamente por imitação
de outra ferramenta.

Conta, OAuth, colaboração hospedada, telemetria, licenciamento, execução
remota e políticas de equipe não estão decididos nem autorizados. Não criar
placeholders de UI para essas possibilidades.

## Fontes da investigação

Referências de Gait, Pueue, Dagu, local-ci e Mergetrain entram como
inspiração documentada, com a distinção entre funcionalidades publicadas e
mecanismos efetivamente inspecionados. Não como contrato de compatibilidade
ou prova de desempenho.
