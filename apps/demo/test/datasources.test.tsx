import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import DataSourcesPage from '../src/pages/DataSourcesPage';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

function mount() {
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
}

describe('DataSourcesPage', () => {
  it('says no real API is connected and marks every source as simulated', () => {
    mount();
    expect(document.body.textContent).toContain('No real APIs are connected');
    const cards = document.querySelectorAll('[data-testid="source-card"]');
    expect(cards.length).toBe(5);
    cards.forEach((c) => expect(c.textContent).toContain('Simulated'));
  });

  it('lists the planted gap days with their reason', () => {
    mount();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Missing');
    expect(text).toContain('Source error');
    expect(text).toContain('Partial');
  });

  it('shows integrity checks with PASS and PARTIAL badges and no FAIL', () => {
    mount();
    const items = document.querySelectorAll('[data-testid="integrity-check"]');
    expect(items.length).toBeGreaterThanOrEqual(15);
    const text = Array.from(items).map((i) => i.textContent).join(' ');
    expect(text).toContain('PASS');
    expect(text).toContain('PARTIAL');
    expect(document.querySelectorAll('[data-testid="check-status"]').length).toBe(items.length);
    expect(Array.from(document.querySelectorAll('[data-testid="check-status"]')).some((b) => b.textContent === 'FAIL')).toBe(false);
  });

  it('Refresh now is simulated: spinner, updated notice, no network call', () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      mount();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Meta Ads now' }));
      expect(screen.getByRole('button', { name: 'Refresh Meta Ads now' }).hasAttribute('disabled')).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(document.body.textContent).toContain('Demo simulation – no external API was called');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
