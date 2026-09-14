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

Comandos atuais: `version`, `enqueue <preset>`, `worker`, `status`,
`history`, `preset-history [--preset <nome>]`, `logs [latest|<jobId>]` e `cancel <jobId>`. O projeto declara receitas em `ci-queue.json`;

`preset-history` agrega o último verde canônico de cada receita declarada. É a fronteira pública usada por consumidores que publicam seus próprios ponteiros Git; a regra de canonicidade permanece no produto CI Queue.
o estado local entra por `CI_QUEUE_STATE_DIR` ou `--state`, nunca pelo arquivo
versionado. `enqueue` só grava um ticket; `worker` é o único comando que drena
a fila. Isso permite um instalador iniciar um worker efêmero sem transformar o
checkout consumidor em dono do executor.
