# S0 source map

Measured source is commit `5a9268e41e27644362dfd9e5cd4e163813f5e1a1`, tree `67da42f17aac27f046995f952ec49ad578bb9712`. The files below had no working-tree diff when the baseline ran.

| Concern | Source anchor |
| --- | --- |
| Directory signature reads and hashes every history body | `backend/ci_queue_api/records.py:58-96` |
| Application cache and history parse | `backend/ci_queue_api/records.py:145-159` |
| Recursive progress projection | `backend/ci_queue_api/records.py:162-243` |
| Full ticket lookup | `backend/ci_queue_api/records.py:246-263` |
| Living queue/running aggregation | `backend/ci_queue_api/records.py:266-305` |
| Project status projects history before limiting | `backend/ci_queue_api/records.py:309-323` |
| All-project status projects history before limiting | `backend/ci_queue_api/records.py:333-338` |
| Execution list filters/sorts before page projection | `backend/ci_queue_api/records.py:371-425` |
| API JSON serialization and no-store transport | `backend/ci_queue_api/server.py:130-151` |
| Scoped endpoint dispatch | `backend/ci_queue_api/server.py:347-359` and `backend/ci_queue_api/server.py:419-487` |
| Client request boundary | `ui/src/lib/api.ts:62-117` |
| Response-only cache and per-hook polling | `ui/src/lib/api.ts:325-410` |
| History's separate manual request path | `ui/src/features/status/status-page.tsx:672-819` |
| Status/dashboard polling and serial history mount | `ui/src/features/status/status-page.tsx:1221-1297` |
| Drawer 2 s polling | `ui/src/features/shared/job-drawer.tsx:440-460` |
| Analysis 30 s polling | `ui/src/features/analysis/analysis-page.tsx:759-817` |
| Worktrees 60 s polling | `ui/src/features/worktrees/worktrees-page.tsx:715-731` |
| Local health 10 s polling | `ui/src/components/local-environment-menu.tsx:25-34` |

The exact reader blob checked by the counter probe is `f9d691128e45e8c880ba81343bccf5eade07eb79` (Git blob SHA-1).
