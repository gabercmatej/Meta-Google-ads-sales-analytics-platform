# Examples

Everything here runs offline. No network, no credentials, no environment variables. All data
comes from a seeded generator and is labelled `DEMO DATA — NOT REAL BUSINESS RESULTS`.

## Quickstart

```bash
npm install
npm run example
```

`npm run example` builds `packages/analytics-core` and runs `examples/quickstart.mjs`
(Node 22 or newer). If you have already built, `node examples/quickstart.mjs` is enough.

The script walks through eight things, in this order:

1. Resolving a period to completed days in the account time zone.
2. One canonical spend path: card, chart and monthly table agree, and a missing day is "no
   data", not zero.
3. Ratios computed from sums, with `null` for a missing denominator.
4. Sales by source: the parts add up to the total, and the selected-sources subtotal is a
   subset.
5. Attributable ROAS that only counts orders with hard evidence.
6. A human-confirmed write against a simulated adapter: an AI draft cannot be confirmed by the
   AI, and execution is refused until a human confirms.
7. A deterministic, LLM-free assistant whose numbers are checked against tool facts.
8. Audit statuses (PASS, PARTIAL with a category, FAIL, UNKNOWN).

## Samples

`examples/samples/` holds reproducible JSON outputs of the same functions. Regenerate them with:

```bash
npm run samples
```

The output is deterministic: the same seed produces byte-identical files, and CI fails if the
committed files differ from a fresh run.

| File | What it shows |
| --- | --- |
| `spend-canonical.json` | Canonical spend for one month, amounts in integer minor units (cents). |
| `spend-with-missing-day.json` | The same month with one platform day missing: partial, and the day is listed. |
| `sales-by-source.json` | Paid orders partitioned by source; parts reconcile to the total. |
| `attributable-roas.json` | ROAS from hard-evidence orders only, with the excluded groups counted. |
| `assistant-answers.json` | Questions, the tools the assistant called, the answer, and its grounding check. |
| `write-audit-log.json` | A confirmed pause, from AI draft to verified read-back, with its audit log. |

## Notes

- Money is stored as integer minor units. The samples show cents, not decimals.
- The simulated write adapter stands in for a real platform. Nothing in this repository can
  write to one.
