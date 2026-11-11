// Single source of truth for navigation. The sidebar renders from this list.

export type NavGroup = 'Analytics' | 'Campaigns' | 'AI' | 'System';

export interface RouteDef {
  path: string;
  label: string;
  group: NavGroup;
  /** Shared pages belong to both platforms (shown with a Meta + Google pill). */
  shared: boolean;
}

export const ROUTES: readonly RouteDef[] = [
  { path: '/overview', label: 'Overview', group: 'Analytics', shared: false },
  { path: '/sales', label: 'Sales', group: 'Analytics', shared: true },
  { path: '/leads', label: 'Leads', group: 'Analytics', shared: false },
  { path: '/attribution', label: 'Attribution', group: 'Analytics', shared: true },
  { path: '/compare', label: 'Ad Comparison', group: 'Analytics', shared: false },
  { path: '/campaigns', label: 'Campaigns & Ads', group: 'Campaigns', shared: false },
  { path: '/create', label: 'Create Ad / Campaign', group: 'Campaigns', shared: false },
  { path: '/drafts', label: 'Drafts', group: 'Campaigns', shared: true },
  { path: '/assistant', label: 'AI Assistant', group: 'AI', shared: true },
  { path: '/recommendations', label: 'AI Recommendations', group: 'AI', shared: true },
  { path: '/data-sources', label: 'Data Sources', group: 'System', shared: true },
  { path: '/activity', label: 'Activity Log', group: 'System', shared: true },
];
