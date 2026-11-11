# Data accuracy

The goal is not "perfect numbers"; it is numbers whose limits are known, reproducible, and visible. This document describes how the private application ingests, reconciles and audits data. No claim of 100 % accuracy is made.

See also [`diagrams/data-flow-reconciliation.md`](../diagrams/data-flow-reconciliation.md). The reference implementation of the pure rules is `packages/analytics-core` (`money.ts`, `dates.ts`, `aggregate.ts`, `spend.ts`, `audit.ts`).

## Ingestion

### API sync
- The platform API version is pinned explicitly; the client is GET-only on an allow-list of paths.
- Cursor pagination, exponential backoff on rate limits and 5xx errors, no retry on an invalid token.
- History is fetched in 7-day chunks. Each run re-reads a trailing window (28 days by default) because platforms correct recent numbers.
- Each day is replaced in a single transaction, so re-running is idempotent.
- Each source has a database lock with a TTL so two runs cannot overlap. One shared function serves the scheduled run, the command line and the manual refresh; the run records its trigger.

### Historical CSV
Platform exports can fill days the API can no longer deliver. The CSV import:
- defaults to a dry run; writing needs an explicit flag and happens in one transaction;
- writes **only gap days** with no API coverage; days that already have API data are **verified** (cost to the cent, impressions, clicks) rather than overwritten;
- is all-or-nothing per day: an invalid row, unknown entity or wrong account means the day is not imported and not marked covered;
- creates clearly marked, write-locked historical structure objects so Meta write operations can never touch them;
- reports zero-delivery rows separately;
- is superseded by any later API fetch of the same days, so nothing is double counted.

CSV exports lack some columns (for example link clicks), so CTR and CPC are computed only over rows that have link clicks, and the view flags partial coverage.

### Spreadsheets and sales backend
- Rows are keyed by (environment, source, row identifier); unchanged rows are skipped by hash; nothing is deleted.
- A workbook is skipped by a hash of its content because the online editor changes the file's version tag on every open.
- Dates without a time zone are treated as Europe/Ljubljana wall time and stored as UTC; non-EUR currency is rejected rather than converted silently.
- Orders appearing in two sources are de-duplicated by a shared order key; disagreements become data-quality issues and are reported, not silently resolved.

## Missing is not zero

Coverage is derived from successful sync runs. A covered day with no rows is a real zero. A day without coverage is "no data". A failed source never overwrites stored data, and an API error is never rendered as zero spend. Charts leave gaps instead of drawing zeros, and derived ratios for a period with a missing day are not shown.

## Canonical spend

One function computes total spend and every surface uses it:
- completed days only (today is excluded until it is over);
- a platform's missing day makes that day "no data" for the total, not zero;
- amounts are summed as decimals and rounded once, at the end;
- ratios (CPL, ROAS) are computed from the sums, never averaged from daily ratios.

Result: the KPI card, the daily chart, the monthly chart and the PDF show the same value, and the sum of days equals the monthly total.

## Daily and monthly views

Charts offer Daily and Monthly aggregation for long ranges (90 days, year to date, custom ranges of at least 60 days). Monthly values use the same shared aggregation, so they are sums of daily values; a month with a missing day has no derived ratio. Non-additive metrics such as reach and frequency are not summed.

## Time zones and money

- Events are stored in UTC. Advertising days are interpreted in the account's time zone and presented in Europe/Ljubljana; time zones are never mixed inside one aggregation.
- Money is held as decimals (or minor units), never binary floats. Google micros convert through exact decimal arithmetic. VAT uses round half up per order.

## Duplicates and re-imports

Re-import is safe by construction: keyed upserts, hash-skip, day replacement in a transaction, and de-duplication by order key. Tests concentrate on exactly these properties (re-import, refunds and corrections, pagination, time boundaries).

## The accuracy audit

A read-only command compares the dashboard's numbers with independent evidence and prints a status per check, grouped into Meta, Google, sales backend and dashboard-consistency sections. It exits non-zero on any FAIL. A successful import never counts as PASS by itself.

| Status | Meaning |
|---|---|
| PASS | Independently reconciled with a second source |
| PARTIAL | Verified only within a stated scope, with a stated reason |
| FAIL | A real mismatch |
| UNKNOWN | Too little evidence to judge (for example no Google data) |

PARTIAL is categorised so it cannot hide defects:

| Category | Reason | Example |
|---|---|---|
| A | Intentionally different basis | Order date vs payment date; gross vs net of VAT; Google campaigns vs whole account |
| B | Source limitation | Today still incomplete; sales backend without payment time; CSV-only days without API; incomplete spend for ROAS |
| C | Missing evidence | Structure without a campaign record; fewer than two sources to compare; a month without independent confirmation |
| D | Genuine defect | A check that stayed PARTIAL although the data was API-confirmed; fixed by comparing at campaign level |

Categories A to C are expected and explained; D is a bug to fix. The audit also checks that card, chart and monthly values for spend and each ROAS agree, and that the selected-source totals reconcile.

A separate change log (not this audit) records writes and approvals by category: Meta write, Google write, approval, AI, sync, attribution, configuration.

## Limits

- Platform numbers can change after the fact; the trailing re-read mitigates but does not eliminate this.
- Some periods are covered only by CSV exports and are PARTIAL by design.
- Reconciliation proves internal consistency and agreement with the sources available, not that a source is itself right.
