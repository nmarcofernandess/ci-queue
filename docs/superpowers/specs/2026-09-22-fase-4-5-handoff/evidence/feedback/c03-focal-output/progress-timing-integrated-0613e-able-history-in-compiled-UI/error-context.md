# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: progress-timing-integrated.spec.ts >> C03 same ticket carries the real DietFlow producer from 0/7 live to 7/7 durable history in compiled UI
- Location: tests/browser/progress-timing-integrated.spec.ts:626:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').getByText('0 de 7', { exact: true })
Expected: visible
Error: strict mode violation: getByRole('dialog').getByText('0 de 7', { exact: true }) resolved to 2 elements:
    1) <p data-slot="item-description" class="text-left font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary line-clamp-none text-xs [overflow-wrap:anywhere]">0 de 7</p> aka getByText('de 7').nth(1)
    2) <p data-slot="item-description" class="text-left font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary line-clamp-none text-xs [overflow-wrap:anywhere]">0 de 7</p> aka locator('#radix-_r_11_').getByText('de 7')

Call log:
  - Expect "toBeVisible" getByRole('dialog').getByText('0 de 7', { exact: true }) with timeout 5000ms
  - waiting for getByRole('dialog').getByText('0 de 7', { exact: true })

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
                            - paragraph: pw-observe · 0 de 7
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
                - generic: 14 GB livres
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
  - dialog [ref=f1e2]:
    - generic [ref=f1e4]:
      - generic [ref=f1e6]:
        - img "Em execução" [ref=f1e8]
        - generic [ref=f1e9]:
          - generic [ref=f1e10]:
            - heading "c03-q2q3" [level=2] [ref=f1e11]
            - generic [ref=f1e12]: DietFlow C03 producer
          - paragraph [ref=f1e13]: "23/09 05:01 · Decorrido: 5s"
      - button "Fechar execução" [active] [ref=f1e14]
    - generic [ref=f1e15]:
      - tablist [ref=f1e17]:
        - tab "Progresso" [selected] [ref=f1e18]
        - tab "Log" [ref=f1e19]
      - tabpanel "Progresso" [ref=f1e20]:
        - generic [ref=f1e25]:
          - table [ref=f1e27]:
            - caption [ref=f1e28]: Detalhes da execução
            - rowgroup [ref=f1e32]:
              - row [ref=f1e33]:
                - rowheader "Ticket" [ref=f1e34]
                - cell "20260923080148-956b7165" [ref=f1e35]
              - row [ref=f1e36]:
                - rowheader "Branch" [ref=f1e37]
                - cell "codex/fase4-5-feedback" [ref=f1e38]
              - row [ref=f1e39]:
                - rowheader "SHA" [ref=f1e40]
                - cell "9efb74b1504cb3b60309aec1a108d60c280a1684" [ref=f1e41]
              - row [ref=f1e42]:
                - rowheader "Diretório" [ref=f1e43]
                - cell "/Users/marcoantonio/dietflow-fase4-5-feedback" [ref=f1e44]
          - list [ref=f1e45]:
            - generic [ref=f1e46]:
              - generic [ref=f1e47]:
                - button "Expandir E2E" [expanded] [ref=f1e49]
                - img "Em execução" [ref=f1e51]
                - generic [ref=f1e52]: E2E
              - generic [ref=f1e55]:
                - generic [ref=f1e56]:
                  - button "Expandir Playwright" [expanded] [ref=f1e58]
                  - img "Em execução" [ref=f1e60]
                  - generic [ref=f1e61]:
                    - generic [ref=f1e62]: Playwright
                    - paragraph [ref=f1e63]: 0 de 7
                - generic [ref=f1e65]:
                  - generic [ref=f1e66]:
                    - button "Expandir pw-observe" [expanded] [ref=f1e68]
                    - img "Em execução" [ref=f1e70]
                    - generic [ref=f1e71]:
                      - generic [ref=f1e72]: pw-observe
                      - paragraph [ref=f1e73]: 0 de 7
                  - generic [ref=f1e74]:
                    - generic [ref=f1e75]:
                      - img "Em execução" [ref=f1e78]
                      - generic [ref=f1e79]: pw-observe › cases.spec.ts › case-0
                    - generic [ref=f1e81]:
                      - img "Aguardando" [ref=f1e84]
                      - generic [ref=f1e85]: pw-observe › cases.spec.ts › case-1
                    - generic [ref=f1e87]:
                      - img "Aguardando" [ref=f1e90]
                      - generic [ref=f1e91]: pw-observe › cases.spec.ts › case-2
                    - generic [ref=f1e93]:
                      - img "Aguardando" [ref=f1e96]
                      - generic [ref=f1e97]: pw-observe › cases.spec.ts › case-3
                    - generic [ref=f1e99]:
                      - img "Aguardando" [ref=f1e102]
                      - generic [ref=f1e103]: pw-observe › cases.spec.ts › case-4
                    - generic [ref=f1e105]:
                      - img "Aguardando" [ref=f1e108]
                      - generic [ref=f1e109]: pw-observe › cases.spec.ts › case-5
                    - generic [ref=f1e111]:
                      - img "Aguardando" [ref=f1e114]
                      - generic [ref=f1e115]: pw-observe › cases.spec.ts › case-6
    - generic [ref=f1e117]:
      - button "Copiar contexto" [ref=f1e118]
      - button "Diagnóstico" [ref=f1e119]
```

# Test source

```ts
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
  756 |       running?: { id?: string; progressSummary?: { active?: Array<Record<string, unknown>> } }
  757 |     }
  758 |     expect(activeSnapshot.running?.id).toBe(c03Ticket.id)
  759 |     expect(activeSnapshot.running?.progressSummary?.active).toEqual(expect.arrayContaining([
  760 |       expect.objectContaining({ id: "playwright", status: "running" }),
  761 |     ]))
  762 |     expect(activeSnapshot.running?.progressSummary).not.toHaveProperty("nodes")
  763 | 
  764 |     const activeDetailResponse = await page.request.get(`${api.url}/api/job?jobId=${encodeURIComponent(c03Ticket.id)}`)
  765 |     expect(activeDetailResponse.status()).toBe(200)
  766 |     const activeDetail = await activeDetailResponse.json() as {
  767 |       progressSummary?: { nodes?: Array<{ id?: string; kind?: string; status?: string }> }
  768 |     }
  769 |     const activeCase = activeDetail.progressSummary?.nodes?.find(
  770 |       (node) => node.kind === "case" && node.status === "running",
  771 |     )
  772 |     expect(activeCase?.id).toEqual(expect.any(String))
  773 |     const activeCaseId = activeCase?.id ?? ""
  774 | 
  775 |     await page.reload()
  776 |     await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
  777 |     const activeDrawer = page.getByRole("dialog")
  778 |     await expect(activeDrawer.locator('[data-node-id="playwright"] [role="img"]')).toHaveAttribute("aria-label", /Em execução/i)
  779 |     await expect(activeDrawer.locator(`[data-node-id="${activeCaseId}"] [role="img"]`)).toHaveAttribute("aria-label", /Em execução/i)
> 780 |     await expect(activeDrawer.getByText("0 de 7", { exact: true })).toBeVisible()
      |                                                                     ^ Error: expect(locator).toBeVisible() failed
  781 |     const activeScreenshotPath = testInfo.outputPath("c03-active-live.png")
  782 |     await page.screenshot({ path: activeScreenshotPath, animations: "disabled" })
  783 |     await testInfo.attach("c03-active-live.png", { path: activeScreenshotPath, contentType: "image/png" })
  784 |     const activeReceiptPath = testInfo.outputPath("c03-active-live.json")
  785 |     writeFileSync(activeReceiptPath, JSON.stringify({
  786 |       ticketId: c03Ticket.id,
  787 |       candidateHead: process.env.C03_CI_QUEUE_HEAD ?? null,
  788 |       consumerHead: process.env.C03_DIETFLOW_HEAD ?? null,
  789 |       sourceDiffSha256: process.env.CI_QUEUE_T6_SOURCE_DIFF_SHA256 ?? null,
  790 |       api: {
  791 |         live: activeSnapshot.running?.progressSummary ?? null,
  792 |         detail: activeDetail.progressSummary ?? null,
  793 |       },
  794 |       observedAt: timeline.firstCaseRunningAt,
  795 |       drawer: "playwright active · 0 de 7 · first case running",
  796 |     }, null, 2))
  797 |     await testInfo.attach("c03-active-live.json", { path: activeReceiptPath, contentType: "application/json" })
  798 | 
  799 |     writeFileSync(activeRelease, "release\n")
  800 |     await expect(worker).resolves.toMatchObject({ processed: [c03Ticket.id], busy: false })
  801 |     timeline.terminalAt = new Date().toISOString()
  802 | 
  803 |     const history = listHistoryJobs(state).find((job) => job.id === c03Ticket.id)
  804 |     expect(history).toMatchObject({ id: c03Ticket.id, status: "passed", exitCode: 0 })
  805 |     const playwright = history?.progress?.nodes?.find((node) => node.id === "playwright")
  806 |     expect(playwright?.detail).toMatchObject({ completed: 7, total: 7, passed: 7, failed: 0, pending: 0 })
  807 |     expect(existsSync(progressPath(state, c03Ticket.id))).toBe(false)
  808 |     const terminalHistory = {
  809 |       status: history?.status ?? null,
  810 |       exitCode: history?.exitCode ?? null,
  811 |       progress: history?.progress ?? null,
  812 |     }
  813 |     expect(terminalHistory).toMatchObject({
  814 |       status: "passed",
  815 |       exitCode: 0,
  816 |       progress: { nodes: expect.any(Array) },
  817 |     })
  818 | 
  819 |     // Persiste a cadeia já observada antes da última asserção visual, para que
  820 |     // uma falha de navegação no drawer não apague o ticket/worker/timeline reais.
  821 |     const partialReceiptPath = testInfo.outputPath("c03-same-ticket-receipt.json")
  822 |     writeFileSync(partialReceiptPath, JSON.stringify({
  823 |       ticketId: c03Ticket.id,
  824 |       producer: {
  825 |         root: producerRoot,
  826 |         headSha: producerHead,
  827 |         fixtureSha256: directorySha256(join(producerRoot, "scripts/__tests__/fixtures/pw-observe"), "fixture do produtor"),
  828 |         manifestSha256: sha256(readFileSync(manifest)),
  829 |       },
  830 |       consumer: {
  831 |         root: ROOT,
  832 |         headSha: consumerHead,
  833 |         compiledBundleSha256: bundleSha256,
  834 |       },
  835 |       state: "temporary",
  836 |       testExecuted: true,
  837 |       terminalUi: "pending-verification",
  838 |       terminalHistory,
  839 |       runtime: {
  840 |         source: "inner temporary CI Queue worker history",
  841 |         observed: history?.runtime ?? "unconfigured",
  842 |       },
  843 |       command: c03Ticket.argv,
  844 |       timeline,
  845 |     }, null, 2))
  846 |     expect(JSON.parse(readFileSync(partialReceiptPath, "utf8"))).toMatchObject({
  847 |       ticketId: c03Ticket.id,
  848 |       testExecuted: true,
  849 |       terminalHistory: {
  850 |         status: "passed",
  851 |         exitCode: 0,
  852 |         progress: { nodes: expect.any(Array) },
  853 |       },
  854 |       runtime: {
  855 |         source: "inner temporary CI Queue worker history",
  856 |         observed: {
  857 |           capability: "node-runtime-guard-v1",
  858 |           coverage: "unconfigured",
  859 |           state: "unconfigured",
  860 |           observations: expect.any(Array),
  861 |         },
  862 |       },
  863 |     })
  864 |     await testInfo.attach("c03-same-ticket-receipt.json", {
  865 |       path: partialReceiptPath,
  866 |       contentType: "application/json",
  867 |     })
  868 | 
  869 |     await page.reload()
  870 |     await page.getByRole("button", { name: "c03-q2q3", exact: true }).click()
  871 |     const expandE2e = page.getByRole("button", { name: "Expandir E2E", exact: true })
  872 |     await expect(expandE2e).toBeVisible()
  873 |     await expandE2e.click()
  874 |     await expect(page.getByText("Playwright", { exact: true })).toBeVisible()
  875 |     await expect(page.getByRole("dialog").getByText("7 de 7", { exact: true })).toBeVisible()
  876 |     const terminalUiPath = testInfo.outputPath("c03-terminal-ui.json")
  877 |     writeFileSync(terminalUiPath, JSON.stringify({
  878 |       ticketId: c03Ticket.id,
  879 |       testExecuted: true,
  880 |       terminalUi: "verified",
```