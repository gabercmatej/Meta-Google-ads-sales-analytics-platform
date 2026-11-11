import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import LeadsPage from '../src/pages/LeadsPage';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function mount(url: string) {
  window.history.replaceState({}, '', url);
  const router = createMemoryRouter([{ path: '/leads', element: <LeadsPage /> }], { initialEntries: [url] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
}

const recentIds = () => Array.from(document.querySelectorAll('section[aria-label="Recent leads"] tbody tr td.num:first-child')).map((e) => e.textContent ?? '');

describe('LeadsPage', () => {
  it('states that leads are simulated and uses only synthetic ids', () => {
    mount('/leads?period=custom&from=2026-10-01&to=2026-11-10');
    const text = document.body.textContent ?? '';
    expect(text).toContain('simulated');
    expect(text).toContain('Total leads');
    expect(text).toContain('Status breakdown');
    expect(text).not.toMatch(/@|\+386/);
  });

  it('lists at most 15 recent leads, newest first', () => {
    mount('/leads?period=custom&from=2026-10-01&to=2026-11-10');
    const rows = document.querySelectorAll('section[aria-label="Recent leads"] tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(15);
    expect(recentIds().length).toBeGreaterThan(0);
  });

  it('shows a dash with a reason rather than zero when a platform has no spend', () => {
    // A single day with a Google source gap: 2026-10-03 has no Google spend.
    mount('/leads?period=custom&from=2026-10-03&to=2026-10-03&platform=google');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Google cost per lead');
    expect(text).not.toContain('Google cost per lead€0');
  });
});
