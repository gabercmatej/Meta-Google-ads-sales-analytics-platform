import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import { getDataset } from '../src/lib/data';
import OverviewPage from '../src/pages/OverviewPage';
import SalesPage from '../src/pages/SalesPage';
import AttributionPage from '../src/pages/AttributionPage';
import ComparisonPage from '../src/pages/ComparisonPage';

afterEach(cleanup);

function mount(path: string, element: React.ReactNode, routePath: string) {
  const router = createMemoryRouter([{ path: routePath, element }], { initialEntries: [path] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
  return router;
}

describe('analytics pages with the simulated dataset', () => {
  it('Overview renders KPIs, the surplus caveat and no MER', () => {
    mount('/overview', <OverviewPage />, '/overview');
    expect(screen.getAllByText('Spend').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Attributable ROAS').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('Surplus is not profit: revenue includes 22% VAT and excludes other costs');
    expect(document.body.textContent).not.toMatch(/\bMER\b/);
  });

  it('Sales reconciles parts to the total and keeps Unknown visible', () => {
    mount('/sales', <SalesPage />, '/sales');
    expect(document.body.textContent).toContain('Unknown');
    expect(document.body.textContent).toContain('Reconciliation');
    expect(document.body.textContent).not.toContain('do NOT equal');
    fireEvent.click(screen.getByRole('button', { name: 'Order date' }));
    expect(document.body.textContent).not.toContain('do NOT equal');
  });

  it('Attribution flags the Google label without evidence', () => {
    window.history.replaceState({}, '', '/attribution?period=custom&from=2025-10-01&to=2026-11-10');
    mount('/attribution', <AttributionPage />, '/attribution');
    expect(document.body.textContent).toContain('Google label, no evidence');
    expect(document.body.textContent).toMatch(/order ORD-\d+ is labelled Google without evidence/);
    expect(document.body.textContent).toContain('Verified attribution');
    fireEvent.change(screen.getByLabelText('Attribution status'), { target: { value: 'conflict' } });
    expect(document.body.textContent).toContain('Evidence for both');
    window.history.replaceState({}, '', '/');
  });

  it('Comparison preselects three ads and honours ?ads=', () => {
    mount('/compare', <ComparisonPage />, '/compare');
    expect(document.querySelectorAll('.cmp-card').length).toBe(3);
    cleanup();
    const ads = getDataset().ads.slice(0, 2).map((a) => a.id).join(',');
    mount('/compare?ads=' + ads, <ComparisonPage />, '/compare');
    expect(document.querySelectorAll('.cmp-card').length).toBe(2);
  });
});
