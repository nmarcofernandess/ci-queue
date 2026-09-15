# UI composition ledger

The current product behavior is defined in [`PRODUCT-CONTRACT.md`](./PRODUCT-CONTRACT.md). This ledger maps that behavior to recovered shadcn compositions.

This file is the selection map for the CI Queue dashboard. It records the
composition before implementation so the product is built by recovering and
adapting shadcn sources rather than re-inventing surfaces.

## Baseline

- Framework: Vite + React + Tailwind 4.
- shadcn configuration: `radix-nova`, base `radix`, icon library `lucide`.
- Bootstrap reference: [Dashboard 01](https://ui.shadcn.com/r/styles/radix-nova/dashboard-01.json), retrieved through `shadcn view @shadcn/dashboard-01` on 13/09/2026.
- Dashboard 01's demo data, section KPI cards and interactive area chart are
  excluded. It supplies the shell, sidebar/header relationship and compatible
  drawer/table source patterns.
- Historical comparison: the retired DietFlow Vite at `e39e16268` may be used
  to compare the density and fixed-region behavior Marco already preferred.
  It contributes no JSX, CSS, data contract, tabs or controls.

## Surface map

| Need                                   | Selected composition                                                                                                                | Adaptation boundary                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell                              | `SidebarProvider` → `Sidebar variant="inset" collapsible="offcanvas"` → `SidebarInset` → header with `SidebarTrigger`               | Brand, routes and project context only. No `SidebarRail`; trigger stays in header; project switcher stays at the header's end.                                                                                                                                                                                                                      |
| Sidebar navigation and local environment | `SidebarHeader`, `SidebarContent`, `SidebarMenu`, `SidebarMenuButton`, `SidebarFooter`, `DropdownMenu`                            | Footer is `LocalEnvironmentMenu`: Bridge from `/health` and theme radios. No fake user.                                                                                                                                                                                                                                                            |
| Project switcher                       | Shared `SelectionPanel` (`Popover` + `ScrollArea` + `InputGroup`) + `Button`                                                        | Searchable exclusive list of active projects plus unassigned history. Archived entries stay in the manager.                                                                                                                                                                                                                                         |
| Project manager                        | Shared `DetailDrawer` + `FieldSet`/`Field` + `AlertDialog`                                                                          | Local register/rename/relocate/link/archive/restore. Probe is Conferir pasta. Archive does not cancel jobs.                                                                                                                                                                                                                                         |
| Current execution                      | `Card` → `CardHeader`/`CardContent`, `Item`, `ItemGroup`, `Empty`, `Tooltip`, icon `Button`                                         | Region is always visible. Running has one state icon; title and final eye open the drawer.                                                                                                                                                                                                                                                          |
| Queue                                  | Dashboard 01 `DataTable` composition adapted into shared `RunTable`                                                                 | Only queued tickets; no filter toolbar. The terminal receipt moves to history, never becomes a queue summary.                                                                                                                                                                                                                                      |
| Queue, history and last greens          | Dashboard 01 `DataTable` composition (`@tanstack/react-table`, `table.FlexRender`, `Table`) adapted into shared `RunTable` renderer | One-line rows with status icon, execution, time, duration, revision and final eye. Commit grouping has a dedicated aggregate table and official Drawer.                                                                                                                                                                                             |
| History controls                       | `InputGroup`, default `ToggleGroup`, shared `FilterSelect`, `Button ghost`                                                        | Controls live in the owning CardHeader, above the table, and wrap left-to-right. No Calendar, interval or nested popup. Executions search server-side across preset, branch, SHA, ticket, cwd, command and extra arguments without exposing the latter two; last greens search the four fields the normalized legacy data actually contained: preset, branch, SHA and ticket. |
| Machine                                | `Card` → `CardHeader`/`CardContent`, `Item`                                                                                         | Only measurable disk capacity. No action, invented normal state, memory total or per-card refresh.                                                                                                                                                                                                                                                  |
| Meta and pending items                 | Separate `Card` summaries; Meta uses a `Drawer` with `FieldSet`/`FieldGroup`/`Field`, while Pendências uses a read-only `Drawer` with `ItemGroup`/`Item` | Meta persists only name, description and selected presets; candidate SHA is derived from their current canonical greens. Pendências renders idempotent validation recommendations emitted by consumers and offers no manual form. Neither surface gates CI or merge.                                                                                  |
| Worktrees                              | Dashboard 01 `DataTable` composition + `Checkbox`, `InputGroup`, `ButtonGroup`, `DropdownMenu`                                      | Persistent selected IDs is a named state-management gap; rows do not become buttons.                                                                                                                                                                                                                                                               |
| Job, worktree, meta and pending detail | `Drawer` from Dashboard 01, right on desktop/bottom on mobile; `DrawerHeader`, `ScrollArea`, `DrawerFooter` where actions exist     | Job header/tabs/footer stay fixed and only its central content scrolls. Match the compact proportions of the approved historical drawer without copying its markup. Meta and Pendências open directly in their own drawer surface, without a second navigation layer.                                                                              |
| Diagnostic and copy variants           | `Popover` for diagnostic, `DropdownMenu` for explicit copy variants                                                                 | Diagnostic does not render below a log. No nested menus.                                                                                                                                                                                                                                                                                           |
| Forms                                  | `FieldSet`, `FieldGroup`, `Field`, `Input`, `Textarea`, `AlertDialog` for deletion                                                  | Forms are in the drawer; no made-up modal form wrapper.                                                                                                                                                                                                                                                                                            |
| Empty/loading/error                    | `Empty`, `Skeleton`, `Sonner`                                                                                                       | Preserve loaded data during refresh; render a surface-local error.                                                                                                                                                                                                                                                                                 |

## Analysis

The route has a single statistics surface using `flex flex-wrap justify-start gap-2`:

```text
[Resultados | Duração] [Período] [Presets ▾]
```

It does not use `space-between`, a date-picker, a calendar or a Select nested
inside a Popover. On narrow screens the first tabs may scroll horizontally and
the remaining controls wrap in this order.

| View     | Selected composition                                                                                   | Contract                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results  | `Card` + Nova `ChartContainer`, custom tooltip payload, `ChartLegendContent`, Recharts `BarChart` + shared `PresetMultiSelect` | Per-preset percentage stacks on a 0–100 axis. Tooltip keeps count · percent and the preset total. Default visible set is top 10 by volume; filtering is local. The table keeps exact counts in the same order.                                        |
| Duration | `Card` + `ItemGroup` + Nova `ChartContainer`, `ChartTooltipContent`, Recharts `ScatterChart`/`Scatter` | Specific preset required. Visible median/range/N above the chart. Both numerical axes derive bounded domains from the visible points, so timestamps never fall back to the epoch. Points only; no `Line`, curve or interpolation. Tooltip contains point-specific temporal/unit data. |

`ChartContainer` is the official Nova chart shell and owns chart config, theme
variables, tooltip and legend styling. Its canvas has an explicit bounded height
in the product rather than retaining the shell's default viewport-wide
`aspect-video`, so a wide dashboard never turns a chart into a wall. Recharts
only supplies the selected series and axes. The Nova registry has no ready-made stacked-bar or scatter
block; reference examples may be read for Recharts structure, but no
new-york-v4 component CSS or JSX is copied into this project.

## Data Table adaptation

The Dashboard 01 registry item explicitly ships a `DataTable` component and
declares `@tanstack/react-table`. The product retains its column-definition,
table-model, `table.FlexRender`, official `Table` and checkbox-selection
composition. The installed major version exposes its compatible table factory
rather than the old `useReactTable` name; the implementation must use that
official version's equivalent API, not downgrade or recreate a CSS grid.

Demo-specific drag-and-drop, arbitrary document columns and generic pagination
are excluded because CI Queue owns its history cursor and does not allow
rearranging execution records. This is a product adaptation, not permission to
turn table rows into buttons or to substitute a handmade table.

Column budgets belong to each table consumer. Compact execution identities keep
title and status badge on one line, truncate only the flexible title, and retain
the complete accessible value. Card tables reserve the final action width for
the installed icon Button plus both effective paddings. Compact absolute dates
remain in the cell; relative time remains available through Tooltip.

## Named gaps

| Gap                | Allowed composition                                                                                               | Prohibited substitute                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Status layout      | Responsive page wrapper around existing Cards/Tables                                                              | A bespoke dashboard/card system or arbitrary divider.     |
| Execution stages   | Recursive `ItemGroup`/`Item` with official `Collapsible`, dots and checks                                         | Percent, ETA, Slider/Progress or flattened hierarchy.    |
| Worktree selection | TanStack v9 controlled `Record<worktreeId, true>` over Checkbox/Data Table, persisted per project in localStorage | Custom checkboxes or clickable rows.                      |
| Duration scatter   | `ChartContainer` with Recharts scatter series                                                                     | Line chart, trendline, area chart or raw tooltip styling. |

## Status grouping correction — 15/09/2026

Queue/history -> installed Nova Card, CardHeader, CardTitle, CardContent and
CardFooter -> shared RunTable data and existing history toolbar. The table has
no additional rounded border inside its Card. Commit grouping uses the same
Card/header arrangement. Status has no duplicate page title in the body.

Status indicators -> existing icons, Badge and ChartContainer -> shared semantic
success/destructive/warning/muted-foreground tokens; do not color whole rows or
replace icon/label identification with color alone.

### Composition refinement approved by Marco — 15/09/2026

Empty current execution -> CardContent + compact Item. Empty queue -> compact
horizontal Empty, without redundant title, table headings or explanatory copy.
History -> mode ToggleGroup (default, spacing 1) identifies the surface; no
separate visible History heading. InputGroup gets flexible width and a short
placeholder. Result and origin use direct Select; grouping is only visible in
greens mode. Table headings use muted text without a colored background band;
summary footers have no tinted band. Existing filtering semantics are preserved.

Live facts -> existing Badge, Item description and chronology -> retry/counts and a shared local clock. No new shell. Unattributed history -> existing ghost Button and shared RunTable -> explicit legacy scope; no new table or nested filter.

## Current execution strip — 15 September 2026

Current execution stages use the installed horizontal `ScrollArea` + `ScrollBar`
and `ItemGroup`/`Item`, with semantic status icons and `Separator` connectors.
The strip occupies the card width below execution identity. Eight stages fit at
the desktop reference viewport (1600 px); narrower widths scroll horizontally.
New active stages are brought into view until the user scrolls manually. Returning
to the right edge resumes following. The job drawer retains its recursive vertical
tree. Browser regression uses twelve isolated stages and checks manual scroll,
automatic following and narrow viewport overflow.

The current preset uses the prominent title size with a two-line-height status
indicator. Time, duration and branch share a wrapping metadata row. Collapsible
chevrons point down while open and right while closed. Drawer content permits
native text selection; dragging content must never dismiss the drawer. Closing
remains available through Close, Escape and the outside overlay. The controlled
detail shell enables Vaul autofocus and uses DrawerContent close autofocus to
return focus to the element that opened it.

## Shared composition ownership — etapa 1

The previous indicator-only scale is superseded by `presentation.ts` and the
complete `EntityIdentity` composition. Executable values live only in code;
`DESIGN.md` explains their roles. DetailDrawer owns all five detail surfaces,
FactsTable owns their metadata sheets, DataTableFrame owns list gutters, and
ProgressTree/ExecutionStages share StatusIndicator descriptors. These compose
installed Nova primitives; they add no backend or data model.

This candidate is subject to human review. Prior approvals do not approve this
new family implementation. See the etapa-1 evidence index for actual proof.
