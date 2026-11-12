// CONTRACT between the simulation workstream (owner: src/sim/**) and the pages that show
// campaign/ad rows. Pages read overlays and render <EntityActions>; only src/sim changes state.
// All state is browser-local. No real advertising account is ever affected.

import type { EntityLevel, Platform, ShowcaseEntityStatus } from '@sedem-ads/analytics-core';

/** Local changes applied on top of the synthetic dataset for one entity. */
export interface EntityOverlay {
  status?: ShowcaseEntityStatus;
  dailyBudgetMinor?: number | null;
  name?: string;
  /** Ads only: edited copy. */
  headline?: string;
  primaryText?: string;
  /** Google is validate-only: the change was validated but NOT applied. */
  validatedOnly?: boolean;
  updatedAt?: string;
}

/** Entity created in the simulation. Always starts PAUSED; it has no delivery data. */
export interface SimEntity {
  id: string;
  level: EntityLevel;
  platform: Platform;
  name: string;
  status: ShowcaseEntityStatus;
  dailyBudgetMinor: number | null;
  campaignId: string | null;
  adGroupId: string | null;
  createdAt: string;
  /** Google: validated only, never applied. */
  validatedOnly: boolean;
}

export interface ActivityEntry {
  seq: number;
  at: string;
  actor: string;
  platform: Platform | null;
  action: string;
  entityId: string | null;
  entityName: string | null;
  detail: string;
  outcome: 'applied_in_simulation' | 'validated_not_applied' | 'rejected' | 'draft_saved' | 'reset' | 'refreshed' | 'synthetic_history';
}

export interface EntityRef {
  id: string;
  level: EntityLevel;
  platform: Platform;
  name: string;
  status: ShowcaseEntityStatus;
  dailyBudgetMinor: number | null;
}
