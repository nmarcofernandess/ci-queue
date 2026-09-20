# Relatório documental: integração CI Queue / DietFlow

Data: 19/09/2026. **Entrega parcial em PRs draft; não é aceite de merge.**

- Produto: [CI Queue #12](https://github.com/nmarcofernandess/ci-queue/pull/12), branch `docs/integration-guide-20260919`, base dev.
- Consumidor: [DietFlow #1298](https://github.com/dietflowoficial/Dietflow-app/pull/1298), branch `docs/ci-queue-integration-20260919`, base dev.
- Manual: [GUIA-INTEGRACAO-CI-QUEUE.html](GUIA-INTEGRACAO-CI-QUEUE.html).

Bases lidas: CI Queue `5a9268e41e27644362dfd9e5cd4e163813f5e1a1`; DietFlow `3c195bc854dd16ec44ef6410bbd24534632cb9a5`. As referências a dev são móveis; as fontes técnicas do HTML estão fixadas nessas revisões. Nenhum main foi usado como código atual.

## Fronteira respeitada

Nenhum código de produto, catálogo de presets, workflow, política de execução, spec/plan ou fase foi alterado. Nenhum merge, instalação, cutover ou full foi executado. Nenhum state privado ou secret local foi consultado/inventado. Escritas ocorreram pelo conector GitHub em branches próprias, com acesso de colaborador, não por troca simulada de identidade local.

## Inventário editorial e ações

| Dono / fonte | Ação |
|---|---|
| CI README e docs/README.md | Entrada/indexação do quickstart e donos por assunto. |
| CI docs/CONSUMER-QUICKSTART.md | Porta genérica: máquina/projeto, adoção de AGENTS+skill, init, fila, ship e limites. |
| CI docs/GUIA-INTEGRACAO-CI-QUEUE.html | Novo ensino offline, sem CDN, com onze capítulos e exemplos copiáveis. |
| CI docs/CONTRACTS.md | Referência concentrada de formatos, OR/default, TSV, duração, proof e projeção. |
| CI docs/INSTALL.md | Bundle vs checkout vs state; ativação, worker on-demand, verificação de login e limites. |
| CI AGENTS.md e .context/domains/manifest.yaml | Ponteiros de integração, sem copiar o manual inteiro. |
| CI DESIGN, UI contracts/ledger, RUNTIME-ISOLATION | Fontes de fronteira/composição/runtime consultadas e mantidas. Não importar renderer de proof. |
| DF docs/ci/README.md | Entrada consumidora e donos. |
| DF docs/ci/CI-QUEUE-CONSUMIDOR.md | Contrato/adaptação atuais; catálogo como membership; não cutover. |
| DF docs/ci/CI-QUEUE-OPERACAO.md | Wrappers, observação e diagnóstico. |
| DF docs/ci/FLUXO-CI-GITHUB-ACTIONS.md | Fluxo próprio; classificador real/docs-only/exceções; políticas remotas distintas. |
| DF .agents/skills/dietflow-ci/SKILL.md | Operação versionada, autorização, prova, observabilidade e manutenção da adoção. |
| DF .claude/CLAUDE.md e dois YAMLs de contexto | **Pendentes**: original preservado; delta explícito no PR #1298. Não declarar aplicação. |
| Harness, specs, planos, receipts e provas históricos | Evidências preservadas, sem reescrita de fases. Revisão não certifica todo o backlog/harness. |

## As onze perguntas no HTML

| # | Capítulo / âncora | Conteúdo entregue |
|---|---|---|
| 1 | #pacotes | Máquina/projeto; mínimo/opcional; fonte/bundle/state; logs/artefatos/projetos/runtimes; teste standalone. |
| 2 | #caminho | Script→argv→ticket→worker/runner→saída/sidecar→API→UI; resultado não fabricado. |
| 3 | #protocolo | TAB real/v1, nove/doze campos, IDs/hierarquia/kinds/counts, retry/falha/artefato, três relógios e exemplo Static+Jest. |
| 4 | #ship | init/autoria/PR/prova/ready/remoto/merge/inspeção; campos/leitores; OR/default; agregador AND; classificador do projeto. |
| 5 | #github | wait/skipped vs actions/skipped; flags; Git/API/local 403; worker sem merge; sem admin/status/ticket fabricado. |
| 6 | #node | Requisitos vs binding por projectId; Node do worker vs job; PATH/shims/preload/receipt; env-i e cobertura limitada; dois projetos. |
| 7 | #projetos | Identidade/localizadores/common-dir/worktrees; criar/mover/remover/recuperar; não scanner recursivo. |
| 8 | #filtro | A filtrado com B rodando; globais vs scoped; contexto all vs ID literal; projeto concreto para capacidades. |
| 9 | #instalacao | Release/ativação/ignição; fila vazia sem worker; próximo login como roteiro ainda não comprovado. |
| 10 | #dietflow | npm run ship próprio, sem cutover; Cloud/direct/fila; diagnóstico/smoke/full/receipt/RC distintos. |
| 11 | #diagnostico | Sintoma→comando real→fonte/expected→ação mínima. |

## Validação realmente realizada

- Leitura dos contratos e implementação relevante nos dois dev, com reconciliação de comandos/campos contra código e testes. Isso não equivale a executar as suítes dos repositórios.
- Exemplos JavaScript do manual reproduzidos em diretório isolado: **seis arquivos passaram node --check**.
- Execução real do agregador isolado: dois gates de sintaxe passaram; Jest ausente retornou **exit 1** e stage failed. Env de progress desligado manteve silêncio. Pais apareceram antes dos filhos nas linhas produzidas.
- **Não houve execução Jest positiva**: Jest não estava instalado no ambiente. Não usar fixture falsa para declarar teste real aprovado.
- Prévia local anterior do manual: onze capítulos, links internos válidos, blocos JSON parseáveis, TSV com TAB/quantidade de campos/counts coerentes; nenhuma dependência externa de assets.
- Essa prévia foi renderizada por Chromium/Playwright com set_content em 1440×1000 e 390×844: sem overflow da página, sem erro JS, sem requisição externa, copy funcionando. file:// foi bloqueado pelo ambiente.
- **Limite importante:** o HTML publicado recebeu edição posterior àquela prévia. A renderização automatizada byte-a-byte do candidato final do GitHub não foi concluída. Não atribuir o resultado da prévia ao blob publicado como prova final.
- A validação por execução dos parsers/CLI nativos do produto não foi concluída; houve confronto de fonte, não simulação de um resultado de suíte.

## Pendências que impedem chamar a tarefa inteira de concluída

1. Aplicar/revisar o delta DietFlow para `.claude/CLAUDE.md`, `.context/patterns/ci.yaml` e `.context/onboarding.yaml`. AGENTS symlink permanece intacto. A substituição integral pela API foi revertida por trazer alterações incidentais fora de CI; o diff final mantém o original. Delta: `docs/ci/DELTA-INSTRUCOES-INTEGRACAO.md` no PR consumidor.
2. Rerenderizar o HTML final do GitHub em desktop/mobile e reconferir links locais e links cruzados nas branches draft. Os links permanentes de navegação para o manual em dev só existirão após integração autorizada; os PRs oferecem o candidato.
3. Rodar o exemplo com Jest real instalado no projeto de ensino, tanto sucesso quanto assertion failure; conferir o catálogo no parser/CLI da revisão selecionada sem ship real.
4. Revisão independente de correção/completude e leitura por agente sem contexto. Nenhum revisor separado foi executado; não apresentar autorrevisão como independente.

## Achados com dono, sem campanha de código

| Achado | Fonte / dono | Ação recomendada |
|---|---|---|
| Ativação na sessão não prova retorno após login/boot | CI scripts/install.mjs: envelopes na release + launchctl bootstrap | Operador/instalação deve observar novo login. Não inventar serviço adicional no consumidor. |
| CLI version não é heartbeat do worker | DF scripts/ci/queue-operator.ts; scripts/ship/ship.ts | Diagnosticar fila/envelope/state separadamente; worker idle pode não ter PID. |
| Código checkout não atualiza instalação | CI scripts/install.mjs, manifest e /build.json | Roteiro local confere revisão instalada; não instalar nesta entrega. |
| Instrução histórica de migration com push dev conflita com leitura simplificada de ship | DF .claude/CLAUDE.md §7.2 e docs de migrations | Dono de migrations deve reconciliar explicitamente; não expandir este PR para política de deploy. |
| Runtime/harness têm requisitos e evidências próprios | DF docs/harness/RUNTIME-PROFILES.md e HARNESS-FAILURE-BACKLOG.md | Preservar receipts e status datados; não inferir capability de provider ou RC pela revisão documental. |

## Roteiro local, sem autorização implícita

1. Conferir branches/diff e aplicar somente o delta documental; preservar symlinks e fora de escopo.
2. Abrir o HTML final offline em 390px e desktop; testar âncoras, cópia com TAB, erro de exemplo e links.
3. Confrontar exemplos com parser/CLI/testes isolados existentes; dry-run de ship continua leitura, não proof de merge.
4. Fazer revisão independente/cold-reader e anexar resultados aos drafts.
5. Instalação, novo login, fila live e merge pertencem a autorização posterior. Nenhum deles é condição fictícia de passed por falta de progress.
