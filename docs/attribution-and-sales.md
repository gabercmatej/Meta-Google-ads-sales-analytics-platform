# Attribution and sales

The hardest part of ad analytics is not charting spend; it is deciding what may honestly be called "a sale caused by an ad". This document describes the rules of the private application and the vocabulary that keeps them straight. The independent reference implementation is `packages/analytics-core` (`sources.ts`, `attribution.ts`).

See also [`diagrams/data-flow-reconciliation.md`](../diagrams/data-flow-reconciliation.md).

## Vocabulary: seven different things

| Term | Meaning | Where it comes from |
|---|---|---|
| Click | A person clicked an ad (link click vs all clicks differ) | Ad platform |
| Lead | A person submitted a form or showed interest | Lead form, spreadsheet, chatbot |
| Platform conversion | An event the platform itself counts (its own attribution window and model) | Ad platform |
| Order | A recorded order in the sales backend, paid or not | Sales backend |
| Confirmed paid order | An order with a paid financial status (a manually marked-paid order is tracked as such, not as bank-verified) | Sales backend |
| Source class | Which origin an order is assigned to for reporting | Internal classification |
| Verified attributable revenue | Revenue of a paid order with verifiable evidence linking it to a platform, campaign or ad | Internal linking |

These are never summed into one number. Meta "results" are a family (forms, landing page views, link clicks, purchases) and are reported by result type; Google conversions are not Meta leads and not paid orders.

## Order status and dates

- Only paid orders count as revenue. Unpaid and cancelled orders are visible as counts but not as revenue.
- The default time basis is the **order date**. The **payment date** is an explicit option, because the two can fall in different months. Views state which basis they use; the audit reports order-date vs payment-date differences as an intentional basis difference, not a defect.
- Duplicate order identifiers count once. An order without an amount counts as an order but contributes nothing to revenue.
- Manually marked-paid orders are eligible but labelled separately from bank-confirmed ones.

## Source classification versus paid attribution

Two different questions are answered by two different mechanisms.

**Source classification** ("where did this customer come from?") assigns every eligible paid order to exactly one class: Meta, Google, Chatbot/AI, Partner portal, Other verified, Unknown, or Conflicting. The classes sum exactly to the eligible orders and revenue; the reconciliation is tested and shown. Evidence has levels:

1. Platform-level label (for example a subject tag or a customer-source field)
2. Campaign
3. Ad group or ad
4. Verified paid order linked to a lead via a keyed-hash phone match, with the lead at or before the order and inside a 90-day window

Stronger evidence wins. Ambiguous phone matches are not used. Repeat orders of the same customer inherit evidence without chaining. A customer-source label applies only to a first order or one close to customer creation, and an order's own evidence always beats it. Unknown is never relabelled "organic". If one order carries both Meta and Google evidence, it is Conflicting and is excluded from both numerators and from ROAS.

**Paid attribution** ("which spend produced this revenue?") is stricter. Only orders with verifiable evidence enter a platform's ROAS numerator. Orders classified only by a customer-source label appear in the source split but are excluded from ROAS.

## Why a "Google" label is not a Google paid-ad sale

A customer-source value of "Google" or a "Google" tag says the person reported or was tagged as coming from Google. That can be a paid ad, organic search, a map listing or a brand search. Without a click identifier (gclid or similar) or UTM parameters captured on the website, the application cannot separate them. So:

- Google-labelled orders are shown in the source split.
- They are level 1 evidence only and are never distributed to individual Google campaigns.
- Google platform ROAS uses Google-tagged revenue over total Google Ads spend and is flagged accordingly.
- A designed future step is first-party click-identifier capture plus offline conversion upload. It is not implemented and would need explicit authorisation, because it sends data to a platform.

Meta is different only in that lead-form leads carry platform identifiers, so a verified lead-to-order link (level 4) is possible.

## Three totals on the sales view

| Total | Contains | Use |
|---|---|---|
| All sales | Every eligible paid order, every class | Business revenue picture |
| Selected-source subtotal | Meta + Google + Chatbot/AI classes only; Partner portal, Other verified, Unknown and Conflicting are excluded | Revenue from the sources the ad budget can influence, as a split by source |
| Strictly attributed | Orders with verified evidence feeding a platform ROAS | The only basis for ROAS |

The selected-source subtotal is a split by order source and explicitly not proven paid-ad attribution; its tooltip says so. All three are visible so none is mistaken for another.

## ROAS rules

- Meta ROAS: Meta-evidence revenue divided by Meta lead-campaign spend.
- Google ROAS: Google-tagged revenue divided by total Google Ads spend.
- Combined "attributable ROAS": the two revenues over the two spends, labelled attributable (not business ROAS) and shown only when both platforms' spend is complete for the period.
- Fewer than five orders sets a low-sample flag. Zero spend or zero orders yields no value, never a division.
- The chart value must equal the card value for the same period; otherwise the chart is hidden.
- Before direct-lead coverage begins, an order is "not verifiable", which is different from 0.

## VAT and result

The sales backend reports gross amounts. Net revenue is computed with a configurable VAT rate (round half up, per order). Ad spend is reported ex-VAT. "Surplus from selected sources" = selected-source revenue minus canonical Meta + Google spend. It is **not profit**: it ignores production cost, labour and tax effects, and the VAT caveat applies. Negative values are shown below zero; a day or month with incomplete spend is a gap. The previous efficiency ratio MER was removed from the interface in V4.6 because it mixed bases.

A separate payments view derives a waterfall from the payment processor (gross minus refunds minus fees), keeps unattributed account fees separate and undeducted, does not treat trialing subscriptions as revenue, and excludes internal test subscriptions by explicit identifier.

## Adapters for another CRM

The linking logic needs, per order: an identifier, an amount, a currency, a paid status, an order date, optionally a payment date, and optional evidence fields (a source label, a keyed contact hash, a lead identifier). Any CRM that can supply those can be mapped through an adapter that outputs the normalised order type. What does not transfer for free: your own status vocabulary, your own source taxonomy, and the legal basis for matching contacts. See [`adapting-to-another-business.md`](adapting-to-another-business.md).
