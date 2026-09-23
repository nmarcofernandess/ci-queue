# Evidência persistente do T6

As capturas e receipts abaixo pertencem à candidata CI Queue `5bff6a270442a6961b33c9d06fe53bae3814c4f8` no worktree `/Users/marcoantonio/ci-queue-fase4-5-handoff`. O harness é dono de todos os arquivos: `tests/browser/progress-timing-integrated.spec.ts` e `tests/browser/table-layout.spec.ts` escrevem em `testInfo.outputPath`; a fila oficial recebe um `--output` sob este diretório. Não houve screenshot manual nem promoção de scratch do browser.

O destino é persistente na lane para revisão/reprodução do T6. As tentativas falhas foram mantidas ao lado dos GREENs para não perder a sequência de diagnóstico. JSONs identificam owner, HEAD e SHA quando o cenário o exige. O teste V01 declara `nativeBrowserZoomObserved: false`; nos casos chamados de 200%, o `deviceScaleFactor` foi 2. Isso não comprova zoom nativo do navegador.

| Diretório | Owner / lifecycle | Resultado e vínculo oficial |
|---|---|---|
| `c03-playwright-output/` | `tests/browser/progress-timing-integrated.spec.ts`; artefatos do run capturados pelo Playwright e mantidos para diagnóstico | Tentativa C03 `20260923075320-9cd26466` passou no filtro por projeto e falhou no elo real produtor por não localizar o caso ativo. Também retém o erro pré-teste de dependências faltantes da tentativa `20260923074253-d367009a`. Logs oficiais em `/Users/marcoantonio/.local/state/local-ci/queue/logs/`. |
| `c03-focal-output/` | Mesmo owner; `error-context.md` é saída do reporter Playwright, não screenshot manual | Tentativa focal `20260923080053-4a42c107` localizou corretamente dois rótulos `0 de 7` (etapa e invocação); strict locator não escolhia o nó. A falha guiou o locator para os dois owners explícitos. |
| `c03-focal-2-output/` | Mesmo owner; screenshot e JSONs escritos em `testInfo.outputPath`, anexados ao resultado da fila e copiados pelo `--output` deste diretório | GREEN `20260923080332-b5cdc2ed`, terminal passed, 1/1. `c03-active-live.png/json` captura o drawer ativo; `c03-terminal-ui.json` e `c03-same-ticket-receipt.json` ligam os sete casos, API e UI terminal. Ticket interno fixture: `20260923081033-6d5e698e`. SHA do diff browser fornecido ao run: `83b2e9e7a2c001eb542a13fa284fd456c797461edf117267b45f5fa7083a0aa6`. |
| `v01-c04-r06-output/` | `tests/browser/table-layout.spec.ts`; screenshots e `viewport-*.json` em `testInfo.outputPath`, preservados pelo `--output` da fila | Ticket `20260923081250-17e11114`, terminal passed, 20/20. Inclui 18 casos V01 e os casos C04/R06. Candidate diff SHA `35415916c6b23b6d0bc99ee3804affa7d09902acd2f043a536fb119254e0914d`. Cada JSON declara viewport, tema, escala, owner, HEAD e `nativeBrowserZoomObserved:false`. |

## Recibos oficiais relacionados

Logs da fila em `/Users/marcoantonio/.local/state/local-ci/queue/logs/`:

- `20260923073023-db80e7ca.log`: C06 focal, 6/6 novos casos.
- `20260923073421-2e9ebcc2.log`: integração da sequência quente; linha `T6_WARM_FEEDBACK_SEQUENCE` contém IDs/timestamps/sha256 dos três tickets temporários. Uma sessão/launch e nenhum reset, seed ou build.
- `20260923075754-a2494e65.log`: owner matrix DF, 5 suítes/124 testes.
- `20260923080332-b5cdc2ed.log`: C03 browser real, 1/1.
- `20260923081250-17e11114.log`: C04/V01/R06 browser, 20/20.

Os receipts e status completos ficam nos logs indicados; esta pasta só guarda saídas visuais/JSON do harness. Não contém state do operador, `.env`, dados clínicos nem artefatos obtidos por screenshot manual.
