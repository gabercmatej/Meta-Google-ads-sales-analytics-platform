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

describe('app shell', () => {
  it('renders grouped navigation and the DEMO DATA banner', () => {
    mount('/overview');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Overview', 'Campaigns & Ads', 'Sales', 'Attribution']) {
      expect(within(nav).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('note').textContent).toContain('DEMO DATA');
  });

  it('shows the Meta + Google pill on shared pages only', () => {
    mount('/sales');
    expect(screen.getByText('Meta + Google', { selector: '.pill-both' })).toBeTruthy();
    cleanup();
    mount('/assistant');
    expect(document.querySelector('.crumb .pill-both')).not.toBeNull();
  });

  it('platform and period selectors update the URL', async () => {
    const router = mount('/overview');
    fireEvent.click(screen.getByRole('button', { name: /Meta Ads/ }));
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'last90' } });
    await Promise.resolve();
    const q = new URLSearchParams(router.state.location.search);
    expect(q.get('platform')).toBe('meta');
    expect(q.get('period')).toBe('last90');
    expect(q.get('view')).toBe('daily');
    expect(screen.getByRole('button', { name: /Meta Ads/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the latest selection when the platform changes twice', () => {
    const router = mount('/overview');
    fireEvent.click(screen.getByRole('button', { name: /Google Ads/ }));
    fireEvent.click(screen.getByRole('button', { name: /Combined/ }));
    expect(new URLSearchParams(router.state.location.search).get('platform')).toBe('combined');
  });
});
