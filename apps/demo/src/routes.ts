// Single source of truth for navigation. The sidebar renders from this list, grouped by task like the product.
import type { Role } from './state/AppState';

export type NavGroup = 'Overview' | 'Advertising' | 'Results' | 'AI help' | 'System';
export type NavIconName = 'grid' | 'layers' | 'plus' | 'file' | 'spark' | 'bulb' | 'users' | 'cart' | 'compare' | 'link' | 'db' | 'clock' | 'shield';

export interface RouteDef {
  path: string;
  label: string;
  group: NavGroup;
  icon: NavIconName;
  /**
   * platform = the page belongs to the Meta or Google workspace (the channel switcher swaps it);
   * shared = one page for both platforms (the switcher shows "Meta Ads | Google Ads").
   */
  scope: 'platform' | 'shared';
  /** Lowest role that sees the page in the menu. */
  min?: Role;
}

export const NAV_GROUPS: readonly NavGroup[] = ['Overview', 'Advertising', 'Results', 'AI help', 'System'];

export const ROUTES: readonly RouteDef[] = [
  { path: '/overview', label: 'Overview', group: 'Overview', icon: 'grid', scope: 'platform' },
  { path: '/campaigns', label: 'Campaigns & ads', group: 'Advertising', icon: 'layers', scope: 'platform' },
  { path: '/create', label: 'Create ad', group: 'Advertising', icon: 'plus', scope: 'platform', min: 'EDITOR' },
  { path: '/drafts', label: 'Drafts', group: 'Advertising', icon: 'file', scope: 'platform', min: 'EDITOR' },
  { path: '/sales', label: 'Sales', group: 'Results', icon: 'cart', scope: 'platform' },
  { path: '/leads', label: 'Leads', group: 'Results', icon: 'users', scope: 'platform' },
  { path: '/attribution', label: 'Attribution', group: 'Results', icon: 'link', scope: 'shared' },
  { path: '/compare', label: 'Ad comparison', group: 'Results', icon: 'compare', scope: 'platform' },
  { path: '/assistant', label: 'AI assistant', group: 'AI help', icon: 'spark', scope: 'shared' },
  { path: '/recommendations', label: 'Recommendations', group: 'AI help', icon: 'bulb', scope: 'shared' },
  { path: '/data-sources', label: 'Data sources', group: 'System', icon: 'db', scope: 'shared' },
  { path: '/activity', label: 'Change log', group: 'System', icon: 'clock', scope: 'shared' },
  { path: '/users', label: 'Users', group: 'System', icon: 'shield', scope: 'shared', min: 'ADMIN' },
];

/** The combined Meta + Google overview lives outside the menu, reached from the channel switcher. */
export const COMBINED_PATH = '/combined';

/** Longest matching route (so /campaigns/x still marks Campaigns & ads). */
export function routeFor(pathname: string): RouteDef | undefined {
  if (pathname.startsWith('/ads/')) return ROUTES.find((r) => r.path === '/campaigns');
  return ROUTES.filter((r) => pathname === r.path || pathname.startsWith(`${r.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
}
