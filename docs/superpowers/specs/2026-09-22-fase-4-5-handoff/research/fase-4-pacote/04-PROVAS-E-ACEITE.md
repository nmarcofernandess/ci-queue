# Provas faltantes e aceite da fase 4

## A. Artefatos exatos a receber, sem reinstalação

Todos os paths do Mac devem ser confirmados no host. Esta auditoria não os leu. Não recriar um log ausente com outro run.

1. **Instalação ativa:** saída sanitizada de `ci-queue version --json`, `GET /health` e `GET /build.json` de `127.0.0.1:8765`; `~/.local/share/ci-queue/installation.json`; estado dos labels `com.nmarcofernandess.ci-queue.dashboard` e `.worker` obtido com `launchctl print`. Conservar revisão, manifest/state e label; retirar tokens/segredos. Não iniciar worker para fazê-lo aparecer: ocioso on-demand é legítimo.
2. **Q2/Q3 oficiais:** `history/20260921115512-ccc7ede4.json` e `history/20260921121505-f0a9fe7e.json` sob o state efetivo; trechos/receipts existentes que associam suíte e build ao HEAD. O PR é relato de resultado, não arquivo bruto recebido.
3. **Full da 125:** `history/20260919075127-addfb8a5.json`, o log de mesmo ID e `artifacts/ci/runs/20260919075132-3fe53416-06a/receipt.json` na worktree/publisher que realmente o preservou. Não supor que existe na atual raiz canônica.
4. **Falha nativa relevante:** `history/20260919055151-8c2dd256.json`, trecho de log com comando/runtime/exit e `~/Library/Logs/DiagnosticReports/node-2026-09-19-034108.ips` sanitizado. Necessário apenas se a afirmação for sobre causa/estabilidade de M03.
5. **ENOSPC em questão:** ticket/executionID, timestamp, syscall/operação, path indicado no erro, filesystem do path e snapshot de capacidade existente daquela janela. ID do evento recente não foi fornecido; não associar automaticamente ao17/09.
6. **Entrega visual #18:** índice/screenshots e revisão da página capturada; receipt `history/20260921133518-b846929f.json` no state efetivo. PR/HEAD/merge já foram conferidos: HEAD `17b379a55682489864d5d328ead68b1581d602fc`, merge `550409a92f359cffc3e75f34712d39133b8ab130`. Não pedir novo merge. Falta receber a evidência visual/instalada, não inventar o número da PR.

Sem esses artefatos, INSTALL-PROVENANCE, VISUAL-ACCEPTANCE, preservação física atual e causa do ENOSPC permanecem NÃO COMPROVADO. O receipt de 20/09 de 7af1a26 continua válido como relato daquela instalação, não é receipt automático de 550409a.

## B. Aceite visual pós-merge da PR #18 — V01

**Não implementar a tabela de novo.** #18 já tem código e testes geométricos incorporados. Conferir esses testes, pedir as capturas e completar somente a prova que estiver ausente.

| Cenário | Invariante observável |
|---|---|
| Histórico: preset curto e longo; projeto longo + Personalizado/Focal; flaky no indicador | Nome tem largura útil legível; badges contextuais não o reduzem a zero/quase-zero; flaky continua no tooltip/nome acessível do indicador; contexto completo acessível por teclado/tooltip. |
| Largura ampla vs média | Revisão aproveita orçamento disponível; não há teto residual que esconda branch apesar de espaço livre. SHA completo permanece acessível. |
| Worktrees com overflow | No início, meio e fim da rolagem horizontal, **nome e olho permanecem visíveis e clicáveis**. Não basta a célula existir fora do viewport. |
| Branch de Worktree longa | Pode rolar e elidir quando necessário; valor completo acessível. Não obriga todos os campos a sticky. |
| Título, olho, checkbox, metadados | Só título/olho abrem; seleção não abre drawer nem perde foco; não cobrir checkbox com célula sticky. |
| Carregar mais / filtro / voltar à aba | Seleção, contexto e comportamento de refresh preservados; não confundir widthfix com nova paginação. |
| Fila/Histórico/ÚltimosVerdes/PorCommit/drawer relacionado | Família compartilhada não fica correta em uma superfície e quebrada em outra. |
| 640 / 820 / 1440 / 1600 px; claro/escuro; zoom100% e200% | Texto e alvos permanecem operáveis; overflow fica no container previsto, não no body inteiro. Avaliar estreito adicional quando o contrato mobile exigir. |
| Refresh falho após dados | Erro explícito e dados anteriores da mesma consulta presentes (C04); nova consulta não usa linhas de outra. |

Asserções geométricas devem comparar viewport do container, retângulos do título/ação e áreas de sobreposição. Não fixar cada classe ou pixel interno do shadcn. Usar orçamento semântico escolhido na PR visual, não copiar números desta auditoria como novo design.

A captura precisa identificar build/SHA e estado da fixture. Suíte verde não é aprovação humana; aprovação antiga não licencia toda nova geometria.

## C. Prova integrada Q2/Q3 — C03

Mesmo ticket sintético, passando por emissor real DF, worker/collector CQ, API CQ e UI compilada da candidata:

- sete casos planejados enquanto uma preparação sintética espera em barreira explícita;
- mesma população na execução normal; repeatEach não colide; retry não infla total;
- duas invocações do mesmo projeto com IDs próprios e agregado vivo;
- mismatch antecipado7/real2 explícito, sem cinco fantasmas pending;
- falha antes de iniciar teste não inventa skipped; fail-fast não fabrica aprovado;
- 1001º caso omitido com retry conserva hasRetries; live permanece limitado;
- canonical filter e opção operacional não viram focal; seletor confirmado vira; cap ausente recusa antes de criar job;
- projetoB executa enquanto filtroA está selecionado; detalhe abre o ticketB sem trocarA;
- terminal preserva progresso/variante, sidecar some só depois da publicação; CLI/HTTP coerentes.

Não precisar de Next, Supabase, UI clínica ou Full do DietFlow. Fixtures internas usam state/HOME temporários. O job real que executa a suíte no Mac entra na fila oficial.

## D. Matriz de framework e lacunas de teste — C06

Para cada entrypoint registrar: owner, runner efetivo, comando/cwd/runtime, seleção, imports vs leituras filesystem, eventos progress emitidos, profundidade comprovada, log/output/receipt e evidência terminal.

Regressões que faltam ou precisam ficar explícitas:

- erro em git-status nunca vira clean; env B0 igual ao preflight observado (C01);
- erro de refresh não desmonta tabela com dados bons da mesma consulta (C04);
- nome/olho no scroll em três posições e nome com badges contextuais; flaky no indicador atual (V01);
- pipeline real produtor/collector/render e cap antigo (C03);
- related não perde contratos lidos por filesystem; mudanças em `.sh/.yml` têm gatilho declarado;
- escopo material desconhecido/deleção não ganha verde vazio via passWithNoTests;
- full é recomendação conforme policy ativa, não execução automática por uma frase solta;
- fixture que imprime marcador de protocolo não contamina progresso do self-host.

Onde o teste já cobre o contrato, preservar e apontar. Teste já verde não é RED nem motivo para fabricar falha. Não usar grep de comentário ou snapshot de JSX como único teste de comportamento.

## E. Dados do checkpoint final que não devem ser misturados

A causa do ENOSPC recente precisa do artefato daquele evento. Os incidentes J/K da 121 têm host Linux/Cursor Cloud, receipts locais referidos no documento e logs parcialmente ausentes; não são recibos do Mac. Se forem usados numa comparação, receber os receipts indicados neles e preservar a classificação de host, execução direct, H/base, cache, memória e concorrência. Ausência permanece ausência; nenhum experimento é autorizado aqui.
