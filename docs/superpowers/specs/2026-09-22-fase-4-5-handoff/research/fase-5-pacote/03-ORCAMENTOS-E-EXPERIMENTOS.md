# Orçamentos e experimentos — definidos depois da leitura do baseline

## 1. Orçamento numérico de referência, não SLO novo

O baseline verificável tem n=1, H008cab050, Node24.20.0 Darwin arm64. Este é o orçamento contábil **observado** a preservar no relatório; não é timeout, previsão para o `dev` atual ou promessa de redução. Fonte: [ticket](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json), [receipt](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/execution-receipt.json).

| Camada | Referência (s) | Regra para usar na comparação |
|---|---:|---|
| Espera | 0,360 | Fora do runtime da receita; publicar separadamente. |
| Entrada até receipt | 4,431 | Não chamar de teste; instrumentar só se virar candidato relevante. |
| Static | 805,000 | 54 gates históricos. `dev` tem56; inventário atual precisa acompanhar tempo. |
| Jest completo | 2.247,000 | Não é o related do smoke; contagem por perfil. |
| Bootstrap E2E | 3,832 | Filho aproximado collector. |
| Supabase/preparação | 100,811 | Filho; inclui muito mais que DB; pré-Q2. |
| Next/preparação | 762,211 | Filho; Chromium+build+startup+health. |
| Playwright | 2.674,085 | Filho; 177 casos no agregado, 14 skipped. |
| Resíduo E2E | 3,061 | Diferença entre raiz e filhos, não nova etapa inventada. |
| FlowUI + agregação Care | 322,000 | Separar internamente antes de atribuir a Vitest/Storybook/pack. |
| Resíduo dentro do receipt | 2,829 | Não atribuído. |
| Final do receipt até terminal | 2,780 | Inclui cópia de0,931; não somar cópia novamente. |
| Receita total | **6.920,829** | Soma contábil coerente. |
| Job total gravado | **6.928,041** | Diferença1ms para timestamps, não corrigir arquivo original. |

**Nenhuma meta absoluta nova foi liberada.** O valor atual por estágio será a mediana das amostras pareadas comparáveis coletadas em P01/P07, com min/max, n e censura, antes de escolher uma meta. Não usar o p95 do painel como orçamento do executor.

## 2. Prioridade pelo custo realmente exposto

| Hipótese / superfície observada | Evidência | Experimento mínimo que discrimina | Decisão / teto econômico |
|---|---|---|---|
| Dois typechecks/preparações fazem trabalho redundante | Fixture197,537 s; typecheck241,226 s; ambos chamam tsc amplo | Preparação e subprocessos cronometrados no mesmo Static; comparar hashes/config/gerados; executar um reuso controlado só após identidade | P02. Eliminação só dentro de fixtures: ganho estritamente menor que197,537 s naquele run; valor recuperável desconhecido. |
| Gerados invalidam trabalho incremental | Prisma chamado em múltiplas entradas; tsc posterior ainda caro | Registrar hash/mtime antes/depois de Prisma/Next typegen/MDX e tempo do tsc; nenhum cache global apagado | Otimizar writer/preparo só se a invalidação causal aparecer. |
| Related/campaign/forced executam arquivos equivalentes de novo | Interseção real no smoke#1256; processos separados no selector | Listar união/interseção com config/env/hook e número de execuções por path | P03. Potencial=minutos dos duplicados medidos menos custo adicional da seleção; não inferir do número de arquivos. |
| CI Queue recompila core duas vezes no próprio check | check→build; test:runtime→build | Contar duas invocações com relógio; comparar entrada standalone e agregado | P04. Economia limitada a um build interno medido; não é ganho no DF. |
| Um worker/ambiente jsdom/transform/GC explica Jest lento | Etapa2247 s, política de runtime; não há perfil por suíte | Piloto de um recorte congelado com eventos por PID/config; alterar só um fator | P05. Não escolher threads/Vitest/500MB ou workers4 por preferência. |
| Cache Next frio domina preparo | Nó Next762,211 s; `.next/cache` não é sempre apagado | Mesma receita focal e árvore; namespace/cache e hash de inputs, separado de Chromium/build/start | P06. Não eliminar next-start nem compartilhar output vivo. |
| Seed/reset DB é maior gargalo | Grupo100,811 s é todo preparo DB+geradores | Partir start/health/gen/migrate/seed/realtime/discovery | Sem templateDB/snapshot por agora;100,811 s nem todo é DB e vale1,46% do Full. |
| Overhead de logs/progress/guard é alto | Atividade dentro das fases; custo total não isolado pelas bordas | Fixture genérica temporária de saída com volume conhecido, mesma supervisão; CPU/bytes/writes/latência; variar só volume ou uma candidata preservando segurança | Só modificar produto CQ se houver efeito medido; não desligar guard na prova clínica. |
| Painel aberto degrada job | Read-path foi otimizado, mas não há par de recipe runs com esta variável | Preferir medir consumo do processo/API com fixture; observar aberturas já existentes, sem segundo Full | Não inferir ganho de job a partir de HTTP p95. |
| ENOSPC vem de cópias/scratch | Q1 mostra populações, sem path da operação falha | Inventário físico/lógico por owner/leitor e stderr da operação, sem prune | M05 permanece aberta; não pressupor cleaner. |

Fontes: [Static/preparação](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/check-fixtures-vs-schema.sh), [package DF](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/package.json), [wrapper E2E](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/scripts/ci/e2e-local-stack.sh), [CQ](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/package.json), [série smoke](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/docs/harness/DIAGNOSTICO-CUSTO-SMOKETEST.md), [Q1](https://github.com/nmarcofernandess/ci-queue/blob/550409a92f359cffc3e75f34712d39133b8ab130/docs/superpowers/specs/2026-09-20-q1-disk-inventory.md).

## 3. Amostragem e aceite

Primeiro usar arquivos já existentes. Uma única dupla A/B é triagem, não prova de estabilidade. Para uma mudança barata que mostrar ganho, usar **três pares pequenos** com ordem balanceada e comparar deltas pareados; não três Fulls. Se o custo do recorte tornar esse desenho excessivo, aproveitar validações regulares já autorizadas ou encerrar com evidência insuficiente. Não expandir automaticamente o ensaio.

Cache frio e quente são estratos distintos. Não limpar cache do SO/usuário e não chamar worktree recém-criada de cache frio de todas as camadas. Namespace isolado, preparo idêntico e ausência de concorrência são parte da amostra. Se a mudança estudada for o cache, declará-lo como o único tratamento.

Aceite: mesma população, condições, asserts, resultado, retries e skipped; segurança/cleanup comprovados; hashes/config coerentes; melhoria maior que a variação observada do próprio recorte; custo de instrumentação declarado. Uma corrida vermelha não concorre como “mais rápida”. Timeout/abort é censura com motivo, não duração vencedora. Não mudar deadlines/timeouts para satisfazer orçamento.

## 4. Limites de segurança da investigação M03

Preservar o [plano já aprovado](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/121-harness-resource-exhaustion/PLANO-EXPERIMENTO-SIGSEGV.md): piloto até **3 runs, 10 min por run, 30 min total**; orçamento ampliado de pares até120 min só no escopo que o plano autoriza e após reancorar suas hipóteses no código atual. O piloto sem reprodução termina inconclusivo, não dispara Full.

Proteções provisórias desse experimento: ≥15GiB livres para iniciar; parar se<10GiB, pressão crítica por2 amostras5s, RSS da árvore experimental>8GiB por2 amostras ou swap crescer>1GiB com pressão alta. Medida ausente pausa. Não são caps de produção nem prova da causa. Sem carga pesada concorrente, encerramento por identidade, não matar outro job. Não aplicar esses números como política global de retenção/host.

## 5. Rollback e integração

Cada corte modifica um owner. Rollback é revert do delta revisado, não apagar evidência/cache/state ou restaurar uma worktree por reset destrutivo. F4 C01 e equivalência do protocolo Q2/Q3 são pré-condições quando o corte os atravessa. Gate de capability continua; nenhum produtor envia protocolo novo para distribuição antiga.

O Full do RC115 é apenas **uma futura amostra integrada** do H do selo. Seu tempo pode ser anexado a esta análise, mas não é amostra A/B se H/população/host mudaram. O controlador de selo decide quando ele roda. Nenhum prompt deste pacote inicia Full por conta própria.
