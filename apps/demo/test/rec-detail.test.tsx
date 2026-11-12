import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { entityPerformance, resolveShowcaseRange } from '@sedem-ads/analytics-core';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import RecommendationDetailPage from '../src/pages/RecommendationDetailPage';
import { getDataset } from '../src/lib/data';
import { buildRecommendations } from '../src/ai/recommendations';
import { entityDaily, findAnomalies, rollingRatio } from '../src/ai/recDetail';
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
});
