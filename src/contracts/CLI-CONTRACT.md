# CLI JSON v1

Toda chamada com `--json` escreve um único objeto em stdout e usa stderr apenas
para diagnóstico humano. A forma é uma destas:

```json
{ "apiVersion": 1, "ok": true, "result": {} }
```

```json
{
  "apiVersion": 1,
  "ok": false,
  "error": { "code": "CONFIG_INVALID", "message": "..." }
}
```

Comandos atuais incluem `version`, `init`, `config`, `enqueue`, `worker`, `status`,
`history`, `observe`, `preset-history`, `advisory`, `logs`, `cancel`, `pause`,
`resume`, `disk-guard`, `runtime`, `guard` e `ship`; consulte a ajuda emitida pela
CLI para as formas aceitas. O
projeto declara receitas em `ci-queue.json`. Seus comandos continuam executáveis
sem a CLI. `guard` é uma opção do consumidor para impor admissão Queue em um
comando específico, não um requisito de adoção.

`advisory upsert --preset <nome> --head-sha <sha-completo> --reason <texto>
[--pr <numero>]` registra uma recomendação de validação. A chave é
`projeto + preset + PR` quando há PR; repetir a chamada atualiza o mesmo item.
Sem PR, uma repetição idêntica por SHA e motivo é idempotente. O comando rejeita
preset inexistente e nunca enfileira execução. `advisory list` expõe os registros
brutos do projeto; a API do dashboard deriva quais ainda estão pendentes a partir
dos verdes canônicos posteriores.

`pause <ticketId> --reason <texto>` devolve `kind` `paused` ou `already-paused`;
uma etapa não declarada em `pauseSafeNodes`, `git` em execução ou grupo sem
identidade recusam com `PAUSE_REFUSED`, e ticket fora de execução com
`NOT_RUNNING`. `resume <ticketId>` devolve `resumed` ou `not-paused`.
`disk-guard [status|observe|enforce|off]` devolve `mode`, o último `status`
amostrado e a política; modo desconhecido é `USAGE`. A capability
`execution-pause-v1` anuncia pausa e retomada; `disk-guard-v1`, o guarda.

`preset-history` agrega o último verde canônico de cada receita declarada. É a fronteira pública usada por consumidores que publicam seus próprios ponteiros Git; a regra de canonicidade permanece no produto CI Queue.
o estado local entra por `CI_QUEUE_STATE_DIR` ou `--state`, nunca pelo arquivo
versionado. `enqueue` só grava um ticket; `worker` é o único comando que drena
a fila. Isso permite um instalador iniciar um worker efêmero sem transformar o
checkout consumidor em dono do executor.
