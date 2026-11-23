import { Button as SdkButton } from "@ui-sdk/react/button"
import { createScrollAreaController } from "@ui-sdk/core/scroll-area"
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const windowSize = 100
const output = [
  "Preparando o próximo teste",
  "Iniciando sessão do navegador",
  "PASS · Abre o detalhe da execução",
  "PASS · Mostra o resultado no histórico",
]

export function LiveLogPrototype() {
  const [latest, setLatest] = useState(windowSize)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [scroll] = useState(createScrollAreaController)
  const lastVisible = pausedAt ?? latest

  useEffect(() => {
    const timer = window.setInterval(() => setLatest((line) => line + 1), 800)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>Log ao vivo</CardTitle>
          <CardDescription>
            Execução simulada do CI Queue. Role para cima para ler uma falha e clique em Acompanhar para voltar às linhas novas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Browser anchoring would follow lines that the rolling window removes. */}
          <ScrollArea
            stickToEnd
            controller={scroll}
            className="h-[55dvh] min-h-48 max-h-[36rem] rounded-lg border bg-muted"
          >
            <ScrollAreaViewport
              role="region"
              aria-label="Linhas do log"
              tabIndex={0}
              className="size-full rounded-lg [overflow-anchor:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              onScroll={() => {
                const atEnd = scroll.isAtEnd()
                setPausedAt((line) => (atEnd ? null : (line ?? latest)))
              }}
            >
              <ScrollAreaContent>
                <pre className="px-3 py-2 font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap">
                  {Array.from({ length: windowSize }, (_, index) => {
                    const line = lastVisible - windowSize + index + 1
                    const failure = line % 12 === 0
                    return (
                      <span key={line} className={failure ? "font-semibold text-destructive" : undefined}>
                        {`${line.toString().padStart(4, "0")}  ${failure ? "FAIL · Histórico não exibiu o ticket dentro do prazo (5 s)" : output[line % output.length]}\n`}
                      </span>
                    )
                  })}
                </pre>
              </ScrollAreaContent>
            </ScrollAreaViewport>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <div>
            <p role="status" className="font-medium">
              {pausedAt === null ? "Acompanhando ao vivo" : "Leitura pausada"}
            </p>
            <p className="text-xs text-muted-foreground">Última linha recebida {latest}</p>
          </div>
          <SdkButton
            render={<Button size="sm" />}
            onClick={() => {
              setPausedAt(null)
              scroll.scrollToEnd({ behavior: "instant" })
            }}
          >
            Acompanhar
          </SdkButton>
        </CardFooter>
      </Card>
    </main>
  )
}
