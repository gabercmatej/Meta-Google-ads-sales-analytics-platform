# Product tour

A screen-by-screen inventory of the private product "Sedem Ads" (V4.6), written as the specification for the Phase 2 browser demo. It describes purpose, widgets, metrics and interactions. It contains **no data values**: no real figures, names or identifiers appear here, and no production screenshots are published (see `screenshot-plan.md`).

The production UI is Slovenian. English labels are used throughout; the Slovenian original is given in parentheses only where it helps the Phase 2 port. The full term list is in `localization-glossary.md`.

## Capability tags

Every feature carries one tag describing what the **production** system actually does. The public demo never goes beyond these, and mirrors them with simulation.

| Tag | Meaning |
|---|---|
| `[READ]` | Read-only analytics. Nothing is written anywhere outside the product's own database. |
| `[META-WRITE]` | Meta write, implemented in production behind a separate scoped write token, allow-listed accounts and the EDITOR/ADMIN role. Flow: preview read from Meta, human confirmation, one write, read-back, audit log. New objects are created PAUSED; activation is a separate confirmed action. |
| `[GOOGLE-VALIDATE]` | Google Ads write is validate-only. Requests are sent with the API validation flag; live Google mutations are not verified or enabled ("tested with mocks"). |
| `[AI-DRAFT]` | AI output. The assistant and recommendations can only create a local draft. A human must open and confirm it through the normal flow. The AI has no write path to any ad platform. |
| `[LOCAL]` | Writes only to the product's own database (settings, users, drafts, audit log). |

Production confidence note: all screens below were verified by reading the private source for V4.6. Screens marked "(lower confidence)" were only partly inspected.

## Global shell (applies to every screen)

- **Sidebar** (fixed, 252 px on desktop; slide-in drawer on mobile). Groups, in order: Overview; Campaigns (campaigns and ads, create ad, drafts); Results (sales, leads, attribution, ad comparison); AI (assistant, recommendations); System (data sources, change log, users). Role-gated entries are hidden for lower roles: create ad and drafts need EDITOR; users needs ADMIN. `[READ]`
- **Role model**: VIEWER (read), EDITOR (prepares drafts and confirms Meta changes), ADMIN (also manages users and campaign settings). The demo should expose a role switch so the confirmation flows are reachable.
- **Channel pill** (Meta / Google, with coloured dots). Selects the platform for platform-scoped pages via a query parameter. The AI and System pages show a combined Meta + Google pill instead. Combined Overview sits outside the pill.
- **Filter carry-over**: period, product and result-type filters are carried across navigation between pages that declare it (overview, campaigns and ads, sales, leads, attribution, comparison, assistant, recommendations).
- **Environment banner**: a striped banner is shown when the environment is demo. The public demo replaces it with a permanent "DEMO DATA - NOT REAL BUSINESS RESULTS" banner.
- **Source status strip / menu** (footer area): one entry per data source with a health badge (connected, stale, never synced, missing configuration, sign-in problem, permission problem, rate limited, unreachable, source error, demo) and a plain-language explanation. Wording rule: stale data shows the state at last sync; an error is never presented as zero.
- **Timezone line** on every page header: the period is shown in the account timezone. Demo label: "Europe/Ljubljana" is replaced by a fixed demo timezone label (see glossary).

## Period selector and filters (shared component)

- Presets: Today, Yesterday, 7 days, 14 days, 30 days, 90 days, This month, Last month, **This year** (added V4.4), Custom range. Custom range = two date inputs; when the range is 60 days or more, charts default to Monthly.
- Responsive: collapses into a compact control on mobile; **last selection wins** when the user clicks quickly between presets or platforms (V4.5).
- Other filters where applicable: product, result type (Meta result types are separate: forms, visits, clicks, purchases; they are never summed into one "results" number), delivery status, search text, level (campaign / ad set / ad).
- Selected filters are reflected in the URL so a view can be shared and reloaded.

## Routes

### Combined Overview (Skupni pregled) `[READ]`

Purpose: one cross-platform page that answers "what did we spend, what did we sell, and what came of it", across Meta, Google and the other verified sources.

- **KPI cards** with period total and change vs previous period: total spend (Meta + Google, completed days only), ad-attributed paid orders and revenue, revenue per source, attributable ROAS (per platform and combined), advertising surplus. No MER (removed in V4.6).
- **Sales by source** block: per-source order counts and revenue for the selected period. Sources: Meta, Google, Chatbot/AI, Partner portal, Other verified, Unknown, Conflicting evidence. Every order belongs to exactly one source. A "Selected sources" aggregate (violet accent) lets the user tick sources to sum; a subtotal row appears for Meta + Google + Chatbot/AI.
- **Advertising surplus chart** ("Presežek"): selected-source revenue minus Meta + Google canonical spend, with a breakdown and a month-over-month tooltip, negative values drawn below a zero axis. Caveat text is permanent: this is not accounting profit; revenue includes VAT while spend excludes it.
- **Attributable ROAS charts**: one card per platform (Meta, Google, Combined). Ratios are computed from sums, not averaged. Without verifiable attribution the cell reads "No data", never a zero multiple.
- **Attribution lines / cohort funnel**: leads, paying customers and revenue grouped by lead cohort, with the evidence basis stated.
- **Charts**: Daily / Monthly toggle on every time series; a "completed days only" rule applies to totals; partial (today) points are drawn at reduced opacity. Each chart header repeats the period total (V4.4).
- Interactions: tooltips on hover/tap, expand chart to a dialog, print or export PDF per chart.

### Platform dashboard: Meta (Pregled, channel = Meta) `[READ]`

- Title "Overview". KPI grid: spend, impressions, reach, clicks, link clicks, CTR, CPC, CPM, frequency, results by type (kept separate), cost per result by type, paid orders and attributable revenue where verified links exist.
- Notes: CTR and CPC are computed over rows that have link clicks only (V4.3 rule). Result-type switch changes which result the "cost per result" refers to.
- Daily series with sparklines on KPI cards, previous-period comparison, partial-day styling, gap handling (a missing day is a gap, not a zero).
- Campaign / ad set / ad table (compact version) linking to the full navigator.
- Empty and warning states: "No data yet" notice when a source never synced; demo notice in demo mode.

### Platform dashboard: Google (Google pregled) `[READ]`

- "Read only. Spend, clicks and conversions from Google; kept separate from Meta."
- KPI cards: spend, impressions, clicks, CTR, CPC, conversions (labelled "Conversions (Google)", Google's own attribution), cost per conversion.
- Campaign comparison chart, campaigns / ad groups / ads drill-down table (click a name to descend a level), and a table of conversion actions with Google's own definitions.
- Notices: "No data captured yet" when empty; demo-mode notice.
- Google never shows Meta's numbers, and vice versa.

### Campaigns and ads (Kampanje in oglasi) `[READ]` + manage actions `[META-WRITE]` / `[GOOGLE-VALIDATE]`

- **Navigator**: three levels (campaigns, ad sets, ads) as tabs/breadcrumb; a table with columns for delivery status, spend, results by type, cost per result, CTR, CPC, frequency, and a performance verdict badge.
- **Delivery status badges**: Active, Learning, Learning limited, In review, Rejected, With issues, Paused, Campaign paused, Ad set paused, Completed, Scheduled, Not delivering, Archived, Deleted, Unknown.
- **Performance verdict badges**: "Not enough data", "No results", "Not enough results", "No comparison" (too few peers), plus good / poor verdicts versus peers. Verdicts state their reason and minimum-evidence thresholds. Thresholds are internal heuristics, not Meta scores.
- **Filters and chips**: status, search, product, selected-ads chips for comparison.
- **Detail drawer** (right-hand panel): daily chart per ad, KPIs, structure, linked sales when verified, and the change history for that object.
- **Per-row actions** (EDITOR/ADMIN only): pause, resume, edit budget, edit name/schedule. Every action opens a confirmation dialog: preview of the current state read from the platform, proposed change, explicit confirm button, then a result panel that shows the read-back state and a link to the audit log entry. `[META-WRITE]`
- **Google management panel**: pause/resume and budget changes on Search campaigns only, always as validate-only requests; the panel says the change was validated but not applied. `[GOOGLE-VALIDATE]`
- Locked objects: historical imported structures (flagged write-locked) show no actions.

### Create ad (Ustvari oglas) `[META-WRITE]` / `[AI-DRAFT]`; Google variant `[GOOGLE-VALIDATE]`

- **Multi-step wizard** (Meta): objective / destination, campaign, ad set (audience, budget, schedule), creative (text, media, call to action), review. Steps validate progressively; a **readiness panel** lists blocking and non-blocking issues using an internal heuristic (not a Meta score).
- **Draft states**: saved locally at any point; resumable from the drafts list.
- **Confirmation dialogs**: (1) confirm creation, which sends one write per object and creates everything PAUSED; (2) a separate, later activation dialog. The UI states the objects are created paused and nothing spends until activation is confirmed.
- **Google wizard**: Search campaigns only, validate-only; shows a prominent notice and ends at "validated", never "created".
- Entry points: "New ad" button, or "Open as draft" from a recommendation or the assistant.

### Drafts (Osnutki) `[LOCAL]`

- List of local drafts with status, owner, readiness indicator ("internal estimate, not Meta's score"), origin (manual / recommendation / assistant) and open/delete actions.
- Empty state: "No drafts. Start with 'New ad' or from a recommendation."

### Sales (Prodaja) `[READ]`

- Header badge: sales backend + platform. KPIs: all orders, paid orders, ordered value (all orders; "not collected revenue"), paid value (as marked in the sales backend, includes VAT, not bank-verified), average order value.
- Charts: paid sales by day with two separate axes (value and count), expandable and printable. Results by status (all orders by status, not only paid). Order source table (the sales-backend tag per source). Services table.
- **Link to Meta** block: paid orders split into verified link via a lead record, subject-line tag only ("FB lead"), and unlinked. Only verified links count towards attribution.
- Order-date basis is stated on every KPI; the timezone is the account timezone.

### Leads (Leadi) `[READ]`

- KPIs: imported leads (Facebook / Instagram split), sold leads per operator, conversion, paying customers, spend, cost per lead (Meta), cost per paying customer, customer revenue, revenue per customer, estimated ROAS.
- "How it is calculated" card: three separate things: when the lead was created, how long payments are observed, and what links them.
- Tables: by ad set, by topic. Daily charts: leads by day (FB vs IG), sold leads by day.
- ROAS shown only when linking is verified; otherwise "No data".

### Attribution (Skupna atribucija prodaje) `[READ]`

- Level tabs: campaigns / ad sets / ads.
- Reporting-mode tabs (advanced): by order date; lead cohort; historical (spreadsheet + Meta). Each mode states its basis.
- Table: orders and revenue per object through verified IDs only; a detail drawer shows the cohort of direct Meta leads and orders per customer (without personal data in the demo).
- Unlinked sales stay unlinked and are listed as such.

### Ad comparison (Primerjava oglasov) `[READ]`

- **Ad selector**: search and filter, pick up to a small fixed number of ads (cards with chips). Selection comes from the navigator via "Compare" checkboxes or directly here.
- **Compare overlay / cards**: side-by-side metric cards with the best value highlighted per metric, shared period, daily overlay chart (one line per ad, same axis), creative preview placeholder, verdict badges with reason.
- Rules: only metrics that exist for all selected ads are compared; different result types are never compared as if equal; too little data shows "Not enough data", not a ranking.

### AI Assistant (AI pomočnik) `[AI-DRAFT]`

- Two-pane workspace: chat plus a context panel (period, platform, selected objects).
- **Suggested questions** as chips for an empty chat.
- **Answer card**: a short answer, a table or small chart built from tool results, the sources used (tool names and period), a note on limits and what is not known, and optional **proposal cards**.
- **Proposal cards** (action kinds such as pause, budget change, new ad): they create a **local draft** and open it in the normal confirmation flow. The assistant cannot call any write endpoint.
- Grounding: every number in an answer comes from a tool call; unsupported questions get a refusal that lists what can be answered.
- The model is a general-purpose hosted model used through tool calls. It is not fine-tuned.

### Recommendations (Priporočila) `[AI-DRAFT]`

- Cards sorted by priority; each card has a kind, a category, a confidence level, the evidence (metrics and period), the proposed action and its expected risk.
- Card actions: "Open as draft" (creates a local draft), "Dismiss", "Snooze" with a reason. Nothing executes on click.
- Card kinds seen in code include pause underperformer, reduce or raise budget, refresh a fatigued creative, review tracking or attribution gaps, and data-quality items. Categories group them (spend efficiency, creative, tracking, data).
- Empty state when nothing meets a threshold: states that "no recommendation" is a valid result.

### Data sources (Viri podatkov) `[READ]`

- One card per source (Meta, Google, sales backend, lead imports, payments) with health badge, last successful sync (account timezone), imported-range summary and a "refresh" action where permitted. Health states match the status menu above.
- Includes the read-only **data accuracy audit** summary: each check reports PASS, FAIL or PARTIAL. PARTIAL carries a category: A intentionally different basis, B source limitation, C missing evidence, D real error. (lower confidence on exact layout.)

### Change log (Dnevnik sprememb) `[LOCAL]`

- Immutable log of changes in Meta and Google Ads, approvals, AI proposals and syncs; environment label; timezone note.
- Paginated list; clicking an entry expands three blocks: Before (read from the platform at preview time), Proposed, After (read back after the write; "No read-back state" when absent).
- Filters by actor, action, platform, outcome.

### Users (Uporabniki) `[LOCAL]`

- ADMIN only; other roles see "No access". Create-user form, user table with role selector (Viewer / Ad editor / Admin). Passwords are never logged. The demo omits this screen or shows it as static read-only (no credentials, no names).

### Campaign settings (Nastavitve kampanj) `[LOCAL]`

- ADMIN only. Explains that one ad account also holds campaigns that are not part of the product, so each campaign gets three independent decisions: part of the product, allowed for write, and approved for use (exact field names not verified). Bulk "approve all verified" action with one explicit confirmation and a log entry; a "needs review" list for incomplete or contradictory settings. (lower confidence on field names.) Demo: optional, low priority.

### Login `[LOCAL]`

- Email and password form. Not part of the demo (no accounts); the demo opens directly.

## Cross-cutting interactions

| Interaction | Behaviour |
|---|---|
| Period presets / custom range | Change every widget on the page and the URL; last click wins. |
| Daily / Monthly | On every time-series chart and KPI zoom view; This year defaults to Monthly. Monthly sums counts and money; ratios are recomputed from monthly sums. The sum of daily values equals the monthly total. |
| Expanded chart | Any chart opens in a dialog with a larger plot, the same toggle, the period and a print/PDF action. |
| Tooltips | Value plus date or month, with partial-day and missing-day markers. |
| Print / PDF | Per chart or per page. Lines are drawn solid at 2 to 3 px and must be distinguishable in greyscale. Rendering uses a vector SVG-to-PDF path, with a print stylesheet fallback. |
| Comparison picker | Ad selection with chips, max selection enforced, compare overlay. |
| Wizard | Steps, readiness panel, saved draft, two separate confirmations (create paused; activate). |
| Confirmation dialogs | Native dialog element, focus trapped, preview before confirm, outcome panel after. |
| Assistant chat | Suggested questions, streamed or instant answer, answer card, proposal cards. |
| Recommendation cards | Evidence, confidence, "Open as draft", dismiss. |

## Data-integrity behaviours the demo must preserve

1. Three cell states: 0, "-" no data, and error. A missing day is a gap in the line, never a zero.
2. One total-spend path: card, chart, monthly view and PDF show the same number to the cent, completed days only.
3. Ratios are computed from sums.
4. Result types are never summed into a single number.
5. Each order is in exactly one source; unlinked sales stay unlinked; no ROAS on unlinked revenue.
6. Surplus is not profit; VAT caveat is visible wherever surplus appears.

## Excluded from the demo

- The "Other modules" sidebar links to sibling products of the company.
- Login, user management and anything involving credentials or personal data.
- Real partner-portal naming (the demo says "Partner portal").
- Any attempt to reproduce real campaign, product, or service names.

## Verification index (private source files read)

Navigation and shell: `src/components/NavLinks.tsx`, `src/components/shell/Shell.tsx`, `src/components/shell/ChannelSwitcher.tsx`, `src/app/(app)/layout.tsx`, `src/lib/platform.ts`. Period and filters: `src/components/FilterBar.tsx`, `src/lib/dates.ts`. Pages: `src/app/(app)/{page,skupaj,oglasi,primerjava,priporocila,prodaja,leadi,atribucija,viri,dnevnik,osnutki,uporabniki,nastavitve-kampanj}`. Charts and export: `src/components/charts/*`. Combined overview: `src/components/skupaj/*`, `src/components/dashboard/CombinedOverview.tsx`. Sales and leads: `src/components/sales/SalesView.tsx`, `src/components/leads/LeadsView.tsx`. Navigator and detail: `src/components/ads/*`, `src/components/detail/*`. Compare: `src/components/compare/*`. Assistant: `src/components/assistant/*`. Recommendations: `src/components/recommendations/*`. Wizards and management: `src/components/wizard/*`, `src/components/manage/ManageActions.tsx`, `src/components/google-manage/*`, `src/components/google-wizard/*`. Status: `src/components/status/SourceStatusMenu.tsx`. Docs: `docs/DESIGN_SYSTEM.md`, `docs/V46_STATUS.md`, `docs/GOOGLE_WRITE.md`.
