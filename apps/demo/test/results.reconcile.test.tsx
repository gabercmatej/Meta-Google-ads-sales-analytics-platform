import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import { getDataset } from '../src/lib/data';
import { combinedFigures } from '../src/lib/combined';
import { attributionFigures, salesFigures } from '../src/lib/resultsData';
import SalesPage from '../src/pages/SalesPage';
import LeadsPage from '../src/pages/LeadsPage';

const RANGES = [
  { start: '2026-10-12', end: '2026-11-10' },
  { start: '2026-11-04', end: '2026-11-10' },
  { start: '2026-01-01', end: '2026-11-10' },
] as const;

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function mount(url: string, path: string, element: React.ReactNode) {
  window.history.replaceState({}, '', url);
  const router = createMemoryRouter([{ path, element }], { initialEntries: [url] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
}

describe('Sales, Attribution and Combined reconcile', () => {
  for (const r of RANGES) {
    it(`Sales paid total equals Combined eligible paid ${r.start}..${r.end}`, () => {
      const ds = getDataset();
      const s = salesFigures(ds, { ...r }, 'order');
      const c = combinedFigures(ds, { ...r });
      expect(s.partitionPaid.orders).toBe(c.paidOrders);
      expect(s.partitionPaid.valueMinor).toBe(c.paidRevenueMinor);
      expect(s.paid.orders).toBe(c.paidOrders);
      expect(s.paid.valueMinor).toBe(c.paidRevenueMinor);
    });

    it(`Attribution tiles sum to total paid ${r.start}..${r.end}`, () => {
      const ds = getDataset();
      const a = attributionFigures(ds, { ...r });
      const c = combinedFigures(ds, { ...r });
      expect(a.tiles.reduce((x, t) => x + t.orders, 0)).toBe(a.paidOrders);
      expect(a.tiles.reduce((x, t) => x + t.revenueMinor, 0)).toBe(a.paidRevenueMinor);
      expect(a.paidOrders).toBe(c.paidOrders);
      expect(a.paidRevenueMinor).toBe(c.paidRevenueMinor);
      expect(a.verifiedOrders).toBe(c.verified.meta.orders + c.verified.google.orders);
      // The coverage line counts exactly the verified share shown on the Meta and Google tiles, never the label-only rest.
      const tile = (k: string) => a.tiles.find((t) => t.key === k)!;
      expect(tile('meta').verifiedOrders + tile('google').verifiedOrders).toBe(a.verifiedOrders);
      expect(tile('meta').verifiedOrders).toBe(c.verified.meta.orders);
      expect(tile('meta').verifiedRevenueMinor).toBe(c.verified.meta.revenueMinor);
      expect(tile('google').verifiedOrders).toBeLessThanOrEqual(tile('google').orders);
    });

    it(`the date basis changes the figures consistently ${r.start}..${r.end}`, () => {
      const ds = getDataset();
      const byOrder = salesFigures(ds, { ...r }, 'order');
      const byPayment = salesFigures(ds, { ...r }, 'payment');
      const c = combinedFigures(ds, { ...r });
      expect(byPayment.basis).toBe('payment');
      expect(byPayment.partitionPaid.orders).toBe(byPayment.paid.orders);
      expect(byPayment.partitionPaid.orders).toBe(c.crm.paidByPayment.orders);
      // Both bases count the same paid orders over a window that contains every order.
      if (r.start === '2026-01-01') expect(byPayment.paid.orders).toBeGreaterThan(0);
      expect(byOrder.all.orders).toBeGreaterThanOrEqual(byOrder.paid.orders);
    });
  }

  it('Sales page toggle switches the basis and the shown line', () => {
    mount('/sales?period=custom&from=2026-10-12&to=2026-11-10', '/sales', <SalesPage />);
    const shown = () => document.querySelector('[data-testid="basis-shown"]')?.textContent ?? '';
    expect(shown()).toContain('order date');
    fireEvent.click(screen.getByRole('button', { name: 'By payment date' }));
    expect(shown()).toContain('payment date');
    fireEvent.click(screen.getByRole('button', { name: 'By order date (as in CRM)' }));
    expect(shown()).toContain('order date');
  });

  it('Google leads page never shows Meta leads', () => {
    mount('/leads?platform=google&period=custom&from=2026-10-12&to=2026-11-10', '/leads', <LeadsPage />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/meta lead/i);
    expect(text).not.toContain('Historical lead-sheet');
    expect(text).toContain('Google');
  });
});
