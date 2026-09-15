import type { ReactNode } from "react"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"

type FactRow = {
  id: string
  label: string
  value: ReactNode
  technical?: boolean
}
type FactsTableProps = { caption: string; rows: readonly FactRow[] }

export function FactsTable({ caption, rows }: FactsTableProps) {
  return (
    <Table className="table-fixed">
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableHead
              scope="row"
              className="w-32 py-2 pl-0 align-top whitespace-normal text-muted-foreground"
            >
              {row.label}
            </TableHead>
            <TableCell
              className={`pr-0 align-top [overflow-wrap:anywhere] whitespace-normal ${row.technical ? "font-mono" : ""}`}
            >
              {row.value}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
