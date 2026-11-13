import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  SHOWCASE_HISTORY_START,
  SHOWCASE_REFERENCE_DATE,
  addDays,
  isValidISODate,
  rangeLength,
  resolveShowcaseRange,
  type DatePreset,
  type DateRange,
  type Granularity,
  type ISODate,
  type PlatformView,
} from '@sedem-ads/analytics-core';
import { getDataset } from '../lib/data';

export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN';
export type Workspace = 'meta' | 'google';

/** Core presets plus two demo-level ones that resolve to fixed ranges of completed days. */
export type DemoPreset = DatePreset | 'today' | 'yesterday' | 'thisWeek';

export interface PeriodState {
  preset: DemoPreset;
  /** Only used when preset === 'custom'. */
  custom: DateRange | null;
}

export interface AppState {
  platform: PlatformView;
  setPlatform: (p: PlatformView) => void;
  /** The Meta or Google workspace that platform-scoped pages show (never 'combined'; that is the /combined page). */
  workspace: Workspace;
  period: PeriodState;
  setPeriod: (p: PeriodState) => void;
  /** Resolved inclusive range (completed days only), or null if empty. */
  range: DateRange | null;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  role: Role;
  setRole: (r: Role) => void;
}

const Ctx = createContext<AppState | null>(null);

/** Bounds for custom dates: first day of history .. last completed day (today is partial). */
/** The in-progress reference day; only the Today preset includes it. */
export const TODAY: ISODate = SHOWCASE_REFERENCE_DATE;
export const HISTORY_START: ISODate = SHOWCASE_HISTORY_START;
export const LAST_COMPLETE_DAY: ISODate = addDays(SHOWCASE_REFERENCE_DATE, -1);

const PLATFORMS: readonly PlatformView[] = ['combined', 'meta', 'google'];
const PRESETS: readonly DemoPreset[] = ['today', 'yesterday', 'thisWeek', 'last7', 'last14', 'last30', 'last90', 'thisMonth', 'previousMonth', 'yearToDate', 'custom'];

/** Weekly charts need at least two weeks in the range; shorter ranges fall back to Daily. */
export const WEEKLY_MIN_DAYS = 14;

/** Weekly selected on a range too short for it reads as Daily (the choice is kept for longer ranges). */
export function effectiveGranularity(g: Granularity, range: DateRange | null): Granularity {
  return g === 'weekly' && (!range || rangeLength(range) < WEEKLY_MIN_DAYS) ? 'daily' : g;
}

/** Optional deep-link query parameters: ?platform=meta&period=last90&from=2026-01-01&to=2026-03-31&view=monthly (or view=weekly) */
function initialFromUrl(): { platform: PlatformView; period: PeriodState; granularity: Granularity } {
  const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const platform = PLATFORMS.find((p) => p === q.get('platform')) ?? 'meta';
  const preset = PRESETS.find((p) => p === q.get('period')) ?? 'last30';
  const from = q.get('from');
  const to = q.get('to');
  const custom = preset === 'custom' && from && to && isValidISODate(from) && isValidISODate(to) && from <= to ? { start: from, end: to } : null;
  const view = q.get('view');
  const granularity: Granularity = view === 'monthly' || view === 'weekly' ? view : 'daily';
  return { platform, period: { preset: custom ? 'custom' : preset === 'custom' ? 'last30' : preset, custom }, granularity };
}

/** Monday of the reference week; the week runs to the last completed day. */
function weekStart(day: ISODate): ISODate {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export function resolveDemoRange(period: PeriodState): DateRange | null {
  if (period.preset === 'today') return { start: SHOWCASE_REFERENCE_DATE, end: SHOWCASE_REFERENCE_DATE };
  if (period.preset === 'yesterday') return { start: LAST_COMPLETE_DAY, end: LAST_COMPLETE_DAY };
  if (period.preset === 'thisWeek') {
    const start = weekStart(SHOWCASE_REFERENCE_DATE);
    return start <= LAST_COMPLETE_DAY ? { start, end: LAST_COMPLETE_DAY } : null;
  }
  return resolveShowcaseRange(getDataset(), period.preset, period.custom ?? undefined);
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const init = useMemo(initialFromUrl, []);
  const [platform, setPlatform] = useState<PlatformView>(init.platform);
  const [period, setPeriodRaw] = useState<PeriodState>(init.period);
  const [granularity, setGranularity] = useState<Granularity>(init.granularity);
  const [role, setRole] = useState<Role>('EDITOR');

  const setPeriod = useCallback((p: PeriodState) => {
    setPeriodRaw(p);
    // Year to date reads better by month; short windows by day. The user can still switch.
    if (p.preset === 'yearToDate') setGranularity('monthly');
    else if (p.preset !== 'custom' && p.preset !== 'last90') setGranularity('daily');
  }, []);

  const range = useMemo(() => resolveDemoRange(period), [period]);
  const shown = effectiveGranularity(granularity, range);

  const value = useMemo<AppState>(
    () => ({ platform, setPlatform, workspace: platform === 'google' ? 'google' : 'meta', period, setPeriod, range, granularity: shown, setGranularity, role, setRole }),
    [platform, period, setPeriod, range, shown, role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function hasRole(role: Role, min: Role): boolean {
  const rank: Record<Role, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };
  return rank[role] >= rank[min];
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}

export const PRESET_LABELS: Record<DemoPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  last7: 'Last 7 days',
  last14: 'Last 14 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  previousMonth: 'Previous month',
  yearToDate: 'This year',
  custom: 'Custom',
};

/** Short labels for the period bar, in the order the product shows them. */
export const PERIOD_BAR: readonly { key: DemoPreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: '7 days' },
  { key: 'last14', label: '14 days' },
  { key: 'last30', label: '30 days' },
  { key: 'last90', label: '90 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'previousMonth', label: 'Previous month' },
  { key: 'yearToDate', label: 'This year' },
];

export const PLATFORM_LABELS: Record<PlatformView, string> = {
  combined: 'Combined overview',
  meta: 'Meta Ads',
  google: 'Google Ads',
};
