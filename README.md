<div align="center">

# Meta & Google Ads Sales Analytics Platform

*One workspace for paid advertising: what we spend, what it brings in, and what to change next.*

Meta Ads and Google Ads performance, verified sales and leads, a grounded AI assistant and human-confirmed campaign changes, all in one place. Every number traces to a source. Missing data is never zero. The AI can analyse and draft, but it can never write.

**[▶ Open the interactive demo](https://meta-google-ads-sales-analytics-pla-two.vercel.app)**

<sub>Runs entirely in your browser on synthetic data. No sign-in, no tracking, no network calls.</sub>

[Architecture](#architecture) · [Overview](#combined-overview) · [AI](#ai-assistant) · [Advertising](#campaigns--ads) · [Results](#sales-leads-and-attribution) · [System](#data-sources-and-change-log) · [Demo](#interactive-demo)

</div>

![Combined overview: Meta + Google spend, sales by source, attributable ROAS and advertising surplus with Daily/Weekly/Monthly charts](assets/screenshots/combined-hero.png)

<sub>Screenshot of the interactive demo. **DEMO DATA — NOT REAL BUSINESS RESULTS.** Campaign names, creatives, numbers and IDs are synthetic.</sub>

## What this repository is

> A **case study** of a private production system used by one company, plus an **interactive demo** (`apps/demo`) that reproduces the product's interface page for page in English, and an **independent reference library** (`packages/analytics-core`) that re-implements its core rules. Everything runs on **synthetic data only**. It contains **no production source code, prompts, data or production screenshots**. See [WHATS_PUBLIC.md](WHATS_PUBLIC.md) for exactly what is and is not here, and [NOTICE.md](NOTICE.md) for terms.

| | Production system (private) | This repository (public) |
|---|---|---|
| **Interface** | Slovenian, inside the company's internal portal | Same layout, navigation and components, in English |
| **Data** | Meta, Google Ads, sales backend, Excel, Stripe | Synthetic, deterministic, 12+ months to 11 Nov 2026 |
| **AI** | Hosted model through read-only tools (not fine-tuned) | Deterministic intent router + the same kind of read-only tools, in the browser |
| **Meta writes** | Live, human-confirmed, scoped to allowed accounts | Simulated in browser state only |
| **Google writes** | Validate-only | Validate-only (simulated) |
| **Sync** | Daily cron + manual refresh | Schedule shown, refresh simulated |
| **Tests** | 2,096 tests (private, not runnable here) | 221 library + 147 demo + 22 scanner tests, 336 browser checks |

## Architecture

```mermaid
flowchart LR
  subgraph S1["Sources"]
    A1["Meta Ads API"]
    A2["Google Ads API"]
    A3["CRM"]
    A4["Lead sheet"]
    A5["Payments"]
  end
  subgraph S2["Pipelines"]
    B1["Scheduled sync"]
    B2["CSV import"]
    B3["Validation"]
  end
  subgraph S3["Data layer"]
    C1[("PostgreSQL")]
    C2["Money in minor units"]
    C3["UTC events"]
  end
  subgraph S4["Analytics"]
    D1["Canonical spend"]
    D2["Attribution"]
    D3["Reconciliation audit"]
  end
  subgraph S5["AI layer"]
    E1["Deterministic tools"]
    E2["Grounding check"]
    E3["Recommendation rules"]
  end
  subgraph S6["UI"]
    F1["Overview"]
    F2["Campaigns"]
    F3["Results"]
    F4["AI"]
    F5["System"]
  end
  subgraph S7["Controlled actions"]
    G1["Preview"]
    G2["Human confirm"]
    G3["Single write"]
    G4["Read-back"]
    G5["Log"]
  end
  S1 --> S2 --> S3 --> S4
  S4 --> S5
  S4 --> S6
  S5 --> S6
  S6 --> S7
  S5 -. "drafts only, never writes" .-> S7
  G1 --> G2 --> G3 --> G4 --> G5

  classDef box fill:#9bbbe0,stroke:#1f3a5f,color:#0a0a0a
  class A1,A2,A3,A4,A5,B1,B2,B3,C1,C2,C3,D1,D2,D3,E1,E2,E3,F1,F2,F3,F4,F5,G1,G2,G3,G4,G5 box
```

Sources are read-only. Every write to an ad platform follows preview, human confirmation, one write, read-back and a log entry. The AI layer can only read through its tools and prepare local drafts. New objects are created **PAUSED**, and activation is a separate confirmed action.

**In this public demo** the sources, pipelines and database are replaced by an in-browser synthetic data generator, and the controlled actions are simulated in local browser state. The domain logic (`packages/analytics-core`) is the same kind of code the architecture describes.

More: [docs/architecture.md](docs/architecture.md), [full system diagram](diagrams/system-architecture.md), [data flow](diagrams/data-flow-reconciliation.md), [assistant flow](diagrams/ai-assistant-flow.md), [action controls](diagrams/campaign-action-controls.md). Static SVG exports are in `assets/diagrams/`.

## Combined overview

The first screen answers three questions: how much are we investing in advertising, how many sales can we link to it, and which platform earns more per euro spent.

- **Total spend** uses one canonical path for the card, the chart, the monthly view and the PDF, and counts only completed days.
- **Sales by source** gives each source its own colour and adds a **Meta + Google + Chatbot/AI** subtotal. Partner portal, Other verified, Unknown and Conflicting stay visible and still reconcile to the total.
- **Advertising surplus** is selected-source revenue minus Meta and Google spend. It is marked *not profit* and has a month-over-month breakdown.
- **Attributable ROAS** is shown per platform and combined, from verified evidence only, computed from sums and never averaged.
- **Every chart** has a period total, Daily/Weekly/Monthly, an expanded view, and print/PDF export with solid lines that stay distinguishable in greyscale.

![Combined overview, full page: Meta + Google spend, sales by source, attributable ROAS and advertising surplus](assets/screenshots/combined-full.png)

<p>
  <img src="assets/screenshots/meta-overview.png" alt="Meta Ads overview: spend, platform leads, CPL, paid orders, revenue, attributable ROAS and advertising surplus with sparklines" width="49%">
  <img src="assets/screenshots/google-overview.png" alt="Google Ads overview with the same layout for the Google workspace" width="49%">
</p>

Each platform overview has the same advertising summary, linked-sales estimate, delivery block and trend charts. A partial period is flagged with the days that have data and the dates that are missing. Chart lines show a gap there instead of dropping to zero.

Every chart and every KPI sparkline opens the same dialog: a larger chart with tooltips and legend toggles, Daily/Weekly/Monthly (weekly and monthly ratios are recomputed from sums), the values table, how it is calculated, and Print / Save PDF. Each KPI has its own colour. The per-chart audit is in [docs/chart-fidelity-audit.md](docs/chart-fidelity-audit.md).

<p>
  <img src="assets/screenshots/chart-expanded.png" alt="Expanded chart: daily spend by platform with legend, metric selector, Daily/Monthly, values and Print / Save PDF" width="49%">
  <img src="assets/screenshots/spark-expanded.png" alt="Expanded KPI sparkline: Meta spend by month with tooltip, how it is calculated and Print / Save PDF" width="49%">
</p>

**Weekly** is offered when the period has at least 14 days. Weeks are ISO weeks, Monday to Sunday, labelled with their dates. A week that is cut by the period edge or still in progress is marked as partial, so it is not compared like a full week. The choice is kept in the URL (`view=weekly`), and on a shorter period the charts fall back to days.

![Combined overview with the Weekly option: Meta and Google spend per ISO week over eight full weeks, 14 September to 8 November](assets/screenshots/chart-weekly.png)

## AI assistant

![AI assistant answering which campaign had the best cost per lead last month: grounding badge, key numbers, what I would do, evidence and limits](assets/screenshots/assistant.png)

The assistant answers questions about spend, leads, sales and attribution. Every number in its answer must come from a read-only tool result, and the answer is checked before it is shown. It can prepare a suggested change, but it has no write path: a person approves every change in a separate workflow.

```mermaid
flowchart LR
  Q(["Question"]) --> I["Intent<br/>topic · period · platform"]
  I --> T["Read-only tools<br/>same calculations<br/>as the dashboard"]
  T --> F[("Verified facts<br/>fact ID + metadata:<br/>metric · unit · source · period<br/>completeness · definition")]
  F --> D["Draft answer"]
  D --> G{"Grounding validation<br/>value AND meaning<br/>match a fact?"}
  G -- "pass" --> A(["Answer<br/>conclusion · metrics · comparison<br/>causes · next steps · limits"])
  G -- "fail" --> RP["Repair round<br/>model told which numbers<br/>are missing or mismatched"]
  RP --> G2{"Revalidate"}
  G2 -- "pass" --> A
  G2 -- "fail" --> FB(["Safe fallback<br/>no unverified numbers"])
  A --> RC["Recommendations<br/>budget effects labelled ESTIMATE"]
  RC -. "draft only,<br/>no write path" .-> H["Human approval<br/>(Editor/Admin): preview,<br/>confirm, one write, read-back, log"]

  classDef io fill:#eef4ff,stroke:#1f5fa8,color:#0b2545
  classDef tool fill:#f3f4f6,stroke:#6b7280,color:#111827
  classDef ok fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef warn fill:#fef3c7,stroke:#b45309,color:#451a03
  class Q,A,RC io
  class I,T,F,D tool
  class G,G2,RP,FB warn
  class H ok
```

### Production assistant

What the production code does. The behaviour below is covered by automated tests that use a controlled model adapter.

- **Facts carry IDs and metadata.** Each tool result is stored as a fact with an ID, and can carry:
  - metric, unit, source and platform
  - period and time zone
  - evidence level and completeness (complete, partial, unavailable)
  - definition
- **Grounding checks meaning, not only value.** Each number is classified as an amount in EUR, a percentage, a ROAS ratio or a plain count:
  - A ROAS in the answer must come from a ROAS fact. A spend of €2.56 cannot "verify" a ROAS of 2.56.
  - EUR must come from EUR and percentages from percentages.
  - Numbers with no fact behind them, or with the wrong meaning, start a repair round, and the answer is checked again.
  - If the repair fails, the user sees a safe fallback without the unverified numbers.
- **One ROAS, the dashboard's.** The assistant's attributable ROAS (Meta, Google, combined) comes from the same calculation as the dashboard card.
  - The calculator refuses to divide revenue by spend on its own.
  - Its operands must be fact IDs, not numbers the model wrote.
- **Completed days only.** If a period reaches today, today is excluded, and the answer says so. Times use the account's time zone.
- **Freshness and definitions.** A source that is failed, overdue, partial or unreachable is reported as such and is never shown as current.
  - A sync older than 7 days is never "fresh".
  - Google conversions, Meta leads and paid orders are kept as separate metrics.
- **Model-written text is not evidence.** The reason or impact text the model writes for a proposed change cannot ground any number.
- **Approval is separate.** The assistant has no tool that writes to an ad platform. It can only create a local draft.
  - An Editor or Admin previews the draft against live data, confirms it, and the app makes one write, reads it back and logs it.
  - New objects start paused. Activation is a separate confirmed action.
  - If the platform's reply is lost, the write is marked *outcome unknown*. It is never retried blindly.

### Demo assistant (this repository)

The demo is labelled **"Demo AI Assistant — simulated, data-grounded analysis"**. It does not run a language model and was not trained or fine-tuned on anything. It follows the same pattern on the synthetic dataset:

- an intent router with 22 topics, plus an honest "not supported" answer
- read-only tools and a fact book
- an answer built only from facts, with a grounding badge (each number must appear in a fact)
- **Show tool calls**, which opens the full trace

The demo does not include the meaning-aware check, the repair round with a live model, freshness from real syncs, or the approval workflow against a real ad account.

### Example (synthetic)

All names and numbers below are invented for illustration. They are not production values and not output copied from the demo.

> **Q: Which campaigns should receive more budget next month, and why?**
>
> **Conclusion.** Campaign A is the only candidate for more budget. Campaign B should stay at its current level. Campaign C should not get more budget until tracking is fixed.
>
> **Key metrics (last 30 completed days; today excluded):**
>
> | Campaign | Spend | Leads | CPL | Previous 30 days CPL |
> |---|---|---|---|---|
> | Campaign A | €1,200.00 | 60 | €20.00 | €24.00 |
> | Campaign B | €900.00 | 30 | €30.00 | €29.00 |
> | Campaign C | €400.00 | — | no data | — |
>
> **Why.**
> - Campaign A's CPL fell while spend was stable, and its frequency is still low.
> - Campaign B is steady, with no sign of headroom.
> - Campaign C has no lead data for the period. That is missing data, not zero leads.
>
> **Next steps.**
> - Raise Campaign A's budget by up to 20 %.
> - **Estimate:** about 70–74 leads at a similar CPL. This is a scenario based on recent ratios, not a forecast.
> - The change is prepared as a draft for approval.
>
> **Limits.**
> - The Meta leads sync is 2 days old.
> - 60 leads is a modest sample.
> - Attributable ROAS is shown only for orders linked by verifiable IDs.
>
> **Follow-up questions:** "How did Campaign A's CTR change?" · "Which ads in Campaign A drive the leads?"

Every number in that answer would need a fact behind it with the right meaning. The estimate would come from the budget-scenario tool and be labelled as an estimate.

![Assistant grounding flow: question, read-only tools over the dataset, fact ledger, number check, answer](assets/diagrams/ai-assistant-flow.svg)

More detail on the production design (tools, fact ledger, repair round, fallback): [docs/ai-assistant-architecture.md](docs/ai-assistant-architecture.md).

## AI recommendations

![Recommendations: prioritised cards with evidence tables, comparison period, explanation and suggested next step](assets/screenshots/recommendations.png)

![Recommendation detail: evidence table, explanation, charts, anomalies and budget scenario](assets/screenshots/recommendation-detail.png)

Recommendations are rule-based cards that compare the selected period with the previous period of the same length. You can filter them by priority, type and platform. Each card shows:

- the entity it concerns
- an evidence table: current, previous, change
- an explanation
- a concrete next step
- links to the campaign, the ad comparison and the assistant

The 7-day rolling CPL and CTR charts on the detail page also look back six days before the period starts. The first days of a period therefore show a full 7-day value, not a ratio over one or two days.

**Prepare change** opens the same confirmation workflow as the Campaigns page. Nothing happens until a person confirms it.

## Campaigns & ads

![Campaigns & ads: Meta campaigns with status, budget, spend share, leads, CPL change, CTR, CPC and Pause/Budget/Edit actions](assets/screenshots/campaigns-meta.png)

Campaigns, ad sets and ads sit in one table, with search and quick filters. Columns are grouped into delivery, spend and results, engagement, and actions, and CPL change against the previous period is shown inline. Each campaign opens a detail page with KPI cards, a trend chart you can switch between metrics, and its settings as read from the (simulated) account.

<p>
  <img src="assets/screenshots/campaign-drilldown.png" alt="Ad detail: KPI cards with change vs previous period, trend chart and the ad creative preview" width="49%">
  <img src="assets/screenshots/campaigns-google.png" alt="Google Ads campaigns: the same table for the Google workspace with validate-only actions" width="49%">
</p>
<p>
  <img src="assets/screenshots/campaigns-google-assetgroups.png" alt="Google Performance Max campaign opened to its asset groups" width="49%">
</p>

> **Demo simulation — no real advertising account is affected.**

| Action | Meta (demo) | Google (demo) |
|---|---|---|
| Pause / resume, budget, edit | Preview → validate → confirm → execute (simulated) → read back → change log | Validate-only: checked, never applied |
| Create campaign / ad | Created **PAUSED**; activation is a separate confirmation | Validate-only |
| Drafts | Save, edit, validate | Save, edit, validate |
| Roles | Viewer is read-only; Ad editor and Administrator can act | Same |

Budgets above the per-change cap are rejected, and final URLs must stay on the advertiser's domain.

## Create ad or campaign

<p>
  <img src="assets/screenshots/create-meta.png" alt="Create campaign: guided Meta flow with a live ad preview" width="49%">
  <img src="assets/screenshots/create-google.png" alt="Create campaign: guided Google search flow with a live ad preview" width="49%">
</p>

Each platform has a guided step-by-step flow with character counters, URL rules and a live preview that redraws as you type. Everything is created **PAUSED**. Drafts stay in the browser and can be validated later on the Drafts page.

![Drafts page: saved local drafts with validation results](assets/screenshots/drafts.png)

## Sales, leads and attribution

<p>
  <img src="assets/screenshots/sales.png" alt="Sales: paid, unpaid, cancelled and refunded orders, revenue and sales by source" width="49%">
  <img src="assets/screenshots/attribution.png" alt="Attribution: verified Meta and Google revenue and ROAS per platform, evidence kept separate from customer source" width="49%">
</p>
<p>
  <img src="assets/screenshots/leads.png" alt="Leads: platform leads, CPL and lead trends per campaign" width="49%">
</p>

- **Sales** can be counted by payment date or by order date. VAT is shown and net revenue is derived from it. Unpaid orders are counted but are not revenue.
- **Attribution is kept separate from customer source.** A customer labelled "Google" is not proof of a Google paid-ad sale. Only a matching lead ID or a stored click ID (fbclid for Meta, gclid for Google) counts towards **attributable ROAS**. Dates, amounts and names are never used to guess a link.
- **The funnel stays in stages** and is never merged into one "result":

| Stage | Source | What it is not |
|---|---|---|
| Click | Meta / Google | Not a lead |
| Lead | Platform lead forms | Not a sale |
| Platform conversion | Meta / Google attribution | Not a confirmed order; platform-modelled |
| Order | Sales backend | Not necessarily paid |
| Paid order | Payment status | Not yet linked to an ad |
| Verified attributable revenue | Internal link on verifiable IDs | Only this enters attributable ROAS |

Details: [docs/attribution-and-sales.md](docs/attribution-and-sales.md), [docs/data-accuracy.md](docs/data-accuracy.md).

## Ad comparison

![Ad comparison: Meta ads side by side with previews, metrics and volume-guarded Best markers](assets/screenshots/compare.png)

Pick two to four ads from the same platform and compare them over **the same period**:

- **Shown per ad:** ad previews, spend, impressions, clicks, leads, CTR, CPC, CPM, CPL and lead rate, plus a trend chart per metric.
- **Ratios** are computed from sums.
- **A Best marker** appears only with enough volume: 1,000 impressions for CTR and CPM, 30 clicks for CPC, 5 leads for CPL.
- **Selections** live in the URL.

Details: [docs/ad-comparison.md](docs/ad-comparison.md).

## Data sources and change log

<p>
  <img src="assets/screenshots/data-sources.png" alt="Data sources: per-source last refresh, row counts and coverage" width="49%">
  <img src="assets/screenshots/activity.png" alt="Change log: simulated changes with actor, action, before and after, and outcome" width="49%">
</p>
<p>
  <img src="assets/screenshots/users.png" alt="Users and roles page, shown for the Administrator role" width="49%">
</p>

- **Daily sync:** a cron job (`0 6 * * *`, 06:00 Europe/Ljubljana) refreshes the data every day.
- **Manual refresh:** each source can also be refreshed on demand. In the demo, refresh only updates a local timestamp.
- **Per-source status:** each source shows its last sync and its **gap days** with the reason.
- **Change log:** records every action, including rejected and validate-only ones.

## Engineering

- **One canonical number per metric.** Card, chart, monthly view and PDF read the same path. Integrity tests check that daily sums equal monthly totals, that Combined = Meta + Google, and that source partitions reconcile.
- **Missing is not zero.** Coverage comes from successful syncs. An API error is never treated as zero spend.
- **Deterministic synthetic data** has seasonality, a planted missing day, refunds, cancellations, unknown and conflicting sources, and no duplicate orders. Tests assert all of it.
- **Grounded answers.** A fact book records every tool result, and a checker rejects any number it cannot trace.
- **Writes that expect to be wrong** (production). Each write follows this sequence:
  1. preview read from the platform
  2. hash-bound confirmation
  3. stale detection
  4. one write
  5. read-back
  6. audit

  New objects start paused.
- **Locked-down static demo.**
  - Strict CSP with no outbound connections, and no secrets.
  - Browser tests fail on any external request, console error, CSP violation, or horizontal overflow on desktop and phone.
- **Privacy scanning** covers the tree and the full git history. gitleaks also runs in CI.

Twelve production problems, each with the decision, implementation, verified result and trade-off: [docs/engineering-challenges.md](docs/engineering-challenges.md).

## Interactive demo

A static single-page app with **no backend and no network calls** (`connect-src 'none'` in the Content Security Policy). Campaign changes live in local state; **Reset demo** on the Change log page restores the original data.

```mermaid
flowchart LR
  subgraph SHELL["Shared shell"]
    direction TB
    SW["Platform switch<br/>Meta Ads · Google Ads · Combined"]
    PER["Period presets<br/>Yesterday … This year · Custom"]
    GR["Daily / Weekly / Monthly"]
    ROLE["Role<br/>Viewer · Ad editor · Administrator"]
  end
  SHELL --> OV["Overview<br/>Combined · Meta · Google"]
  SHELL --> ADV["Advertising<br/>Campaigns & ads · Create ad · Drafts"]
  SHELL --> RES["Results<br/>Sales · Leads · Attribution · Ad comparison"]
  SHELL --> AI["AI help<br/>AI assistant · Recommendations"]
  SHELL --> SYS["System<br/>Data sources · Change log · Users"]

  classDef shell fill:#eef4ff,stroke:#1f5fa8,color:#0b2545
  classDef page fill:#ffffff,stroke:#94a3b8,color:#0f172a
  classDef ai fill:#ecfdf5,stroke:#059669,color:#064e3b
  class SW,PER,GR,ROLE shell
  class OV,ADV,RES,SYS page
  class AI ai
```

The platform switch decides which workspace you are in. Meta Ads and Google Ads are separate workspaces with their own campaigns, charts and recommendations, and **Combined** puts both side by side. Platform, period and Daily/Weekly/Monthly live in the URL, so every view can be linked. Pages that cover both platforms (Attribution, AI, System) carry a **Meta + Google** marker.

```bash
npm ci
npm run dev:demo      # http://localhost:5173
```

## Run and verify

Node 22+. No credentials or network access are needed after install.

```bash
git clone https://github.com/gabercmatej/Meta-Google-ads-sales-analytics-platform.git
cd Meta-Google-ads-sales-analytics-platform
npm ci
npm run dev:demo      # interactive demo
npm test              # reference library tests
npm run example       # library quick start on synthetic data
npm run verify        # typecheck, tests, builds, bundle budget, browser tests, privacy scan
```

`npm run test:browser` needs a local Chrome or Chromium. Every example and every demo page shows `DEMO DATA — NOT REAL BUSINESS RESULTS`. See [examples/README.md](examples/README.md).

### Public code

| Path | Purpose |
|---|---|
| `apps/demo` | Interactive demo: Vite, React 19, React Router, Recharts; assistant engine in `src/ai`, simulation in `src/sim` |
| `packages/analytics-core` | Independent reference library, zero runtime dependencies: money, metrics, dates, aggregation, canonical spend, sources, attribution, comparison, audit, write safety, assistant facts and grounding, synthetic showcase dataset and queries |
| `examples/` | Runnable synthetic examples |
| `scripts/` | Privacy scanner, browser tests, bundle budget |

`analytics-core` is written for this showcase and is not extracted from the production code.

## Documentation

| Document | Topic |
|---|---|
| [architecture.md](docs/architecture.md) | System layers, adapters, sync, security boundaries |
| [ai-assistant-architecture.md](docs/ai-assistant-architecture.md) | Tools, fact ledger, grounding, fallback, recommendations |
| [attribution-and-sales.md](docs/attribution-and-sales.md) | Source classes, evidence levels, ROAS, surplus |
| [data-accuracy.md](docs/data-accuracy.md) | Missing vs zero, canonical spend, audit statuses |
| [ad-comparison.md](docs/ad-comparison.md) | Comparison rules and winner conditions |
| [campaign-management.md](docs/campaign-management.md) | Write flow, safety checks, Google validate-only |
| [engineering-challenges.md](docs/engineering-challenges.md) | Twelve problems and decisions |
| [adapting-to-another-business.md](docs/adapting-to-another-business.md) | What transfers and what does not |
| [product-tour.md](docs/product-tour.md) | Screen-by-screen tour of the production app (text) |
| [localization-glossary.md](docs/localization-glossary.md) | Slovenian UI terms in English |
| [demo-plan.md](docs/demo-plan.md), [screenshot-plan.md](docs/screenshot-plan.md) | How the demo and screenshots were planned and built |
| [WHATS_PUBLIC.md](WHATS_PUBLIC.md), [SECURITY.md](SECURITY.md), [NOTICE.md](NOTICE.md) | Scope, reporting, terms |

## Repository map

```text
README.md, WHATS_PUBLIC.md, NOTICE.md, SECURITY.md
apps/demo/          interactive demo (static SPA, synthetic data, simulated writes)
packages/           analytics-core reference library (src + tests)
docs/               architecture, AI assistant, attribution, data accuracy, comparison,
                    campaign management, engineering, adapting, tour, glossary, plans
diagrams/           Mermaid sources
assets/diagrams/    exported diagram SVGs
assets/screenshots/ screenshots captured from the running demo
examples/           runnable synthetic examples and generated samples
scripts/            privacy scanner, browser tests, bundle budget
.github/            CI: privacy scan, gitleaks, typecheck, tests, builds, browser tests
vercel.json         static hosting config with strict security headers
```

## Notice and licence

**No licence granted.** All rights reserved unless stated otherwise. Read [NOTICE.md](NOTICE.md) before reusing anything.

## Author

Built by [@gabercmatej](https://github.com/gabercmatej).
