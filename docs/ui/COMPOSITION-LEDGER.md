# UI composition ledger

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

## Surface map

| Need | Selected composition | Adaptation boundary |
| --- | --- | --- |
| App shell | `SidebarProvider` → `Sidebar variant="inset" collapsible="offcanvas"` → `SidebarInset` → header with `SidebarTrigger` | Brand, routes and bridge data only. No `SidebarRail`; trigger stays in header. |
| Sidebar navigation and theme | `SidebarHeader`, `SidebarContent`, `SidebarMenu`, `SidebarMenuButton`, `SidebarFooter`, `ToggleGroup`, `Tooltip` | Footer contains Bridge and Claro/Escuro/Sistema only. |
| Current execution | `Card` → `CardHeader`/`CardContent`, `Item`, `ItemGroup`, `ItemSeparator` | Full-width only while there is a real running ticket. Title opens drawer; date, relative time and duration live below it. |
| Queue | Dashboard 01 `DataTable` composition adapted into shared `RunTable` | Only queued tickets; no filter toolbar. The terminal receipt moves to history, never becomes a queue summary. |
| History, last greens and problems | Dashboard 01 `DataTable` composition (`@tanstack/react-table`, `table.FlexRender`, `Table`) adapted into shared `RunTable` renderer | Two columns: Execution and Context. Only preset title opens the drawer. |
| History controls | `Tabs`, `InputGroup`, direct `Select`, `Button ghost` | Controls live above the table and wrap left-to-right. No Calendar, interval or nested popup. |
| Machine | `Card` → `CardHeader`/`CardContent`/`CardFooter`, `Item`, ghost `Button` link | Only measurable disk capacity and the link to Analysis. No invented normal state, memory total or per-card refresh. |
| Meta and notes | `Card` summaries plus `Drawer` form using `FieldSet`/`FieldGroup`/`Field` | One manual project goal and manual notes; they do not gate CI or manufacture pending work. |
| Worktrees | Dashboard 01 `DataTable` composition + `Checkbox`, `InputGroup`, `ButtonGroup`, `DropdownMenu` | Persistent selected IDs is a named state-management gap; rows do not become buttons. |
| Job, worktree, meta and note detail | `Drawer` from Dashboard 01, right on desktop/bottom on mobile; `DrawerHeader`, `ScrollArea`, `DrawerFooter` | Fixed header/tabs/footer with only central content scrolling. |
| Diagnostic and copy variants | `Popover` for diagnostic, `DropdownMenu` for explicit copy variants | Diagnostic does not render below a log. No nested menus. |
| Forms | `FieldSet`, `FieldGroup`, `Field`, `Input`, `Textarea`, `AlertDialog` for deletion | Forms are in the drawer; no made-up modal form wrapper. |
| Empty/loading/error | `Empty`, `Skeleton`, `Sonner` | Preserve loaded data during refresh; render a surface-local error. |

## Analysis

The route has a first row of `Tabs`: **Estatísticas** and **Problemas**.

The second row uses `flex flex-wrap justify-start gap-2`:

```text
Estatísticas: [Resultados | Duração] [Período] [Preset]
Problemas:                             [Período] [Preset]
```

It does not use `space-between`, a date-picker, a calendar or a Select nested
inside a Popover. On narrow screens the first tabs may scroll horizontally and
the remaining controls wrap in this order.

| View | Selected composition | Contract |
| --- | --- | --- |
| Results | `Card` + Nova `ChartContainer`, `ChartTooltipContent`, `ChartLegendContent`, Recharts `BarChart` | Vertical stacked bars for passed, failed, cancelled and interrupted. Show every filtered preset; no hidden top-N. |
| Duration | `Card` + `ItemGroup` + Nova `ChartContainer`, `ChartTooltipContent`, Recharts `ScatterChart`/`Scatter` | Specific preset required. Visible median/range/N above the chart. Points only; no `Line`, curve or interpolation. Tooltip contains point-specific temporal/unit data. |
| Problems | Shared `RunTable` | Failed and interrupted terminal records. Do not invent a failure classification. |

`ChartContainer` is the official Nova chart shell and owns chart config, theme
variables, tooltip and legend styling. Recharts only supplies the selected
series and axes. The Nova registry has no ready-made stacked-bar or scatter
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

## Named gaps

| Gap | Allowed composition | Prohibited substitute |
| --- | --- | --- |
| Status layout | Responsive page wrapper around existing Cards/Tables | A bespoke dashboard/card system or arbitrary divider. |
| Execution stages | `ItemGroup`, `Item`, dots/checks and `Separator` | Percent, ETA, Slider/Progress or made-up state machine. |
| Worktree selection | TanStack v9 controlled `Record<worktreeId, true>` over Checkbox/Data Table, persisted per project in localStorage | Custom checkboxes or clickable rows. |
| Duration scatter | `ChartContainer` with Recharts scatter series | Line chart, trendline, area chart or raw tooltip styling. |
