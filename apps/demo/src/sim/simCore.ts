// Pure simulation state: reducer + persistence. No React, no network. All state is browser-local.
import type { CreativeTheme, Platform } from '@sedem-ads/analytics-core';
import type { ActivityEntry, EntityOverlay, SimEntity } from './contract';

export const SIM_STORAGE_KEY = 'showcase-demo-sim-v1';
export const SIM_STATE_VERSION = 1;
const MAX_ACTIVITY = 500;

export interface DraftCreative {
  headline: string;
  primaryText: string;
  callToAction: string;
  finalUrl: string;
  theme: CreativeTheme;
}

/** A locally saved, not-yet-created campaign (+ optional first ad). Never sent anywhere. */
export interface Draft {
  id: string;
  platform: Platform;
  campaignName: string;
  /** Meta objective or Google channel type. */
  objective: string;
  dailyBudgetMinor: number | null;
  includeAd: boolean;
  adName: string;
  creative: DraftCreative;
  createdAt: string;
  updatedAt: string;
}

export interface SimState {
  version: typeof SIM_STATE_VERSION;
  overlays: Record<string, EntityOverlay>;
  created: SimEntity[];
  drafts: Draft[];
  activity: ActivityEntry[];
  /** Dismissed recommendation keys. */
  dismissed: string[];
  seq: number;
  idCounter: number;
}

export function emptySimState(): SimState {
  return { version: SIM_STATE_VERSION, overlays: {}, created: [], drafts: [], activity: [], dismissed: [], seq: 0, idCounter: 0 };
}

export type NewActivity = Omit<ActivityEntry, 'seq'>;

export type SimAction =
  | { type: 'change'; entityId: string; patch: Omit<EntityOverlay, 'updatedAt' | 'validatedOnly'>; validatedOnly: boolean; at: string; activity: NewActivity }
  | { type: 'log'; activity: NewActivity }
  | { type: 'created'; entities: SimEntity[]; activity: NewActivity[] }
  | { type: 'saveDraft'; draft: Draft; activity?: NewActivity }
  | { type: 'deleteDraft'; id: string; activity?: NewActivity }
  | { type: 'dismiss'; key: string }
  | { type: 'restore'; key: string }
  | { type: 'restoreAll' }
  | { type: 'reset'; at: string; actor: string };

function withActivity(state: SimState, items: NewActivity[]): SimState {
  if (items.length === 0) return state;
  let seq = state.seq;
  const added = items.map((a) => ({ ...a, seq: ++seq }));
  const activity = [...state.activity, ...added].slice(-MAX_ACTIVITY);
  return { ...state, activity, seq };
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'change': {
      const prev = state.overlays[action.entityId] ?? {};
      // validatedOnly = "validated, NOT applied": status/budget/name fields are left untouched.
      let next: EntityOverlay;
      if (action.validatedOnly) next = { ...prev, validatedOnly: true, updatedAt: action.at };
      else {
        next = { ...prev, ...action.patch, updatedAt: action.at };
        delete next.validatedOnly;
      }
      return withActivity({ ...state, overlays: { ...state.overlays, [action.entityId]: next } }, [action.activity]);
    }
    case 'log':
      return withActivity(state, [action.activity]);
    case 'created':
      return withActivity(
        { ...state, created: [...state.created, ...action.entities], idCounter: state.idCounter + action.entities.length },
        action.activity,
      );
    case 'saveDraft': {
      const exists = state.drafts.some((d) => d.id === action.draft.id);
      const drafts = exists ? state.drafts.map((d) => (d.id === action.draft.id ? action.draft : d)) : [...state.drafts, action.draft];
      return withActivity({ ...state, drafts, idCounter: exists ? state.idCounter : state.idCounter + 1 }, action.activity ? [action.activity] : []);
    }
    case 'deleteDraft':
      return withActivity({ ...state, drafts: state.drafts.filter((d) => d.id !== action.id) }, action.activity ? [action.activity] : []);
    case 'dismiss':
      return state.dismissed.includes(action.key) ? state : { ...state, dismissed: [...state.dismissed, action.key] };
    case 'restore':
      return { ...state, dismissed: state.dismissed.filter((k) => k !== action.key) };
    case 'restoreAll':
      return { ...state, dismissed: [] };
    case 'reset': {
      const fresh = emptySimState();
      return withActivity(fresh, [
        { at: action.at, actor: action.actor, platform: null, action: 'Reset demo', entityId: null, entityName: null, detail: 'All simulated changes, drafts and dismissed recommendations were cleared.', outcome: 'reset' },
      ]);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// persistence (localStorage, always guarded)

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns a valid state or null when the payload is corrupt or from another version. */
export function parseSimState(raw: string | null): SimState | null {
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (!isObj(p) || p.version !== SIM_STATE_VERSION) return null;
    if (!isObj(p.overlays) || !Array.isArray(p.created) || !Array.isArray(p.drafts) || !Array.isArray(p.activity) || !Array.isArray(p.dismissed)) return null;
    if (typeof p.seq !== 'number' || typeof p.idCounter !== 'number') return null;
    if (!p.created.every((c) => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string')) return null;
    if (!p.drafts.every((d) => isObj(d) && typeof d.id === 'string' && isObj(d.creative))) return null;
    if (!p.activity.every((a) => isObj(a) && typeof a.at === 'string' && typeof a.action === 'string')) return null;
    if (!p.dismissed.every((k) => typeof k === 'string')) return null;
    return p as unknown as SimState;
  } catch {
    return null;
  }
}

export function loadSimState(storage: StorageLike | null = defaultStorage()): SimState {
  if (!storage) return emptySimState();
  try {
    return parseSimState(storage.getItem(SIM_STORAGE_KEY)) ?? emptySimState();
  } catch {
    return emptySimState();
  }
}

export function saveSimState(state: SimState, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SIM_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function nextSimId(state: SimState, prefix: string): string {
  return `${prefix}-${String(state.idCounter + 1).padStart(4, '0')}`;
}
