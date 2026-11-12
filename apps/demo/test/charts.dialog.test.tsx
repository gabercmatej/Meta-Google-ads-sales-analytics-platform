import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { metricSeries } from '@sedem-ads/analytics-core';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import { getDataset } from '../src/lib/data';
import CombinedOverviewPage from '../src/pages/CombinedOverviewPage';
import { pdfFileName, pdfText } from '../src/lib/chartPdf';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

function mount() {
  window.history.replaceState({}, '', '/combined?period=last90');
  const router = createMemoryRouter([{ path: '/combined', element: <CombinedOverviewPage /> }], { initialEntries: ['/combined?period=last90'] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
}

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Expand chart: Daily spend by platform' }));
  return screen.getByRole('dialog', { name: 'Daily spend by platform' });
};

describe('expanded chart dialog', () => {
  it('opens with the calculation note and actions, and closes with Close and Esc', () => {
    mount();
    const dlg = open();
    expect(within(dlg).getByText('How it is calculated')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Save PDF' })).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Print' })).toBeTruthy();
    fireEvent.click(within(dlg).getAllByRole('button', { name: 'Close' })[0]!);
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Monthly toggle in the dialog changes granularity', () => {
    mount();
    const dlg = open();
    const group = within(dlg).getByRole('group', { name: 'Show chart by day or month' });
    expect(within(group).getByRole('button', { name: 'Daily' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'Monthly' }));
    expect(within(group).getByRole('button', { name: 'Monthly' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByRole('dialog')).getAllByRole('columnheader').some((h) => h.textContent === 'Month')).toBe(true);
  });

  it('legend toggle hides a series everywhere (table column too)', () => {
    mount();
    const dlg = open();
    const legend = within(dlg).getByRole('list', { name: 'Legend' });
    const google = within(legend).getByRole('button', { name: /Google/ });
    expect(google.getAttribute('aria-pressed')).toBe('true');
    expect(within(dlg).getAllByRole('columnheader').some((h) => /Google/.test(h.textContent ?? ''))).toBe(true);
    fireEvent.click(google);
    const after = within(screen.getByRole('dialog'));
    expect(after.getByRole('button', { name: /Google/ }).getAttribute('aria-pressed')).toBe('false');
    expect(after.getAllByRole('columnheader').some((h) => /Google/.test(h.textContent ?? ''))).toBe(false);
  });
});

describe('PDF export', () => {
  it('builds the file name from title and period', () => {
    expect(pdfFileName('Daily spend by platform', '2026-08-13', '2026-11-10')).toBe('Sedem-Ads-Daily-spend-by-platform-2026-08-13-2026-11-10.pdf');
    expect(pdfFileName('Clicks and CTR', '2026-01-01', '2026-01-31')).toBe('Sedem-Ads-Clicks-and-CTR-2026-01-01-2026-01-31.pdf');
  });

  it('keeps PDF text inside Helvetica (no euro sign or typographic dashes)', () => {
    expect(pdfText('€1,234.50 – total')).toBe('1,234.50 EUR - total');
  });

  it('Save PDF calls the PDF builder and downloads the right file name (jspdf mocked)', async () => {
    const downloads: string[] = [];
    const text = vi.fn();
    class FakeDoc {
      setFont = vi.fn();
      setFontSize = vi.fn();
      setTextColor = vi.fn();
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      line = vi.fn();
      addPage = vi.fn();
      text = text;
      getTextWidth = () => 10;
      splitTextToSize = (s: string) => [s];
      output = () => new Blob(['pdf'], { type: 'application/pdf' });
    }
    vi.doMock('jspdf', () => ({ jsPDF: FakeDoc }));
    vi.doMock('svg2pdf.js', () => ({ svg2pdf: vi.fn(async () => undefined) }));
    vi.resetModules();
    const { saveChartPdf } = await import('../src/lib/chartPdf');
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = orig(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = () => downloads.push((el as HTMLAnchorElement).download);
      return el;
    }) as typeof document.createElement);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    const name = await saveChartPdf({
      title: 'Daily spend by platform',
      from: '2026-08-13',
      to: '2026-11-10',
      periodText: '13 Aug 2026 – 10 Nov 2026',
      scope: 'Meta + Google',
      granularity: 'Daily',
      howCalculated: 'x',
      series: [{ label: 'Meta', color: '#2563eb' }],
      rows: [['2026-11-10', '€10.00']],
      svg: null,
    });
    expect(name).toBe('Sedem-Ads-Daily-spend-by-platform-2026-08-13-2026-11-10.pdf');
    expect(downloads).toEqual([name]);
    expect(text.mock.calls.some((c) => String(c[0]).includes('Synthetic demo data'))).toBe(true);
    vi.doUnmock('jspdf');
    vi.doUnmock('svg2pdf.js');
  });
});

describe('monthly aggregation', () => {
  it('monthly spend equals the sum of its daily values and CTR comes from summed clicks and impressions', () => {
    const ds = getDataset();
    const range = { start: '2026-08-01', end: '2026-10-31' };
    const daily = metricSeries(ds, { metric: 'spend', range, granularity: 'daily' });
    const monthly = metricSeries(ds, { metric: 'spend', range, granularity: 'monthly' });
    expect(monthly.length).toBe(3);
    for (const m of monthly) {
      const days = daily.filter((d) => d.key.startsWith(m.key));
      expect(m.meta).toBe(days.reduce((a, d) => a + (d.meta ?? 0), 0));
    }
    const clicks = metricSeries(ds, { metric: 'clicks', range, granularity: 'monthly' });
    const imps = metricSeries(ds, { metric: 'impressions', range, granularity: 'monthly' });
    const ctr = metricSeries(ds, { metric: 'ctr', range, granularity: 'monthly' });
    ctr.forEach((p, i) => {
      const c = clicks[i]!.meta;
      const im = imps[i]!.meta;
      if (p.meta != null && c != null && im) {
        const expected = c / im;
        expect(Math.abs(p.meta - expected) < 1e-6 || Math.abs(p.meta - expected * 100) < 1e-4).toBe(true);
      }
    });
  });
});
