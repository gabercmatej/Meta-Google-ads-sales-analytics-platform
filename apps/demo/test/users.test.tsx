import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider, useAppState, type Role } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import UsersPage from '../src/pages/UsersPage';

afterEach(cleanup);

function WithRole({ role, children }: { role: Role; children: ReactNode }) {
  const { setRole, role: current } = useAppState();
  useEffect(() => setRole(role), [role, setRole]);
  return current === role ? <>{children}</> : null;
}

function mount(role: Role) {
  const router = createMemoryRouter([{ path: '/users', element: <WithRole role={role}><UsersPage /></WithRole> }], { initialEntries: ['/users'] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
}

describe('UsersPage', () => {
  it('lists only fictional example.com users to administrators', () => {
    mount('ADMIN');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Demo admin');
    const domains = text.match(/@[a-z]+\.[a-z]+/g) ?? [];
    expect(domains.length).toBeGreaterThan(0);
    domains.forEach((d) => expect(d).toBe('@example.com'));
  });

  it('hides the user list from non-administrators', () => {
    mount('EDITOR');
    expect(document.body.textContent).toContain('Administrators only');
    expect(document.body.textContent).not.toContain('admin@example.com');
  });

  it('invite is simulated and sends nothing', () => {
    mount('ADMIN');
    fireEvent.click(screen.getByRole('button', { name: 'New user' }));
    fireEvent.change(screen.getByPlaceholderText('Analyst D'), { target: { value: 'Analyst D' } });
    fireEvent.change(screen.getByPlaceholderText('analyst.d@example.com'), { target: { value: 'analyst.d@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation (simulated)' }));
    expect(document.body.textContent).toContain('Demo simulation');
    expect(document.body.textContent).toContain('was not sent');
  });
});
