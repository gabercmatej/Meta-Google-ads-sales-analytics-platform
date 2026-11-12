// Deterministic, synthetic change-log history shown before any in-session action. Derived from the synthetic
// dataset (reference instant and campaign names); the people are fictional. Nothing here was ever applied anywhere.
import type { ShowcaseDataset } from '@sedem-ads/analytics-core';
import type { ActivityEntry } from '../sim/contract';

type Seed = Omit<ActivityEntry, 'seq' | 'at'> & { daysAgo: number; hhmm: string };

const ACTORS = { ana: 'Ana Example (Ad editor)', marko: 'Marko Sample (Ad editor)', lena: 'Lena Demo (Administrator)', system: 'Scheduled job' } as const;

const SYN = 'Synthetic history.';

export function seedActivity(ds: ShowcaseDataset): ActivityEntry[] {
  const meta = ds.campaigns.filter((c) => c.platform === 'meta');
  const google = ds.campaigns.filter((c) => c.platform === 'google');
  const m = (i: number) => meta[i % Math.max(1, meta.length)];
  const g = (i: number) => google[i % Math.max(1, google.length)];
  const refresh = (daysAgo: number, hhmm: string, name: string, platform: 'meta' | 'google' | null, detail: string): Seed => ({
    daysAgo,
    hhmm,
    actor: ACTORS.system,
    platform,
    action: 'Refresh data',
    entityId: null,
    entityName: name,
    detail: `${detail} ${SYN}`,
    outcome: 'synthetic_history',
  });
  const entry = (daysAgo: number, hhmm: string, actor: string, platform: 'meta' | 'google' | null, action: string, entityId: string | null, entityName: string | null, detail: string): Seed => ({
    daysAgo,
    hhmm,
    actor,
    platform,
    action,
    entityId,
    entityName,
    detail: `${detail} ${SYN}`,
    outcome: 'synthetic_history',
  });
  const seeds: Seed[] = [
    refresh(0, '07:02', 'Meta Ads', 'meta', "Scheduled refresh stored yesterday's rows; no gaps."),
    refresh(0, '07:04', 'Google Ads', 'google', "Scheduled refresh stored yesterday's rows; no gaps."),
    entry(1, '15:41', ACTORS.ana, 'meta', 'Change budget', m(0)?.id ?? null, m(0)?.name ?? null, 'Daily budget EUR 40.00 → EUR 45.00. Previewed, confirmed, read back.'),
    entry(2, '10:18', ACTORS.marko, 'google', 'Save draft', null, 'Search | Seasonal Offer', 'Saved locally as a draft. Nothing was sent.'),
    refresh(2, '07:03', 'Meta Ads', 'meta', "Scheduled refresh stored yesterday's rows."),
    entry(3, '16:05', ACTORS.ana, 'meta', 'Pause ad set', null, `${m(2)?.name ?? 'Campaign'} / Ad set 2`, 'Status ACTIVE → PAUSED. Cost per lead above the rule threshold for 7 days.'),
    entry(4, '09:30', ACTORS.lena, null, 'Change role', null, ACTORS.marko, 'Viewer → Ad editor.'),
    refresh(5, '12:01', 'Payments', null, 'Midday refresh stored new paid and refunded orders.'),
    entry(6, '11:12', ACTORS.marko, 'google', 'Change budget', g(0)?.id ?? null, g(0)?.name ?? null, 'Daily budget EUR 25.00 → EUR 30.00. Validated only, never applied to Google.'),
    entry(8, '14:47', ACTORS.ana, 'meta', 'Create campaign (PAUSED)', null, 'Retargeting | Warm audience', 'Created in PAUSED state with 1 ad set and 2 ads. Activation is a separate confirmed action.'),
    refresh(9, '07:02', 'Lead sheet', null, 'Scheduled refresh stored new lead rows.'),
    entry(10, '17:20', ACTORS.ana, 'meta', 'Resume campaign', m(5)?.id ?? null, m(5)?.name ?? null, 'Status PAUSED → ACTIVE after confirmation.'),
    entry(12, '08:55', ACTORS.system, null, 'Import CSV', null, 'Meta Ads', 'Imported 6 gap days from a CSV export; checked against the API totals.'),
    entry(14, '13:36', ACTORS.marko, 'meta', 'Pause campaign', m(2)?.id ?? null, m(2)?.name ?? null, 'Status ACTIVE → PAUSED. Test ended.'),
    entry(16, '10:02', ACTORS.lena, null, 'Dismiss recommendation', null, 'Review creative fatigue', 'Dismissed by an administrator; no change was made.'),
    refresh(18, '07:03', 'CRM', null, 'Scheduled refresh stored new customers and orders.'),
    entry(20, '15:10', ACTORS.ana, 'meta', 'Edit ad copy', null, `${m(0)?.name ?? 'Campaign'} / Creative A`, 'Headline updated; new ad version created in PAUSED state.'),
    entry(23, '09:41', ACTORS.marko, 'google', 'Pause campaign', g(2)?.id ?? null, g(2)?.name ?? null, 'Status ENABLED → PAUSED. Validated only, never applied to Google.'),
    entry(27, '16:28', ACTORS.lena, null, 'Change role', null, ACTORS.ana, 'Ad editor → Administrator.'),
    entry(30, '11:50', ACTORS.ana, 'meta', 'Change budget', m(1)?.id ?? null, m(1)?.name ?? null, 'Daily budget EUR 20.00 → EUR 24.00. Previewed, confirmed, read back.'),
  ];
  const ref = Date.parse(ds.referenceNow);
  return seeds.map((s, i) => {
    const { daysAgo, hhmm, ...rest } = s;
    const day = new Date(ref - daysAgo * 86_400_000).toISOString().slice(0, 10);
    // Fixed wall times treated as UTC+1; display only.
    const at = new Date(Date.parse(`${day}T${hhmm}:00Z`) - 3_600_000).toISOString();
    return { ...rest, at, seq: -(i + 1) };
  });
}
