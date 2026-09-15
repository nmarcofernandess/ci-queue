# CI Queue

CI Queue is a local, project-agnostic CI executor and observability dashboard.
Projects consume it through a versioned installation and keep only their own
recipes, commands and approval policy.

The dashboard is a Vite application in [`ui`](./ui), bootstrapped with the
official shadcn Nova/Radix configuration. Its construction rules and selected
compositions are in [`docs/ui/COMPOSITION-LEDGER.md`](./docs/ui/COMPOSITION-LEDGER.md).

The immutable bundle carries its own installer, command launcher and macOS
LaunchAgent envelopes. Installation and recovery are documented in
[`docs/INSTALL.md`](./docs/INSTALL.md). A consumer never points to this checkout.

[`examples/local-project`](./examples/local-project) is a dependency-free
consumer fixture for success, failure, wait, cancellation and interrupted
worker recovery.

Configuration, progress, records and ownership are documented in
[`docs/CONTRACTS.md`](./docs/CONTRACTS.md).
