# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: progress-timing-integrated.spec.ts >> C03 same ticket carries the real DietFlow producer from 0/7 live to 7/7 durable history in compiled UI
- Location: tests/browser/progress-timing-integrated.spec.ts:626:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

Expected: Any<String>
Received: undefined
```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic [aria-hidden]:
      - generic:
        - generic:
          - generic:
            - generic:
              - list:
                - listitem:
                  - link:
                    - /url: "#status"
                    - generic: CI Queue
            - generic:
              - generic:
                - generic:
                  - list:
                    - listitem:
                      - link:
                        - /url: "#status"
                        - generic: Status
                    - listitem:
                      - link:
                        - /url: "#worktrees"
                        - generic: Worktrees
                    - listitem:
                      - link:
                        - /url: "#analysis"
                        - generic: Análise
            - generic:
              - list:
                - listitem:
                  - button:
                    - generic:
                      - generic: Ambiente local
                      - generic: Bridge online
      - main:
        - generic:
          - generic:
            - button:
              - generic: Toggle Sidebar
            - generic: Status
            - button:
              - generic: DietFlow C03 producer
        - main:
          - generic:
            - generic: Execução atual
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - button:
                        - generic: c03-q2q3
                      - generic: DietFlow C03 producer
                    - generic: codex/fase4-5-feedback · 9efb74b1
                - generic:
                  - generic:
                    - generic:
                      - list:
                        - generic:
                          - generic:
                            - generic: E2E
                            - paragraph: "Playwright: 0 de 7"
                - generic:
                  - generic:
                    - generic: 5s
                    - paragraph: decorrido
                  - generic:
                    - button
          - generic:
            - generic:
              - generic: Fila livre
              - region:
                - generic:
                  - generic:
                    - generic:
                      - radiogroup:
                        - radio [checked]: Execuções
                        - radio: Últimos verdes
                      - generic:
                        - group:
                          - group
                          - textbox:
                            - /placeholder: Buscar execuções…
                        - combobox:
                          - generic: Todo período
                        - combobox:
                          - generic: Todos os resultados
                  - generic:
                    - generic:
                      - generic:
                        - table:
                          - rowgroup:
                            - row:
                              - columnheader: Estado
                              - columnheader: Execução
                              - columnheader: Término
                              - columnheader: Duração
                              - columnheader: Revisão
                              - columnheader
                          - rowgroup:
                            - row:
                              - cell:
                                - generic:
                                  - generic:
                                    - generic: Nenhuma execução concluída
                                    - generic: As execuções terminais aparecerão aqui.
            - complementary:
              - generic:
                - generic: Máquina
                - generic: 13,1 GB livres
              - generic:
                - generic: Meta para main
                - generic:
                  - paragraph: Nenhuma meta declarada.
                - generic:
                  - button: Abrir meta
              - generic:
                - generic: Pendências · 0
                - generic:
                  - paragraph: Nenhuma pendência.
                - generic:
                  - button: Ver pendências
    - region "Notifications alt+T"
  - dialog [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e6]:
        - img "Em execução" [ref=e8]
        - generic [ref=e9]:
          - generic [ref=e10]:
            - heading "c03-q2q3" [level=2] [ref=e11]
            - generic [ref=e12]: DietFlow C03 producer
          - paragraph [ref=e13]: "23/09 04:57 · Decorrido: 5s"
      - button "Fechar execução" [active] [ref=e14]
    - generic [ref=e15]:
      - tablist [ref=e17]:
        - tab "Progresso" [selected] [ref=e18]
        - tab "Log" [ref=e19]
      - tabpanel "Progresso" [ref=e20]:
        - generic [ref=e25]:
          - table [ref=e27]:
            - caption [ref=e28]: Detalhes da execução
            - rowgroup [ref=e32]:
              - row [ref=e33]:
                - rowheader "Ticket" [ref=e34]
                - cell "20260923075722-7a7ab661" [ref=e35]
              - row [ref=e36]:
                - rowheader "Branch" [ref=e37]
                - cell "codex/fase4-5-feedback" [ref=e38]
              - row [ref=e39]:
                - rowheader "SHA" [ref=e40]
                - cell "9efb74b1504cb3b60309aec1a108d60c280a1684" [ref=e41]
              - row [ref=e42]:
                - rowheader "Diretório" [ref=e43]
                - cell "/Users/marcoantonio/dietflow-fase4-5-feedback" [ref=e44]
          - list [ref=e45]:
            - generic [ref=e46]:
              - generic [ref=e47]:
                - button "Expandir E2E" [expanded] [ref=e49]
                - img "Em execução" [ref=e51]
                - generic [ref=e52]: E2E
              - generic [ref=e56]:
                - button "Expandir Playwright" [ref=e58]
                - img "Aguardando" [ref=e60]
                - generic [ref=e61]:
                  - generic [ref=e62]: Playwright
                  - paragraph [ref=e63]: 0 de 7
    - generic [ref=e64]:
      - button "Copiar contexto" [ref=e65]
      - button "Diagnóstico" [ref=e66]
```

# Test source

```ts
  665 |   let testBodyFailed = false
  666 | 
  667 |   try {
  668 |     execFileSync("mkfifo", [gate])
  669 |     mkdirSync(join(state, "state"), { recursive: true })
  670 |     writeFileSync(
  671 |       join(state, "state", "projects.json"),
  672 |       JSON.stringify({
  673 |         schemaVersion: 1,
  674 |         revision: 1,
  675 |         bootstrapProjectId: "dietflow-c03",
  676 |         projects: {
  677 |           "dietflow-c03": {
  678 |             id: "dietflow-c03",
  679 |             displayName: "DietFlow C03 producer",
  680 |             repositoryPath: producerRoot,
  681 |             gitCommonDir: null,
  682 |             configPath: null,
  683 |             archivedAt: null,
  684 |             revision: 1,
  685 |             createdAt: timeline.createdAt,
  686 |             updatedAt: timeline.createdAt,
  687 |           },
  688 |         },
  689 |       }),
  690 |     )
  691 |     process.env.C03_GATE_PATH = gate
  692 |     process.env.C03_READY_PATH = ready
  693 |     process.env.C03_ARTIFACT_DIR = artifacts
  694 |     process.env.C03_ACTIVE_READY_PATH = activeReady
  695 |     process.env.C03_ACTIVE_RELEASE_PATH = activeRelease
  696 | 
  697 |     const c03Ticket = enqueueExplicitTicket({
  698 |       recipe: "c03-q2q3",
  699 |       argv: ["/bin/bash", producer],
  700 |       projectId: "dietflow-c03",
  701 |       projectName: "DietFlow C03 producer",
  702 |       cwd: producerRoot,
  703 |       stateRoot: state,
  704 |       flags: { progressEnabled: true },
  705 |       requestedBy: "c03-browser-proof",
  706 |     })
  707 |     ticket = c03Ticket
  708 |     timeline.enqueuedAt = new Date().toISOString()
  709 |     worker = runWorker(state).finally(() => { workerSettled = true })
  710 | 
  711 |     await waitFor(() => existsSync(ready), "discovery do produtor")
  712 |     timeline.discoveryReadyAt = statSync(ready).mtime.toISOString()
  713 |     const manifest = `${ready}.discovery.json`
  714 |     const discovery = JSON.parse(readFileSync(manifest, "utf8")) as { caseIds?: unknown[] }
  715 |     expect(discovery.caseIds).toHaveLength(7)
  716 | 
  717 |     api = await startApiForState(state, await reservePort())
  718 |     const bundleSha256 = compileCandidateUi(bundle)
  719 |     ui = await startCompiledUi(bundle, api.url)
  720 | 
  721 |     const liveResponse = await page.request.get(`${api.url}/api/status?context=all&view=live`)
  722 |     expect(liveResponse.status()).toBe(200)
  723 |     const live = await liveResponse.json() as {
  724 |       running?: { id?: string; progressSummary?: { planned?: Array<Record<string, unknown>> } }
  725 |     }
  726 |     expect(live.running?.id).toBe(c03Ticket.id)
  727 |     expect(live.running?.progressSummary?.planned).toMatchObject([
  728 |       { rootId: "e2e", id: "playwright", detail: { completed: 0, total: 7, pending: 7 } },
  729 |     ])
  730 | 
  731 |     await page.addInitScript(() => localStorage.setItem("ci-queue.lastProjectId", "dietflow-c03"))
  732 |     await page.goto(`${ui.url}/?projectId=dietflow-c03`)
  733 |     await expect(page.getByText(/0 de 7/).first()).toBeVisible({ timeout: 10_000 })
  734 |     await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
  735 |     await expect(page.getByRole("dialog").getByText("0 de 7", { exact: true })).toBeVisible()
  736 | 
  737 |     await waitFor(() => releaseGate(gate), "leitor da barreira FIFO", 1_000)
  738 |     gateReleased = true
  739 |     timeline.releasedAt = new Date().toISOString()
  740 | 
  741 |     await waitFor(() => {
  742 |       if (!existsSync(activeReady) || !ticket) return false
  743 |       try {
  744 |         const progress = JSON.parse(readFileSync(progressPath(state, ticket.id), "utf8")) as {
  745 |           nodes?: Array<{ id?: string; kind?: string; status?: string }>
  746 |         }
  747 |         return progress.nodes?.some((node) => node.kind === "case" && node.status === "running") ?? false
  748 |       } catch {
  749 |         return false
  750 |       }
  751 |     }, "primeiro caso Playwright ativo")
  752 |     timeline.firstCaseRunningAt = statSync(activeReady).mtime.toISOString()
  753 |     const activeResponse = await page.request.get(`${api.url}/api/status?context=all&view=live`)
  754 |     expect(activeResponse.status()).toBe(200)
  755 |     const activeSnapshot = await activeResponse.json() as {
  756 |       running?: { id?: string; progressSummary?: { active?: Array<Record<string, unknown>>; nodes?: Array<Record<string, unknown>> } }
  757 |     }
  758 |     expect(activeSnapshot.running?.id).toBe(c03Ticket.id)
  759 |     expect(activeSnapshot.running?.progressSummary?.active).toEqual(expect.arrayContaining([
  760 |       expect.objectContaining({ id: "playwright", status: "running" }),
  761 |     ]))
  762 |     const activeCase = activeSnapshot.running?.progressSummary?.nodes?.find(
  763 |       (node) => node.kind === "case" && node.status === "running",
  764 |     )
> 765 |     expect(activeCase?.id).toEqual(expect.any(String))
      |                            ^ Error: expect(received).toEqual(expected) // deep equality
  766 | 
  767 |     await page.reload()
  768 |     await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
  769 |     const activeDrawer = page.getByRole("dialog")
  770 |     await expect(activeDrawer.locator('[data-node-id="playwright"] [role="img"]')).toHaveAttribute("aria-label", /Em execução/i)
  771 |     await expect(activeDrawer.locator(`[data-node-id="${activeCase?.id}"] [role="img"]`)).toHaveAttribute("aria-label", /Em execução/i)
  772 |     await expect(activeDrawer.getByText("0 de 7", { exact: true })).toBeVisible()
  773 |     const activeScreenshotPath = testInfo.outputPath("c03-active-live.png")
  774 |     await page.screenshot({ path: activeScreenshotPath, animations: "disabled" })
  775 |     await testInfo.attach("c03-active-live.png", { path: activeScreenshotPath, contentType: "image/png" })
  776 |     const activeReceiptPath = testInfo.outputPath("c03-active-live.json")
  777 |     writeFileSync(activeReceiptPath, JSON.stringify({
  778 |       ticketId: c03Ticket.id,
  779 |       candidateHead: process.env.C03_CI_QUEUE_HEAD ?? null,
  780 |       consumerHead: process.env.C03_DIETFLOW_HEAD ?? null,
  781 |       sourceDiffSha256: process.env.CI_QUEUE_T6_SOURCE_DIFF_SHA256 ?? null,
  782 |       api: activeSnapshot.running?.progressSummary ?? null,
  783 |       observedAt: timeline.firstCaseRunningAt,
  784 |       drawer: "playwright active · 0 de 7 · first case running",
  785 |     }, null, 2))
  786 |     await testInfo.attach("c03-active-live.json", { path: activeReceiptPath, contentType: "application/json" })
  787 | 
  788 |     writeFileSync(activeRelease, "release\n")
  789 |     await expect(worker).resolves.toMatchObject({ processed: [c03Ticket.id], busy: false })
  790 |     timeline.terminalAt = new Date().toISOString()
  791 | 
  792 |     const history = listHistoryJobs(state).find((job) => job.id === c03Ticket.id)
  793 |     expect(history).toMatchObject({ id: c03Ticket.id, status: "passed", exitCode: 0 })
  794 |     const playwright = history?.progress?.nodes?.find((node) => node.id === "playwright")
  795 |     expect(playwright?.detail).toMatchObject({ completed: 7, total: 7, passed: 7, failed: 0, pending: 0 })
  796 |     expect(existsSync(progressPath(state, c03Ticket.id))).toBe(false)
  797 |     const terminalHistory = {
  798 |       status: history?.status ?? null,
  799 |       exitCode: history?.exitCode ?? null,
  800 |       progress: history?.progress ?? null,
  801 |     }
  802 |     expect(terminalHistory).toMatchObject({
  803 |       status: "passed",
  804 |       exitCode: 0,
  805 |       progress: { nodes: expect.any(Array) },
  806 |     })
  807 | 
  808 |     // Persiste a cadeia já observada antes da última asserção visual, para que
  809 |     // uma falha de navegação no drawer não apague o ticket/worker/timeline reais.
  810 |     const partialReceiptPath = testInfo.outputPath("c03-same-ticket-receipt.json")
  811 |     writeFileSync(partialReceiptPath, JSON.stringify({
  812 |       ticketId: c03Ticket.id,
  813 |       producer: {
  814 |         root: producerRoot,
  815 |         headSha: producerHead,
  816 |         fixtureSha256: directorySha256(join(producerRoot, "scripts/__tests__/fixtures/pw-observe"), "fixture do produtor"),
  817 |         manifestSha256: sha256(readFileSync(manifest)),
  818 |       },
  819 |       consumer: {
  820 |         root: ROOT,
  821 |         headSha: consumerHead,
  822 |         compiledBundleSha256: bundleSha256,
  823 |       },
  824 |       state: "temporary",
  825 |       testExecuted: true,
  826 |       terminalUi: "pending-verification",
  827 |       terminalHistory,
  828 |       runtime: {
  829 |         source: "inner temporary CI Queue worker history",
  830 |         observed: history?.runtime ?? "unconfigured",
  831 |       },
  832 |       command: c03Ticket.argv,
  833 |       timeline,
  834 |     }, null, 2))
  835 |     expect(JSON.parse(readFileSync(partialReceiptPath, "utf8"))).toMatchObject({
  836 |       ticketId: c03Ticket.id,
  837 |       testExecuted: true,
  838 |       terminalHistory: {
  839 |         status: "passed",
  840 |         exitCode: 0,
  841 |         progress: { nodes: expect.any(Array) },
  842 |       },
  843 |       runtime: {
  844 |         source: "inner temporary CI Queue worker history",
  845 |         observed: {
  846 |           capability: "node-runtime-guard-v1",
  847 |           coverage: "unconfigured",
  848 |           state: "unconfigured",
  849 |           observations: expect.any(Array),
  850 |         },
  851 |       },
  852 |     })
  853 |     await testInfo.attach("c03-same-ticket-receipt.json", {
  854 |       path: partialReceiptPath,
  855 |       contentType: "application/json",
  856 |     })
  857 | 
  858 |     await page.reload()
  859 |     await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
  860 |     const expandE2e = page.getByRole("button", { name: "Expandir E2E", exact: true })
  861 |     await expect(expandE2e).toBeVisible()
  862 |     await expandE2e.click()
  863 |     await expect(page.getByText("Playwright", { exact: true })).toBeVisible()
  864 |     await expect(page.getByRole("dialog").getByText("7 de 7", { exact: true })).toBeVisible()
  865 |     const terminalUiPath = testInfo.outputPath("c03-terminal-ui.json")
```