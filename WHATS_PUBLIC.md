# What is public in this repository

This repository is a showcase of a private production system. This page lists exactly what is
here, what is not, and why.

## Public

| Path | What it is | Origin |
|---|---|---|
| `README.md`, `docs/`, `diagrams/`, `assets/diagrams/` | Case-study documentation and architecture diagrams | Written for this showcase from the private design documents; describes the architecture and rules, contains no source code, prompts or data |
| `packages/analytics-core/` | Independent reference implementation of the core rules (money, ratios from sums, missing vs zero, canonical spend, source classes, attribution evidence, comparison, audit statuses, write-safety state machine, tool facts and number grounding) | Written from a specification for this showcase. **Not copied or extracted from the production code** |
| `apps/demo/` | Interactive browser demo: dashboards, simulated campaign management, a deterministic demo assistant and recommendations | Written for this showcase. Runs only on a synthetic, deterministic dataset in the browser; no backend, no network calls, no language model |
| `assets/screenshots/` | Screenshots of the interactive demo | Captured from the locally built demo on synthetic data; metadata stripped (PNG holds image chunks only) |
| `examples/` | Runnable examples and generated JSON samples | Synthetic only, deterministic, labelled `DEMO DATA — NOT REAL BUSINESS RESULTS` |
| `scripts/` | Dependency-free privacy scanner (working tree and git history) and its tests, browser tests, bundle budget | Written for this showcase |
| `.github/workflows/ci.yml`, `vercel.json` | CI (privacy scan, gitleaks, typecheck, tests, builds, browser tests, sample drift check) and static hosting headers | Written for this showcase |

The git history of this repository starts fresh with the showcase. The private repository's
history is not included.

## Not public

| Item | Reason |
|---|---|
| Production source code, tests, migrations and scripts | Company authorization to publish them is not documented |
| AI system prompts and prompt templates | Confidential |
| Any real data: spend, revenue, orders, leads, customers, budgets, campaign names | Business-confidential and personal data |
| Account, campaign, ad, page, dataset and customer identifiers | Internal identifiers |
| Credentials, tokens, `.env` files, connection strings | Secrets |
| Hostnames, hosting details, server paths, schedules, deployment steps and build fingerprints | Infrastructure |
| Real audit results, logs, backups, database dumps, CSV/Excel exports | Contain business data |
| Name of the partner portal lead source | Third-party business relationship; shown as "Partner portal" |
| Screenshots of the production application | Even blurred screenshots can leak data or metadata |

## Numbers you will see

- **Synthetic:** every amount, count, name and date in `examples/`, in the demo, in its
  screenshots, in tests and in the reference library's generator.
- **Engineering facts about the private system:** the private test-suite size at V4.6 (195 test
  files / 2,096 tests). It is reported for context and cannot be run here.
- **Not shown:** any business metric of the real company.

## Screenshots

Every screenshot in `assets/screenshots/` was captured from the interactive demo running on
synthetic data, with the `DEMO DATA — NOT REAL BUSINESS RESULTS` banner visible. There are no
screenshots of the production application. See [docs/screenshot-plan.md](docs/screenshot-plan.md).

## Licence

No licence is granted. See [NOTICE.md](NOTICE.md).

## Checks

`npm run privacy-scan` and `npm run privacy-scan:history` scan the working tree and every
commit for secrets, identifiers, hosts, paths, contact details and a hashed blocklist of
private names. CI also runs gitleaks. Found something that should not be here? See
[SECURITY.md](SECURITY.md).
