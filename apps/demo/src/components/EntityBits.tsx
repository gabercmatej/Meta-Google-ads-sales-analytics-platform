import type { EntityPerformanceRow, Platform, ShowcaseEntityStatus } from '@sedem-ads/analytics-core';
import { Badge, StatusPill } from './ui';
import { change } from '../lib/format';

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <Badge tone={platform}>{platform === 'meta' ? 'Meta' : 'Google'}</Badge>;
}

export function StatusBadge({ status }: { status: ShowcaseEntityStatus }) {
  return <StatusPill status={status} />;
}

/** Strong / weak performance hint and creative-fatigue hint. */
export function HintBadges({ row }: { row: Pick<EntityPerformanceRow, 'tier' | 'fatigued'> }) {
  return (
    <>
      {row.tier === 'strong' && <Badge tone="good" title="Performance tier in the synthetic data: strong">Strong</Badge>}
      {row.tier === 'weak' && <Badge tone="bad" title="Performance tier in the synthetic data: weak. Worth reviewing.">Needs attention</Badge>}
      {row.fatigued && <Badge tone="warn" title="Performance decays the longer this ad runs (simulated creative fatigue)">Fatigue</Badge>}
    </>
  );
}

/** Relative change; for cost metrics a decrease is good. */
export function ChangeText({ value, lowerIsBetter }: { value: number | null; lowerIsBetter?: boolean }) {
  if (value === null) return <span className="no-data" title="No previous-period data to compare">–</span>;
  const good = value === 0 ? null : lowerIsBetter ? value < 0 : value > 0;
  return <span className={good === null ? 'text-ink-3' : good ? 'font-semibold text-positive' : 'font-semibold text-negative'}>{change(value)}</span>;
}

export const OBJECTIVE_LABEL: Record<string, string> = { LEADS: 'Leads', TRAFFIC: 'Traffic', SALES: 'Sales', AWARENESS: 'Awareness' };
export const CHANNEL_LABEL: Record<string, string> = { SEARCH: 'Search', DISPLAY: 'Display', PERFORMANCE_MAX: 'Performance Max' };
