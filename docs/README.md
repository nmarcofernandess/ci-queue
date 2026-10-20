# Documentação: entradas e responsáveis

Reconciliado em 19/09/2026 a partir de `dev` em `5a9268e41e27644362dfd9e5cd4e163813f5e1a1`; a navegação do método de feedback/prova foi atualizada em 23/09/2026. Branches são móveis; exemplos de código no manual apontam para a revisão observada.

| Assunto | Fonte editável | Papel |
|---|---|---|
| Adoção por um projeto | [CONSUMER-QUICKSTART](CONSUMER-QUICKSTART.md) | Entrada genérica e sequência mínima |
| Método de feedback, fechamento e prova | [TESTING-METHOD](TESTING-METHOD.md) | Escolha, diagnóstico, retomada, evidência e templates de adoção |
| Ensino completo offline | [GUIA-INTEGRACAO-CI-QUEUE.html](GUIA-INTEGRACAO-CI-QUEUE.html) | Onze capítulos, diagramas e exemplos copiáveis |
| Formatos e invariantes | [CONTRACTS](CONTRACTS.md) | Referência técnica, não outro tutorial |
| Release, ativação e recuperação | [INSTALL](INSTALL.md) | Operação da máquina e limites de verificação |
| Node por job e sessão | [RUNTIME-ISOLATION](RUNTIME-ISOLATION.md) | Binding opt-in, controle privado, recovery e proteção da instalação; observado não é sandbox |
| UI do produto | [PRODUCT-CONTRACT](ui/PRODUCT-CONTRACT.md), [COMPOSITION-LEDGER](ui/COMPOSITION-LEDGER.md) | Conteúdo e composição da aplicação, não do manual |
| DietFlow consumidor | [CI-QUEUE-CONSUMIDOR em dev](https://github.com/dietflowoficial/Dietflow-app/blob/dev/docs/ci/CI-QUEUE-CONSUMIDOR.md) | Adaptação, política e comandos próprios |

## Não duplicar contratos

README, AGENTS e `.context` apontam para os donos acima. Skills consumidoras documentam a porta operacional do próprio projeto, sem copiar um motor de ship nem todo este manual. Ao adotar em outro projeto, atualizar explicitamente seu AGENTS (ou alvo do symlink) e sua skill/instrução versionada.

Specs, planos e relatos de campanhas preservam decisões históricas. Não prevalecem sobre código/testes atuais nem devem ser reescritos para parecer execução atual. O manual é ensino, não proof de runtime ou certificado de login/boot.
