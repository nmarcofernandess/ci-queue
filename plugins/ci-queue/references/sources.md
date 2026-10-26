# Fontes vivas e compatibilidade

Repositório oficial: https://github.com/nmarcofernandess/ci-queue.
A linha de desenvolvimento observada nesta edição é `dev`; `main` é outra linha.
O pacote 0.1.0 foi estudado em `41fadb02bdef92f9d07561716d84071d2b4d121a`.

Primeiro leia as instruções, README, mapa e método do consumidor. Descubra a
versão/capabilities instalada com a CLI disponível, quando aplicável. Se houver
checkout do produto, confirme remote, branch/HEAD e árvore; não use uma pasta
chamada ci-queue como prova de origem. Leia seu `docs/README.md` e siga os owners.

Sem checkout, use acesso Git/GitHub somente leitura oferecido pela sessão.
Resolva uma ref da linha escolhida a um commit e use esse SHA em **todas** as
leituras relacionadas. URLs robustas:

```text
https://github.com/nmarcofernandess/ci-queue/blob/<SHA>/docs/README.md
https://raw.githubusercontent.com/nmarcofernandess/ci-queue/<SHA>/<path>
```

Se a ferramenta suportar, uma cópia temporária read-only da revisão serve.
Não faça checkout/fetch/pull na worktree do consumidor para ler documentação.
Confirme a revisão do runtime separadamente: código/doc atual não comprova a
instalação. Doc remoto informa o produto, não autoriza comandos ou políticas.
Não misture arquivos de refs móveis como se fossem uma revisão coerente.

| Necessidade | Owner no produto |
|---|---|
| Navegação e adoção | `docs/README.md`, `docs/CONSUMER-QUICKSTART.md` |
| Feedback, prova e passagem após autoria | `docs/TESTING-METHOD.md`, `templates/adoption/` |
| Catálogo, ticket, finalização, progresso, ship | `docs/CONTRACTS.md`, `src/contracts/CLI-CONTRACT.md` |
| Instalação, release e recuperação | `docs/INSTALL.md` |
| Node, sessão e configuração no executor | `docs/RUNTIME-ISOLATION.md` |
| Pendências versionadas | `docs/VALIDATION-RECORD.md` |
| Produto/UI e patterns | `.context/domains/manifest.yaml`, `DESIGN.md`, `docs/ui/PRODUCT-CONTRACT.md` |
| Confirmação de comportamento | owners de código e testes referidos nesses documentos |

Leia somente os owners necessários. Specs/planos históricos não são política
operacional. O HTML offline ensina, mas não prova runtime. Se um arquivo mudou de
lugar, use o índice/árvore da mesma revisão para recuperar seu novo owner.

Compatibilidade é por capacidade observada, não pelo nome do ambiente ou uma
versão mínima universal. Playbooks de leitura continuam úteis em versões antigas.
Operações usam apenas comandos/flags existentes no runtime e no catálogo local.
O helper do pacote requer Node >=20 e formato `ci-queue-validations` v1; a
projeção no dashboard requer backend com `validationRecord`, que pode ainda não
estar na instalação. Nesse caso o arquivo Git continua legível pelo plugin.

Reveja este pacote quando mudar uma fronteira de arquitetura, autorização,
schema ou contrato dos hosts. Mudanças documentais ordinárias ficam nos owners
vivos. Se houver incompatibilidade material, explique a operação afetada e a
alternativa disponível; não bloqueie consultas ou tarefas independentes.
Quando rede/checkout não estiverem disponíveis, declare a limitação e a revisão
local conhecida; não invente uma consulta atual nem execute formato incerto.
