# Screenshot plan

## Status: implemented in Phase 2

The 12 published screenshots in `assets/screenshots/` were captured by `SCREENSHOTS=<dir> node scripts/browser-test.mjs` from the locally built demo (desktop 1440 x 900 and phone 390 x 844, both at device pixel ratio 2, reduced motion, light scheme). They were then re-encoded so each PNG holds only `IHDR`, `IDAT` and `IEND` chunks, and the repository privacy scan passed over the result. The same run fails on any external request, console error or CSP violation.

The rules below were written in Phase 1, when **no screenshots of any kind** were published, for these reasons:

1. No synthetic environment exists yet. The only running version of the product is the private production app, whose screens contain real company data (campaign names, spend, orders, customers).
2. Redacting real screenshots is not an acceptable substitute. Blurring leaves layout fingerprints, metadata and partial text.
3. The Phase 2 browser demo (see `demo-plan.md`) will render only synthetic data. All published screenshots will be captured from that demo.

Phase 1 therefore described screens in words and linked to diagrams only.

## Capture rules (all shots)

- Source: the deployed or locally built Phase 2 demo only. Never the production app.
- Data: synthetic only, from the deterministic generator with a fixed seed.
- The "DEMO DATA - NOT REAL BUSINESS RESULTS" banner must be visible in every shot, uncropped.
- No IDs, no tokens, no hostnames other than the public demo origin (preferably cropped out of the frame; capture the page, not browser chrome).
- Synthetic names are obviously synthetic (see `demo-plan.md`), never resembling real campaigns or products.
- Viewport: desktop 1440 x 900 at device pixel ratio 2; mobile 390 x 844 at DPR 3 for the shots marked "mobile".
- Fonts: bundled font, so output does not depend on the capture machine.
- Fixed clock: the demo is pinned to a fixed "today" so numbers and dates are reproducible.
- Reduced motion, animations disabled, fixed scroll position.

## Capture pipeline (automated, in Phase 2)

1. Playwright-core script drives the built demo through the named states.
2. Before each capture, extract `document.body.innerText` and all attribute text and run the `scripts/privacy-scan` rules over it. Any match fails the run (emails, phone patterns, ID shapes, API-key shapes, production words and names in the blocklist, real-looking currency amounts outside the synthetic set).
3. Capture PNG.
4. Strip all metadata: no EXIF, no text chunks (tEXt, iTXt, zTXt), no creation time or software tags. Re-encode with a tool that writes only image data, then verify by parsing the chunk list.
5. Write an adjacent manifest (route, state, seed, viewport) for reproducibility. The manifest contains no machine paths.
6. A second check scans the final PNG bytes for known blocklist strings.
7. A human reviews each image once before it enters the repository.

## Per-shot safety checklist (repeat for every screenshot)

- [ ] Captured from the demo, not production.
- [ ] Banner visible.
- [ ] DOM text scan passed.
- [ ] No identifiers, hostnames, emails, phone numbers, person names.
- [ ] Only generic source names (Meta, Google, Chatbot/AI, Partner portal, Other verified, Unknown, Conflicting).
- [ ] PNG metadata stripped and verified.
- [ ] Numbers are synthetic and look it.
- [ ] Alt text written; no claims beyond the demo.

## The 11 planned screenshots

File names are proposals under `assets/screenshots/`.

### 1. Combined Overview (`01-combined-overview.png`)

- Route and state: `/combined`, period "This year", Monthly, all sources ticked.
- Viewport: 1440 desktop; also mobile 390 (cards stacked).
- Must be visible: banner, period selector, KPI cards (total spend, paid orders, revenue, attributable ROAS per platform, advertising surplus), sales-by-source block with the Meta + Google + Chatbot/AI subtotal, the surplus chart with its VAT caveat, ROAS cards for Meta and Google.
- Story: a growing business with a spring peak and a summer dip; Google ROAS lower than Meta; one source labelled Unknown; one Conflicting row with a small count.

### 2. AI Assistant (`02-ai-assistant.png`)

- Route and state: `/assistant`, one question already answered: "Which campaign had the weakest cost per lead last month?" with the answer card, table, sources line and limits note, and one proposal card "Pause campaign (local draft)".
- Viewport: 1440; mobile 390 chat view.
- Must be visible: the label "Interactive demo assistant - simulated analytical responses", tool names used, the "creates a local draft only" wording.
- Story: the underperforming campaign from the synthetic dataset is identified.

### 3. AI Recommendations (`03-recommendations.png`)

- Route and state: `/recommendations`, five or more cards with different kinds and confidence levels.
- Viewport: 1440.
- Must be visible: evidence lines, confidence badges, "Open as draft", "Dismiss", the empty-result principle in a footer note.
- Story: underperformer, fatigued creative, budget headroom, tracking gap (Google-labelled order without paid evidence), data-quality item.

### 4. Meta dashboard (`04-meta-dashboard.png`)

- Route and state: `/overview?channel=meta`, "Last 90 days", Daily.
- Viewport: 1440; mobile 390.
- Must be visible: KPI grid with sparklines, result types kept separate, daily spend chart with one visible gap (missing day) and the partial-day point at reduced opacity, notice that CTR/CPC use rows with link clicks.

### 5. Google dashboard (`05-google-dashboard.png`)

- Route and state: `/overview?channel=google`, "Last 30 days".
- Viewport: 1440.
- Must be visible: read-only line, KPI cards, campaign comparison chart, conversion actions table, "Conversions (Google)" label.

### 6. Campaign and ad management (`06-campaign-management.png`)

- Route and state: `/campaigns`, ad-set level, then the budget-edit confirmation dialog open. Two frames (table; dialog) may be combined side by side.
- Viewport: 1440.
- Must be visible: delivery badges, verdict badges with reasons, the confirmation dialog with preview/proposed values, text "Simulated - no advertising account was changed", and a Google row showing "validate-only".
- Story: pausing the underperforming campaign.

### 7. Ad comparison (`07-ad-comparison.png`)

- Route and state: `/compare` with three ads selected; overlay chart.
- Viewport: 1440; mobile 390 (stacked cards).
- Must be visible: chips, best-value highlighting, shared period, daily overlay, verdict reasons, creative placeholders (neutral shapes, no real creatives).
- Story: one fatigued ad versus two healthy ones.

### 8. Sales attribution (`08-sales-attribution.png`)

- Route and state: `/attribution`, campaign level, "By order date".
- Viewport: 1440.
- Must be visible: attribution table with linked orders, an explicit "Not linked" row, mode tabs, evidence-basis statement, the Google-labelled order without paid evidence shown as unlinked.

### 9. Financial performance (`09-financial-performance.png`)

- Route and state: `/combined` scrolled to the finance charts, Monthly, expanded chart dialog for the advertising surplus with a month-over-month tooltip and a negative month.
- Viewport: 1440.
- Must be visible: zero axis with a negative value below it, VAT caveat, "not accounting profit" text, attributable ROAS per platform. No MER.

### 10. Daily / monthly reporting (`10-daily-monthly.png`)

- Route and state: `/sales`, same chart in Daily and in Monthly shown as two frames; or one expanded chart with the toggle.
- Viewport: 1440; mobile 390.
- Must be visible: toggle, period totals in the chart header equal in both frames, partial-day styling, two axes (value, count).

### 11. PDF export (`11-pdf-export.png`)

- Route and state: a rendered page of the exported PDF (print view) of the combined overview, converted to PNG, plus the print preview.
- Viewport: A4 portrait render at 2x.
- Must be visible: solid 2 to 3 px lines distinguishable in greyscale, a greyscale version beside the colour version, banner or "Demo data" footer text on the PDF itself.
- Check: PDF metadata (title, author, producer, creation date) is neutral before rasterising; only the PNG is published.

## Mobile coverage

Mobile (390) shots only for 1, 2, 4, 7 and 10. Verify no horizontal page scroll, readable tap targets (44 px), and drawer navigation.

## Alt-text principle

Alt text states what is shown and that the data is synthetic. Example: "Combined overview of a synthetic advertising dataset showing monthly spend, orders by source and advertising surplus."
