import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import CombinedOverviewPage from '../src/pages/CombinedOverviewPage';
import RecommendationsPage from '../src/pages/RecommendationsPage';

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
}

describe('combined overview and recommendations', () => {
  it('Combined shows the platform comparison, ROAS and no MER', () => {
    mount('/combined', <CombinedOverviewPage />, '/combined');
    expect(screen.getByTestId('platform-comparison')).toBeTruthy();
    expect(screen.getByTestId('platform-share')).toBeTruthy();
    expect(document.body.textContent).toContain('Attributable ROAS');
    expect(document.body.textContent).not.toMatch(/\bMER\b/);
  });

  it('Recommendations render simulated cards and dismiss/restore works', () => {
    mount('/recommendations', <RecommendationsPage />, '/recommendations');
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prepare change').length).toBeGreaterThan(0);
    const n = cards.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    expect(screen.getAllByRole('article').length).toBe(n - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Restore all' }));
    expect(screen.getAllByRole('article').length).toBe(n);
  });
});
