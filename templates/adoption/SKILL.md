---
name: consumer-testing-method
description: Choose focal feedback, closing diagnostics or proof using the consumer's CI guide and method map.
---

# Consumer testing method

Start with `npx ci-queue-consumer guide`. It reads this repository's catalog and
host and shows the recipes, the executor on this host and why, how to integrate,
and the repository's own teachings. `ci-queue-consumer inspect <recipe>` shows
one recipe's argv and the next line to run, without running it.

For the procedure (when focal feedback is enough, when a proof is due, how the
result is recorded), open the [method map](.context/patterns/ci.yaml) from the
**consumer repository root** and follow its `method` owner (default
`docs/ci/TESTING-METHOD.md`, or the existing consumer procedure).

For generic execution and diagnosis, use `ci-queue:operate`; for pending
validations, use `ci-queue:validations`. The method map above owns local choices.
[Adoption contract](https://github.com/nmarcofernandess/ci-queue/blob/main/docs/CONSUMER-QUICKSTART.md).
