# Evidência para redesenho, sem mudança de política

## Proveniência e custo observado

Todos os quatro tickets pertencem à branch `codex/exames-r2-r3-20261007`. São revisões distintas; não somar suas durações para estimar um único Smoke. A execução é serial e fail-fast na fonte `scripts/ci-local.sh`, mas os snapshots de recursos não demonstram ausência ou presença de outros trabalhos no host.

| Ticket | HEAD | Total ticket | Static emitter | Jest emitter | Terminal observado |
|---|---|---:|---:|---:|---|
| A: 20261007202354-f4e085c7 | 8766d0ea8ad69f020834a30f978e61bf21dcca78 | 138.241 s | 134 s | pendente | catalog-changes: falta aceite [check] |
| B: 20261007202938-55694893 | b6e6d9985c2b3950dbdd359ba456383dbe44dd94 | 158.932 s | 152 s | pendente | lifecycle-consumers: foods-recipes.ts versus seed.ts |
| C: 20261007203453-d2ebe2b7 | 9f914e7218b6925200dfdd00b07480cab993d899 | 359.940 s | 356 s | pendente | lint: 719 warnings, piso 712, 0 errors |
| D: 20261007204501-3b50e0bd | 6421c4630ac54972b7aaee63c3a80a58513d5d9b | 1155.457 s | 333 s | 799 s | passed; catálogo, forced e related alcançados |

Os JSONs enviados por Marco contêm tempos de stages, não individuais dos gates. Foram encontrados **separadamente** 38/50/62/87 registros de comando nos artifacts copiados A/B/C/D. IDs de job presentes conferem com o ticket; cwd/runDir e todos os intervalos conferem. Em D, oito linhas filhas Prisma não têm IDs explícitos de job: preservam parent/runDir/intervalo e associação pelo artifact, com limite registrado no manifesto. Não são prova independente de associação exata. O ticket foi projetado para retirar identidade do operador e observações detalhadas de processos.

As implementações primárias dos gates foram comparadas pelo Git blob nos quatro SHAs e na base DietFlow: a matriz registra o resultado por caminho. A comparação das entradas `package.json`, `ci-queue.json`, `jest.config.cjs`, `scripts/ci-local.sh` e `scripts/ci/**` não encontrou delta entre esses SHAs e dev confirmado. Isso permite interpretar as fronteiras do medidor na fonte pinada; não torna os diffs de produto/inputs iguais.

O medidor existente usa `performance.now`, registra argv, exit, lockfile, cache por lstat e parentId. Recursos CPU/RSS dos filhos aparecem explicitamente indisponíveis. Cache presente por lstat não prova cache hit ou conteúdos iguais. Stages usam resolução em segundos; ticket, stage e comando medem limites diferentes. A diferença entre total e soma de stages não pode ser atribuída integralmente à Queue, à espera ou ao bootstrap.

## Limites de soma e custos sustentados

Na matriz, cada comando normal usa sua fronteira externa. Typecheck inclui hooks/filhos: não somar Prisma, fumadocs e tsc filhos novamente. Prisma inicial usa somente suas duas primeiras folhas. Fixtures não mede wrapper: a linha soma validate, generate/normalize, tsc, refs e snapshot dentro do intervalo entre e2e-trigger e showcase; faltam gaps do wrapper. Um exit não zero do tsc de fixtures pode ser tolerado se fora de prisma; resultado de uma folha não é necessariamente verdict do gate. Os logs são a evidência do verdict final.

| Fronteira medida | A | B | C | D |
|---|---:|---:|---:|---:|
| field-identity-ratchet | 66.308 s | 63.055 s | 98.333 s | 106.160 s |
| fixtures tsc (folha; incluída na linha fixtures) | 17.888 s | 14.256 s | 84.928 s | 15.317 s |
| lint ratchet | não alcançado | não alcançado | 79.069 s | 52.492 s |
| typecheck wrapper | não alcançado | não alcançado | não alcançado | 19.091 s |
| typecheck Storybook wrapper | não alcançado | não alcançado | não alcançado | 18.202 s |
| seleção + execução Jest wrapper | não começou | não começou | não começou | 798.964 s |

Essas atribuições dependem dos artifacts recuperados, não dos três diagnósticos isolados. Não há atribuição a build Next ou TDD nos três tickets. O Smoke não chama Next build: `next typegen`, codegen Prisma e reconstrução de golden são preparações diferentes. Os dois typechecks não chegaram a executar em A/B/C.

Em D, o selector reportou `mode=catalog-and-related`, changed=142, forced=16, related=106, working-tree=no. O log preserva comandos, paths e resultados:

| Invocação dentro de Jest | Cobertura reportada | Tempo Jest observado | Estimativa impressa pelo Jest |
|---|---|---:|---:|
| catalog-proof | 87 suites / 938 tests passed | 687.107 s | 774 s |
| forced | 16 suites / 133 tests passed | 2.467 s | 3 s |
| related | 462 suites passed, 3 skipped; 4086 tests passed, 16 skipped | 90.270 s | 116 s |

As estimativas são do próprio runner, não budgets autorados. Sua soma não é estimativa de Smoke/Ship. Os três tempos do log somam 779.844 s; wrapper 798.964 s inclui seleção, lançamento e outros filhos. Não há medição nativa individual dessas três invocações no JSONL; o stage Review do collector acompanha esse trabalho e não deve ser somado como quarta execução. Números de suites/testes são por invocação, não contagem de testes únicos. Não deduzir overlap entre catálogo/forced/related pelas contagens.

O Jest relacionado possui deduplicação entre forced e related no mesmo perfil. Catálogo usa seleção curada/profiles próprios; repetição de path sob outro profile não é automaticamente redundante. `jest.config.cjs` exclui campanhas Foods e suite Queue por padrão; catálogo pode habilitar seu perfil. `--passWithNoTests` existe no related normal; review working-tree usa política mais estrita e nunca é proof de ship. D mostra maxWorkers=1 e Node 24.20.0; não se deve converter isso em capacidade global de host ou proposta de concorrência.

## Repetições e dependências a avaliar

| Repetição na fonte | Caminho/destino existente | Questão semântica pendente |
|---|---|---|
| Prisma generate/normalize | gate inicial; check:fixtures; pretypecheck; pretypecheck:storybook; bootstrap separado e filhos de Jest observados | Inputs/client podem mudar entre fronteiras? Qual preparação já demonstra a propriedade de cada consumidor? |
| tsc --noEmit | fixtures executa compilador completo mas filtra erros prisma; main executa tsc completo; Storybook usa outro project | Compilação repetida não implica veredito igual: filtro, project, generated inputs e cache diferem. |
| fumadocs | gate inicial; typecheck-main gera novamente | Inputs MDX/config mudaram? Há contrato de reuso? |
| snapshot-sync | folha de fixtures e gate próprio | Mesmo input/timing? Fixtures ainda valida refs/schema; retirar wrapper perde outras propriedades. |
| detector RED/GREEN | editor-list-item-delete e calculo-card-shell executam fixtures do próprio detector antes do scan | Autoteste protege qualidade do detector; separar seu destino exige cobertura equivalente demonstrada. |
| catálogos, forced e related | três comandos serializados pelo selector | Profiles/ignores diferentes, contratos que leem disco e dependências fora de import impedem dedup por filename apenas. |

O índice de fontes inclui implementação e dependências literais existentes resolvidas no Git. Não é grafo exaustivo de imports, filesystem ou efeitos dinâmicos. `gate-matrix.json` expõe comando npm resolvido, lifecycle hooks e caminhos pinados por SHA. Para fumadocs, a entrada é o pacote/config e a dependência no lockfile, não uma implementação local inventada.

## Destinos e responsáveis

| Owner | O que decide / onde ler |
|---|---|
| DietFlow | `package.json`, `ci-queue.json`, wrappers Static/Smoke/Full, jest-scope/config/catalog-proof, classificadores, overlays, ship e elegibilidade de ticket. Cada cobertura clínica/estrutural tem seu próprio detector e contratos. |
| CI Queue | Agenda/executa/observa jobs, guarda logs/artifacts/progress, runtime binding, supervisor e formatos; `docs/CONTRACTS.md` e `docs/RUNTIME-ISOLATION.md`. Não decide baixar gates clínicos. |
| Host/runtime | Recursos efetivos, runtime Node, filesystem/cache e serviços disponíveis. O pacote não mede capacidade livre contínua nem contenção global. |

`static` chama ci:local. `smoketest` e `smoketest-ship` chamam o mesmo ci:smoketest, Static → Jest relacionado; ship-proof adiciona flags de identidade/frescor. `full` chama Static → Jest de produto completo → E2E local-stack (com opção FlowUI do catálogo), sem passar antes pelo related. `review` é diagnóstico do diff+working tree, não agrega Static. GitHub instala/prepara Prisma/fumadocs e executa checks/lint/typechecks/related como fallback condicional; a ordem dos checks não é idêntica à local. O conjunto de checks estáticos tem contrato de paridade; lint remoto lê o piso da workflow, local lê a base.

Ship é coordenador fora da Queue. Somente smoketest-ship é acceptedPreset neste snapshot. Prova exige HEAD/base/cwd/tree/preflight/postflight, não apenas progresso verde. Full é complementar/advisory; docs-only dispensa Smoke segundo classificador DietFlow. Esses fatos não constituem proposta de alteração. Actionlint é remoto quando workflows mudam; não é um 59º Static local oculto.

## Lacunas que a revisão precisa preservar

Não há orçamento autorado por gate, novo plano implementado, prova de cobertura equivalente para remoções, distribuição estatística comparável por mesma tupla ou perfil contínuo de host. Os quatro tickets são amostra situada, não benchmark controlado. O alvo de 120 s não foi alcançado nem certificado. As fontes privadas dependem de acesso do revisor. Nenhuma receita básica, framework, medidor ou execução adicional foi criada. As fontes originais, lanes e owners de terceiros permanecem intactos.
