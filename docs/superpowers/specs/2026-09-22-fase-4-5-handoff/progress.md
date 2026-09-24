# Progresso após os merges de 23/09/2026

## Estado confirmado

- CI Queue PR #25 → `dev` em `94b459d1a485a319b95e7a8dcdce41edc40122a6`; PR #26 → `dev` em `734fd96e8c1b06238a783f4a42a408984d0a674d`.
- DietFlow PR #1323 → `dev` em `e7bfdd27da442d82f18bebc5a6964d9c44c3de8c`.
- Os checkouts donos de `dev` foram atualizados por fast-forward e permaneceram limpos. O runtime instalado do CI Queue, seu boot e o cancelamento real de um ticket ainda exigem conferência própria; merge não os comprova.
- Leitura de 23/09: CLI e `installation.json` ainda anunciam `3f2fb2481b40971cb77bbd5802fca4b3b3acfd9b`; o dashboard está carregado e o worker está ocioso sob launchd. `/build.json` respondeu `manifest:null`. Isso comprova o descompasso com `dev`, não o cutover nem o retorno após novo login.
- Ao receber a ordem de cancelar CIs da lane do CI Queue, a fila não tinha ticket ativo ou pendente dessa lane. Os tickets encontrados pertenciam a outras lanes do DietFlow e foram preservados.

## Falhas de condução a não repetir

1. Enfileirei validações focal e completa enquanto a UI ainda estava em revisão humana. Depois de mudar a expectativa de um teste do acordeão, rodei o check completo outra vez para obter um recibo do novo SHA. Isso confundiu desenvolvimento de PR Draft com o momento de ship, ocupou a máquina e atrasou outros tickets. Mesmo tendo dado verde, o segundo CI não consertou a interface reprovada. Durante a codificação, usar leitura, diagnóstico do editor, TypeScript e lint rápidos; não iniciar teste que passe de três segundos. O CI necessário roda uma vez quando a mudança estiver pronta para ship.
2. A primeira correção do acordeão trocou dois controles desconectados por um único trigger, mas removeu o sublinhado e alterou densidade/espaçamento sem aprovação visual. O nome longo passou a truncar pelo espaço disponível, escondendo informação diagnóstica. A revisão deve preservar uma affordance única em toda a largura clicável, a seta dentro dela e a contagem no mesmo alinhamento.
3. A tabela continuou truncando com base na largura circunstancial do card (sidebar/viewport), apesar de oferecer rolagem horizontal. O limite de cada coluna deve ser estável; ao faltar espaço, a tabela rola lateralmente e conserva nomes/ícones nas respectivas células.
4. O diagnóstico do smoke avulso identificou flags de ship no preset do DietFlow, mas deixou a correção para depois. Um teste isolado não deve ser recusado apenas porque `dev` avançou. O ship deve exigir HEAD/base elegíveis, revalidar antes do merge e aplicar cancelamento conforme a política do consumidor. O CI Queue executa flags declaradas; não deve inferir intenção de ship nem classificar o diff do DietFlow.
5. O fechamento anterior reconheceu como pendentes instalação/cutover, conferência do boot e prova de `ci-queue cancel` real. Esses itens têm de ser concluídos ou receber um impedimento factual, sem chamar bundle temporário de instalação oficial.

## Decisão sobre T7/P05/P06/A10

P05 permanece inconclusivo, sem promessa de ganho causal. O número de três retestes quentes e a instrumentação por tentativa eram um critério de medição, não uma lacuna funcional demonstrada no feedback. Não gerar execuções para completar contagem. Encerrar essa cobrança de harness como não bloqueante; se um defeito de sessão, emissão, publicação ou cancelamento aparecer em uso real, registrar o caso concreto e corrigir o produto. Nenhum ganho de tempo é reivindicado.

## Trabalho posterior ao merge

- A lane pós-merge passou a compor cada cabeçalho expansível em um único trigger shadcn. Seta, título e contagem permanecem na mesma linha; o hover sublinha toda a área clicável. Folhas longas quebram linha. A tabela reserva larguras fixas para execução e revisão e rola dentro do card. Inspeção no browser local mediu a mesma coluna de execução (451 px) e revisão (387 px) em viewport de 390 e 1280 px; a página permaneceu em 390 px e o scroll interno foi 1184 px. O Vite desta lane usou dependências por symlink e recusou servir a fonte Geist por allowlist, então a tipografia final ainda requer conferir a release empacotada.
- Manter uma única receita `smoketest` no DietFlow. O smoke avulso não recebe flags Git de ship; o comando ship aplica as flags à sua tentativa da mesma receita e preserva preflight/postflight e cancelamento. A duplicação temporária de `ship-smoketest` foi rejeitada por Marco e retirada antes de qualquer CI.
- README, quickstart, contrato, DESIGN e ledger agora descrevem a responsabilidade do consumidor e a composição visual sem nova heurística no motor.
- O typecheck da UI terminou em menos de um segundo e o lint focal dos arquivos de CI do DietFlow passou. O typecheck completo do DietFlow não terminou dentro do limite de três segundos e foi interrompido; não foi repetido. Nenhum CI foi iniciado por estas correções.
- No momento de ship da correção completa: um único CI necessário, instalar/cortar para a versão mergeada, conferir versão/manifest/serviços/boot e provar `ci-queue cancel` real. Não repetir CI por cada edição nem promover para `main` por inferência.
- Preparar depois um dossiê curto de boas práticas e a atualização de `AGENTS.md` para fixar esta regra operacional em fonte canônica.
