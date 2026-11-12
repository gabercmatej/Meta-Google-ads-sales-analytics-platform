// Product shell: 252px sidebar with the PND logo and task-grouped menu, sticky demo banner + header with the
// channel switcher, content column and a data-source footer. Mirrors the product layout in English.
import { startTransition, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { dataSourceStatus } from '@sedem-ads/analytics-core';
import { COMBINED_PATH, NAV_GROUPS, ROUTES, routeFor, type NavIconName } from '../routes';
import { hasRole, useAppState, type Role } from '../state/AppState';
import { getDataset } from '../lib/data';
import { dateTime } from '../lib/format';
import logo from '../assets/pnd-logo.png';
import '../styles/print.css';

const ROLE_LABEL: Record<Role, string> = { VIEWER: 'Viewer', EDITOR: 'Ad editor', ADMIN: 'Administrator' };
const PLATFORM_DOT = { meta: '#0866ff', google: '#ea8600' } as const;

/** Keeps ?platform=&period=&from=&to=&view= in the URL in step with the app state; other params (e.g. ads) are preserved. */
function useUrlSync() {
  const { platform, period, granularity } = useAppState();
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    q.set('platform', platform);
    q.set('period', period.preset);
    q.set('view', granularity);
    if (period.preset === 'custom' && period.custom) {
      q.set('from', period.custom.start);
      q.set('to', period.custom.end);
    } else {
      q.delete('from');
      q.delete('to');
    }
    const next = `?${q.toString()}`;
    if (next !== loc.search) navigate({ pathname: loc.pathname, search: next, hash: loc.hash }, { replace: true });
  }, [platform, period, granularity, loc.pathname, loc.search, loc.hash, navigate]);
}

const SHELL_ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5',
  chat: 'M4 5h16v11H9l-5 4V5z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
} as const;

function ShellIcon({ name, size = 16 }: { name: keyof typeof SHELL_ICONS; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={SHELL_ICONS[name]} />
    </svg>
  );
}

const NAV_PATHS: Record<NavIconName, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  plus: 'M12 5v14M5 12h14',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  cart: 'M3 4h2.5l2 11h10l2-8H7M9.5 20h.01M17 20h.01',
  compare: 'M8 4v16M16 4v16M4 8h8M12 16h8',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  db: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z',
};

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={NAV_PATHS[name]} />
    </svg>
  );
}

function NavLinks({ role, pathname, search }: { role: Role; pathname: string; search: string }) {
  const active = routeFor(pathname)?.path;
  const groups = NAV_GROUPS.map((g) => ({ g, items: ROUTES.filter((r) => r.group === g && (!r.min || hasRole(role, r.min))) })).filter((x) => x.items.length);
  return (
    <div className="space-y-5" role="group" aria-label="Ads & analytics">
      {groups.map(({ g, items }) => (
        <div key={g}>
          <p className="eyebrow px-3 pb-1.5">{g}</p>
          <ul className="space-y-0.5">
            {items.map((l) => {
              const on = l.path === active;
              return (
                <li key={l.path}>
                  <Link
                    to={{ pathname: l.path, search }}
                    aria-current={on ? 'page' : undefined}
                    className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
                      on ? 'bg-brand-soft font-semibold text-brand' : 'font-medium text-ink-2 hover:bg-slate-100 hover:text-ink'
                    }`}
                  >
                    {on && <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand" />}
                    <span className={on ? 'text-brand' : 'text-slate-400 group-hover:text-ink-2'}>
                      <NavIcon name={l.icon} />
                    </span>
                    <span className="truncate">{l.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ModuleLink({ icon, children }: { icon: keyof typeof SHELL_ICONS; children: ReactNode }) {
  return (
    <span className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-3 text-xs font-medium text-ink-3" title="Another module of the admin suite (not part of this demo)">
      <span className="text-slate-400">
        <ShellIcon name={icon} size={15} />
      </span>
      <span className="flex-1 truncate">{children}</span>
      <span className="text-slate-400">
        <ShellIcon name="ext" size={11} />
        <span className="sr-only">(separate module, not in the demo)</span>
      </span>
    </span>
  );
}

function SidebarBody({ role, pathname, search }: { role: Role; pathname: string; search: string }) {
  return (
    <>
      <Link to={{ pathname: COMBINED_PATH, search }} className="flex h-16 shrink-0 items-center gap-2.5 px-5" aria-label="Meta Center, home">
        <img src={logo} alt="PND" height={26} width={119} className="h-[26px] w-auto" />
      </Link>
      <nav aria-label="Meta Center" className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        <NavLinks role={role} pathname={pathname} search={search} />
        <div className="mt-6 border-t border-line pt-4">
          <p className="eyebrow px-3 pb-1.5">Other PND modules</p>
          <div className="space-y-px">
            <ModuleLink icon="home">Overview</ModuleLink>
            <ModuleLink icon="chat">Comments &amp; messages</ModuleLink>
            <ModuleLink icon="edit">Content &amp; posts</ModuleLink>
          </div>
        </div>
      </nav>
      <details className="infotip shrink-0 border-t border-line px-5 py-3 text-2xs text-ink-3">
        <summary className="flex cursor-pointer items-center justify-between gap-2">
          <span>Reads data · writes only with confirmation</span>
          <span className="font-medium text-brand">More</span>
        </summary>
        <p className="mt-2 leading-snug">
          The product reads data. Changes to ad accounts run only after an explicit confirmation and are all recorded in the change log. In this demo every change is
          simulated in your browser.
        </p>
      </details>
    </>
  );
}

type ChannelKey = 'meta' | 'google' | 'combined';
const CHANNELS: { key: ChannelKey; long: string; short: string }[] = [
  { key: 'meta', long: 'Meta Ads', short: 'Meta' },
  { key: 'google', long: 'Google Ads', short: 'Google' },
  { key: 'combined', long: 'Combined overview', short: 'Combined' },
];

/** Workspace switch: Meta Ads | Google Ads | Combined overview. Meta and Google keep the current section and period. */
function ChannelSwitcher({ pathname }: { pathname: string }) {
  const { workspace, setPlatform } = useAppState();
  const navigate = useNavigate();
  const loc = useLocation();
  const onCombined = pathname === COMBINED_PATH;
  const shared = routeFor(pathname)?.scope === 'shared';
  const active: ChannelKey | null = onCombined ? 'combined' : shared ? null : workspace;
  const go = (key: ChannelKey) => (e: MouseEvent) => {
    e.preventDefault();
    if (key === 'combined') {
      navigate({ pathname: COMBINED_PATH, search: loc.search });
      return;
    }
    if (onCombined || shared || pathname.startsWith('/campaigns/')) {
      // The router commits navigations in a transition; setting the platform in the same transition keeps
      // the URL sync from seeing the new platform with the old path and replacing the new route.
      const q = new URLSearchParams(loc.search);
      q.set('platform', key);
      startTransition(() => {
        setPlatform(key);
        navigate({ pathname: onCombined || shared ? '/overview' : '/campaigns', search: `?${q.toString()}` });
      });
      return;
    }
    setPlatform(key);
  };
  const items = shared ? CHANNELS.filter((c) => c.key === 'combined') : CHANNELS;
  return (
    <nav aria-label="Platform" className="inline-flex max-w-full rounded-full bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200/80 shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]">
      {shared && (
        <span
          role="group"
          aria-label="Meta Ads and Google Ads (shared page)"
          title="Shared page for Meta Ads and Google Ads: it covers both platforms, so there is no choice here."
          className="inline-flex min-h-8 min-w-0 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-ink shadow-[0_1px_2px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.04)] sm:px-3.5"
        >
          {(['meta', 'google'] as const).map((k, idx) => (
            <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {idx > 0 && <span aria-hidden className="mx-2 h-3 w-px shrink-0 bg-slate-200 sm:mx-2.5" />}
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLATFORM_DOT[k] }} />
              <span className="sm:hidden">{CHANNELS[idx]!.short}</span>
              <span className="hidden sm:inline">{CHANNELS[idx]!.long}</span>
            </span>
          ))}
        </span>
      )}
      {items.map((i) => {
        const on = active === i.key;
        return (
          <a
            key={i.key}
            href={i.key === 'combined' ? COMBINED_PATH : `/overview?platform=${i.key}`}
            onClick={go(i.key)}
            aria-current={on ? 'page' : undefined}
            data-channel={i.key}
            title={i.key === 'combined' ? 'Meta and Google together: spend, sales by source, return' : `${i.long}: separate workspace`}
            className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold transition-all sm:px-3.5 ${
              on ? 'bg-white text-ink shadow-[0_1px_2px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.04)]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {i.key !== 'combined' ? (
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${on ? 'opacity-100' : 'opacity-40'}`} style={{ background: PLATFORM_DOT[i.key] }} />
            ) : (
              <span aria-hidden className="relative flex h-2.5 w-3 shrink-0">
                <span className={`absolute left-0 top-0 h-2.5 w-2.5 rounded-full ${on ? 'opacity-100' : 'opacity-40'}`} style={{ background: PLATFORM_DOT.meta }} />
                <span className={`absolute left-1 top-0 h-2.5 w-2.5 rounded-full mix-blend-multiply ${on ? 'opacity-100' : 'opacity-40'}`} style={{ background: PLATFORM_DOT.google }} />
              </span>
            )}
            <span className="sm:hidden">{i.short}</span>
            <span className="hidden sm:inline">{i.long}</span>
          </a>
        );
      })}
    </nav>
  );
}

function SourceStrip({ search }: { search: string }) {
  const statuses = dataSourceStatus(getDataset());
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-3" data-testid="source-strip">
      {statuses.map((s) => (
        <Link key={s.id} to={{ pathname: '/data-sources', search }} className="inline-flex items-center gap-1.5 hover:text-ink" title={`${s.name}: demo · refreshed ${dateTime(s.lastSyncAt)}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
          <span className="font-medium text-ink-2">{s.name}</span>
          <span className="hidden sm:inline">demo</span>
          <span className="hidden text-slate-400 lg:inline">· {dateTime(s.lastSyncAt)}</span>
        </Link>
      ))}
    </div>
  );
}

function UserMenu() {
  const { role, setRole } = useAppState();
  return (
    <details className="menu relative">
      <summary className="flex h-9 items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium text-ink-2 hover:bg-slate-100" aria-label="User menu">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold uppercase text-white">
          D
        </span>
        <span className="hidden max-w-[9rem] truncate md:inline">Demo user</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1.5 w-60 rounded-xl bg-white p-1.5 shadow-pop">
        <p className="truncate px-2 pt-1.5 text-sm font-medium text-slate-900">Demo user</p>
        <p className="px-2 pb-1.5 text-xs text-slate-500">{ROLE_LABEL[role]}</p>
        <div className="my-1 border-t border-line" />
        <p className="eyebrow px-2 pb-1 pt-1">View the demo as</p>
        <div role="radiogroup" aria-label="Role">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${role === r ? 'font-semibold text-brand' : 'text-slate-700'}`}
            >
              {ROLE_LABEL[r]}
              {role === r && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
        <p className="px-2 pb-1 pt-1.5 text-2xs leading-snug text-ink-3">Roles change what the menu and actions allow. There is no sign-in in the demo.</p>
      </div>
    </details>
  );
}

export function AppShell() {
  const { role, range } = useAppState();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useUrlSync();

  const current = loc.pathname === COMBINED_PATH ? { label: 'Combined overview' } : routeFor(loc.pathname);

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  useEffect(() => {
    document.title = `${current?.label ?? 'Not found'} · Meta Center demo`;
  }, [current?.label]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <aside className="hidden h-screen w-[252px] shrink-0 flex-col border-r border-line bg-white md:sticky md:top-0 md:flex" aria-label="Main menu">
        <SidebarBody role={role} pathname={loc.pathname} search={loc.search} />
      </aside>

      <div className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-slate-900/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} />
        <aside
          id="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className={`invisible absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col bg-white shadow-pop transition-transform ${open ? 'visible translate-x-0' : '-translate-x-full'}`}
        >
          <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-2.5 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="Close menu">
            <ShellIcon name="close" size={18} />
          </button>
          <SidebarBody role={role} pathname={loc.pathname} search={loc.search} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30">
          <div role="status" className="demo-stripes border-b border-amber-600 px-4 py-1 text-center text-xs font-bold leading-snug text-black">
            DEMO — all data shown is synthetic. No connection to any real Meta, Google Ads, CRM or payment account.
          </div>
          <header className="flex h-14 items-center gap-2 border-b border-line bg-white/95 px-3 backdrop-blur sm:gap-3 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 md:hidden"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="mobile-drawer"
            >
              <ShellIcon name="menu" size={20} />
            </button>
            <span className="hidden text-sm font-semibold tracking-tight text-ink lg:inline">Ads &amp; analytics</span>
            <span className="hidden h-5 w-px bg-line lg:block" aria-hidden />
            <div className="min-w-0">
              <ChannelSwitcher pathname={loc.pathname} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-amber-600 bg-amber-300 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-black sm:inline">Demo</span>
              <UserMenu />
            </div>
          </header>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 outline-none sm:px-8 sm:py-8 min-[1700px]:max-w-[1760px]">
          {!range && (
            <div role="status" className="mb-4 rounded-xl border border-amber-200/80 bg-warn-soft/70 px-3.5 py-3 text-sm text-amber-950">
              The selected period has no completed days in the available history. Choose another period.
            </div>
          )}
          <Outlet />
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-[1360px] space-y-1 px-4 py-3 sm:px-8 min-[1700px]:max-w-[1760px]">
            <SourceStrip search={loc.search} />
            <p className="text-2xs text-slate-400">Amounts in EUR · ad days in the account time zone, sales by order date (Europe/Ljubljana) · synthetic demo data</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
