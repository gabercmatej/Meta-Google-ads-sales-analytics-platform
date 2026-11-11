# Adapting to another business

This is an honest map of what is reusable and what is not. The private application is a single-company system, not a configurable SaaS product, and nothing here promises plug-and-play deployment.

## Modular today

| Part | Why it transfers |
|---|---|
| Money, ratio, date and aggregation rules | Pure functions with no business vocabulary. See `packages/analytics-core` |
| Canonical spend and missing-vs-zero handling | Depends only on a daily series and coverage |
| Comparison semantics | Metric direction table plus completed-day windows |
| Source classification and evidence levels | The structure is generic; the taxonomy is a configuration |
| Audit model (PASS, PARTIAL, FAIL, UNKNOWN with categories) | Check results are data |
| Write-safety rules (preview, hash, stale, read-back, paused creation) | Platform-agnostic state machine |
| Grounded assistant pattern (tools, fact ledger, number grounding, fallback) | Independent of the domain |
| Adapter boundary | Each external system sits behind an interface with a normalising layer and a demo implementation |
| Multi-account scaffolding | Workspaces with products, accounts and members exist |

## Needs engineering work

| Part | What changes |
|---|---|
| Sales backend adapter | New CRM or shop: a new adapter mapped to the normalised order type (id, amount, currency, status, order date, optional payment date, evidence fields) |
| Status vocabulary | Which statuses mean paid, unpaid, cancelled |
| Source taxonomy | Your own channels and how a label maps to a class |
| Lead identity | Your own join key, and the legal basis for hashing and matching contacts |
| Spreadsheet import | Column mapping is business-specific |
| Result types | Your own definition of a lead, a form, a purchase |
| Language and locale | The UI is Slovenian, EUR and Europe/Ljubljana; localisation is a real task |
| VAT and finance model | Rates, rounding rules and what "result" means in your accounting |
| Recommendation thresholds | Tuned to one company's volumes |
| Hosting, secrets, scheduling | Not part of this repository |
| Platform access | Each ad platform needs its own approved access and, for writes, its own review and tokens |

## Suggested order of work

1. Implement the sales adapter and run in demo mode alongside synthetic data.
2. Define statuses and source taxonomy; get reconciliation to sum.
3. Connect read-only ad platforms; run the audit until PARTIAL cases are explained.
4. Only then consider the write flow, starting with validate-only.

## What not to expect

- No one-click installer or hosted service.
- No guarantee that another company's data will classify as cleanly.
- No attribution beyond what your data can prove. If you cannot capture click identifiers or verified lead links, you will have source labels, not paid attribution.
