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

export default function UsersPage() {
  const { role: currentRole } = useAppState();
  const [users, setUsers] = useState<DemoUser[]>(INITIAL);
  const [roleDraft, setRoleDraft] = useState<Record<string, UserRole>>({});
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
  const say = (m: string) => setNotice(`Simulated in this browser: ${m} No e-mail, password or external service was used.`);

  function invite() {
    if (!valid) return;
    setUsers((u) => [...u, { id: `u-${u.length + 1}`, name: name.trim(), email: email.trim(), role, lastSignIn: 'Never signed in', active: true }]);
    say(`user ${email.trim()} was added to this list.`);
    setName('');
    setEmail('');
    setRole('Viewer');
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Users" sub="Internal access to the application. Every change is recorded in the change log. Fictional users only; nothing here is a real account." />

      {notice && (
        <div role="status">
          <Notice tone="info">{notice}</Notice>
        </div>
      )}

      <Card title="New user" subtitle="Simulated. The user is only added to the list below, in this browser.">
        <form
          className="grid gap-x-3 gap-y-3 p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <label className="grid gap-1 text-xs text-ink-2">
            Username (e-mail, example.com only)
            <input className={`${inputCls} w-full`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst.d@example.com" />
          </label>
          <label className="grid gap-1 text-xs text-ink-2">
            Display name
            <input className={`${inputCls} w-full`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Analyst D" />
          </label>
          <label className="grid gap-1 text-xs text-ink-2">
            Role
            <select className={`${inputCls} w-full`} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {(Object.keys(ROLE_TONE) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="primary" disabled={!valid}>
              Create user (simulated)
            </Button>
          </div>
        </form>
      </Card>

      <Card title={`Users (${users.length})`} subtitle="Viewer: reads. Ad editor: prepares drafts and confirms changes. Administrator: also manages users.">
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const draft = roleDraft[u.id] ?? u.role;
            return (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {u.name}
                    {u.id === 'u-1' && <Badge tone="neutral">you</Badge>}
                    {!u.active && <Badge tone="neutral">Disabled</Badge>}
                  </div>
                  <div className="text-xs text-ink-3">
                    {u.email} · <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                  </div>
                  <div className="text-2xs italic text-ink-3">Last sign-in: {u.lastSignIn}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={inputCls} aria-label={`Role for ${u.name}`} value={draft} onChange={(e) => setRoleDraft((d) => ({ ...d, [u.id]: e.target.value as UserRole }))}>
                    {(Object.keys(ROLE_TONE) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    onClick={() => {
                      setUsers((all) => all.map((x) => (x.id === u.id ? { ...x, role: draft } : x)));
                      say(`role of ${u.name} set to ${draft}.`);
                    }}
                  >
                    Save role
                  </Button>
                  <Button size="sm" onClick={() => say(`password reset for ${u.name} is not available in the demo.`)}>
                    Reset password
                  </Button>
                  {u.id !== 'u-1' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setUsers((all) => all.map((x) => (x.id === u.id ? { ...x, active: !x.active } : x)));
                        say(`${u.name} was ${u.active ? 'disabled' : 'enabled'}.`);
                      }}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
