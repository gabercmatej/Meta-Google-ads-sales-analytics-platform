import { useState } from 'react';
import { Badge, Button, Card, Notice, PageTitle, inputCls, type Tone } from '../components/ui';
import { hasRole, useAppState } from '../state/AppState';

type UserRole = 'Viewer' | 'Ad editor' | 'Administrator';

interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastSignIn: string;
  active: boolean;
}

const ROLE_TONE: Record<UserRole, Tone> = { Viewer: 'gray', 'Ad editor': 'info', Administrator: 'good' };
const ROLE_HELP: Record<UserRole, string> = {
  Viewer: 'Reads dashboards and reports. Cannot change anything.',
  'Ad editor': 'Can review and confirm simulated changes and create drafts.',
  Administrator: 'Everything an editor can do, plus manage users and the change log.',
};

const INITIAL: DemoUser[] = [
  { id: 'u-1', name: 'Demo admin', email: 'admin@example.com', role: 'Administrator', lastSignIn: '2026-11-11 09:12', active: true },
  { id: 'u-2', name: 'Analyst A', email: 'analyst.a@example.com', role: 'Viewer', lastSignIn: '2026-11-10 16:40', active: true },
  { id: 'u-3', name: 'Editor B', email: 'editor.b@example.com', role: 'Ad editor', lastSignIn: '2026-11-11 08:05', active: true },
  { id: 'u-4', name: 'Analyst C', email: 'analyst.c@example.com', role: 'Viewer', lastSignIn: '2026-10-28 11:30', active: false },
];

const th = 'whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-3';
const td = 'whitespace-nowrap border-t border-line px-4 py-2.5 text-[13px] text-ink-2';

export default function UsersPage() {
  const { role: currentRole } = useAppState();
  const [users, setUsers] = useState<DemoUser[]>(INITIAL);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Viewer');
  const [notice, setNotice] = useState<string | null>(null);

  if (!hasRole(currentRole, 'ADMIN')) {
    return (
      <div className="space-y-5">
        <PageTitle title="Users" />
        <Notice tone="amber" title="Administrators only">
          The user list is only available to the Administrator role. Switch the demo role in the header to see this page.
        </Notice>
      </div>
    );
  }

  const valid = name.trim().length > 0 && /^[^\s@]+@example\.(com|org)$/.test(email.trim());

  function invite() {
    if (!valid) return;
    setUsers((u) => [...u, { id: `u-${u.length + 1}`, name: name.trim(), email: email.trim(), role, lastSignIn: 'Invited, not signed in', active: true }]);
    setNotice(`Demo simulation – invitation for ${email.trim()} was not sent. No e-mail and no external service was used.`);
    setName('');
    setEmail('');
    setRole('Viewer');
    setOpen(false);
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Users"
        sub="Who can see and change what. Fictional users only; nothing here is a real account."
        right={
          <span className="flex items-center gap-2">
            <Badge tone="info">Simulated</Badge>
            <Button variant="primary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              New user
            </Button>
          </span>
        }
      />

      {notice && (
        <div role="status">
          <Notice tone="info" title="Demo simulation">
            {notice}
          </Notice>
        </div>
      )}

      {open && (
        <Card title="Invite a user" subtitle="Simulated. The invitation is not sent anywhere.">
          <form
            className="grid gap-3 p-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite();
            }}
          >
            <label className="space-y-1 text-xs text-ink-3">
              Name
              <input className={`${inputCls} w-full`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Analyst D" />
            </label>
            <label className="space-y-1 text-xs text-ink-3">
              E-mail (example.com only)
              <input className={`${inputCls} w-full`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst.d@example.com" />
            </label>
            <label className="space-y-1 text-xs text-ink-3">
              Role
              <select className={`${inputCls} w-full`} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {(Object.keys(ROLE_TONE) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary" disabled={!valid}>
                Send invitation (simulated)
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Users" subtitle={`${users.length} users`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={th}>Name</th>
                <th scope="col" className={th}>E-mail</th>
                <th scope="col" className={th}>Role</th>
                <th scope="col" className={th}>Last sign-in</th>
                <th scope="col" className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className={`${td} font-medium text-ink`}>{u.name}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}>
                    <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                  </td>
                  <td className={td}>{u.lastSignIn}</td>
                  <td className={td}>
                    <Badge tone={u.active ? 'good' : 'neutral'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Roles">
        <dl className="divide-y divide-line px-4 sm:px-5">
          {(Object.keys(ROLE_HELP) as UserRole[]).map((r) => (
            <div key={r} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
              <dt className="w-36 shrink-0">
                <Badge tone={ROLE_TONE[r]}>{r}</Badge>
              </dt>
              <dd className="text-sm text-ink-2">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
