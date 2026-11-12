import { createContext, useContext } from 'react';
import type { Role } from '../state/AppState';
import type { ActivityEntry, EntityOverlay, SimEntity } from './contract';
import type { ChangeRequest, ChangeResult, ChangeReview, CreateInput, CreateResult, EffectiveEntity } from './changeFlow';
import type { Draft } from './simCore';

export interface SimApi {
  overlay: (id: string) => EntityOverlay | undefined;
  created: SimEntity[];
  activity: ActivityEntry[];
  reset: () => void;
  // ---- additions ----
  drafts: Draft[];
  /** Dismissed recommendation keys. */
  dismissed: string[];
  role: Role;
  /** Steps 1-2 of the flow: read current state, preview, validate. Writes nothing. */
  review: (entity: EffectiveEntity, request: ChangeRequest) => Promise<ChangeReview>;
  /** Steps 3-6: confirm, execute (simulated), read back, log. Call only from a human click. */
  confirm: (review: ChangeReview) => Promise<ChangeResult>;
  /** Record a rejected (failed validation) attempt in the activity log. */
  logRejection: (review: ChangeReview) => void;
  /** Create a campaign (+ ad), always PAUSED. Google is validate-only. */
  create: (input: CreateInput, fromDraftId?: string) => Promise<CreateResult>;
  /** Create or update a draft; returns the saved draft. */
  saveDraft: (draft: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Draft;
  deleteDraft: (id: string) => void;
  dismiss: (key: string) => void;
  restore: (key: string) => void;
  restoreAll: () => void;
  /** Append a plain entry to the browser-local change log (no entity is changed). */
  logActivity: (a: Omit<ActivityEntry, 'seq' | 'at' | 'actor'>) => void;
}

const noop = () => {};
const defaultApi: SimApi = {
  overlay: () => undefined,
  created: [],
  activity: [],
  reset: noop,
  drafts: [],
  dismissed: [],
  role: 'EDITOR',
  review: () => Promise.reject(new Error('SimProvider missing')),
  confirm: () => Promise.reject(new Error('SimProvider missing')),
  logRejection: noop,
  create: () => Promise.reject(new Error('SimProvider missing')),
  saveDraft: () => {
    throw new Error('SimProvider missing');
  },
  deleteDraft: noop,
  dismiss: noop,
  restore: noop,
  restoreAll: noop,
  logActivity: noop,
};

export const SimCtx = createContext<SimApi>(defaultApi);


export function useSim(): SimApi {
  return useContext(SimCtx);
}
