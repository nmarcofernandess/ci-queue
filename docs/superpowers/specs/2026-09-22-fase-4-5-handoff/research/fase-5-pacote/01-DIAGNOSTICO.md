# Fase 5 — diagnóstico verificável de custo e estabilidade

**Data:** 21/09/2026. **Papel:** arquiteto/revisor externo. Nenhuma modificação de produto, teste, Full, instalação, PR ou limpeza foi executada. As únicas execuções locais foram leitura de arquivos anexos, aritmética e criação deste pacote.

## 1. Revisão e precedência

CQ `dev=550409a92f359cffc3e75f34712d39133b8ab130`; DF `dev=ffc99748f796d8f7923c9e46161b2a4dc735eef8`. `CHECKPOINT.json` registra trees e ancestry.

A API de PR confirmou #17/#1305/#18 como mergeadas. O primeiro parent do CQ é o merge #17 (`24d6a2b4`); o `dev` é o merge #18. No DF, a cadeia de parents é `ffc99748 → 45768012 → 147c5ed5` (merge #1305). Os HEADs finais dos PRs foram lidos dos próprios metadados; não se usou existência de branch como prova de integração.

[PR17](https://github.com/nmarcofernandess/ci-queue/pull/17) · [PR1305](https://github.com/dietflowoficial/Dietflow-app/pull/1305) · [PR18](https://github.com/nmarcofernandess/ci-queue/pull/18).

A Fase 4 é uma auditoria anexa, não um commit de implementação. Seu C01 continua relevante: [runner](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/src/core/runner.ts), `readGitInfo` converte falha de status em string vazia e `runJob` prepara o env antes de anexar `preflight` ao ticket. Não duplicar esse trabalho nesta fase. P00 exige sua prova focal antes de usar H/B0 como identidade de uma comparação canônica nova. Isso não demonstra que o Full histórico teve seleção errada: aquela atribuição não foi feita.

## 2. Baseline primário — o Full AP17

**Fontes realmente lidas:** [queue-ticket.json](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json) (campos de identidade, runtime, terminal, todos os 54 gates e subestágios) e [execution-receipt.json](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/execution-receipt.json) completo. O ticket grande não foi baixado integralmente; intervalos consultados e hashes de blob estão em `evidence/AP17-EXTRACAO.json`. Não se confunde esse extrato com o receipt original.

- Ticket `20260919075127-addfb8a5`; execution `20260919075132-3fe53416-06a`.
- H `008cab050649c7d11255aef1e3a5f574581f02c1`; B0 `3d411dab21554040f9337d6564c3bce620e5129a`; pre/post idênticos e limpos.
- macOS/Darwin arm64, Node **24.20.0**, runtime `verified / guarded-node-processes`. Não há série de RAM/CPU do host para este run.
- Comando `npm run ci:local:full -- --with-flowui`; passed, exit 0; receipt `cleanup=confirmed`.

### Fronteiras temporais

| Parcela | Duração | Significado e limite |
|---|---:|---|
| criado → iniciado | **0,360 s** | Espera antes do claim; não são duas horas de fila. |
| claim → início do receipt | **4,431 s** | Entrada/preparação anterior ao contexto do consumidor; não isolada por suboperação. |
| receipt da receita | **6.920,829 s** | Inclui preparação, testes, agregação e finalização da receita. |
| fim do receipt → ticket terminal | **2,780 s** | Saída/finalização no executor; inclui atividades posteriores ao receipt. |
| job registrado na fila | **6.928,041 s** | 1h55m28,041. Diferença de 1 ms frente à subtração de timestamps, preservada. |
| cópia de artefatos | **0,931 s** | Intervalo interno à finalização, **não somar de novo**. |
| publicação externa/pack posterior/ship | **não medida aqui** | Não está contida automaticamente no relógio do ticket. |

A diferença job menos receipt é **7,212 s**. Não é um limite superior do custo total do CI Queue: redaction, pipe, coleta e guard também trabalham durante a receita. Medir só as bordas não desconta essa atividade concomitante.

### Raízes e filhos

| Raiz | s | % do job |
|---|---:|---:|
| Static | 805 | 11,62% |
| Jest | 2.247 | 32,43% |
| E2E | 3.544 | 51,15% |
| FlowUI + agregação Care | 322 | 4,65% |

Soma das raízes: **6.918 s**. Restam **2,829 s** no receipt entre as fronteiras instrumentadas. Os filhos E2E somam **3.540,939 s**, deixando **3,061 s** frente à raiz. Não inventar a distribuição desses resíduos entre cleanup/publicação.

**Duração `emitter`** das raízes vem de relógio do shell, com resolução de segundos. **Duração `collector`** de gates/filhos é o intervalo de recepção no coletor, útil para localizar trabalho, mas inclui scheduling/pipe e não mede CPU isolada. Soma de pai e filhos duplicaria o tempo.

## 3. Static — maior ganho inicial com menor mudança semântica

[54 gates completos](evidence/AP17-GATES.md). Soma dos intervalos **803,829 s**, grupo **804,311 s**, raiz **805 s**.

| Maior gate | s | % de Static |
|---|---:|---:|
| typecheck | 241,226 | 29,97% |
| check:fixtures | 197,537 | 24,54% |
| check:field-identity-ratchet | 104,836 | 13,02% |
| lint ratchet | 103,517 | 12,86% |
| typecheck:storybook | 33,010 | 4,10% |

Os cinco somam **680,126 s**, **84,49%** do Static. Types + fixtures somam **438,763 s**, mas isso **não** é economia prometida nem trabalho integralmente redundante.

### Repetição comprovada pelo código

[package.json](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/package.json), [check-fixtures-vs-schema.sh](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/check-fixtures-vs-schema.sh) e [generate-client.sh](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/prisma/generate-client.sh) mostram:

1. `check:fixtures` executa `prisma validate`, Prisma generate, **tsc do projeto inteiro**, invariantes de referências e snapshot.
2. Mais tarde, o gate `typecheck` executa Prisma generate + `next typegen` no prehook, MDX e outro tsc completo.
3. Storybook tem programa TypeScript próprio e também prepara Prisma. Não é automaticamente a mesma compilação.
4. `pretest` prepara Prisma novamente antes de cada processo `npm test`. `generate-client.sh` não contém memoização por fingerprint.

**Causa estrutural confirmada:** há comandos repetidos. **Causa da lentidão do Mac ainda aberta:** não foi medido quanto cada repetição paga de compilação fria, invalidação dos gerados, IO, GC ou scheduling. O tsc posterior de 241 s ser maior que todo o gate fixtures de 198 s impede a suposição simplista “a segunda compilação é de graça por cache”.

**Primeiro candidato de mudança:** compor uma única preparação/typecheck do mesmo universo no agregado, com reuso explícito dentro da execução. Só reutilizar resultado que provou a identidade dos inputs/config/gerados e terminou corretamente. Não usar um booleano de ambiente que declare teste passado, não estreitar o universo de TS, não compartilhar output mutável entre worktrees.

**Limite econômico inicial:** eliminar exclusivamente o trabalho redundante contido em fixtures não pode economizar mais que seus **197,537 s** naquele run; parte do gate é própria e continua. O ganho real pode ser zero ou muito menor. Não vender 438 s recuperáveis. Prisma gate 1 custou **6,990 s**, mas multiplicar isso pelo número de chamadas também não mede as demais chamadas.

### Segurança que precede esse reuso

Hoje `check:fixtures` filtra diagnóstico de tsc com `grep '^prisma/(seed|seeds)'` quando o processo falha. Um crash/OOM/erro de infraestrutura sem essas linhas pode cair no aviso “erros fora de prisma”. O Static ainda tem typecheck estrito depois: não se conclui Full falsamente verde. Porém, transformar a execução filtrada em autoridade compartilhada sem conservar exit/signal/diagnóstico seria perigoso. P02 exige regressão para esse caso, erros de produto fora de Prisma e gerados alterados entre consumidores.

**field-identity não foi inocentado nem escolhido como vilão:** consumiu 104,836 s (1,51% do Full). Pode merecer perfil, mas apagar seu trabalho por completo ainda não explicaria as duas horas. Não remover o ratchet para obter ganho.

## 4. Jest — duas perguntas diferentes

### Custo da população selecionada

O Full executa o Jest completo de produto; o smoke usa seleção `catalog/forced/related`. [full-local.sh](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/full-local.sh), [selector](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/jest-scope.ts). O registro da 125 declara 1.926 suítes / 16.188 testes; o receipt mede a etapa de 2.247 s. O relatório JSON completo do Jest não foi lido; não há ranking confiável de arquivos lentos nem decomposition transform/setup/asserção/GC.

O diagnóstico do smoke registra interseção concreta na #1256: seis arquivos forced + cinco relacionados = dez únicos, com `jest-scope.test.ts` em ambas seleções. Isso prova repetição naquela seleção; não quantifica toda a interseção atual e não autoriza fundir campanhas com ambientes distintos. [Diagnóstico](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md).

P03 começa produzindo listas reais por grupo e **perfil efetivo** (config, env, opt-ins, runner, preparação). União só dentro do mesmo perfil. Uma suíte rodar duas vezes sob condições distintas pode ser intencional; deduplicar apenas por path destruiria prova.

### Estabilidade de runtime

A [política atual](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/jest/worker-memory-policy.cjs) usa maxWorkers 1 no Full/recorte em Darwin + Node exatamente 24.20.0; em outro runtime o fallback muda. O limite idle de 1500MB também é omitido nesse runtime exato. O [package](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/package.json) já invoca Node com `--no-sparkplug`. Trocar só a versão e deixar os defaults mudarem mistura runtime, workers e reciclagem no mesmo experimento.

O [plano causal M03](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/PLANO-EXPERIMENTO-SIGSEGV.md) distingue Sparkplug, reciclagem e runtime e preserva caps. Seu braço histórico sem `--no-sparkplug` não deve ser reativado mecanicamente depois de a mitigação entrar no produto. Reancorar no runtime atual, congelar os fatores não estudados e atualizar o desenho antes de executar. Não desativar guard, reciclar worker ou elevar concorrência para fabricar velocidade.

O [registro da 125](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/125-full-ap17-fixes/progress.md) contém SIGSEGV em `20260919055151-8c2dd256`, outro run sem SIGSEGV mas com falha de suíte, e o Full final verde. Isso não é ensaio de uma variável. Nem zero crashes naquele Full nem relato de stack nativa basta para declarar cura universal ou isolamento causal de RAM.

**Sem migração Jest→Vitest nesta fase.** A documentação oficial de Jest descreve reciclagem após verificar memória ao término do trabalho, não um teto rígido de RSS durante a suíte. `--max-old-space-size` limita uma região do heap V8; 8192 não significa RAM reservada nem orçamento total da árvore. Fontes externas, separadas das medições: [Jest](https://jestjs.io/docs/configuration#workeridlememorylimit-numberstring), [Node](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib). Não há benchmark DietFlow aqui que sustente as projeções do dossiê anterior de 3–5 minutos.

## 5. E2E — preparação não é execução de casos

No ticket histórico: Bootstrap **3,832 s**; Supabase **100,811 s**; Next **762,211 s**; Playwright **2.674,085 s**. O agregado declara **177 casos = 163 passed + 14 skipped**, zero failed; skipped não significa executado. Zero retries é declarado na 125, mas não deve ser inferido de um detalhe histórico limitado de casos.

O [wrapper atual](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/e2e-local-stack.sh) confirma que:

- Bootstrap envolve runtime Docker/preflight, não só uma mensagem.
- Supabase abrange start/health, geração, migrations, seed, fixture e realtime. **Não é 100 s de custo atribuível a Colima.**
- `Next` inclui preparação/instalação de Chromium, `next build`, startup e healthcheck. **762 s não é tempo de `next start`.**
- Só `.next/standalone` é removido pelo wrapper; o restante de `.next` pode sobreviver. A afirmação “sempre apaga todo o cache” não descreve esse código.
- Q2/Q3 introduziu discovery e agregação antes de Next; parte desse novo trabalho fica dentro da fronteira ainda chamada Supabase. Comparar nós apenas por label, entre pré e pós-Q2, mistura semânticas.

P06 mede esses subcomandos primeiro. Não troca `next-start` por `next-dev`, não muda seed/reset, não remove `--fail-on-flaky-tests`, não põe cache compartilhado entre worktrees. O cache persistente já existente deve ser observado antes de construir outro cache.

Os incidentes J/K do Cursor, referidos no diagnóstico, são registros de outro host/carga e não entram no denominador de SIGSEGV nativo Mac. Não copiar swapfile, reset de banco ou recycle do relato para esta campanha.

## 6. FlowUI e o custo do próprio CI Queue

[package DF](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/package.json): `ci:flowui = test:storybook:care` (Vitest Browser) seguido de `scripts/ci-flowui.ts` (build Storybook e assertions/capturas). O nó histórico de 322 s inclui ainda `proof:care-downloads:aggregate` antes do `progress_finish`, confirmado no [Full do próprio H testado](https://github.com/dietflowoficial/Dietflow-app/blob/008cab050649c7d11255aef1e3a5f574581f02c1/scripts/ci/full-local.sh). Não chamar os 322 s de “tempo Vitest” e não ligar `FLOWUI_CI_SKIP_BUILD` para esconder trabalho.

[package CQ](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/package.json) e [wrapper CQ](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/scripts/ci/check-with-progress.sh): core/UI usam Vitest; runtime/examples/release/install usam Node; backend usa unittest Python; browser usa Playwright. O check tem quatro fases externas. O wrapper filtra markers internos para impedir que fixtures se passem por progresso do check real.

**Repetição concreta no CQ:** `check → build`, depois `test → test:runtime → build` novamente. P04 pode reduzir essa duplicação preservando `test:runtime` standalone com build fresco. A duração dessa repetição ainda não foi medida. Não atribuir ao Vitest/core o tempo de Python/browser/install, nem ao DF qualquer ganho obtido no check do CQ.

A [Fase 3](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/performance/etapa-3/CANDIDATE.md) tem benchmarks versionados de API/read-path: por exemplo, D1000H Executions All warm p95 de 202,016 para 18,962 ms e projeção live candidata de 8,642 ms p95 no conjunto especificado. São medições reportadas do servidor em dataset sintético; não são uma execução Full mais rápida. Preservar leitura incremental/cache/dedup já integrada. A PR visual #18 também não otimiza executor.

## 7. Worker, logs e disco

Esperas conhecidas de 0,360 s no Full e 0,502 s no smoke histórico refutam “fila esperando” como causa dominante **nesses tickets**, não em todos. O residual de 7,212 s fora do receipt também não mede overhead concomitante de pipes/coleta/runtime guard. Para esse efeito, usar fixture genérica de saída com volume controlado e custo observado por processo, nunca desativar supervisão no Full.

[Q1 de 20/09](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/superpowers/specs/2026-09-20-q1-disk-inventory.md) reporta worktrees ~79G lógicos, state ~57M e cópias ~45M. Não converta unidades aproximadas em bytes exatos ou soma lógica APFS em espaço recuperável. O documento não capturou a operação/path do ENOSPC. O copyArtifacts de 0,931 s pertence a 19/09; não é medição do volume de 20/09.

Classificação: scratch pertence ao teste/runtime que o criou; logs/tickets são evidência; cópias de inspeção pertencem ao executor; proofs e sua publicação pertencem ao DF. Receipt `artifacts/ci/runs/...` não está automaticamente na lista global de cópia. Os `/tmp/*` fixos dos scripts de fixtures/Next são lacuna de isolamento/durabilidade, não diagnóstico automático de disco cheio. **Nenhuma limpeza global autorizada.**

## 8. O que esta entrega resolve e o que mantém aberto

| Obrigação | Efeito da Fase 5 |
|---|---|
| Localizar o tempo do AP17 | Resolvido no alcance do ticket/receipt: quatro raízes, 54 gates, filhos E2E e bordas. Não precisa de outro Full para responder. |
| “Ainda não existem gates temporizados no Mac” | Superado para esse ticket de 19/09; preservar a afirmação antiga apenas como retrato de 14–15/09. |
| 121-M01, admissão/orçamento global | Continua aberta; série do host e prova de concorrência ausentes. C01 da Fase 4 é confiabilidade de prova, não cura de memória. |
| 121-M02, worker/launchd | Sem novo encerramento; performance não prova causa do unload ou boot da instalação atual. |
| 121-M03, SIGSEGV/Colima | Continua aberta; medições históricas misturam variáveis e não substituem piloto causal. |
| 121-M04, economia de disco/cache | Continua aberta; P06 mede cache existente antes de recomendar outra arquitetura. |
| 121-M05, retenção/ENOSPC | Continua aberta; faltam bytes físicos, operação falha e leitores validados por path. |
| 121-M06/M07 | Não reimplementar painel nem spend-abort. Estados documentais e prova instalada seguem cortes da Fase 4. |
| Spec 125 | Preservar Full histórico verde e status publicado; corrigir generalizações “100% estável/eficácia total” como documentação, sem invalidar o ticket e sem declará-lo prova do RC atual. |
| RC115 | Full do candidato pertence ao selo e só ele pode iniciar a execução final. P07 coleta o resultado; não cria campanha concorrente. |

## 9. Próxima ação

Executar **P00** agora (somente leitura). Após dependências F4 e janela segura, **P01/P02** constituem o primeiro corte útil. As três otimizações candidatas são condicionadas a prova: Static compartilhado, deduplicação Jest por perfil e build interno único do CQ. Os pilotos Jest/E2E não se tornam mudanças de produto por terem sido escritos em um prompt.
