import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SHOWCASE_REFERENCE_DATE, type PlatformView } from '@sedem-ads/analytics-core';
import { ROUTES, type NavGroup } from '../routes';
import { HISTORY_START, LAST_COMPLETE_DAY, PLATFORM_LABELS, PRESET_LABELS, useAppState, type Role } from '../state/AppState';
import { date } from '../lib/format';
import { Segmented } from './ui';
import { Icon } from './Icon';
import type { DatePreset } from '@sedem-ads/analytics-core';
import './shell.css';
import '../styles/print.css';

const GROUPS: readonly NavGroup[] = ['Analytics', 'Campaigns', 'AI', 'System'];
const PRESET_ORDER: readonly DatePreset[] = ['last7', 'last14', 'last30', 'last90', 'thisMonth', 'previousMonth', 'yearToDate', 'custom'];
const PLATFORM_ORDER: readonly PlatformView[] = ['combined', 'meta', 'google'];
const ROLE_LABEL: Record<Role, string> = { VIEWER: 'Viewer', EDITOR: 'Ad editor', ADMIN: 'Admin' };

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

function PlatformPill() {
  return (
    <span className="pill-both" title="This page covers both Meta and Google">
      <i className="dot dot-meta" />
      <i className="dot dot-google" />
      Meta + Google
    </span>
  );
}

function PlatformSelector() {
  const { platform, setPlatform } = useAppState();
  return (
    <div className="platform-sel" role="group" aria-label="Platform">
      {PLATFORM_ORDER.map((p) => (
        <button key={p} type="button" className={`plat plat-${p} ${p === platform ? 'on' : ''}`} aria-pressed={p === platform} onClick={() => setPlatform(p)}>
          <i className={`dot dot-${p}`} aria-hidden="true" />
          {PLATFORM_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function PeriodSelector() {
  const { period, setPeriod, range } = useAppState();
  const custom = period.preset === 'custom';
  const cur = period.custom ?? range ?? { start: HISTORY_START, end: LAST_COMPLETE_DAY };
  return (
    <div className="period-sel">
      <label className="field">
        <span className="field-label">Period</span>
        <select
          aria-label="Period"
          value={period.preset}
          onChange={(e) => {
            const preset = e.target.value as DatePreset;
            setPeriod({ preset, custom: preset === 'custom' ? cur : null });
          }}
        >
          {PRESET_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <>
          <label className="field">
            <span className="field-label">From</span>
            <input
              type="date"
              aria-label="From date"
              min={HISTORY_START}
              max={LAST_COMPLETE_DAY}
              value={cur.start}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setPeriod({ preset: 'custom', custom: { start: v, end: cur.end < v ? v : cur.end } });
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input
              type="date"
              aria-label="To date"
              min={HISTORY_START}
              max={LAST_COMPLETE_DAY}
              value={cur.end}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setPeriod({ preset: 'custom', custom: { start: cur.start > v ? v : cur.start, end: v } });
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}

export function AppShell() {
  const { granularity, setGranularity, role, setRole, range } = useAppState();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useUrlSync();

  const current = ROUTES.find((r) => loc.pathname === r.path || loc.pathname.startsWith(`${r.path}/`));

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => {
    document.title = `${current?.label ?? 'Not found'} · Meta & Google Ads Analytics Demo`;
  }, [current]);

  return (
    <div className={`app ${open ? 'nav-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" id="primary-nav" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i className="dot dot-meta" />
            <i className="dot dot-google" />
          </span>
          <div>
            <div className="brand-name">Meta &amp; Google Ads</div>
            <div className="brand-sub">Sales Analytics Platform</div>
          </div>
          <button type="button" className="icon-btn drawer-close" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Main">
          {GROUPS.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-group-title">{g}</div>
              {ROUTES.filter((r) => r.group === g).map((r) => (
                <NavLink key={r.path} to={r.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon name={r.path.slice(1)} />
                  <span className="nav-label">{r.label}</span>
                  {r.shared && (
                    <span className="nav-shared" title="Shared page: covers both Meta and Google">
                      <i className="dot dot-meta" />
                      <i className="dot dot-google" />
                      <span className="sr-only">Meta and Google</span>
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">Synthetic data · No network calls · Fictional company</div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main">
        <div className="demo-banner" role="note">
          <strong>DEMO DATA — NOT REAL BUSINESS RESULTS</strong> · Simulated, deterministic dataset (reference date {date(SHOWCASE_REFERENCE_DATE)})
        </div>
        <header className="topbar">
          <button type="button" className="nav-toggle" aria-label="Open navigation" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
          <div className="crumb">
            <span className="crumb-title">{current?.label ?? 'Not found'}</span>
            {current?.shared && <PlatformPill />}
          </div>
          <div className="controls">
            <PlatformSelector />
            <PeriodSelector />
            <Segmented
              label="Granularity"
              value={granularity}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              onChange={setGranularity}
            />
            <label className="field">
              <span className="field-label">Role</span>
              <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        {!range && (
          <div className="range-warn" role="status">
            The selected period has no completed days in the available history. Choose another period.
          </div>
        )}
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
