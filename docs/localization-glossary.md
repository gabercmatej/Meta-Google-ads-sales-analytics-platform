# Localization glossary (Slovenian to English)

Used to port the production UI vocabulary to the English Phase 2 demo. Terms are UI vocabulary only; no data. Entries marked (verified) were read in the private UI source; (proposed) are translations chosen for this showcase where the original is longer or context-specific.

## Formatting decisions

| Topic | Decision |
|---|---|
| Locale | **en-IE** for number and date formatting (`Intl` with `en-IE`). Rationale: it gives euro-native formatting (symbol before amount, comma thousands, dot decimal), day-first dates that match the Slovenian source habit, and a 24-hour clock, without implying a UK or US business. en-GB would also work; en-IE is chosen because EUR is the currency. The decision lives in one constant so it can be swapped. |
| Currency | EUR, symbol before the amount, two decimals for money (`EUR 1,234.50` rendered as the euro sign form `€1,234.50`). Money is stored as integer minor units (cents) and formatted only at the edge. |
| Integers | Thousands separator comma. Percentages one decimal. Ratios (ROAS) two decimals with an "x" suffix, for example `2.40x`. |
| Dates | Day-first with a short month name: `14 Mar 2026`. Axis ticks: `14 Mar`; monthly axis: `Mar 2026`. ISO `YYYY-MM-DD` in URLs and exports. |
| Timezone | The advertising day is interpreted in a single fixed account timezone. The demo labels it "Account timezone: Europe/Ljubljana (demo)" in headers; events are stored in UTC. Daylight-saving boundaries must be covered by tests. |
| Missing values | "-" with a tooltip "No data", never `0`. |
| Placeholder names | All demo entities carry obviously synthetic names (see `demo-plan.md`). |

## Navigation and sections

| Slovenian | English |
|---|---|
| Pregled | Overview |
| Skupni pregled / Skupaj | Combined overview |
| Google pregled | Google overview |
| Kampanje in oglasi | Campaigns and ads |
| Ustvari oglas / Nov oglas | Create ad / New ad |
| Osnutki / Osnutki oglasov | Drafts / Ad drafts |
| Prodaja | Sales |
| Leadi | Leads |
| Atribucija / Skupna atribucija prodaje | Attribution / Sales attribution |
| Primerjava oglasov | Ad comparison |
| AI pomočnik | AI assistant |
| Priporočila | Recommendations |
| Viri podatkov | Data sources |
| Dnevnik sprememb | Change log |
| Uporabniki | Users |
| Nastavitve kampanj | Campaign settings |
| Rezultati (group) | Results |
| Sistem (group) | System |
| Prijava | Sign in |

## Roles

| Slovenian | English |
|---|---|
| Pregledovalec | Viewer |
| Urednik oglasov | Ad editor |
| Skrbnik | Admin |
| Ni dostopa | No access |

## Period and filters

| Slovenian | English |
|---|---|
| Danes | Today |
| Včeraj | Yesterday |
| 7 dni / 14 dni / 30 dni / 90 dni | 7 days / 14 days / 30 days / 90 days |
| Ta mesec | This month |
| Prejšnji mesec | Last month |
| Letos | This year |
| Po meri | Custom |
| Od / Do | From / To |
| Dnevno / Mesečno | Daily / Monthly |
| Produkt | Product |
| Rezultat | Result |
| Raven | Level |
| Kampanje / Nabori oglasov / Oglasi | Campaigns / Ad sets / Ads |
| Način poročanja | Reporting mode |
| Po datumu naročila | By order date |
| Kohorta leadov | Lead cohort |
| Zgodovinski (Excel + Meta) | Historical (spreadsheet + Meta) |

## KPIs and metrics

| Slovenian | English |
|---|---|
| Poraba | Spend |
| Prikazi | Impressions |
| Doseg | Reach |
| Kliki / Kliki na povezavo | Clicks / Link clicks |
| CTR | CTR |
| CPC | CPC |
| CPM | CPM |
| Frekvenca | Frequency |
| Rezultati | Results |
| Cena na rezultat | Cost per result |
| Obrazci / Obiski / Kliki / Nakupi | Forms / Visits / Clicks / Purchases |
| Konverzije (Google) | Conversions (Google) |
| Cena na konverzijo | Cost per conversion |
| Vsa naročila | All orders |
| Plačana naročila | Paid orders |
| Naročena vrednost (vsa naročila) | Ordered value (all orders) |
| ni zbrani prihodek | not collected revenue |
| Plačano (označeno v Crosstyju) | Paid (as marked in the sales backend) |
| z DDV, ni bančno preverjeno | incl. VAT, not bank-verified |
| Povprečna vrednost naročila | Average order value |
| Excel leadi | Imported leads |
| Prodani (operater) | Sold (operator) |
| Konverzija | Conversion |
| Plačujoče stranke | Paying customers |
| Zaslužek strank | Customer revenue |
| Cena / plačujočo stranko | Cost per paying customer |
| CPL (Meta) | Cost per lead (Meta) |
| Ocen. ROAS | Est. ROAS |
| Pripisljivi ROAS | Attributable ROAS |
| Skupni (ROAS) | Combined |
| Presežek (oglaševalski) | Advertising surplus |
| MER | (removed in V4.6; not present in the demo) |

## Chart titles and blocks

| Slovenian | English |
|---|---|
| Plačana prodaja po dnevih | Paid sales by day |
| Vsa naročila po statusu | All orders by status |
| Vir naročila | Order source |
| Storitve | Services |
| Excel leadi po dnevih | Imported leads by day |
| Prodani leadi (operater) po dnevih | Sold leads (operator) by day |
| Po naborih oglasov | By ad set |
| Tema | Topic |
| Primerjava kampanj | Campaign comparison |
| Kampanje, skupine oglasov, oglasi | Campaigns, ad groups, ads |
| Konverzijska dejanja (definicije Googla) | Conversion actions (Google's definitions) |
| Povezava z Meta | Link to Meta |
| Excel povezava | Verified lead-record link |
| Samo oznaka FB lead | Subject-line tag only |
| Brez povezave | Not linked |
| Kako je izračunano | How it is calculated |
| Zakaj to obstaja | Why this exists |
| Pred / Predlagano / Po | Before / Proposed / After |

## Sources (generic categories only)

| Slovenian / production | English |
|---|---|
| Meta | Meta |
| Google | Google |
| Chatbot / AI | Chatbot/AI |
| Partner portal (named in production) | Partner portal |
| Drug preverjen vir | Other verified |
| Neznano | Unknown |
| Neskladen dokaz | Conflicting evidence |
| Izbrani viri | Selected sources |

The real partner portal must never be named; the demo always writes "Partner portal".

## Delivery statuses

| Slovenian | English |
|---|---|
| Aktivno | Active |
| Učenje | Learning |
| Učenje omejeno | Learning limited |
| V pregledu | In review |
| Zavrnjeno | Rejected |
| S težavami | With issues |
| Zaustavljeno | Paused |
| Kampanja zaustavljena | Campaign paused |
| Nabor zaustavljen | Ad set paused |
| Končano | Completed |
| Načrtovano | Scheduled |
| Ne dostavlja | Not delivering |
| Arhivirano | Archived |
| Izbrisano | Deleted |
| Neznano | Unknown |

## Performance verdicts

| Slovenian | English |
|---|---|
| Premalo podatkov | Not enough data |
| Brez rezultatov | No results |
| Premalo rezultatov | Not enough results |
| Brez primerjave | No comparison |
| Poraba X brez rezultata v obdobju | Spend X with no result in the period |
| Za primerjavo je treba vsaj N vrstnikov | At least N peers are needed for comparison |
| Notranja ocena pripravljenosti (hevristika, ne Metina ocena) | Internal readiness estimate (heuristic, not a Meta score) |

## Source health statuses

| Slovenian | English | Explanation (English) |
|---|---|---|
| Povezano | Connected | Last sync succeeded and data is fresh. |
| Zastarelo | Stale | Connection works but the last successful sync is old; shows the state at last sync. |
| Še ni zajeto | Not yet synced | Source configured but no sync has succeeded. There is no data; this is not zero. |
| Manjkajo nastavitve | Configuration missing | The app lacks settings for this source. |
| Prijava zavrnjena | Sign-in rejected | The source rejected the credentials. |
| Ni pravic | No permission | The account may not read this data. |
| Omejitev klicev | Rate limited | The source temporarily limited calls. |
| Nedosegljivo | Unreachable | The last attempt did not reach the source. |
| Napaka vira | Source error | The last attempt failed; existing data is unchanged (an error is not zero spend). |
| Samo ročni uvoz | Manual import only | No automatic transfer; data is from a manual import. |
| Demo podatki | Demo data | Invented demonstration data. |

## Buttons and actions

| Slovenian | English |
|---|---|
| Potrdi | Confirm |
| Prekliči | Cancel |
| Zapri | Close |
| Shrani osnutek | Save draft |
| Odpri kot osnutek | Open as draft |
| Zavrni / Opusti | Dismiss |
| Odlog | Snooze |
| Zaustavi | Pause |
| Zaženi | Resume |
| Uredi proračun | Edit budget |
| Primerjaj | Compare |
| Povečaj | Expand |
| Natisni | Print |
| Izvozi PDF | Export PDF |
| Osveži | Refresh |
| Aktiviraj | Activate |
| Predogled | Preview |
| Preveri (validate) | Validate |
| Nov oglas | New ad |

## Tooltips and notes (proposed English wording)

| Context | English |
|---|---|
| Missing value | No data for this day. This is not zero. |
| Partial day | Today is not complete; value may still change. |
| Surplus | Advertising surplus is not accounting profit. Revenue includes VAT; spend excludes VAT. |
| Attribution | Shown only where a verifiable link exists. Unlinked sales stay unlinked. |
| Meta results | Result types are shown separately and are never added together. |
| Readiness | Internal estimate, not a Meta score. |
| Paid | Marked as paid in the sales backend. Not bank-verified. |

## Audit statuses

| Status | Meaning |
|---|---|
| PASS | Values agree across the compared views. |
| FAIL | A real discrepancy. |
| PARTIAL | A difference that has an explanation; carries a category. |
| A | Intentionally different basis (for example different date rule). |
| B | Source limitation. |
| C | Missing evidence. |
| D | Real error. |

## Error, empty and system states

| Slovenian | English |
|---|---|
| Ni podatka | No data |
| Še ni zajetih podatkov | No data captured yet |
| Ni osnutkov | No drafts |
| Ni podatkov o kampanjah | No campaign data |
| Ni dostopa | No access |
| Demonstracijski način | Demonstration mode |
| Ni prebranega stanja po spremembi | No read-back state after the change |
| Napaka vira | Source error |
| Samo branje | Read-only |
| Samo preverjanje (validate-only) | Validate-only |
| Testirano z mocki | Tested with mocks |
| Simulirano: noben oglaševalski račun ni bil spremenjen | Simulated: no advertising account was changed |
| Ustvarjeno kot zaustavljeno (PAUSED) | Created paused |
| Aktivacija je ločeno potrjeno dejanje | Activation is a separate confirmed action |
| Nepovezana prodaja ostane nepovezana | Unlinked sales stay unlinked |

## Demo-only strings

- Persistent banner: "DEMO DATA - NOT REAL BUSINESS RESULTS".
- Assistant label: "Interactive demo assistant - simulated analytical responses".
- Write confirmation: "Simulated - no advertising account was changed".
- Footer: "Independent reference implementation. Synthetic data."

## Rules for translators and reviewers

1. Never translate a data value; no demo string may contain a real name, ID or number from production.
2. Keep "No data" distinct from "0" and from an error state.
3. Use "advertising surplus", never "profit".
4. Use "Partner portal" for the real portal; never name it.
5. Do not use the words "100 %" or "guaranteed" about accuracy.
