import type { Draft } from './simCore';

export type DraftErrors = Partial<Record<'campaignName' | 'dailyBudget' | 'adName' | 'headline' | 'primaryText' | 'callToAction' | 'finalUrl', string>>;

export const MIN_DAILY_BUDGET_MINOR = 500;
export const MAX_DAILY_BUDGET_MINOR = 100_000;
export const URL_PREFIX = 'https://example.com';

export function isAllowedUrl(url: string): boolean {
  return url === URL_PREFIX || url.startsWith(`${URL_PREFIX}/`);
}

/** Field validation for a campaign (+ optional ad) before it can be created. */
export function validateDraft(d: Pick<Draft, 'campaignName' | 'dailyBudgetMinor' | 'includeAd' | 'adName' | 'creative'>): DraftErrors {
  const e: DraftErrors = {};
  if (d.campaignName.trim() === '') e.campaignName = 'Campaign name is required.';
  else if (d.campaignName.length > 120) e.campaignName = 'Use at most 120 characters.';
  if (d.dailyBudgetMinor === null || !Number.isFinite(d.dailyBudgetMinor)) e.dailyBudget = 'Enter a daily budget in EUR.';
  else if (d.dailyBudgetMinor < MIN_DAILY_BUDGET_MINOR) e.dailyBudget = 'Minimum daily budget is €5.00.';
  else if (d.dailyBudgetMinor > MAX_DAILY_BUDGET_MINOR) e.dailyBudget = 'Maximum daily budget in this demo is €1,000.00.';
  if (d.includeAd) {
    if (d.adName.trim() === '') e.adName = 'Ad name is required.';
    if (d.creative.headline.trim() === '') e.headline = 'Headline is required.';
    else if (d.creative.headline.length > 60) e.headline = 'Use at most 60 characters.';
    if (d.creative.primaryText.trim() === '') e.primaryText = 'Primary text is required.';
    else if (d.creative.primaryText.length > 300) e.primaryText = 'Use at most 300 characters.';
    if (d.creative.callToAction.trim() === '') e.callToAction = 'Choose a call to action.';
    if (!isAllowedUrl(d.creative.finalUrl)) e.finalUrl = 'In this demo the final URL must start with https://example.com/';
  }
  return e;
}
