// Deterministic intent router: ordered, first match wins. No model involved.
import type { ShowcaseDataset } from '@sedem-ads/analytics-core';
import { matchCampaign } from './rules';
import type { IntentId } from './types';

export interface Route {
  intent: IntentId;
  matchedBy: string;
  /** Set for guard routes (unsupported topics). */
  reason?: string;
}

interface Rule {
  intent: IntentId;
  name: string;
  test: RegExp;
  reason?: string;
}

const GUARDS: Rule[] = [
  { intent: 'unsupported', name: 'guard:creative-writing', test: /\b(poem|poetry|joke|song|story|haiku|limerick|recipe|weather|translate)\b/, reason: 'creative writing and general knowledge are outside this demo' },
  { intent: 'unsupported', name: 'guard:competitors', test: /\b(competitor|competitors|competition|market share|industry average|benchmark|rival)\b/, reason: 'there is no competitor or market data in the dataset' },
  { intent: 'unsupported', name: 'guard:personal-data', test: /(@[a-z0-9-]+\.[a-z]{2,})|\b(e-?mail address|email address|phone number|home address|customer name|which customer|who bought|who is the customer|personal data|full name)\b/, reason: 'the demo never exposes personal customer data' },
  { intent: 'unsupported', name: 'guard:future-revenue', test: /\b(next (year|quarter|month|week)|in \d+ (months|years)|will (be|earn|make|reach)|predict|projection|project(ed)? revenue|expected revenue)\b.*\b(revenue|sales|income|profit)\b|\b(revenue|sales|income|profit)\b.*\b(next (year|quarter)|in \d+ (months|years))\b/, reason: 'there is no predictive model' },
];

const RULES: Rule[] = [
  { intent: 'help', name: 'help', test: /\b(help|what can you do|what do you do|capabilities|how do i use|what can i ask|who are you)\b/ },
  { intent: 'forecast', name: 'forecast', test: /\b(forecast|next month|next week|will (we|it|spend|leads)|predict|projection|expected)\b/ },
  { intent: 'google_label', name: 'google-label', test: /\bgoogle\b.*\b(label|labelled|labeled|tagged|reported)\b|\b(label|labelled|labeled)\b.*\bgoogle\b|\bwithout evidence\b|\bnot attributed\b/ },
  { intent: 'unknown_source', name: 'unknown-source', test: /\b(unknown source|unknown sources|unlinked|unattributed|no source|conflict|conflicting|cannot be linked|can't be linked|not linked)\b/ },
  { intent: 'how_attribution', name: 'how-attribution', test: /\bhow (does|do|is|are)\b.*\battribut|\battribution\b.*\b(work|works|method|rules|logic|explain)\b|\bexplain attribution\b/ },
  { intent: 'surplus', name: 'surplus', test: /\b(surplus|presežek|profit|margin)\b/ },
  { intent: 'refunds', name: 'refunds', test: /\b(refund|refunds|refunded|cancel|cancelled|canceled|cancellation|cancellations|return|returns|chargeback)\b/ },
  { intent: 'attributable_roas', name: 'roas', test: /\b(roas|return on ad|return on spend|attributable)\b/ },
  { intent: 'month_over_month', name: 'month-over-month', test: /\b(month over month|month-over-month|mom|(this|current) month\b.*\b(previous|last|prior) month|(previous|last|prior) month\b.*\b(this|current) month)\b|\bcompare\b.*\bmonth\b/ },
  { intent: 'budget_realloc', name: 'budget', test: /\b(budget|reallocat|reallocate|move money|shift (spend|money)|where should i (put|spend|move))\b/ },
  { intent: 'creative_fatigue', name: 'fatigue', test: /\b(fatigue|fatigued|tired creative|creatives? (are|is) tired|tired|wearing out|worn out|stale (ad|creative)|creative decay)\b/ },
  { intent: 'cpl_rise', name: 'cpl-change', test: /\b(why|reason|explain|cause)\b.*\b(cpl|cost per lead)\b|\b(cpl|cost per lead)\b.*\b(rise|rose|risen|increase|increased|up|higher|worse|drop|dropped|fall|fell|change|changed)\b/ },
  { intent: 'compare_ads', name: 'compare-ads', test: /\bcompare\b.*\b(ads?|creatives?)\b|\bad (a|vs|versus)\b|\b(two|2) (best )?ads\b/ },
  { intent: 'top_ads_ctr', name: 'top-ads-ctr', test: /\b(ctr|click[- ]through)\b.*\b(ads?|creatives?)\b|\b(ads?|creatives?)\b.*\b(ctr|click[- ]through|best|top|strongest)\b|\btop ads\b|\bbest ads?\b/ },
  { intent: 'platform_compare', name: 'platform-compare', test: /\b(meta|facebook)\b.*\b(vs|versus|or|and|against|compare)\b.*\bgoogle\b|\bgoogle\b.*\b(vs|versus|or|and|against)\b.*\b(meta|facebook)\b|\bcompare platforms?\b|\bwhich platform\b/ },
  { intent: 'worst_campaign', name: 'worst-campaign', test: /\b(worst|weakest|poorest|underperform\w*|least efficient|most expensive|highest cpl|struggling|bad)\b.*\bcampaigns?\b|\bcampaigns?\b.*\b(worst|weakest|poorest|underperform\w*|least efficient|most expensive|highest cpl|performing worst)\b/ },
  { intent: 'best_campaign_cpl', name: 'best-campaign', test: /\b(best|strongest|top|most efficient|cheapest|lowest cpl|lowest cost|lowest cost per lead)\b.*\b(campaigns?|cpl)\b|\bcampaigns?\b.*\b(best|cpl|cheapest|efficient|lowest cost|cost per lead)\b/ },
  { intent: 'sales_by_source', name: 'sales-by-source', test: /\b(sales|orders|revenue)\b.*\b(source|sources|channel|by source)\b|\b(source|sources|channel)\b.*\b(sales|orders|revenue)\b|\bby source\b/ },
  { intent: 'lead_trend', name: 'lead-trend', test: /\b(lead|leads)\b.*\b(trend|trending|volume|over time|growing|growth|declin\w*|going)\b|\btrend\b.*\bleads?\b|\b(week over week|week-over-week|wow|weekly|by week|per week|each week|week by week)\b/ },
  { intent: 'data_quality', name: 'data-quality', test: /\b(data quality|missing (data|days?)|data issues?|data gaps?|sync|stale data|incomplete|data problems?|data coverage)\b|\bany issues\b/ },
  { intent: 'spend_summary', name: 'summary', test: /\b(summar\w*|overview|spend|spent|how much|performance|kpis?|totals?|how are we doing|leads|cpl|ctr|cpc)\b/ },
];

const CAMPAIGN_ASK = /\b(tell me about|details (of|about|for)|campaign)\b/;

export function routeQuestion(q: string, ds: ShowcaseDataset): Route {
  for (const g of GUARDS) if (g.test.test(q)) return { intent: g.intent, matchedBy: g.name, reason: g.reason };
  // A campaign named in the question wins over generic topics (but not over help).
  const named = matchCampaign(q, ds) !== undefined;
  if (named && !/\bcompare\b.*\bads?\b/.test(q)) return { intent: 'campaign_specific', matchedBy: 'campaign-name' };
  for (const r of RULES) if (r.test.test(q)) return { intent: r.intent, matchedBy: r.name };
  if (CAMPAIGN_ASK.test(q) && named) return { intent: 'campaign_specific', matchedBy: 'campaign-ask' };
  return { intent: 'unsupported', matchedBy: 'no-match', reason: 'the question does not match any supported topic' };
}
