# Entrada para revisão: Static/Jest e Smoke → Ship

Este pacote reúne evidência já existente para auditar individualmente os 58 gates Static e o Jest relacionado do DietFlow. O objetivo de estudo é um único caminho Smoke → Ship mínimo e previsível, com teto-alvo de 120 s. Nenhuma receita, política, gate ou produto foi alterado. Nenhum CI, teste, build, Smoke, Full, banco ou deploy foi executado para coletar este pacote.

Leia nesta ordem:

1. [Análise e limites](ANALYSIS.md): fatos, custos, repetições e fronteiras de responsabilidade.
2. [Matriz legível dos 58 gates + Jest](GATES.md), com [dados completos](gate-matrix.json): cobertura, implementação, hooks, dependências literais, tempos e destinos existentes.
3. [Manifesto](manifest.json): SHAs completos, tickets, origens, completude, sanitização e lacunas.
4. [Índice de fontes imutáveis](sources.json): caminhos, Git blobs, SHA-256 e URLs de leitura; código consultado no Git, sem espelhar o repositório.
5. [Receitas e scripts existentes](recipes.json): fotografia de `ci-queue.json` e entradas npm relevantes. É inventário datado para revisão, não outro catálogo operacional.

Os três diagnósticos enviados por Marco estão em `diagnostics/`, com logs sanitizados em `evidence-logs/`. Os tickets projetados estão em `tickets/`. `measurements/` contém JSONL existentes, recuperados dos artifacts dos tickets; nenhuma instrumentação foi criada ou executada. O Smoke posterior `20261007204501-3b50e0bd` também foi coletado: passou e alcançou Jest. Seu log é um **recorte estrutural**, excluindo payloads de console/fixtures e stacks. Os três logs iniciais preservam o conteúdo salvo as redações documentadas.

Fonte DietFlow dev confirmada na coleta: `0907cd94fac6b483c5f8a48038d037d2297e2c73`, a mesma indicada no despacho. Base documental CI Queue dev: `16f3a275688e0f977b7982ca53035001c045d4da`. As branches são móveis; os links deste pacote usam commits completos. Os SHAs dos quatro runs estão no manifesto e na matriz. A leitura de AGENTS, skill local e owners informou a coleta; pendências de produto consultadas não foram retomadas.

Ambos os repositórios foram confirmados **privados**. O GPT revisor precisa de acesso aos dois para seguir os links de fonte. A publicação aqui não concede esse acesso. Cada arquivo do índice foi resolvido contra o objeto Git local do SHA indicado. Os links não usam `dev` como fonte móvel. Para um arquivo citado no log posterior, use `https://github.com/dietflowoficial/Dietflow-app/blob/6421c4630ac54972b7aaee63c3a80a58513d5d9b/<path>`.

A revisão deve registrar, por gate, propriedade protegida, limites do detector, cobertura alternativa demonstrável, custo observado versus estimativa sustentada, inputs/dependências e destino em uma receita **já existente**. Repetição de comando é indício de custo repetido; não demonstra redundância semântica. Os tempos históricos não certificam um novo piso de 120 s nem autorizam remoção de gate.

Publicação em branch documental e PR draft para dev, sem merge. A workflow viva do Queue executa o job apenas quando o PR deixa de ser draft; push nesta branch não pertence ao trigger de main. A validação deste pacote limita-se a JSON/JSONL, objetos Git, links locais, contagem da matriz, sanitização e whitespace documental. [Registro da validação](VALIDATION.md).
