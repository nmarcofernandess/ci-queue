# Etapa 3 performance fixtures

Fixtures are generated into a fresh temporary directory by
`scripts/bench/ci-queue-read-path.py`. They use the fixed seed
`ci-queue-etapa-3-s0-v1`, absolute timestamps, two temporary Git repositories,
projects Alpha/Beta and unattributed records. No operator state or consumer
checkout is read.

Canonical populations: D0, D100, D1000, D1000H (128 nodes plus one 4096-node
detail), D3000 and DLIVE. Exact generated-body SHA-256 values are recorded in
`docs/performance/etapa-3/raw/dataset-hashes.json`.
