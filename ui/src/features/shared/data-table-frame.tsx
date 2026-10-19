import type { ReactNode } from "react"
import { Table } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function DataTableFrame({
  placement,
  label,
  width = "standard",
  children,
}: {
  placement: "card" | "body"
  label: string
  width?: "standard" | "wide" | "scroll"
  children: ReactNode
}) {
  return (
    <Table
      aria-label={label}
      data-placement={placement}
      className={cn(
        "min-w-[40rem] table-fixed [&_thead_th]:font-normal [&_thead_th]:text-muted-foreground",
        width === "wide" && "min-w-[52rem]",
        width === "scroll" && "min-w-[74rem]",
        placement === "card"
          ? "[&_tr>:first-child]:pl-(--card-spacing) [&_tr>:last-child]:pr-(--card-spacing)"
          : undefined
      )}
    >
      {children}
    </Table>
  )
}
