import type { LogSlice } from "../../lib/types"

export const LOG_BUFFER_LIMIT = 4 * 1024 * 1024
export function appendLog(
  previous: LogSlice | undefined,
  next: LogSlice
): LogSlice {
  if (next.error) return { ...next, content: previous?.content ?? "" }
  if (previous && next.offset !== previous.nextOffset)
    throw new Error(
      "O cursor do log mudou. Reabra a execução para reler o arquivo."
    )
  if (next.nextOffset < next.offset)
    throw new Error("O arquivo de log foi reduzido durante a leitura.")
  const content = (previous?.content ?? "") + next.content
  return {
    ...next,
    content:
      content.length > LOG_BUFFER_LIMIT
        ? "[Trecho anterior fora do buffer de visualização]\n" +
          content.slice(-LOG_BUFFER_LIMIT)
        : content,
  }
}
