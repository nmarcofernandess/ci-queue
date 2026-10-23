---
name: consumer-testing-method
description: Choose focal feedback, closing diagnostics or proof using the consumer's CI method map.
---

# Consumer testing method

Read the consumer's README and AGENTS, then open its
[method map](.context/patterns/ci.yaml). Resolve this path and the map's `method`
from the **consumer repository root**, regardless of where this skill is copied.
The default owner is `docs/ci/TESTING-METHOD.md`; change `method` to the existing
consumer procedure when adopting (for example `docs/ci/FEEDBACK-LOOP.md`).

Consumer commands remain executable directly. Choose Queue for scheduling,
serialization and records when useful or required by a declared resource
contract. Use feedback only after the map declares a real implemented recipe;
otherwise it stays unavailable. Feedback does not grant proof or ship eligibility.

For Queue, inspect the installed revision, state, cwd and existing ticket before
retrying. Worker Node and caller environment are separate; the consumer loads
its own configuration in the actual executor. Job Node binding is opt-in. Use
framework/version-compatible native loaders; do not copy another project's env.

The consumer owns outputs, useful caches and resource lifecycle. Once the command
and any current finalization attempt end, queue work is released; historical
uncertain cleanup is diagnostic and does not demand
a globally clean computer. A finalization hook is optional unless the declared
output contract requires it. Recover publication for that same ID through the
public entry without rerunning tests or deleting reservations.

Follow the map's consumer-owned procedure for the transition after planned
tasks/reviews, closing diagnostics and record retention. Generic reference:
[CI Queue testing method](https://github.com/nmarcofernandess/ci-queue/blob/main/docs/TESTING-METHOD.md).
