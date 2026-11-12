// Pure helpers for the simulated "Refresh now" on the Data sources page. No network, no timers.
// The demo has its own clock: the dataset reference instant plus the time spent on the page, so the
// relative labels are stable and never compared with the visitor's real calendar.

/** Minutes before the demo clock at which each source "last refreshed successfully" at page load. */
export const BASE_AGE_MINUTES: Record<string, number> = { meta: 4, google: 6, crm: 11, leads: 16, payments: 23 };

const MIN = 60_000;

/** Demo clock: reference instant + 30 min (the page opens shortly after the last scheduled run) + elapsed ms. */
export function demoNow(referenceNowIso: string, elapsedMs: number): string {
  return new Date(Date.parse(referenceNowIso) + 30 * MIN + Math.max(0, elapsedMs)).toISOString();
}

/** Initial "last successful refresh" instant of a source. */
export function initialRefresh(referenceNowIso: string, sourceId: string): string {
  const age = BASE_AGE_MINUTES[sourceId] ?? 10;
  return new Date(Date.parse(referenceNowIso) + 30 * MIN - age * MIN).toISOString();
}

/** "just now", "4 min ago", "2 h ago". */
export function relativeAgo(fromIso: string, nowIso: string): string {
  const diff = Math.max(0, Date.parse(nowIso) - Date.parse(fromIso));
  const min = Math.floor(diff / MIN);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.floor(min / 60)} h ago`;
}
