import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { entityPerformance, resolveShowcaseRange } from '@sedem-ads/analytics-core';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import RecommendationDetailPage from '../src/pages/RecommendationDetailPage';
import { getDataset } from '../src/lib/data';
import { buildRecommendations } from '../src/ai/recommendations';
import { entityDaily, findAnomalies, rollingDaily, rollingRatio, sparkFor } from '../src/ai/recDetail';
import { addDays } from '@sedem-ads/analytics-core';
import { money, count } from '../src/lib/format';

afterEach(cleanup);
const ds = getDataset();
const range = resolveShowcaseRange(ds, 'last30')!;

function mount(key: string) {
  const router = createMemoryRouter([{ path: '/recommendations/:recKey', element: <RecommendationDetailPage /> }], { initialEntries: [`/recommendations/${encodeURIComponent(key)}`] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
}

describe('recommendation detail', () => {
  const rec = buildRecommendations(ds, 'meta', range).items.find((r) => r.type === 'rising_cpl')!;

  it('evidence numbers equal the dataset values and all sections render', () => {
    mount(rec.key);
    const row = entityPerformance(ds, { level: 'campaign', view: 'meta', range }).find((r) => r.id === rec.entityId)!;
    const table = screen.getByTestId('rec-evidence');
    expect(within(table).getAllByText(money(row.current.cplMinor)).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(money(row.previous.cplMinor)).length).toBeGreaterThan(0);
    expect(within(table).getAllByText(count(row.current.leads)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('rec-peers')).toBeTruthy();
    expect(screen.getByTestId('rec-anomalies')).toBeTruthy();
    expect(screen.getByText('Simulated scenario — linear estimate, not a forecast')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ask assistant' })).toBeTruthy();
  });

  it('daily campaign totals add up to the period totals used by the rule', () => {
    const row = entityPerformance(ds, { level: 'campaign', view: 'meta', range }).find((r) => r.id === rec.entityId)!;
    const d = entityDaily(ds, rec, range);
    expect(d.spend.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(row.current.spendMinor);
    expect(d.leads.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(row.current.leads);
  });

  it('rolling ratio uses summed parts and a day without data is not zero; anomalies need 14 days', () => {
    expect(rollingRatio([10, null, 30], [2, null, 3], 3)).toEqual([5, 5, 8]);
    expect(rollingRatio([null], [null], 3)).toEqual([null]);
    expect(findAnomalies({ days: ['2026-01-01'], spend: [100], leads: [1], clicks: [1], impressions: [1] }, 'cpl')).toEqual([]);
  });

  it('first day of the period already uses a full 7-day window (6 days before the period + day 1)', () => {
    const r = rollingDaily(ds, rec, range);
    expect(r.days[0]).toBe(range.start);
    expect(r.days).toEqual(entityDaily(ds, rec, range).days);
    const before = entityDaily(ds, rec, { start: addDays(range.start, -6), end: range.start });
    expect(before.days).toHaveLength(7);
    const tot = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(r.cpl[0]).toBeCloseTo(tot(before.spend) / tot(before.leads), 10);
    expect(r.ctr[0]).toBeCloseTo(tot(before.clicks) / tot(before.impressions), 10);
    expect(r.leads7[0]).toBe(tot(before.leads));
    // Inside-period-only rolling would give day 1 alone — must differ from the full window here.
    const d1 = entityDaily(ds, rec, { start: range.start, end: range.start });
    expect(tot(before.leads)).toBeGreaterThan(tot(d1.leads));
    expect(sparkFor(ds, rec, range, null).current[0]).toBe(r.cpl[0]);
  });
});
