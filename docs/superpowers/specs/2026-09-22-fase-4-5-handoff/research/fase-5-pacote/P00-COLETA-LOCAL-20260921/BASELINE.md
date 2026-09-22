# P00 — baseline local, leitura de 21/09/2026

Coleta limitada do histórico da fila no Mac. Nenhum Full ou teste novo foi solicitado para esta coleta. O arquivo `BASELINE.json` guarda identidade e tempos dos tickets; `MANIFEST.json` fixa hash dos arquivos consultados, sem copiá-los.

| Ticket | Projeto / preset | Estado | Duração | HEAD |
|---|---|---|---:|---|
| 20260919075127-addfb8a5 | DietFlow / full | passed | 6928.0 s | 008cab0506 |
| 20260915122336-527ad689 | DietFlow / smoketest | passed | 1868.8 s | 66bdc555b9 |
| 20260914140623-ae35471d | DietFlow / smoketest | passed | 2602.3 s | 3f1dea64b8 |
| 20260921115955-6e890b30 | DietFlow / static | passed | 180.6 s | 675b08f461 |
| 20260921121505-f0a9fe7e | DietFlow / smoketest | passed | 201.8 s | d8048fb4f6 |
| 20260921115512-ccc7ede4 | CI Queue / check | passed | 263.5 s | e410dff80a |
| 20260921133518-b846929f | CI Queue / check | passed | 290.6 s | 17b379a556 |
| 20260919055151-8c2dd256 | DietFlow / full | failed | 2948.3 s | bd792f2b1e |
| 20260917222022-34ef8b6a | DietFlow / receitas-medidas | interrupted | não medida | afcfbf9c50 |

Amostras não são pares A/B: HEAD, base e cobertura variam. O Full AP17 continua o único Full verde desta série com tempos por gate versionados. A release local do CI Queue observada é `550409a92f`; isso não descreve a versão usada pelos tickets antigos.

## Próximo corte
P01 pode medir a preparação e o typecheck com relógios existentes. P02 só deve mudar Static depois de um par causal de mesma população/perfil. C01 foi integrada em CI Queue dev pela #20 (merge `56eb86e5`, check `20260921210940-cecaab90` passed). A release local observada ainda é `550409a9`, portanto o código C01 integrado não é fato da distribuição instalada. Uma comparação canônica nova só deve usar o runtime instalado após atualização/identidade comprovadas.

## Onde estava o tempo do Full AP17

Static 805 s; Jest 2.247 s; E2E 3.544 s; FlowUI 322 s. Dentro de Static, typecheck 241,2 s, fixtures 197,5 s, field-identity 104,8 s e lint ratchet 103,5 s. São filhos de Static; não somar ao pai. Fonte: `queue-ticket.json` versionado da AP17.
