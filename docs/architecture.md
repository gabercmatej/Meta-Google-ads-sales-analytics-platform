# Architecture

This document describes the architecture of the private production application. File and module names refer to that private repository and are given as plain text; they are not part of this public tree. The independent reference implementation of the core rules lives in `packages/analytics-core`.

See also [`diagrams/system-architecture.md`](../diagrams/system-architecture.md).

## Stack

| Layer | Technology |
|---|---|
| Application | Next.js (App Router), React, TypeScript in strict mode |
| Styling and charts | Tailwind CSS, Recharts |
| Persistence | PostgreSQL through Prisma |
| Validation | zod (inputs, tool schemas, configuration) |
| Auth | Signed JWT session cookie, bcrypt password hashes, role-based access (viewer, editor, admin) |
| AI | Provider abstraction over the Anthropic Messages API; a "none" provider disables it |
| Exports | PDF generated in the browser from the rendered charts, plus a print view |
| Tests | Vitest |

The product UI is Slovenian; amounts are EUR; day boundaries follow the Europe/Ljubljana time zone.

## Layers

```
src/app        routes and server actions (UI is a thin layer)
src/components dashboards, charts, period selector, exports
src/lib        pure helpers: money, dates, periods, navigation intent, CSV parsing
src/server
  adapters     one adapter per external system (live + demo implementations)
  sync         scheduled sync runner, per-source lock, failure classification
  analytics    aggregation, performance, attribution, platform ROAS, sources
  comparison   comparison semantics (additive / ratio / share) and windows
  recommendations  deterministic rules engine + optional wording layer
  assistant    tool-based AI assistant, grounding, fact ledger, fallback
  meta-write   Meta write flow (modes: off, mock, validate, live)
  google-write Google write flow (modes: off, validate, live)
  drafts       local campaign drafts and creation wizard state
  audit        read-only data-accuracy audit
```

Domain rules (money, ratios, source classification, comparison, audit) are pure functions without I/O. That is what makes them testable and what the public reference library reproduces.

## Adapters

Each external system sits behind an adapter interface with a normalising layer that turns provider payloads into internal types.

| Adapter | Direction | Notes |
|---|---|---|
| Meta Marketing API | read | Version pinned explicitly. The client allows only GET on an allow-list of paths. Cursor pagination, backoff on rate limits and 5xx, no retry on an invalid token. |
| Meta lead forms | read | Uses a separate, page-scoped token. Phone numbers are stored only as a keyed hash. |
| Google Ads API | read; write is validate-only | GAQL queries, service-account authentication, normalising layer for micros to decimal money. |
| Sales backend | read | GET-only allow-list. Endpoints with side effects (payment checks, cancellation) are deliberately not reachable. |
| Excel workbook | read | Read through a document-graph API; unchanged content is skipped by a content hash. |
| Stripe | read | Balance transactions, invoices, subscriptions; fees linked only with evidence. |
| Demo adapters | read | Deterministic synthetic data, clearly labelled, selected by environment. |

A factory chooses live or demo adapters. Missing external configuration never blocks local development: the app starts in demo mode.

## Data model (conceptual)

- Structure: accounts, campaigns, ad sets, ads, creative snapshots, for Meta and for Google.
- Facts: daily ad insights, daily Google metrics, lifetime insights, leads, orders, customers, Stripe invoices and balance transactions.
- Links: lead-to-order matches and attribution links, each carrying an evidence level.
- Operations: sync runs, source locks, import runs, data issues.
- Governance: write requests, a change-log table, drafts, recommendations, write-scope campaigns.
- Multi-account: workspaces with products, ad accounts and members, so one product's data is never shown as another's.

Every table has an `env` column (demo or live). Reads always filter on it.

## Sync

A scheduled sync runner calls one shared primary-source function for Meta, the sales backend, Excel and Google Ads. The same function serves the scheduled run, the CLI and the manual "refresh now" button; each run records its trigger. Each source has a database-backed lock (atomic conditional update with a TTL) so overlapping runs cannot interleave. See [`data-accuracy.md`](data-accuracy.md).

## Security model

- Secrets exist only on the server. Nothing sensitive is exposed through public environment variables or to the browser.
- A middleware rejects every path without a valid session; each page and server action also verifies the user and role.
- Write capability is separated by token, not just by UI: the read-only token used for analytics cannot write.
- Login attempts and AI questions are rate limited.
- Logs and error messages pass through a sanitiser that removes tokens and identifiers.
- Customer phone numbers are never stored raw; matching uses a keyed hash of the normalised number.

## AI and write boundary

The assistant and the recommendation code are statically forbidden (by a test) from importing the write modules. The only thing the assistant can create is a local draft. See [`ai-assistant-architecture.md`](ai-assistant-architecture.md) and [`campaign-management.md`](campaign-management.md).

## Tests

The private repository has 195 test files and 2,096 tests at V4.6 (private repository, not runnable here). They concentrate on calculations, re-import idempotency, linking, refunds and corrections, pagination, time boundaries, access control without login, and the safety boundary around write modules. The public library has its own, smaller suite; see the repository README for its current count.

## What this document does not claim

It does not claim the system is free of defects or that the numbers are perfect. Numbers are reconciled and audited against independent sources where such sources exist, and the audit reports PARTIAL or UNKNOWN where they do not.
