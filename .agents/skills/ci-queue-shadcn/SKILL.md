---
name: ci-queue-shadcn
description: Recover, select and adapt official shadcn Nova/Radix compositions for any CI Queue UI change before JSX is written.
---

# CI Queue shadcn composition

Use this skill for every change under `ui/src/`. It is a **selection workflow**,
not a visual review after code exists.

## Non-negotiable sequence

1. State the user need in one semantic noun: shell, navigation, table, filter,
   status item, drawer, form, menu, empty/error/loading, or chart.
2. Read DESIGN.md and .context/domains/manifest.yaml, then the referenced
   .context/patterns/ui-composition.yaml and its shared owners/consumers.
   Read the matching row in `docs/ui/COMPOSITION-LEDGER.md`. That ledger is the
   product decision record and names the only accepted adaptation gaps.
3. From `ui/`, run `npx shadcn@latest info --json`, then
   `npx shadcn@latest docs <component>` for every component selected. For a
   block not already present, recover its source with `npx shadcn@latest view`.
4. Write the implementation note in this form before JSX:
   `need -> official composition -> adapted data/action -> named gap, if any`.
5. Adapt data, labels and actions only. Preserve the recovered composition,
   semantic tokens, variants, keyboard behavior and responsive structure.
6. If no component/block is close enough, stop and name the missing gap. Do not
   improvise a primitive composition because it is faster.
7. Inspect desktop, intermediate and narrow widths in the browser, including
   open menus/drawers/popovers and empty, loading and factual-error states.

## Local facts that change implementation

- The UI is Vite + React + Tailwind 4, `radix-nova`, Radix and Lucide.
- Dashboard 01 supplies the shell, Drawer and DataTable source pattern. It is
  the bootstrap, not the source of CI Queue data or the analysis area chart.
- `@tanstack/react-table` is v9. Read
  `ui/node_modules/@tanstack/react-table/skills/getting-started/SKILL.md`.
  Use `useTable`, `tableFeatures`, stable inputs and `table.FlexRender`; do not
  paste v8 `useReactTable` code or replace a DataTable with CSS grid markup.
- The only named UI gaps are the Status page layout, execution-stage connector,
  persistent worktree selection and duration scatter series. Their permitted
  compositions are in the ledger.
- The old DietFlow Vite dashboard at `e39e16268` is a visual comparison source
  only for a Marco-approved quality named by the product contract, especially
  drawer density and fixed-region behavior. Do not copy its JSX/CSS or revive
  obsolete content. Nova composition remains the structural source.

## Fast rejection list

Reject these implementation paths before coding:

- a raw `div` when an installed `Card`, `Item`, `Table`, `Empty`, `Field`,
  `DropdownMenu`, `Popover`, `Drawer` or `ChartContainer` already fits;
- a direct primitive-library workaround when the matching shadcn component is
  installed;
- a custom color, manual dark override, handcrafted overlay z-index or manual
  icon sizing;
- `space-y-*`; use a flex column with `gap-*`;
- a whole-row button; only an explicitly named title opens a drawer;
- `Select` inside a `Popover`/calendar for a fixed period;
- a line, area or trendline for the duration view;
- an inferred error or invented empty state in place of a factual API state.

The shadcn component skill available in the agent environment explains API
rules. This local skill makes the recovery-and-selection step mandatory for
this product, so a future agent starts from the vocabulary already available
rather than from arbitrary markup.
