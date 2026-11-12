import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { generateShowcaseDataset } from '@sedem-ads/analytics-core';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import DataSourcesPage from '../src/pages/DataSourcesPage';

// Opt-in variant: the dataset with deliberately planted gap days, to keep coverage of the gap display.
vi.mock('../src/lib/data', () => {
  const ds = generateShowcaseDataset({ plantedGaps: true });
  return { getDataset: () => ds };
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('DataSourcesPage with planted gaps', () => {
  it('lists the planted gap days with their reason', () => {
    const url = '/sources?period=custom&from=2026-09-01&to=2026-11-10';
    window.history.replaceState({}, '', url);
    const router = createMemoryRouter([{ path: '/sources', element: <DataSourcesPage /> }], { initialEntries: [url] });
    render(
      <AppStateProvider>
        <SimProvider>
          <RouterProvider router={router} />
        </SimProvider>
      </AppStateProvider>,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('Missing');
    expect(text).toContain('Source error');
  });
});
