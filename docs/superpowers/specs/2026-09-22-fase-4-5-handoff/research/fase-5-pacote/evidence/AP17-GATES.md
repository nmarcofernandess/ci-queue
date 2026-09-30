# AP17 — 54 gates observados

Ticket `20260919075127-addfb8a5`, HEAD `008cab050649c7d11255aef1e3a5f574581f02c1`. Durações **collector**: aproximações do intervalo de recepção, não CPU e não cronômetros executados dentro de cada subcomando.

[Origem pinada](https://github.com/dietflowoficial/Dietflow-app/blob/ffc99748f796d8f7923c9e46161b2a4dc735eef8/specs/115-caminho-para-main/harness/evidence/ap17-full/20260919075127-addfb8a5/queue-ticket.json). Esta tabela é extração da auditoria; o JSON original continua no repositório.

| ID | Gate | Segundos | % de Static (805 s) |
|---|---|---:|---:|
| gate-53 | `typecheck` | 241.226 | 29.97% |
| gate-21 | `check:fixtures` | 197.537 | 24.54% |
| gate-18 | `check:field-identity-ratchet` | 104.836 | 13.02% |
| gate-52 | `lint ratchet (origin/dev)` | 103.517 | 12.86% |
| gate-54 | `typecheck:storybook` | 33.010 | 4.10% |
| gate-20 | `check:e2e-trigger` | 12.440 | 1.55% |
| gate-11 | `check:unit-favorite-writers` | 9.260 | 1.15% |
| gate-34 | `check:regression-verdict-provenance` | 7.472 | 0.93% |
| gate-3 | `check:use-server` | 7.053 | 0.88% |
| gate-1 | `prisma generate` | 6.990 | 0.87% |
| gate-42 | `check:lifecycle-consumers` | 6.716 | 0.83% |
| gate-43 | `check:lifecycle-modal-derivation` | 5.898 | 0.73% |
| gate-27 | `check:clinical-readonly-preview-boundary` | 5.515 | 0.69% |
| gate-39 | `check:single-favorite-toast` | 5.315 | 0.66% |
| gate-44 | `check:in-document-removal` | 4.377 | 0.54% |
| gate-45 | `check:dirty-source-ownership` | 4.046 | 0.50% |
| gate-5 | `check:admin-relation-authority` | 3.812 | 0.47% |
| gate-23 | `check:autofill-policy` | 3.032 | 0.38% |
| gate-30 | `check:catalog-changes` | 2.711 | 0.34% |
| gate-10 | `check:clinical-item-header` | 2.674 | 0.33% |
| gate-31 | `check:seed-tag` | 2.524 | 0.31% |
| gate-7 | `check:architecture` | 2.179 | 0.27% |
| gate-24 | `check:patient-proof-routes` | 1.710 | 0.21% |
| gate-9 | `check:golden-fresh` | 1.573 | 0.20% |
| gate-4 | `check:policy-write-boundaries` | 1.471 | 0.18% |
| gate-17 | `check:numeric-input-ratchet` | 1.410 | 0.18% |
| gate-2 | `fumadocs .source` | 1.400 | 0.17% |
| gate-12 | `check:record-date-derivation` | 1.314 | 0.16% |
| gate-8 | `check:golden-product-shape` | 1.303 | 0.16% |
| gate-37 | `check:a4-contract` | 1.300 | 0.16% |
| gate-48 | `check:plano-visibility` | 1.073 | 0.13% |
| gate-47 | `check:location-visibility` | 1.069 | 0.13% |
| gate-46 | `check:patient-visibility` | 1.027 | 0.13% |
| gate-49 | `check:recipe-visibility` | 0.999 | 0.12% |
| gate-40 | `check:content-visibility` | 0.995 | 0.12% |
| gate-51 | `check:exam-visibility` | 0.991 | 0.12% |
| gate-41 | `check:hard-domain-writers` | 0.979 | 0.12% |
| gate-38 | `check:no-inline-search-input` | 0.948 | 0.12% |
| gate-13 | `check:module-help-docs` | 0.947 | 0.12% |
| gate-16 | `check:field-adornment-contract` | 0.933 | 0.12% |
| gate-28 | `check:snapshot-sync` | 0.923 | 0.11% |
| gate-50 | `check:substance-visibility` | 0.922 | 0.11% |
| gate-19 | `check:context-yaml` | 0.836 | 0.10% |
| gate-22 | `check:showcase` | 0.826 | 0.10% |
| gate-25 | `check:proof-index-fresh` | 0.822 | 0.10% |
| gate-14 | `check:favorites-kinds` | 0.807 | 0.10% |
| gate-15 | `check:import-surfaces` | 0.795 | 0.10% |
| gate-36 | `check:a4-css-sync` | 0.746 | 0.09% |
| gate-35 | `check:vercel-branch-policy` | 0.676 | 0.08% |
| gate-32 | `check:flowid-contract` | 0.660 | 0.08% |
| gate-26 | `check:clinical-readonly-proof-atlas` | 0.629 | 0.08% |
| gate-33 | `check:e2e-target-contract` | 0.622 | 0.08% |
| gate-29 | `check:snapshot-runtime` | 0.496 | 0.06% |
| gate-6 | `check:zod-schema-sync` | 0.487 | 0.06% |

Soma dos 54 intervalos: **803.829 s**. Grupo `static-gates`: **804,311 s**. Raiz Static: **805 s**. As diferenças são resíduos entre fronteiras/cronômetros, não gates omitidos.
