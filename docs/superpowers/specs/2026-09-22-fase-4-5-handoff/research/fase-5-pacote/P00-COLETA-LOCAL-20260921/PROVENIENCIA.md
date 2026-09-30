# P00 · proveniência da coleta local

Observação: 21/09/2026, após os merges F4-C01/C02/C03/C04/C06. Os dados de tickets em `BASELINE.json` foram lidos antes destes merges; o pacote preserva a fotografia histórica e não recalcula tempos. Não houve novo Full ou execução para esta análise.

- DietFlow `origin/dev`: `2999819034f9ef0cfed76d3247388f6b15366273`.
- CI Queue `origin/dev`: `91d68ec20d02d8a1666dd7ab909141458de66bc3`.
- CI Queue instalado: revisão `550409a92f359cffc3e75f34712d39133b8ab130`, manifest SHA-256 `7f665836d1c3e2a8416317faed81ca57c795d0bef7ebcb5637d25fe7524d007f`; contém `progress-q2q3-v1`, mas não os patches C01/C03/C04 recém mergeados.
- C01 #20: check `20260921210940-cecaab90` passed, merge `56eb86e5219d777bc0e608c953dfbb8f5172abb5`. C06 #1308: smoke `20260921212245-e8cb972d` passed, merge `500bcf0c15a9ddc0b6e5d1e43f18efefe3205f06`.
- #22 integrou o produtor DietFlow #1309: check CI Queue `20260921213539-7ce6cceb` e prova dedicada `20260921213858-f9700fe3` passed no HEAD `4f914dd0c0bc4f0a7f9ff62c0c38a9e9ff00dfd8`. São validação de Fase 4, não amostras pareadas de performance P00.

## Receipts versionados do Full AP17

| Fonte original | Bytes | SHA-256 |
|---|---:|---|
| `/Users/marcoantonio/dietflow-app/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json` | 533382 | `56035b7bfe42f9420ba19fc963b9186291683b684afd20596aeb80d358d17ecf` |
| `/Users/marcoantonio/dietflow-app/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/execution-receipt.json` | 1579 | `eebca1640256e44fe4b20813eb407eddc693c24133e755ca00be8711ef44e138` |

`MANIFEST.json` fixa hashes dos history/logs locais efetivamente consultados. Não copia os logs brutos: eles podem conter dados de execução não redigidos. `PENDENCIAS.md` nomeia o que ainda não foi extraído. A ausência de logs antigos impede comparar cache, host e população; `BASELINE.md` não apresenta essas amostras como A/B.
