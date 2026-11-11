import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TimeSeriesChart, type ChartRow, type ChartSeries } from '../src/components/charts/TimeSeriesChart';

afterEach(cleanup);

const series: ChartSeries[] = [{ key: 'v', label: 'Spend', color: '#4f46e5', format: (n) => `${n}` }];
const base = { series, yFormat: (n: number) => `${n}`, ariaLabel: 'Spend by day', fixedWidth: 600, height: 240 };

describe('TimeSeriesChart', () => {
  it('renders with null gaps without treating them as zero', () => {
    const data: ChartRow[] = [
      { key: '2026-11-01', label: '1 Nov', v: 10 },
      { key: '2026-11-02', label: '2 Nov', v: null },
      { key: '2026-11-03', label: '3 Nov', v: 30 },
    ];
    const { container } = render(<TimeSeriesChart {...base} data={data} />);
    expect(container.querySelector('.chart-empty')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows an explicit no-data state when every value is null', () => {
    const data: ChartRow[] = [
      { key: '2026-11-01', label: '1 Nov', v: null },
      { key: '2026-11-02', label: '2 Nov', v: null },
    ];
    render(<TimeSeriesChart {...base} data={data} />);
    expect(screen.getByRole('img', { name: /no data for this period/ })).toBeTruthy();
  });
});
