# CI Queue

CI Queue is a local, project-agnostic CI executor and observability dashboard.
It is being extracted from DietFlow so projects consume a versioned tool instead
of hosting its queue implementation.

The dashboard is a Vite application in [`ui`](./ui), bootstrapped with the
official shadcn Nova/Radix configuration. Its construction rules and selected
compositions are in [`docs/ui/COMPOSITION-LEDGER.md`](./docs/ui/COMPOSITION-LEDGER.md).

The repository is in active extraction. The immutable bundle and
filesystem-only installation foundation are documented in
[`docs/INSTALL.md`](./docs/INSTALL.md). A consumer must not point to this
checkout; it will use a versioned, verified distribution after cutover.
