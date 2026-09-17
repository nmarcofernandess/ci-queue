# Aceite e cenários: etapa 2

**Esta é uma matriz de testes a implementar/executar, não uma declaração de aprovação.** Uma linha é satisfeita por evidência do comportamento, com revisão identificada. Não substituir teste de integração por três objetos escritos manualmente com os mesmos valores.

## Matriz de aceite

| ID | Critério | Prova mínima | Dono |
| --- | --- | --- | --- |
| D01 | running-terminal sem duration explícita produz intervalo monotônico do mesmo ID | Unit com clock falso | E1 |
| D02 | duração explícita vence a observação, inclusive zero | Unit emitter=0/700/90000 | E1 |
| D03 | repeated running e counts não reiniciam relógio | Unit com vários eventos intermediários | E1 |
| D04 | failed→running é nova tentativa, preserva retryCount e limpa duração antiga | Unit e UI do mesmo ID | E1/E5 |
| D05 | terminal repetido não aumenta duração; terminal explícito posterior substitui inferência | Unit determinístico | E1 |
| D06 | terminal sem início fica sem número; skipped não inventa zero | Unit missing-start/skipped | E1 |
| D07 | nó aberto ao fechar o job fica missing-end e não recebe tempo do pai/job | Unit + runner | E1/E3 |
| D08 | reinício não reaproveita relógio; fatos terminais do sidecar são preservados | Restore + reconcile real temporário | E1/E3 |
| D09 | pai/irmãos sobrepostos são medidos separadamente | Unit pai1000/filhos800+800 | E1 |
| D10 | alteração do relógio civil não muda duração monotônica; clock inválido não produz número negativo | Unit wall skew e clock inválido | E1 |
| D11 | job/projeto diferente não herda âncora, retry ou duração | Dois coletores/estados isolados | E1 |
| D12 | snapshot JSON não tem bigint/âncora de processo serializada | Persistência/round trip | E1/E3 |
| D13 | stdout/stderr fragmentados não se misturam; UTF-8/última linha preservados | Decoders e processo real | E2 |
| D14 | instrumentação não acrescenta IO periódico nem processo por nó | Clock avança sem eventos, zero writes adicionais | E2 |
| D15 | último snapshot em memória chega a history apesar de falha de sidecar | Falha de IO injetada | E3 |
| D16 | sidecar só é limpo após publicação terminal confirmada | History write fails / cleanup fails / retry de fechamento | E3 |
| D17 | cancel/timeout/crash não viram nó passed nem tempo falso | Runner/recovery e projeção terminal | E3/E4 |
| D18 | artifacts mede só a operação existente, sem alterar política/veredito | Cópia bem-sucedida/erro/skipped em temp | E3 |
| D19 | nodes/roots/active e CLI/HTTP/diagnóstico conservam os mesmos fatos por ID | Terminal TS → reader Python → comparador de fatos | E4 |
| D20 | bool/NaN/negativo/overflow/enums inválidos não geram duração falsa nem derrubam árvore válida | Unit Python/TS de projeção | E4 |
| D21 | projeto sem catálogo conserva isolamento do diagnóstico e todos os guards | HTTP A/B/unassigned | E4 |
| D22 | árvore/faixa mostram número e fonte iguais; legado sem source continua legível | Modelo + browser | E5 |
| D23 | 0 ms não é ausência; collector é distinto de emitter e ausência tem explicação acessível | Unit + Tooltip com teclado | E5 |
| D24 | geometria/chevrons/flaky/contadores/scroll não regridem | Browser largo/intermediário/estreito, claro/escuro | E5/E7 |
| D25 | markers antigos do Static e Playwright funcionam sem mudança de receita | Fixture de contrato em processo real | E6 |
| D26 | todos os gates publicados com fronteiras completas têm tempo, não só roots | Árvore com group e vários gates | E6/E7 |
| D27 | registros antigos não são reescritos ou reprocessados; ledger fica intacto | Fixtures antes/depois e isolamento do state | E3/E7 |
| D28 | a prova final usa UI/API/runtime da mesma candidata | E2E com build próprio + state temporário | E7 |
| D29 | suíte completa da candidata é executada sem dist de worktree irmã | npm run check, HEAD e evidências | E0/E7 |

## Fixtures de relógio falso

`fixtures/timing-cases.json` contém exemplos sintéticos com eventos TSV em arrays de campos. O teste converte `fields.join('\t')` e ajusta o clock injetável antes de cada operação.

Operações da fixture:

- `ingest`: entregar o marker ao coletor.
- `finalize`: finalizar a coleta e testar snapshot estável.
- `recreate`: criar outro coletor lendo o snapshot persistido, com novo relógio de processo. Não carregar o Map de âncoras antigo.

`initialNodes` representa um sidecar legado de fixture, não um arquivo de produção. `expectedNodes` contém campos que precisam existir e uma lista `absent` de campos que devem continuar ausentes. Não exigir igualdade do snapshot inteiro quando updatedAt ou outros campos legítimos diferem.

`atMs` é a leitura monotônica simulada dentro do coletor vigente. `wallIso`, quando informado, muda só o relógio civil. Em `recreate`, o monotônico pode reiniciar numa origem diferente; isso não dá direito a subtrair valores de coletores distintos.

### Leitura dos exemplos

```text
inferred-basic:
 running em 0, passed em 1250
 → durationMs=1250, durationSource=collector

emitter-wins:
 running em 0, passed em 200 com durationMs=90000
 → durationMs=90000, durationSource=emitter

restart-loses-anchor:
 running em coletor A
 coletor B restaura snapshot
 terminal sem duração
 → sem durationMs, reason=collector-restarted
```

Os valores são escolhidos para testar regras, não para simular a performance atual do Mac. Não comparar medidas reais a uma tolerância impossível de 1 ms sob carga de CI.

## Prova curta com processo real

Criar um emissor de fixture Node que:

1. publique root/group/gate running sem durationMs;
2. publique um caso com duração explícita 7 ms após uma espera física diferente, demonstrando precedência;
3. publique um failed→running→passed com mesmo ID;
4. separe um marker UTF-8 por chunks e intercale outra saída no outro pipe;
5. deixe um nó running sem terminal para testar ausência;
6. finalize com exit code previamente escolhido pelo cenário.

O teste observa a duração inferida como inteiro não negativo e fonte collector, não como valor físico exato. A duração explícita deve ser exatamente 7. Para medir o comportamento de 30 minutos, usar a fixture de relógio falso, não manter um processo dormindo 30 minutos.

Um handshake temporário entre teste e fixture pode segurar a transição até a UI ler o snapshot. Use timeout curto e teardown que encerre apenas processos identificados pelo teste. Nunca procurar/matar worker por nome nem usar a fila real.

## Recortes visuais necessários

Não são necessárias centenas de capturas. O índice precisa mostrar os cenários que distinguem comportamentos:

| Superfície | Dados |
| --- | --- |
| Faixa da execução atual | Um estágio concluído emitter, outro collector e um running sem número falso |
| Drawer expandido | Grupo, gates e caso retry; leaf alinhada com siblings que possuem chevron |
| Terminal interrompido | Nó completo preservado e nó sem fim com ausência explícita |
| Histórico legado | Número sem source e ausência sem metadado, sem erro de schema |
| Tooltip/foco | Fonte e ms exatos, sem abrir outro detalhe |
| Estreito | Número, título longo, ação e chevron dentro do recuo existente |

Inspecionar os PNGs efetivamente, nomeá-los pelo cenário e registrar SHA. Uma captura gerada mas não aberta não é prova visual inspecionada.

## Recibo final

```text
BASE:
HEAD:
ARQUIVOS DE CÓDIGO CAPTURADOS / TREE OU HASHES:
DIST PRÓPRIO:
UI BUILD / API / EMISSOR:
STATE TEMPORÁRIO:

D01–D29:
  id → teste / comando / resultado / revisão

CHECK COMPLETO:
  comando, exit, contagens verdadeiras, skips

PROVA DE PASSAGEM:
  marker → collector → sidecar → terminal → CLI/API → árvore/faixa

DURAÇÃO SEM EVIDÊNCIA:
  casos e motivos previstos, sem valores fabricados

COBERTURA DO CONSUMIDOR:
  nós existentes medidos; granularidades não emitidas declaradas

STATE/LEDGER/INSTALAÇÃO REAIS:
  nenhuma mutação

PR DRAFT / LIMITAÇÕES:
```
