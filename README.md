# CI Queue

Executor local de CI com fila, supervisão de processos, registros, API, dashboard e ship genérico. Ele amplia as capacidades do repositório consumidor; a interface apenas mostra e opera os registros. O projeto continua dono dos testes, da preparação e da política de entrega. Pode adotar o ship genérico ou manter seu próprio processo de entrega. O worker não mergeia.

## Comece aqui

**[Quickstart de integração](docs/CONSUMER-QUICKSTART.md)** é a porta de entrada genérica. O **[manual HTML offline](docs/GUIA-INTEGRACAO-CI-QUEUE.html)** ensina máquina/projeto, protocolo TSV, receitas agregadoras, ship, Node por projeto, worktrees, filtros e diagnóstico. Salve o HTML e abra no navegador; o GitHub mostra o código-fonte, não executa a página.

- [Índice e donos da documentação](docs/README.md)
- [Contratos de catálogo, ticket, progresso e ship](docs/CONTRACTS.md)
- [Método de feedback e prova](docs/TESTING-METHOD.md)
- [Instalação de uma release e verificação local](docs/INSTALL.md)
- [Pin opt-in de Node e seus limites](docs/RUNTIME-ISOLATION.md)
- [Consumidor exemplo isolado](examples/local-project/README.md)

O código atual desta integração é a branch **dev**. Uma revisão de documentação não promove main, não instala release e não comprova o state de uma máquina. Código do checkout, bundle instalado e state de jobs são três objetos diferentes.

## Desenvolvimento do produto

Leia [AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md) e o [contrato da UI](docs/ui/PRODUCT-CONTRACT.md). Rode os testes relevantes antes dos agregados. `npm run check` testa o produto no checkout; só seu enqueue cria um job na fila escolhida. Testes de produto usam state isolado e nunca escrevem na fila do operador.

O pacote é privado: não presumir distribuição npm pública. Consuma uma release verificada ou siga o processo de build/instalação documentado. O DietFlow mantém seu próprio `npm run ship`; a existência de ship genérico não constitui cutover.

## Retestar ou produzir prova

O consumidor escolhe uma receita real pelo próprio mapa e catálogo. Use feedback
somente quando o mapa declarar uma receita adotada; uma tentativa focal e quente
serve para iterar, não para autorizar ship. Leia o [método de feedback e
prova](docs/TESTING-METHOD.md) antes de copiar o
[quickstart](docs/CONSUMER-QUICKSTART.md) para outro projeto.
