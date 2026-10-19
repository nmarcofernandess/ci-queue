# CI Queue

CI Queue is an independent local CI executor and observability product. It owns
its CLI, queue, supervisor, records, API, dashboard, installation and product
tests. A consuming project owns its recipes, preparation and test harness.

For the boundary between planned authorship and integration, follow the
consumer's instructions and `docs/TESTING-METHOD.md#fechamento-depois-da-autoria`.
Keep execution state in the consumer's selected record; queue observability
does not reopen its plan or declare integration/deploy complete.

## Integration documentation

The generic entry is `docs/CONSUMER-QUICKSTART.md`; the complete offline teaching
manual is `docs/GUIA-INTEGRACAO-CI-QUEUE.html`. Owners and navigation are in
`docs/README.md`. Formats belong to `docs/CONTRACTS.md`; release operations to
`docs/INSTALL.md`; the feedback/proof choice and adoption templates to
`docs/TESTING-METHOD.md`; Node binding limits to `docs/RUNTIME-ISOLATION.md`.
Read live code/tests on the requested branch before reconciling prose. Historical
specs/plans are context, not current operational policy. Do not rewrite their
phases as part of a docs reconciliation.

When adopting CI Queue in a consumer, explicitly update its AGENTS file (the
actual target if it is a symlink) and its versioned operational skill/instruction.
Keep one editable owner; use pointers rather than parallel contract copies.
`ship.acceptedPresets` is OR; absent proof enqueues the first recipe. Required
multiple checks belong in a real aggregate recipe with failure propagation.
Progress is observability, never ship eligibility. An offline manual is not a
runtime proof. Draft documentation PRs do not authorize merge, installation,
cutover, Full execution or changes to product policy.

## Working in this repository

- Product commands in this repository remain runnable directly. Use the
  official queue when validating through CI Queue (`ci-queue enqueue
  check|review --wait`); fixtures inside the suite use temporary states. Do not
  start a second worker on the operator state. Resume an existing queued job by
  inspecting its ticket/status/process before enqueueing again.
- Keep the executor and dashboard independent of a consumer checkout. A path,
  import, script or release asset must not require DietFlow internals.
- Preserve proven process ownership, cancellation, locking and record formats
  unless the change has a migration and recovery path.
- The worker and runner never import `src/ship` and never request GitHub merge.
- The project UI lives in `ui/` and uses Vite, TypeScript, Tailwind 4,
  `radix-nova`, Radix and Lucide. Read `ui/components.json` and run
  `cd ui && npx shadcn@latest info --json` before changing UI.
- For every UI change, load `.agents/skills/ci-queue-shadcn/SKILL.md` before
  writing JSX. It makes recovery and selection the first action, rather than
  a constraint checked after a component was invented.

## UI: retrieve, select, adapt

Start at the [domain map](.context/domains/manifest.yaml), then open the
[UI composition pattern](.context/patterns/ui-composition.yaml) for the shared
owner, consumers and checks. Read `DESIGN.md` and the product contract before
changing the selected surface. For execution state, use the shared descriptor
in `ui/src/features/shared/presentation.ts`; status color, retry and failure
priority do not belong in individual screens.
Recover the installed composition and its consumers before JSX. Features pass
data/actions; shared owners decide geometry/presentation. Family corrections
must verify all consumers. Types/lint prove mechanical limits; the rendered
candidate proves composition. Internal review never implies human approval.
Work requested against dev does not authorize main promotion or installation.


Treat shadcn as the available construction vocabulary, never as a styling
constraint applied after generating markup.

Before writing JSX for any surface:

1. Classify the need: shell, table, filter, item/card, detail, form, menu,
   empty/loading/error or chart.
2. Read the corresponding entry in `docs/ui/COMPOSITION-LEDGER.md`.
3. Run `npx shadcn@latest docs <component>` and retrieve the complete source
   with `view` when the component or block is not installed.
4. Select the closest official composition. State it in the implementation
   note as `need -> composition -> adapted data/action`.
5. Adapt only data, labels, routes and the stated real gap. Do not rewrite a
   component's structural markup or use a primitive library directly when the
   installed shadcn component provides the composition.
6. Inspect it in a browser at desktop, intermediate and narrow widths, in all
   themes and with overlays, empty, loading and error states when applicable.

The named gaps are the status page grid, execution-stage connector, persistent
worktree selection and duration scatter series. Each must compose existing
Nova components and semantic tokens. A new gap needs an explicit product
decision before JSX.

The retired DietFlow Vite dashboard at commit `e39e16268` may be inspected only
for a Marco-approved interaction or proportion that the product contract names,
especially drawer density and fixed-region behavior. Never copy its JSX/CSS or
revive its obsolete tabs, copy, data or controls. The current product contract
decides content; official Nova compositions decide structure; the historical
screen is a visual comparison target for the explicitly preserved quality.
The Dashboard 01 area-chart demo and data are excluded. The starter supplies
the application shell and compatible source composition, not CI Queue content.

### Dashboard 01 tables in this workspace

Before adapting a Dashboard 01 table, inspect the installed TanStack package.
This repository currently uses `@tanstack/react-table` v9. Its local source of
truth is `ui/node_modules/@tanstack/react-table/skills/getting-started/SKILL.md`:
use `useTable`, registered `tableFeatures`, stable inputs and
`table.FlexRender`. Do not paste a v8 `useReactTable` example, downgrade the
installed dependency or abandon the Dashboard 01 `DataTable` composition for a
CSS grid when an API name differs.

## UI invariants

- Use installed shadcn components and their variants before custom markup.
- Use semantic tokens; do not add raw colors, manual dark overrides or overlay
  z-index values.
- Use `Empty`, `Skeleton`, `Separator`, `Badge`, `Field`, `InputGroup`,
  `ToggleGroup`, `ButtonGroup`, `DropdownMenu` and `Popover` according to their
  official composition.
- A title may open a job or worktree drawer; table rows and metadata are not
  whole-row buttons.
- Preserve native anatomy, spacing and lifecycle. Tables use TableRow/TableCell;
  do not render Cards/Items as rows. When spacing disappears, remove the reset
  at its shared owner instead of adding compensating CSS or another wrapper.
- Prefer native variants and sizes. Features supply semantic data/actions, not
  arbitrary presentation overrides. Keep genuine product adaptations in their
  existing owners and ledger; an existing class is not proof of its necessity.
- Preserve native focus and controlled state. Do not remount a controlled Select
  on value changes; let its popup use the available height. Informative tooltips
  need keyboard access, and selected choices need an accessible state.
- Follow the native-contract limits in DESIGN.md. The native-spacing lint rule
  catches static spacing regressions in named components; it does not certify
  upstream source integrity, calculated CSS, visual parity or human acceptance.
- Filters remain above the controlled surface. Never nest Select inside a
  Popover/Calendar to represent a fixed period. Results presets use the shared
  searchable multi-select; Duration keeps a single declared recipe.
- The project selector lives in the global header. The sidebar footer is the
  local environment (Bridge + theme), not a user account.
- The Analysis duration view is point data: `ChartContainer` plus `Scatter`,
  with no line, curve or invented trend.

## Validation

During UI iteration, render and review the candidate before running a queue
ticket. A Draft PR, visual adjustment, commit or push does not by itself call
for `check` or `review`. Use the smallest focal check for a concrete behavior or
contract risk; a failed broad run calls for causal diagnosis before another
canonical run. Once the candidate is ready for integration, run the documented
minimum check for that destination. Before release/cutover, execute the
product's documented contract, integration, UI and installation checks. A
consumer smoketest does not prove the queue engine; an isolated queue fixture
does not prove a consumer Full run.
