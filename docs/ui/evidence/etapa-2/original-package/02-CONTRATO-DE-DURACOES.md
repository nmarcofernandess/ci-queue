# Contrato da etapa 2: durações dos nós de progresso

**Estado:** especificação de implementação. Não é código já entregue.

## 1. Resultado observável

Cada nó publicado com início e fim observáveis deve conservar uma duração final utilizável no histórico, no detalhe, no diagnóstico e na CLI. A faixa da execução atual mostra os tempos dos estágios já concluídos usando a mesma interpretação da árvore.

A escolha é:

```text
Duração terminal explícita e válida do emissor?
  sim → conservar exatamente, origem emitter
  não → início e fim da tentativa observados pelo mesmo coletor?
           sim → intervalo monotônico observado, origem collector
           não → ausência explícita, nunca zero fabricado
```

O coletor não precisa ser especializado em Static, Jest ou Playwright. Ele acompanha IDs e transições do protocolo existente.

## 2. Transporte e dados persistidos

Não mudar prefixos, versão TSV, quantidade de colunas ou significado dos campos existentes:

```text
@@ci-queue-progress<TAB>1<TAB>node<TAB>id<TAB>parentId-ou--<TAB>kind<TAB>status<TAB>durationMs-ou--<TAB>label
```

`@@local-ci-progress` continua aceito. Nenhum produtor é obrigado a importar biblioteca do CI Queue.

Adicionar campos opcionais a `ProgressNode` em `src/contracts/schema.ts` e espelhá-los no contrato público da UI:

```ts
export type ProgressDurationSource = "emitter" | "collector"
export type ProgressDurationUnavailableReason =
  | "missing-start"
  | "missing-end"
  | "collector-restarted"
  | "clock-invalid"

// Incorporar estes campos a ProgressNode; os demais permanecem.
export type ProgressDurationMetadata = {
  durationMs?: number
  durationSource?: ProgressDurationSource
  durationUnavailableReason?: ProgressDurationUnavailableReason
}
```

Regras:

- durationMs é inteiro seguro, finito e não negativo, em milissegundos. Zero é um valor real.
- durationSource só acompanha uma duração numérica válida. Não publicar source sem valor.
- durationUnavailableReason acompanha a ausência do valor, nunca um número fabricado para preencher a interface.
- Os campos são aditivos. Preservar progress schema 1, ticket schemas legados e envelope HTTP existente. Não criar migração da coleção histórica.
- Duração antiga sem source continua numérica, mas com origem não registrada. Não rotular todo histórico antigo como emitter por suposição.
- A origem é procedência operacional, não assinatura criptográfica nem prova de qualidade do teste.
- O evento parseado do produtor contém apenas os campos do protocolo. Não permitir que novos metadados internos entrem por um `Omit<ProgressNode,...>` amplo sem revisão. Usar um Pick explícito para o tipo de node event.

## 3. Relógio

Usar `process.hrtime.bigint()` no coletor, com dependência injetável nos testes. Converter a diferença de nanosegundos para milissegundos por truncamento inteiro, mantendo o valor exato em ms resultante. A API/JSON nunca recebem bigint.

```ts
export interface ProgressClock {
  monotonicNowNs(): bigint
  wallNowIso(): string
}

export const systemProgressClock: ProgressClock = {
  monotonicNowNs: () => process.hrtime.bigint(),
  wallNowIso: () => new Date().toISOString(),
}
```

`wallNowIso()` continua servindo a updatedAt e procedência textual. **Não subtrair datas de parede para a duração inferida.** Alterar Date.now, fuso ou relógio do host não deve mudar a diferença monotônica numa tentativa contínua.

O início é o recebimento/interpretação de um marcador completo `running`, não a chegada de um pedaço incompleto da linha. O fim é a interpretação do terminal. Buffering do produtor, agendamento do event loop e transporte fazem parte do limite dessa medição; a UI não a chama de duração interna exata.

Não prometer precisão de CPU, inclusão idêntica de suspensão do SO em todas as plataformas, nem resolução real de nanossegundos só porque a API devolve nanossegundos.

## 4. Máquina de estados por ID e tentativa

A chave de timing é o ID do nó **dentro de um job**. Nenhum mapa é compartilhado entre tickets ou projetos.

| Entrada | Ação de timing |
| --- | --- |
| pending inicial | Sem relógio e sem duração inferida. |
| primeiro running | Registrar uma âncora monotônica da tentativa. Limpar motivo de ausência anterior. |
| running repetido | Conservar a primeira âncora; não contar retry nem reiniciar. |
| counts | Não abrir, fechar ou reiniciar nenhum relógio. |
| passed/failed/skipped com durationMs explícito válido | Valor explícito vence. Origem emitter. Não somar observação do coletor. |
| terminal sem durationMs, com âncora contínua | Diferença monotônica; origem collector. Remover âncora da tentativa. |
| terminal sem durationMs e sem início conhecido | Sem número; reason missing-start. |
| terminal sem durationMs após restauração de running de outro coletor | Sem número; reason collector-restarted. |
| terminal repetido sem duração nova | Preservar o primeiro resultado final, sem ampliar o intervalo. |
| terminal posterior da mesma tentativa com duração explícita válida | Pode substituir uma inferência do coletor. Origem passa a emitter. |
| failed → running | Retry atual: incrementar retryCount pelo reducer existente, limpar duração/source/motivo da tentativa anterior e abrir uma âncora nova. |
| outro terminal → running | Novo intervalo observado no mesmo ID, limpar a medida anterior; não inventar retryCount. Recomendar ID próprio para invocações distintas no contrato do emissor. |
| running → pending inesperado | Não manter uma âncora atravessando o recuo. Descartá-la; só medir após novo running. Não corrigir o estado do produtor para passed. |

Prioridade usa a duração do **evento terminal atual**, não durationMs herdado por merge de um running ou da tentativa anterior. O protocolo aceita números em updates running: preservá-los como snapshot informado pelo emissor, sem transformá-los automaticamente na duração final se o terminal vier com `-`.

Um terminal skipped sem início e sem valor explícito não é uma execução de zero milissegundos. Um skipped após início pode ter consumido tempo; medir somente o intervalo efetivamente observado ou conservar o número do produtor.

Em retry, durationMs continua significando a tentativa atual/última, conforme os testes atuais. Não trocar discretamente para soma de tentativas. O intervalo do pai, quando ele envolve todas as tentativas, naturalmente abrange retries e esperas. Não adicionar árvore de tentativas nesta entrega.

Eventos malformados continuam ignorados pelo parser. Eles não abrem relógios, não substituem um início válido e não mudam veredito.

## 5. Hierarquia e paralelismo

Cada nó é medido independentemente. Exemplo:

```text
Pai:  t=0 até t=1000      → 1000 ms
Filho A: 100 até 900      →  800 ms
Filho B: 200 até 1000     →  800 ms
```

O pai continua 1.000 ms, não 1.600 ms. Não deduzir overhead subtraindo soma de filhos sobrepostos. Não chamar intervalo observado de CPU ou custo de worker.

Os limites existentes de hierarquia, nós e profundidade permanecem. Timing não cria nós para cada pulso de relógio, tentativa ou amostra. Não adicionar um serviço de eventos.

## 6. Um coletor, dois pipes

`runJob` deve manter **uma instância de ProgressCollector** do início à finalização. Ela possui o estado e o mapa monotônico. Os decoders de stdout e stderr são independentes e entregam linhas completas à mesma instância.

- Fragmentos de stderr não completam uma linha pendente de stdout e vice-versa.
- Decodificação UTF-8 respeita fronteiras de bytes: usar StringDecoder ou stream.setEncoding, um por pipe, não `Buffer.toString()` independente para cada fragmento multibyte.
- Preservar recebimento do último fragmento sem newline no close.
- Não sortear eventos pelos timestamps de parede, nem supor uma ordem absoluta de execução entre dois pipes. A ordem observada é a ordem entregue ao coletor.
- Manter os contratos existentes de redação de segredos no log. Corrigir progresso não pode voltar a gravar credenciais brutas.
- Não adicionar polling, heartbeat, timer de IO ou processo por nó. Escritas continuam atreladas a eventos/snapshot final, não à passagem de segundos.

## 7. Finalização e persistência

Ordem exigida:

```text
close do processo e fechamento dos streams
  → flush de ambos os decoders
  → processamento dos eventos finais existentes
  → snapshot final do mesmo coletor
  → publicar terminal em history sob o lock existente
  → somente após sucesso, remover sidecar de progresso
```

`finalProgress` não pode criar outro coletor no encerramento normal, pois perderia as âncoras em memória. O ticket terminal deve receber o snapshot mais recente **em memória**, mesmo que a última escrita do sidecar tenha falhado.

`closeRunningTicket` ou o trecho responsável pelo commit terminal só autoriza limpeza quando o terminal foi realmente publicado ou já existe como registro autoritativo. Um retorno de candidate sem confirmação de gravação não autoriza apagar o sidecar. Não remodelar a fila nem substituir seus locks.

Se publicar o terminal falhar, conservar o sidecar para recuperação. Se remover o sidecar falhar depois da publicação, o terminal continua autoritativo. Não sobrescrever um terminal existente para fazer outra finalização obter números diferentes.

**Artefatos:** medir somente a operação de cópia já existente, quando ela realmente acontece. Abrir/fechar o nó existente em torno de copyArtifacts, inclusive no caminho de erro, sem alterar política de cópia ou status do job. Caso skipped sem operação não ganha tempo inferido. Reservar/conservar o ID interno existente; não criar um segundo nó de artefatos.

Não acrescentar novos estágios de preflight, clone, rede, setup ou teardown para parecer que todo o total foi explicado. A duração do job e sua espera permanecem com o contrato atual; esta etapa trata dos nós.

## 8. Crash, cancelamento e início/fim ausentes

O worker atual não retoma um processo sem ownership comprovado. Preservar essa regra.

- Ao restaurar um sidecar, preservar durações terminais já registradas.
- Nunca recuperar uma âncora monotônica subtraindo updatedAt, startedAt do ticket ou outro relógio de processo.
- Running restaurado perde continuidade. Repetição de running não a recupera magicamente. Um terminal explícito com durationMs continua válido; uma nova tentativa reconhecida pode abrir nova âncora.
- Ao fechar normalmente um job cujo nó ficou aberto, manter o status emitido e reason missing-end, sem inventar passed/failed do nó. A UI já interpreta job terminal versus nó running.
- Ao reconciliar owner morto, anexar o sidecar existente ao ticket interrompido e marcar a medição aberta como collector-restarted. Não preencher tempo até o instante de descoberta do crash.
- Nenhuma duração numérica deve continuar crescendo depois de terminal/cancelamento/timeout.
- Uma falha na observabilidade não muda exitCode nem transforma sucesso em erro. Falha na publicação autoritativa do terminal permanece um problema de persistência, não algo a ser encoberto por essa regra.

## 9. Projeção HTTP/CLI/diagnóstico

Em `progress_summary`, publicar os campos novos na mesma função que produz nodes, roots e active. Não implementar três critérios divergentes.

Validar número inteiro seguro não negativo, source na enum, reason na enum. Número inválido perde duração/source, sem converter para zero. Se houver número válido e reason contraditório, publicar o número com source válida e omitir o reason. Metadado malformado não deve apagar toda uma árvore estruturalmente válida.

A CLI deve conservar esses campos no JSON bruto, e o diagnóstico deve conter a mesma duração/origem. Comparação CLI/HTTP pode normalizar a forma da árvore, mas os fatos de cada ID precisam coincidir.

Continuam invariantes: project.id independente do catálogo; consultas A/B isoladas; arquivo unassigned explícito; nenhuma alteração no ledger, nos projetos ou no estado de Meta. GET não mede nem escreve timing.

## 10. Apresentação compartilhada

Criar somente um pequeno proprietário de conteúdo de duração de progresso, usado por `ProgressTree` e `ExecutionStages`. Os contêineres existentes continuam donos de coluna, fonte, alinhamento e padding.

| Dado | Texto | Informação acessível por Tooltip/foco |
| --- | --- | --- |
| emitter final | `42s` | Informado pelo emissor; valor exato em ms. |
| collector final | `≈ 42s` | Intervalo observado pelo CI Queue entre marcadores; pode incluir buffering. Valor em ms. |
| numérico legado sem source | `42s` | Origem da duração não registrada neste histórico. |
| terminal sem medida | `—` | Motivo específico: início/fim ausente, coleta reiniciada ou relógio inválido. |
| pending/running sem número | Não acrescentar um falso cronômetro. | Preservar o estado atual do nó. |

Usar `formatDuration` já existente, que distingue 0 ms de ausência. Não mudar globalmente formatação de todas as tabelas.

Não criar timer por nó. O pedido é duração medida/concluída, não estimativa de quanto falta. Relógio já existente da duração total do job permanece fora dessa mudança. Um valor explícito em running é um snapshot parcial do emissor, não nova medição contínua criada nesta etapa.

Tooltip deve ser acessível por teclado; não fazer o texto de duração abrir outro drawer. Não adicionar badges de origem ou parágrafos repetidos a cada linha. Preservar coluna do chevron nas folhas, ordem da árvore, flaky e contadores.

## 11. Atualização documental e compatibilidade

Substituir pontualmente a cláusula atual `Duração ausente permanece ausente` por:

> Duração final informada pelo emissor é preservada. Na ausência dela, início e fim observados continuamente pelo coletor permitem uma duração identificada como observada. Sem essa evidência, a duração permanece ausente. Não inferimos tempos de registros históricos.

Atualizar CONTRACTS, PRODUCT-CONTRACT e mapas de proprietários. O TSV histórico não será usado para voltar a colocar a medição de gates no roadmap. Não reclassificar dezenas de itens antigos nem inventar outra especificação mãe.

A instalação antiga continuará sem produzir inferências novas; produtores antigos continuam compatíveis com o produto novo. Leitores antigos podem ignorar metadados adicionais e ainda ler durationMs. Não afirmar que um leitor antigo conhece a procedência nova.
