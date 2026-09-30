import * as React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import {
  rankResults,
  resolveSelection,
  resultIdentity,
  resultLabel,
  type PresetSelection,
  type ResultCounts,
} from "@/features/analysis/results-model"
import { SelectionPanel } from "@/features/shared/selection-panel"

function modeLabel(selection: PresetSelection, count: number) {
  if (selection.mode === "top10") {
    return "10 mais executados"
  }
  if (selection.mode === "all") {
    return "Todos"
  }
  if (selection.presets.length === 0) {
    return "Nenhum preset"
  }
  return `${count} selecionados`
}

export function PresetMultiSelect({
  rows,
  selection,
  onSelection,
  onOpenChange,
}: {
  rows: ResultCounts[]
  selection: PresetSelection
  onSelection: (next: PresetSelection) => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [frozen, setFrozen] = React.useState<ResultCounts[]>(rows)
  const visible = open ? frozen : rows
  const ranked = rankResults(visible)
  const resolved = resolveSelection(visible, selection)
  const selected = new Set(resolved.selected)
  const filtered = ranked.filter((row) =>
    resultLabel(row).toLowerCase().includes(query.trim().toLowerCase())
  )

  const toggle = (identity: string, checked: boolean) => {
    const current = resolveSelection(visible, selection).selected
    const next = checked
      ? [...new Set([...current, identity])]
      : current.filter((name) => name !== identity)
    onSelection({ mode: "custom", presets: next })
  }

  return (
    <SelectionPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange?.(next)
        if (next) {
          setFrozen(rows)
          setQuery("")
        }
      }}
      label="Presets de Resultados"
      trigger={
        <Button type="button" variant="outline" className="max-w-xs min-w-0">
          <span className="truncate">{modeLabel(selection, selected.size)}</span>
        </Button>
      }
      header={
        <InputGroup>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar preset…"
            aria-label="Buscar preset"
          />
        </InputGroup>
      }
      footer={
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => onSelection({ mode: "top10" })}>
            10 mais executados
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onSelection({ mode: "all" })}>
            Todos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onSelection({ mode: "custom", presets: [] })}
          >
            Limpar
          </Button>
        </div>
      }
    >
      {filtered.map((row) => {
        const identity = resultIdentity(row)
        const label = resultLabel(row)
        return (
          <Field key={identity} orientation="horizontal" className="items-center gap-2 px-1">
            <Checkbox
              checked={selected.has(identity)}
              onCheckedChange={(value) => toggle(identity, value === true)}
              id={`preset-${identity}`}
            />
            <FieldLabel htmlFor={`preset-${identity}`} className="min-w-0 flex-1">
              <span className="flex min-w-0 justify-between gap-3">
                <span className="truncate" title={label}>
                  {label}
                </span>
                <span className="tabular-nums text-muted-foreground">{row.total}</span>
              </span>
            </FieldLabel>
          </Field>
        )
      })}
    </SelectionPanel>
  )
}
