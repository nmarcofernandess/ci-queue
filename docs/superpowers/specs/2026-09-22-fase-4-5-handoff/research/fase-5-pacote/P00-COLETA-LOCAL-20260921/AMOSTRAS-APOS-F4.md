# P00 · amostras recentes após integração da Fase 4

Leitura em 21/09/2026 18:56 -0300. São receipts originais do histórico local do CI Queue. Nenhum job foi disparado para esta coleta. Os três foram executados pela release instalada `550409a9`, que ainda não contém os commits C01/C03/C04 integrados em `dev`; portanto não são prova de desempenho da nova distribuição. A revisão e a população Jest variam. **Não formam A/B causal.**

| Ticket | HEAD / base | Smoke | Static | Jest | Observação |
|---|---|---:|---:|---:|---|
| `20260921212245-e8cb972d` | `add48ee96` / `4a50e858` | 234,437 s | 211 s | 19 s | C06 #1308; passed |
| `20260921213253-b9836620` | `085a1673` / `500bcf0c` | 215,093 s | 208 s | 2 s | C03 #1309; passed |
| `20260921214202-23f15f97` | `e714219f` / `299981903` | 286,977 s | 144 s | 138 s | 123-PROOF #1306; passed |

Duração `smoke` é `finishedAt-startedAt` do ticket, não espera na fila. Static/Jest são raízes emitidas pela receita, com arredondamento em segundos; review e artefatos pertencem ao collector. Os valores não devem ser somados cegamente nem extrapolados para Full. Eles mostram que o Static destes três HEADs terminou em 2,4–3,5 min, ao contrário do smoke histórico de 31 min; a causa da diferença ainda não está identificada. P01 continua necessário para separar preparação, gerados e typecheck.

## Integridade das fontes

- `history/20260921212245-e8cb972d.json`: SHA-256 `dcee4f72c005d8ebaa4ad9457cdabc41756f2276115f0da4737b2f43bfff88c0`.
- `history/20260921213253-b9836620.json`: SHA-256 `d4a21a7b55214d8e6c3cb7bb6317c7c387df0e2421a24d42464ba018f688c13f`.
- `history/20260921214202-23f15f97.json`: SHA-256 `331ddf75203e2416d2fa4ef07c5899fca461556366421d6ebeb4194f6324edbc`.

Root dos três: `/Users/marcoantonio/.local/state/local-ci/queue/`. Históricos permanecem no state dono; não copiamos logs com possíveis dados de execução. Este complemento não substitui as lacunas de `PENDENCIAS.md` nem muda o baseline histórico original.
