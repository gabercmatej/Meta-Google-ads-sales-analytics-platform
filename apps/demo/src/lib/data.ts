import { generateShowcaseDataset, type ShowcaseDataset } from '@sedem-ads/analytics-core';

let cached: ShowcaseDataset | null = null;

/** The one synthetic dataset for the whole demo. Generated once, in the browser, from a fixed seed. */
export function getDataset(): ShowcaseDataset {
  cached ??= generateShowcaseDataset();
  return cached;
}
