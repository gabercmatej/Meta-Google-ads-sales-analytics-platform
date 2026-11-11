# Ad and period comparison

Comparison is where dashboards most often mislead: a green arrow on a metric that is better when lower, a percentage between two different result types, or a "no change" that really means "no data". This document describes how the private application handles it. The reference implementation is `packages/analytics-core/src/comparison.ts`.

## Metric semantics

Every metric is declared once with a direction, and the direction drives colour and wording everywhere.

| Direction | Metrics (examples) |
|---|---|
| Lower is better | Cost per lead, cost per paid order, cost per conversion, cost per click |
| Higher is better | Leads, paid orders, revenue, average order value, ROAS, CTR, conversion rate |
| Neutral (never coloured good or bad) | Spend, impressions, reach, clicks, share |

A metric is additive (counts, amounts), a ratio (computed from the sums of its parts), or a share. Ratios are never averaged across rows.

## What a comparison returns

A comparison carries the current value, the reference value, the absolute and relative change, a judgement (better, worse, neutral) derived from the metric's direction, and a tooltip explaining the basis. When a comparison cannot be made, it carries a precise reason (for example no baseline, no denominator, missing history) instead of silently showing nothing.

## Windows

- Comparisons use completed days only.
- The default reference is the equally long period immediately before the current one; for calendar presets (this month) the reference is the previous month over the same elapsed days.
- The period selector supports 7, 14, 30 and 90 days, this month, previous month, year to date and a custom range.

## Ad-level comparison

A dedicated comparison page puts up to four ads side by side for the same period, with overlay charts of daily trends and a plain-language analysis. A Google comparison exists alongside it. The verdict logic is a pure function:

- A winner is declared only when every compared ad has the same result type, the same campaign objective and the same Meta attribution setting, **and** each has enough evidence (a minimum number of results and impressions). Otherwise the page says why no winner is shown: different result types, small sample, or too few ads.
- A small relative difference in cost per result between the best and second best is "no difference", not a win.
- Ads with too small a sample are shown greyed rather than ranked.
- A form-lead ad is never ranked against a click ad on "cost per result".
- Reach and frequency are shown per ad, never summed.
- No sales are attributed to an ad by date or amount similarity; ad-level revenue appears only where a verifiable link exists.

## Assistant and recommendations

The assistant's period comparison tool reuses the same semantics and returns a fact the model must cite. The recommendation engine applies the same minimum-evidence thresholds, and flags changes such as rising cost per lead or creative fatigue (a CTR drop beyond a threshold) only when the sample is large enough.

## Limits

A better number is not proof of a better ad: audiences, delivery and timing differ. The comparison states what changed, and the recommendation layer states confidence and limitations.
