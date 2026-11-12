import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '../src/components/AppShell';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';

afterEach(cleanup);

function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { path: 'overview', element: <p>overview body</p> },
          { path: 'assistant', element: <p>assistant body</p> },
          { path: 'sales', element: <p>sales body</p> },
          { path: 'combined', element: <p>combined body</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
  return router;
}

const sw = () => within(screen.getByRole('navigation', { name: 'Platform' }));

describe('app shell', () => {
  it('renders grouped navigation and a compact DEMO badge', () => {
    mount('/overview');
    const nav = screen.getAllByRole('navigation', { name: 'Meta Center' })[0]!;
    for (const label of ['Overview', 'Campaigns & ads', 'Sales', 'Attribution', 'AI assistant', 'Data sources']) {
      expect(within(nav).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('demo-badge')).toBeTruthy();
    expect(document.querySelector('.demo-stripes')).toBeNull();
    fireEvent.click(screen.getByTestId('demo-badge'));
    expect(screen.getByRole('tooltip').textContent).toContain('Synthetic data. No real accounts, customers or campaigns.');
  });

  it('shows the fixed Meta + Google pill on shared pages only', () => {
    mount('/sales');
    expect(screen.queryByRole('group', { name: /shared page/ })).toBeNull();
    cleanup();
    mount('/assistant');
    expect(screen.getByRole('group', { name: /shared page/ })).toBeTruthy();
  });

  it('the platform switch updates the URL and keeps the section', () => {
    const router = mount('/sales');
    fireEvent.click(sw().getByRole('link', { name: /Meta Ads/ }));
    const q = new URLSearchParams(router.state.location.search);
    expect(router.state.location.pathname).toBe('/sales');
    expect(q.get('platform')).toBe('meta');
    expect(q.get('view')).toBe('daily');
    expect(sw().getByRole('link', { name: /Meta Ads/ }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps the latest selection when the platform changes twice', () => {
    const router = mount('/overview');
    fireEvent.click(sw().getByRole('link', { name: /Google Ads/ }));
    fireEvent.click(sw().getByRole('link', { name: /Combined/ }));
    expect(router.state.location.pathname).toBe('/combined');
  });
});
