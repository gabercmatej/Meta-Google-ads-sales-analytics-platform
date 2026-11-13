# Chart fidelity audit

How each chart in the demo compares with the reference product screens, what was fixed in this release, and how
it is verified. The reference is the set of product screenshots used for the showcase; no product code or data was
used. All numbers in the demo are synthetic.

The inventory below is produced automatically by `npm run test:browser` (`CHART_INVENTORY=file.json` writes it out):
87 expandable charts on 14 pages (36 chart cards, 51 clickable sparklines; table sparklines are sampled, 3 per table).
Every inventoried chart is opened, checked and closed by the browser test; see [Verification](#verification).

## Shared behaviour (all charts)

| Aspect | Reference product | Demo before | Demo now |
|---|---|---|---|
| Sparkline colour | One colour per metric (spend, leads, CPL, revenue, ROAS, CTR, CPC …) | Almost all blue | Per-metric tokens in `components/charts/colors.ts` (`METRIC_COLOR`, `GOOGLE_METRIC_COLOR`, `metricColor()`), campaign palette `campaignColor(i)` |
| Sparkline shape | Smooth monotone line over a soft gradient, last point marked | Straight segments, no fill | Monotone cubic path (no overshoot), 18 % → 0 gradient, round end dot that stays round at any width; a missing day breaks the line |
| Sparkline click | Opens the metric chart | Not clickable | The whole KPI card (except its info and link controls) and the sparkline open the chart dialog; the sparkline is a real `<button>` (Enter / Space) |
| Card click | Expand icon | Expand icon only | Expand icon, or a click anywhere on the plot (`cursor-zoom-in`); legend pills, toggles and links keep their own action |
| Dialog | Title, period, larger chart, legend, tooltip, Daily/Monthly, explanation, print | Present for cards only | Same dialog for cards and sparklines: title + period + scope, Daily/Monthly (own state for sparklines), metric selector where the card has several, Customize, legend toggles, tooltip, values table, "How it is calculated", Print, Save PDF, Close |
| Monthly values | Sum of days; ratios from sums | Cards only | Sparklines too: sums add up, CTR / CPC / CPL / ROAS / AOV recomputed from summed numerator and denominator; incomplete months are marked; 7-day rolling recommendation lines are daily only (stated in the dialog) |
| Incomplete period | Marked | Hatched bars only; on a line a partial month looked like a collapse | Hatched bars, and an open dot on lines; the note under the legend names the marker used; sparkline dialog titles no longer say "per day" because they also show months |
| Print / PDF | Solid lines | Solid | Unchanged and now verified per chart: every inventoried chart's PDF is downloaded and checked (valid PDF, page present, no dash pattern) |

## Per-chart matrix

Columns: **Type** = original → demo; **Series / colours**; **Hover / click / expand**; **Fixed in this release**.
"Spark" rows are KPI sparklines that open the dialog with one series, Daily/Monthly and Save PDF.

### Combined overview (`/combined`)

| Chart | Type | Series / colours | Hover / click / expand | Fixed in this release |
|---|---|---|---|---|
| Total / Meta / Google spend (spark ×3) | spark → spark | combined slate, Meta blue, Google orange | tooltip in dialog; card click; dialog | colours per platform, monotone + gradient, clickable, monthly sums |
| Spend by platform | multi-line → multi-line | Total black, Meta blue, Google orange; metric selector (5) | tooltip, legend toggles, plot click, expand | — (already matched) |
| Sales by source: orders / revenue | multi-line → multi-line | total, subtotal purple, 6 sources (`SOURCE_COLOR`) | as above | — |
| Selected-source advertising surplus | +/- bars → +/- bars | green above zero, red below | breakdown strip, MoM tooltip | — |
| Attributable ROAS: Meta, Google, combined | multi-line → multi-line | combined black, Meta blue, Google orange | as above | — |

### Meta overview (`/overview?platform=meta`)

| Chart | Type | Series / colours | Hover / click / expand | Fixed |
|---|---|---|---|---|
| Spend, Leads, CPL, Linked value, Estimated ROAS (spark ×5) | spark → spark | spend navy, leads teal, CPL near-black, value green, ROAS orange | card click, dialog, monthly from sums (CPL = spend/leads, ROAS = value/spend) | were all blue and not clickable |
| Spend by section | multi-line → multi-line | section colours | tooltip, legend, expand | — |
| Paid sales, all channels | stacked bars + subtotal line → same | `SOURCE_COLOR` | as above | — |

### Google overview (`/overview?platform=google`)

| Chart | Type | Series / colours | Hover / click / expand | Fixed |
|---|---|---|---|---|
| Spend, Impressions, Clicks, CTR, Avg. CPC (spark ×5) | spark → spark | `GOOGLE_METRIC_COLOR` (navy, grey, green, teal, violet) | card click, dialog, CTR/CPC monthly from sums | colours, clickable |
| Daily spend | bars + average line → same | orange bars, dashed average (solid in print) | tooltip, expand | — |
| Campaign spend (spark ×4, campaign cards) | spark → spark | `campaignColor(i)` | dialog | **bug fixed:** the line plotted one point per ad row instead of one per day; now summed per day, missing day = gap |

### Campaigns and ads

| Page | Chart | Type | Fixed |
|---|---|---|---|
| `/campaigns` table | Result per day (trend column) | spark → spark | clickable, title per row |
| `/campaigns/:id` | Leads per day (spark), Spend trend | spark, line | leads colour per platform |
| `/ads/:id` (Meta and Google) | Spend, Clicks, CTR, CPC, Leads, CPL (spark ×6), Spend trend | spark, line | per-metric colours via `metricColor(platform, metric)`; ratio sparks monthly from sums |

### Results

| Page | Chart | Type | Series | Fixed |
|---|---|---|---|---|
| `/sales` | All orders, Paid orders, Ordered value, Paid value, AOV (spark ×5) | spark | orders blue, paid orders green, all value grey, paid value green, AOV violet | colours, clickable, AOV monthly = value / orders |
| `/sales` | Value of paid sales; Number of paid orders; Revenue and orders over time; Sales by source; Advertising profitability | bars, bar+line, stacked bars, +/- bars | — | — |
| `/leads` (Meta, Google) | Leads, Sold leads, Spend (spark ×3) | spark | leads teal, sold green, spend platform tone | colours, clickable |
| `/leads` | Leads (stacked by campaign/status); Sold per day; CPL and lead-to-paid conversion; Reported vs CRM; Difference per day | stacked bars, bars, dual-axis lines, lines, +/- bars | — | — |
| `/attribution` | Meta vs Google (verified revenue vs ad spend) | grouped bars, categorical (no Daily/Monthly) | green revenue, slate spend | — |
| `/compare` | CTR, CPC, CPL, Leads, Spend, Clicks trend | lines, one per selected ad | ad colours | — |

### AI recommendations

| Page | Chart | Type | Fixed |
|---|---|---|---|
| `/recommendations` | 7-day rolling CPL / CTR per card (×7) | two-line spark (current solid, previous dashed grey) → same | monotone, metric colour, clickable dialog with both periods by day (daily only, explained) |
| `/recommendations/:id` | CPL vs previous period; Spend and CPL; Conversion trend | lines, bar+line | — |

## Synthetic data

The dataset covers more than 12 months, is deterministic (fixed seed) and reconciles exactly: Meta + Google =
Combined, daily sums = monthly values, ratios come from sums, a missing day is not zero, and there are no partial
history or warning panels. `test/showcase-realism.test.ts` checks weekday shape, seasonality and plausible ranges.
One Google ad (`google-c1-g1-a1`) has a mild CTR decline over the last 30 days (about −11 %, below the fatigue rule),
so the falling-CTR recommendation has a real case next to the fatigued Meta ad.

## Verification

- `npm run test:browser`: every page at 1440×900 and 390×844 (no console errors, no CSP violations, no external
  requests, no horizontal overflow, no yellow panels) plus the chart inventory. For each of the 87 charts:
  open → dialog title equals the chart title → chart rendered → legend has ≥ 1 series (≥ 2: hide and restore one) →
  Monthly and back to Daily where offered → metric switch where offered → "How it is calculated" present →
  Save PDF downloads a valid PDF without dashed strokes → Escape closes → reopen → Close button closes.
- Print: a card's print sheet holds the chart with no dashed line when `window.print()` runs.
- Unit tests (`npm test`, `npm run test:demo`), typecheck, build, bundle budget, privacy scans.

## Remaining gaps

- Colours and shapes follow the reference screenshots by eye; there is no pixel comparison against the product.
- Attribution "Meta vs Google" is categorical, so it has no Daily/Monthly switch (by design).
- Recommendation sparklines are 7-day rolling values and only available by day.
- Table sparklines are tested on a sample of 3 rows per table; all rows use the same component.
- PDF checks are structural (valid file, page, no dash operator, title text); the rendered PDF image is not compared.
