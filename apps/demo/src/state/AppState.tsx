import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  SHOWCASE_HISTORY_START,
  SHOWCASE_REFERENCE_DATE,
  addDays,
  isValidISODate,
  resolveShowcaseRange,
  type DatePreset,
  type DateRange,
  type Granularity,
  type ISODate,
  type PlatformView,
} from '@sedem-ads/analytics-core';
import { getDataset } from '../lib/data';

export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN';

export interface PeriodState {
  preset: DatePreset;
  /** Only used when preset === 'custom'. */
  custom: DateRange | null;
}

export interface AppState {
  platform: PlatformView;
  setPlatform: (p: PlatformView) => void;
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
export const HISTORY_START: ISODate = SHOWCASE_HISTORY_START;
export const LAST_COMPLETE_DAY: ISODate = addDays(SHOWCASE_REFERENCE_DATE, -1);

const PLATFORMS: readonly PlatformView[] = ['combined', 'meta', 'google'];
const PRESETS: readonly DatePreset[] = ['last7', 'last14', 'last30', 'last90', 'thisMonth', 'previousMonth', 'yearToDate', 'custom'];

/** Optional deep-link query parameters: ?platform=meta&period=last90&from=2026-01-01&to=2026-03-31&view=monthly */
function initialFromUrl(): { platform: PlatformView; period: PeriodState; granularity: Granularity } {
  const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const platform = PLATFORMS.find((p) => p === q.get('platform')) ?? 'combined';
  const preset = PRESETS.find((p) => p === q.get('period')) ?? 'last30';
  const from = q.get('from');
  const to = q.get('to');
  const custom = preset === 'custom' && from && to && isValidISODate(from) && isValidISODate(to) && from <= to ? { start: from, end: to } : null;
  const granularity: Granularity = q.get('view') === 'monthly' ? 'monthly' : 'daily';
  return { platform, period: { preset: custom ? 'custom' : preset === 'custom' ? 'last30' : preset, custom }, granularity };
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

  const range = useMemo(() => resolveShowcaseRange(getDataset(), period.preset, period.custom ?? undefined), [period]);

  const value = useMemo<AppState>(
    () => ({ platform, setPlatform, period, setPeriod, range, granularity, setGranularity, role, setRole }),
    [platform, period, setPeriod, range, granularity, role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  last7: 'Last 7 days',
  last14: 'Last 14 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  previousMonth: 'Previous month',
  yearToDate: 'Year to date',
  custom: 'Custom',
};

export const PLATFORM_LABELS: Record<PlatformView, string> = {
  combined: 'Combined',
  meta: 'Meta Ads',
  google: 'Google Ads',
};
