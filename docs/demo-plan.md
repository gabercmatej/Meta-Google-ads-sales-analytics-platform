# Phase 2 plan: public browser demo

Status: plan only. Nothing in this document is built in Phase 1. Companion documents: `product-tour.md` (what to port), `localization-glossary.md` (English strings and formatting), `screenshot-plan.md` (capture rules).

## 1. Goals

1. Let a visitor click through a faithful, **synthetic-data** version of the product's main screens in a browser, with no sign-in and no install.
2. Demonstrate the design rules that make the product trustworthy: missing is not zero, ratios from sums, one canonical spend path, one source per order, no ROAS without verifiable links, simulated write safety.
3. Reuse the public `packages/analytics-core` library so the demo is evidence that the library works end to end.
4. Be impossible to confuse with real results (permanent banner) and impossible to leak anything (no backend, no network, no secrets).
5. Produce the 11 screenshots in `screenshot-plan.md` reproducibly.

Non-goals: connecting to any real ad platform, calling a real model, reproducing production code or data, user accounts.

## 2. Architecture decision

**Static, browser-only Vite + React + TypeScript single-page app in `apps/demo/`.**

| Criterion | Vite SPA (chosen) | Next.js |
|---|---|---|
| Backend needed | None. All data generated in the browser from a seeded generator. | Brings a server runtime and API route temptations. |
| Attack surface and secrets | No server, no env, strict CSP possible. | Server components, route handlers, env handling to audit. |
| Deployment | Static files; any static host. | Needs the framework runtime or export constraints. |
| Fidelity to production | The product uses Next.js, but the visible UI is client-rendered components and Recharts; the port needs the components, not the framework. | Closer in routing, but gives nothing visible. |
| Cost / complexity | Minimal. | Higher; more to review for a showcase. |

The benchmark showcase repository also uses a Vite SPA for the same reasons. Justification to record in the README: "The demo is a static app because it needs no server; this keeps the security posture simple and the claims verifiable."

Constraints:

- No backend, no database, no network writes. The built site makes **zero** requests other than its own static assets.
- Content Security Policy: `connect-src 'none'` (preferred) so even a compromised dependency cannot call out; relax to `'self'` only if a feature truly needs it, which none planned do.
- Routing: client-side router with a history fallback; hash routing is not required because the host rewrites to `index.html`.
- A **network-disabled test** (section 10) runs every flow with `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` replaced by functions that throw and record the call; the test fails if any is invoked, and the browser-level check fails on any non-origin request.
- Fonts are bundled locally (no font CDN). No analytics, no third-party scripts.

## 3. How the demo consumes `packages/analytics-core`

The demo imports the library as a workspace dependency and contains no business logic of its own beyond presentation.

| Library module | Used for |
|---|---|
| `synthetic/generate.ts` | Deterministic 12-month dataset from a seed (section 5). |
| `money.ts`, `metrics.ts` | Minor-unit money, safe ratios, "no data" vs 0 vs error cell states. |
| `dates.ts` | Account-timezone day handling, completed-day rule, period presets. |
| `aggregate.ts` | Daily to monthly sums; ratios recomputed from sums; partial-day handling. |
| `spend.ts` | The single canonical total-spend path (card = chart = monthly = PDF). |
| `sources.ts`, `attribution.ts` | One source per order, selected-source sums, verified-link attribution, surplus and attributable ROAS. |
| `comparison.ts` | Ad comparison cards, best-value logic, minimum-evidence verdicts. |
| `audit.ts` | Data-accuracy audit summary on the Data sources page (PASS / FAIL / PARTIAL with A to D). |
| `write-safety.ts` (`SimulatedWriteAdapter`) | Preview, confirm, one simulated write, read-back, audit entry; PAUSED-on-create; activation as a separate step. |
| `assistant/tools.ts`, `assistant/answer.ts` | Tool functions over the dataset and the deterministic answer engine. |

If the library lacks something the UI needs, add it to the library with tests first, then consume it. Do not duplicate logic in `apps/demo`.

## 4. Faithful-port strategy

- Recreate the **visual structure, navigation, layouts, charts and interactions** documented in `product-tour.md` using new components written for the demo. **Do not copy any private file**, class list, fixture or string verbatim; write fresh code from the tour and the glossary. Layout facts used (sidebar 252 px, 1360 px content width, 14 px card radius, Inter, tabular numerals) come from the design-system tokens, which are design values, not code.
- Token palette (design values): canvas, brand blue, positive green, negative red, warning amber; platform dots (Meta blue, Google orange); selected-sources violet; section colours. Define them as CSS custom properties in one stylesheet.
- Charts: **Recharts** (the production product uses it, so the look, tooltips and expand behaviour match). Rules: missing day is a gap (no connecting line), partial day at reduced opacity, solid 2 to 3 px lines in print, greyscale distinguishable.
- Screens to port (priority order): Combined overview; Meta dashboard; Google dashboard; Campaigns and ads (with confirm dialogs); AI assistant; Recommendations; Ad comparison; Sales; Attribution; Leads; Data sources and audit; Change log; Create-ad wizard and Drafts. Out: login, users, campaign settings (optional later).
- Shared components built first: shell, channel pill, period selector, KPI card with sparkline, chart frame (Daily/Monthly toggle, expand dialog, print), data table, badges, notice, dialog, drawer.

## 5. Synthetic data specification (12 months)

Everything is generated from a seed by `synthetic/generate.ts`; the demo adds no hand-typed numbers. Names are obviously synthetic: "Demo Company", "Sample Product A/B/C", "Example Campaign 01", "Example Ad 07", a placeholder partner called "Partner portal". No real product, service, region, or person names.

### Entities and counts

| Entity | Count (target) |
|---|---|
| Months | 12, ending at a fixed demo "today" (a constant, not the system clock) |
| Platforms | 2 (Meta, Google) |
| Meta campaigns | 8 (across 3 sample products) |
| Meta ad sets | 20 |
| Meta ads | 48, with 3 creatives refreshed during the year |
| Google campaigns | 5, Search only; ad groups 12; ads 30 |
| Daily rows | per ad per day for the full range, with a few deliberate missing days |
| Orders | a few thousand synthetic orders in total (order of magnitude), across statuses: paid, unpaid, cancelled, refunded, partially refunded |
| Leads | imported lead records with FB/IG split, operator-sold flag |
| Customers | synthetic opaque keys only; no names, emails or phones |
| Sources | Meta, Google, Chatbot/AI, Partner portal, Other verified, Unknown, Conflicting |
| Currency | EUR, minor units |

### Seasonality story per month (relative index, not real)

| Month | Story |
|---|---|
| M1 | Quiet start, low spend, learning phase on new campaigns. |
| M2 | Gradual growth; first creative refresh. |
| M3 | Spring campaign launch; spend and orders rise. |
| M4 | Spring peak; best attributable ROAS on Meta. |
| M5 | Plateau; one campaign begins to underperform. |
| M6 | Pre-summer dip; budget reduction on one campaign. |
| M7 | Summer low; Google carries relatively more. |
| M8 | Lowest month; a few zero-delivery days and one missing day. |
| M9 | Autumn recovery; a new ad set launches paused, then activated. |
| M10 | Strong month; a creative becomes fatigued (frequency up, CTR down). |
| M11 | Peak season; spend rises; the advertising surplus is negative for part of one earlier month and positive here. |
| M12 | Current partial month: today is incomplete and drawn partial. |

### Planted conditions (so features have something to find)

1. **An underperforming campaign**: sustained spend above a threshold with cost per result well above peers; triggers a "pause underperformer" recommendation and the assistant's "weakest" answer.
2. **A fatigued ad**: frequency rising over 6 weeks while CTR and results fall; triggers a "refresh creative" card and shows in comparison.
3. **A Google-labelled order without paid evidence**: an order tagged to Google in the sales data but with no verified paid-click evidence; it must appear as Unknown or Conflicting evidence, never as Google-attributed revenue, and must not inflate Google ROAS.
4. **Refunds and cancellations**: a share of orders cancelled or refunded after the period; revenue figures follow the stated rule and totals reconcile.
5. **Missing day**: at least one day with no data for one platform (a gap, "No data"), distinct from a day with genuine zero spend.
6. **A source error day**: one day marked as an API error, shown as "Source error", not zero spend.
7. **Partial final day**: the demo "today" has incomplete data.
8. **VAT**: revenue stored incl. VAT, spend excl. VAT; the caveat is visible wherever surplus is.

### Invariants (acceptance tests, run in CI)

1. Seeded generation is deterministic: the same seed produces byte-identical output.
2. Sum of daily spend equals the monthly total for every month, per platform and combined, in integer minor units.
3. Card total spend equals chart total equals monthly total equals PDF-model total (single canonical path), completed days only.
4. Every order is in exactly one source; per-source counts sum to the all-orders count; per-source revenue sums to total.
5. No ROAS is produced for unlinked revenue; those cells are "No data".
6. Ratios (CTR, CPC, CPM, ROAS, conversion) equal sum-of-numerator over sum-of-denominator, never the mean of daily ratios.
7. Meta result types are never summed into one figure anywhere.
8. Missing days are `no data`, not 0; error days are `error`, not 0.
9. Refunds never create negative order counts; net revenue equals gross minus refunds.
10. Month and day boundaries are correct across daylight-saving transitions in the account timezone.
11. No generated string matches a privacy-scan rule; names come only from the synthetic vocabulary.
12. The planted conditions exist exactly as specified (counts and magnitudes within stated ranges).
13. The Google-labelled order without evidence is not in the Google source total.

## 6. AI Assistant demo specification

- Visible label on the page and in the empty state: **"Interactive demo assistant - simulated analytical responses"**. It never claims to be a live AI, and never says it called a model.
- Implementation: a deterministic engine (`assistant/answer.ts`) that maps a question to a supported intent by pattern and entity matching, calls the corresponding tool over the synthetic dataset and fills a template. No network, no model.
- Supported questions (each mapped to tools in `assistant/tools.ts`):

| Question type | Tool(s) |
|---|---|
| "How much did we spend last month, by platform?" | spend by period and platform |
| "Which campaign had the weakest cost per result?" | campaign performance and peer comparison |
| "Compare these two ads" (selected from context) | comparison |
| "What is our attributable ROAS on Meta this year?" | attribution and ROAS |
| "How many orders came from each source?" | sales by source |
| "Show daily vs monthly spend for this year" | aggregate |
| "Which ads look fatigued?" | frequency and CTR trend |
| "What changed in the log this week?" | change log |
| "Is the data complete?" | audit and source health |
| "Should I pause X?" | recommendation evidence; returns a **proposal card** that creates a local draft |

- **Grounding check**: every number in the answer is produced by a tool result; the engine verifies that each figure in the rendered text appears in a tool output, and fails closed (shows a fallback) if not.
- **Refusal and limits**: unsupported or ambiguous questions get a polite refusal that lists what can be answered; questions asking for unavailable data ("last month's profit", "which customer bought") explain what is unknown; no invented answers. Notes about the surplus not being profit and about missing data are included when relevant.
- **Proposal cards** only create a local simulated draft; the user must open it and confirm through the same simulated confirmation as manual changes. The assistant has no path to the simulated write adapter.
- **Optional future real-LLM demo**: out of scope by default. If ever added, it must go through a server-side proxy with a demo-only key, strict rate limits, input length caps, no secrets in the client, the same grounding rules and a different label ("live model demo"). This would break the "no backend" property and requires an explicit decision and a separate CSP.

## 7. Recommendation card specification

At least five card kinds, each generated by a rule over the synthetic metrics (rules live in the demo or the library, with tests):

| Kind | Trigger condition (synthetic) | Proposed action (draft only) |
|---|---|---|
| Pause underperformer | Spend above threshold, cost per result above peer median by a margin, enough results to judge | Draft: pause campaign |
| Refresh fatigued creative | Frequency above threshold and CTR down over N weeks | Draft: new ad from existing creative |
| Raise budget | Attributable ROAS above target with budget-limited delivery | Draft: budget increase |
| Reduce budget | Low attributable ROAS and no recent improvement | Draft: budget decrease |
| Tracking or attribution gap | Orders tagged to a platform without paid evidence | Open attribution view; no write |
| Data quality | Missing days or source error in the period | Open data sources view |
| Not enough data | A campaign too new to judge | Shows "no recommendation yet" |

Each card shows evidence, confidence, a safe-action description, "Open as draft" and "Dismiss". No card executes anything.

## 8. Simulated campaign management

- Operations: create campaign / ad set / ad (wizard), edit, edit budget, pause, resume, save draft, validate.
- State is **local only** (in memory, optionally mirrored to `sessionStorage`; reset button restores the seed state). No data leaves the browser.
- Flow uses `SimulatedWriteAdapter`: preview (current state read from the simulated platform) -> confirm -> one simulated write -> read-back -> audit entry in the change log. New objects are created **PAUSED**; activation is a second confirmed dialog.
- Every success panel states: **"Simulated - no advertising account was changed"**.
- Role switch (Viewer / Ad editor / Admin) shows that Viewer cannot confirm.
- **Google**: shown as a **validate-only mirror of production**: pause/resume/budget and the Search wizard end in "Validated (not applied)" and never in "Created". The panel states that live Google changes are not enabled in the product ("tested with mocks"). Where a flow has no production equivalent it is labelled "Simulated".
- Honesty copy for Meta: "In the private product this flow runs behind a scoped write token, allow-listed accounts and an editor role. This demo contains no connection to any ad platform."

## 9. Cross-cutting requirements

- **Persistent banner**: "DEMO DATA - NOT REAL BUSINESS RESULTS" fixed at the top of every page, not dismissible, included in screenshots and in PDF output.
- **Localization**: English, per `localization-glossary.md`; en-IE number and date formatting; EUR; fixed demo timezone label. All strings in one dictionary file.
- **Responsiveness**: designed at 1440 and 390; sidebar becomes a drawer on mobile; tables scroll within their card, never the page; charts resize; no horizontal page scroll.
- **Accessibility basics**: semantic landmarks, one h1 per page, visible focus, keyboard-operable dialogs with focus trap and Escape, `aria-label` on charts with a data-table alternative or summary, colour never the only signal (badges have text), contrast at least WCAG AA, reduced-motion respected, tap targets 44 px on mobile.
- **Performance budget**: initial JS at most 250 kB gzipped (route-level code splitting; charts and PDF lazy-loaded), LCP under 2.5 s on a mid-range mobile profile, data generation under 300 ms or run in a worker, no layout shift from late fonts.
- **Print/PDF**: print stylesheet plus an optional client-side PDF; solid 2 to 3 px lines; greyscale distinguishable; neutral PDF metadata; banner text included.
- **No persistence of anything sensitive**: there is nothing sensitive; storage holds only UI preferences and simulated state.

## 10. Testing

1. **Unit tests** (vitest): all data invariants from section 5, the formatting helpers, the grounding check, recommendation rules.
2. **Component smoke tests**: each route renders without console errors against the seeded dataset; banner present; no element shows `NaN`, `undefined`, `Infinity` or a bare `0` where "No data" is expected.
3. **Network-disabled test**: a vitest/jsdom or Playwright test replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` with throwing stubs, then walks every flow (navigation, period changes, assistant questions, wizard, confirmations). The test fails if any stub is called.
4. **Browser check script** (`apps/demo/scripts/check`): Playwright-core loads the built site, fails on any request outside the demo origin, fails on console errors, and captures screenshots.
5. **Screenshot and privacy script**: for each planned shot, scan DOM text with the rules from the repository's `scripts/privacy-scan`, then capture and strip PNG metadata, then re-verify the file (section "Capture pipeline" in `screenshot-plan.md`).
6. **Repo-wide privacy scan** in CI over source, built assets and screenshots.
7. **Visual sanity** at 1440 and 390 for the 11 screens, reviewed by a human once.

## 11. Vercel deployment settings

No production secrets or production environment are involved at any point. **Do not configure any environment variable that comes from the private product.** The only optional variable is `VITE_DEMO_BUILD_LABEL` (a harmless display label such as a version string).

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | `apps/demo` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js version | 22.x |
| Environment variables | none required; optional `VITE_DEMO_BUILD_LABEL` only |

`apps/demo/vercel.json` should contain: an SPA rewrite of all non-asset paths to `/index.html`, immutable caching for hashed assets, and security headers: a strict Content-Security-Policy (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` disabling camera, microphone, geolocation and similar, and `X-Frame-Options: DENY`.

### Monorepo dependency resolution (must be verified before deploy)

The demo depends on `packages/analytics-core`, which lives outside the Root Directory `apps/demo`. Two workable approaches; pick one and prove it with a clean preview deployment:

1. **Preferred: source alias.** Declare `"@showcase/analytics-core": "file:../../packages/analytics-core"` (or an npm workspace), and in Vite and TypeScript configs alias the package to its `src/index.ts` so no separate package build is needed. This requires the Vercel project setting **"Include source files outside of the Root Directory in the Build Step"** to be enabled (it is the default for newer projects but must be checked in project settings), because `npm ci` and the build read files above `apps/demo`.
2. **Fallback: repo root as Root Directory.** Set Root Directory to the repository root, Install `npm ci`, Build `npm run build -w apps/demo` (after building the package if required), Output `apps/demo/dist`. This avoids the outside-root setting but changes the settings table above.

Soundness checks: (a) a root `package.json` with `workspaces` and a committed lockfile must exist so `npm ci` works from the chosen directory (Worker 1 owns the root manifest in Phase 1; confirm it exists, otherwise Phase 2 adds it); (b) the build must pass from a fresh clone without any local artefacts; (c) the first Vercel preview build log is checked for "module not found"; (d) the deployed site is run through the network and privacy checks in section 10. If approach 1 fails on the platform, switch to approach 2 rather than copying the library into `apps/demo`.

## 12. README update steps after deploy

1. Add a demo link and a hero image (a screenshot from `screenshot-plan.md`) at the very top of the README.
2. Add the provenance sentence, adapted from the benchmark: "The demo, screenshots and examples use synthetic data generated by this repository; they are not production data, and the production source is private."
3. Add the demo quick-start block (`npm ci`, `npm run dev -w apps/demo`).
4. Update the honesty section: Meta write behind scoped controls in production; Google validate-only; AI draft-only; no live platform connection in the demo.
5. Update `WHATS_PUBLIC.md` with the screenshot provenance (synthetic, capture method, metadata stripped) and the new public paths. This file is owned by the lead.
6. Re-run the privacy scan over the whole tree and the built `dist`.

## 13. Phased task checklist

### Phase 2A: foundations
- [ ] Root workspace and lockfile verified; `apps/demo` scaffold (Vite, React, TypeScript strict, vitest).
- [ ] Design tokens, Inter bundled, shell, router, banner, English dictionary.
- Acceptance: build passes; banner on every route; CSP header test passes; no network requests at load.

### Phase 2B: data and core widgets
- [ ] Wire `synthetic/generate.ts`; add missing generator features (planted conditions) with tests.
- [ ] Period selector, KPI card, chart frame with Daily/Monthly, expand dialog, tooltips, table, badges.
- Acceptance: all 13 invariants pass; chart totals equal card totals to the cent; gaps render as gaps.

### Phase 2C: reporting screens
- [ ] Combined overview, Meta, Google, Sales, Leads, Attribution, Data sources and audit.
- Acceptance: each route matches the tour inventory; no MER; surplus caveat present; unlinked sales stay unlinked.

### Phase 2D: operations screens
- [ ] Campaigns and ads, detail drawer, ad comparison, wizard, drafts, change log, simulated write flows.
- Acceptance: every confirmation shows the simulated notice; create is paused; activation separate; Google shows validate-only; change log records each action.

### Phase 2E: AI
- [ ] Assistant engine UI, supported questions, grounding check, refusals, proposal cards; recommendation cards.
- Acceptance: label visible; tests check that each rendered number appears in tool output (a test property, not an accuracy claim); unsupported questions refused.

### Phase 2F: quality and release
- [ ] Network-disabled test; browser check; component smoke tests; responsive and accessibility pass at 1440 and 390; performance budget.
- [ ] Screenshot capture, DOM privacy scan, metadata stripping, human review.
- [ ] Vercel preview deploy; verify monorepo resolution; production deploy of the demo.
- [ ] README and WHATS_PUBLIC updates (section 12).
- Acceptance: CI green; repo-wide privacy scan clean on source, dist and images; demo URL works on a phone and a desktop.

## 14. Risks and open questions

- Root manifest and workspace layout: confirm with Worker 1 output before starting.
- The en-IE choice is a presentation decision; confirm with the owner.
- Vercel "outside root directory" setting: verify in the project UI at deploy time.
- Recharts print/PDF fidelity may need a dedicated print component.
- Exact production thresholds for verdicts and recommendations are internal; the demo defines its own documented thresholds and must not imply they equal production's.
- Library gaps: some planted conditions may need generator support not present in Phase 1.

## 15. Next session prompt

Copy the block below into a new session started in the public showcase repository.

````text
You are continuing the public portfolio showcase for "Sedem Ads" (an independent reference implementation; the private production source must never be copied or referenced by path). Work only in the public showcase repository (a local clone of github.com/gabercmatej/Meta-Google-ads-sales-analytics-platform). Do not run git commit or git push unless I explicitly ask. Never touch the private production repository or any ad platform.

Goal: build Phase 2, the static browser demo described in docs/demo-plan.md. Read first: docs/demo-plan.md, docs/product-tour.md, docs/localization-glossary.md, docs/screenshot-plan.md, packages/analytics-core (its src/index.ts and examples/README.md), scripts/privacy-scan.mjs, and NOTICE.md / WHATS_PUBLIC.md.

Rules:
- Vite + React + TypeScript + Recharts in apps/demo/. No backend, no network calls, CSP connect-src 'none', bundled fonts, no analytics.
- All data is synthetic and generated by packages/analytics-core synthetic/generate.ts (extend it with tests where planted conditions are missing). Obviously synthetic names only.
- Permanent banner "DEMO DATA - NOT REAL BUSINESS RESULTS". English UI, en-IE formatting, EUR, fixed demo timezone label.
- Simulated writes only through SimulatedWriteAdapter; confirmation text "Simulated - no advertising account was changed"; created objects PAUSED, activation separate; Google validate-only; the assistant is labelled "Interactive demo assistant - simulated analytical responses", is deterministic, grounded in tool outputs, and has no write path.
- Never present MER as current. Advertising surplus is not profit (VAT caveat visible). Missing data is not 0; ratios from sums; daily sums equal monthly totals.
- Never name the real partner portal; use "Partner portal". Never claim 100 percent accuracy.

Do in order, committing nothing: (1) verify root workspace and lockfile, scaffold apps/demo with tests and vercel.json per the plan; (2) wire the generator and invariant tests; (3) shared components and the Combined overview, Meta, Google, Sales, Attribution screens; (4) campaigns, comparison, wizard, drafts, change log with simulated write flows; (5) assistant and recommendation cards; (6) network-disabled test, browser check, privacy scan, responsive and accessibility pass at 1440 and 390; (7) screenshot script that scans DOM text, captures at DPR 2, strips PNG metadata, and writes the 11 images listed in docs/screenshot-plan.md; (8) prepare the README demo section and hero image edits as a proposed diff for the lead rather than editing README.md or NOTICE.md yourself unless told.

After each step run build, type-check, tests and the privacy scan, and report what was actually verified and what is pending (for example the Vercel monorepo resolution check, which needs the project settings). End with a short list of open questions.
````
