import type { ReactNode } from "react"
import { Table } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function DataTableFrame({
  placement,
  label,
  children,
}: {
  placement: "card" | "body"
  label: string
  children: ReactNode
}) {
  return (
    <Table
      aria-label={label}
      data-placement={placement}
      className={cn(
        "min-w-[40rem] table-fixed [&_tbody_td]:h-12 [&_tbody_td]:py-2 [&_tbody_td]:align-middle [&_thead_th]:font-normal [&_thead_th]:text-muted-foreground",
        placement === "card"
          ? "[&_tr>:first-child]:pl-(--card-spacing) [&_tr>:last-child]:pr-(--card-spacing)"
          : "[&_tr>:first-child]:pl-0 [&_tr>:last-child]:pr-0"
      )}
    >
      {children}
    </Table>
  )
}
