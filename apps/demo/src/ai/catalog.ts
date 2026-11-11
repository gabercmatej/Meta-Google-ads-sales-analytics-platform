import type { IntentId } from './types';

export interface IntentInfo {
  id: Exclude<IntentId, 'unsupported'>;
  label: string;
  example: string;
}

/** Fixed list of supported topics. Examples double as the suggested-question chips. */
export const INTENT_EXAMPLES: IntentInfo[] = [
  { id: 'help', label: 'What can you do', example: 'What can you do?' },
  { id: 'spend_summary', label: 'Spend and leads summary', example: 'Summarise spend and leads' },
  { id: 'platform_compare', label: 'Meta vs Google', example: 'Compare Meta and Google' },
  { id: 'best_campaign_cpl', label: 'Best campaign by CPL', example: 'Which campaign has the best CPL?' },
  { id: 'worst_campaign', label: 'Weakest campaign', example: 'Which campaign is performing worst?' },
  { id: 'cpl_rise', label: 'Why CPL changed', example: 'Why did CPL rise?' },
  { id: 'creative_fatigue', label: 'Creative fatigue', example: 'Are any creatives fatigued?' },
  { id: 'top_ads_ctr', label: 'Top ads by CTR', example: 'Which ads have the highest CTR?' },
  { id: 'budget_realloc', label: 'Budget reallocation', example: 'Where should I move budget?' },
  { id: 'lead_trend', label: 'Lead trend', example: 'How is lead volume trending?' },
  { id: 'sales_by_source', label: 'Sales by source', example: 'Show sales by source' },
  { id: 'attributable_roas', label: 'Attributable ROAS', example: 'What is the attributable ROAS?' },
  { id: 'surplus', label: 'Advertising surplus', example: 'What is the advertising surplus?' },
  { id: 'refunds', label: 'Refunds and cancellations', example: 'How many refunds and cancellations are there?' },
  { id: 'unknown_source', label: 'Unknown-source orders', example: 'How many orders have an unknown source?' },
  { id: 'google_label', label: 'Google label without evidence', example: 'Why are some Google-labelled orders not attributed?' },
  { id: 'data_quality', label: 'Data quality', example: 'Are there any data quality issues?' },
  { id: 'month_over_month', label: 'This month vs last month', example: 'Compare this month with the previous month' },
  { id: 'forecast', label: 'Forecast (not supported)', example: 'What will revenue be next month?' },
  { id: 'campaign_specific', label: 'One campaign', example: 'Tell me about Search | Brand Terms' },
  { id: 'compare_ads', label: 'Compare two ads', example: 'Compare the two best ads' },
  { id: 'how_attribution', label: 'How attribution works', example: 'How does attribution work here?' },
];
