# Engineering challenges

Twelve problems that shaped the private Sedem Ads application, written as problem, decision, implementation, verified result and trade-off. File and module names refer to the **private production repository**; they are not part of this public tree and are given as plain text. Test counts are from the private suite at V4.6 (195 files, 2,096 tests; not runnable here). The public library `packages/analytics-core` re-implements the pure rules independently.

---

### 1. One spend number everywhere

**Problem.** Total spend was computed in several places: KPI card, daily chart, monthly chart, PDF. They drifted when today was partial or a platform had a missing day.
**Decision.** One canonical function owns total spend; every surface calls it.
**Implementation.** It uses completed days only, sums as decimals, rounds once, and treats a platform's missing day as "no data". Ratios are derived from the sums.
**Verified result.** An audit check compares card, daily series and monthly series; tests assert daily sums equal monthly totals.
**Trade-off.** Today is never shown in totals, which surprises users who expect live numbers.

### 2. Missing is not zero

**Problem.** A failed API call or an uncovered day rendered as 0 spend, which looks like good news.
**Decision.** Distinguish three states: zero, no data, source unreachable.
**Implementation.** Coverage is derived from successful sync runs. A failing source never overwrites stored data. Charts keep gaps; derived ratios are suppressed for periods with gaps.
**Verified result.** Tests cover empty results, API errors and partial months. The assistant tools return "no data", not 0.
**Trade-off.** More states in the UI and more explanatory text.

### 3. Idempotent re-import

**Problem.** Platforms correct recent numbers; spreadsheets get re-synced; the same order appears in two systems.
**Decision.** Every import must be safe to run twice.
**Implementation.** Day replacement in a transaction for ad insights; keyed upserts with hash-skip for rows; content-hash skip for the workbook (its version tag changes on every open); a trailing re-read window; cross-source de-duplication by order key with mismatches reported as issues.
**Verified result.** Re-import and duplicate tests; no deletes anywhere in import paths.
**Trade-off.** A larger re-read window costs API calls every run.

### 4. Backfilling history from CSV without corrupting API data

**Problem.** The API could no longer deliver some historical days; manual exports were the only source and had fewer columns.
**Decision.** CSV fills gaps only and is verified against the API wherever both exist.
**Implementation.** Dry run by default; gap days only; all-or-nothing per day; days with API data are compared to the cent and not overwritten; historical structure objects are marked and write-locked; CTR and CPC use only rows that have link clicks.
**Verified result.** A local comparison of exported days against stored API days matched exactly on cost, impressions and clicks for the overlapping period; the audit marks CSV-only days PARTIAL, never PASS.
**Trade-off.** Some history will stay PARTIAL by design.

### 5. Order-source classification that reconciles

**Problem.** "Where did our revenue come from?" had several competing answers, and "Google" could mean paid or organic.
**Decision.** Every eligible paid order lands in exactly one class with an evidence level; classes must sum to the total.
**Implementation.** Classes: Meta, Google, Chatbot/AI, Partner portal, Other verified, Unknown, Conflicting. Evidence levels 1 to 4; stronger wins; conflicts are excluded from ROAS; unknown is never "organic".
**Verified result.** A reconciliation flag asserts the sum of classes equals eligible orders and revenue; tests cover conflicts and inheritance.
**Trade-off.** A large Unknown or label-only share is visible and uncomfortable, but it is honest.

### 6. Linking leads to orders without storing phone numbers

**Problem.** The only verifiable lead-to-order bridge was a phone number, which is personal data.
**Decision.** Store only a keyed hash of the normalised number and require temporal and window constraints.
**Implementation.** HMAC over the normalised international form with a server-side key; lead must be at or before the order and inside a 90-day window; ambiguous matches are discarded; repeat orders inherit without chaining.
**Verified result.** A normalisation defect (local-prefix numbers not matching) was found by a diagnostic and fixed; a dedicated diagnostic command exists to inspect match rates.
**Trade-off.** Customers who used another number are unlinked, and that is correct.

### 7. Three revenue totals, one meaning each

**Problem.** Adding a "Meta + Google + Chatbot/AI" view risked being read as proven paid-ad revenue.
**Decision.** Keep all sales, selected-source subtotal and strictly attributed revenue as separate, labelled numbers.
**Implementation.** A fixed list of selected sources; the tooltip states it is a split by order source, not paid-ad attribution; surplus = selected revenue minus canonical Meta + Google spend, shown below zero when negative. MER was removed because it mixed bases.
**Verified result.** Audit checks for the selected-source reconciliation; tests for the model.
**Trade-off.** Three numbers instead of one headline.

### 8. Fair ROAS

**Problem.** A single ROAS invited division by tiny samples or by incomplete spend.
**Decision.** Per-platform ROAS with explicit denominators, a combined "attributable" ROAS, and refusal when inputs are incomplete.
**Implementation.** Meta over lead-campaign spend; Google over whole-account spend; low-sample flag under a minimum order count; zero gives no value; chart equals card or the chart is hidden.
**Verified result.** Audit checks for daily ROAS per platform and combined agree with the cards.
**Trade-off.** Often no number is shown, by design.

### 9. A grounded AI assistant

**Problem.** A language model asked about numbers will produce plausible wrong ones.
**Decision.** Tools return facts; the model must cite them; a checker verifies every number; failure degrades to a labelled rules-based mode.
**Implementation.** Fact ledger with numbered ids; registered objects so invented ids are dropped; number grounding with locale-aware matching and masked non-metrics; one repair round; a claim detector for "I changed...".
**Verified result.** The private suite includes an evaluation harness with fixed cases, run with the model provider disabled so results are deterministic; a static test asserts the assistant has no write import.
**Trade-off.** Occasionally a correct answer is rejected for a number the checker cannot trace, and the user sees the limited-mode answer.

### 10. AI with no write path

**Problem.** Users want "do it for me", but an agent with ad-account write access is a liability.
**Decision.** The assistant can only produce local drafts and structured proposals.
**Implementation.** Modules are separated; a test forbids imports of write code in assistant and recommendation directories; drafts are limited by role, kind and account.
**Verified result.** The static boundary test; draft creation tests.
**Trade-off.** One more click for the user, which is the point.

### 11. A write flow that expects to be wrong

**Problem.** Writing to an ad account is irreversible in money terms.
**Decision.** Preview from the platform, hash-bound confirmation, stale detection, single write, read-back, audit; new objects paused.
**Implementation.** Separate token, allow-lists, approved-campaign scope, role gating with admin-first operations, a budget cap, an emergency stop, mock and validate modes for testing. Google was built to the same standard but stays validate-only until live mutation can be verified.
**Verified result.** Mock-adapter tests cover the write flow; Meta is used in production under scope; Google is deliberately not claimed as live.
**Trade-off.** Slower than a button that just does it.

### 12. Print and PDF that match the screen

**Problem.** Charts in exports used dashed or thin lines that vanished in greyscale and drifted from the screen numbers.
**Decision.** Exports reuse the same data path and draw solid, distinguishable lines.
**Implementation.** Chart exports render from the same canonical series; all lines are solid 2 to 3 px; gaps stay gaps; tests check the export styling.
**Verified result.** Tests cover the export styling code path; the exports were checked by eye during release review.
**Trade-off.** Less styling freedom in print.

---

## What is not claimed

No claim of 100 % accuracy. Google writes are validate-only. The model is not fine-tuned. Surplus is not profit.
