// Simulation provider: browser-local overlay of changes on top of the synthetic dataset.
// All writes go through the write-safety workflow (preview -> validate -> confirm -> execute ->
// read-back -> audit) in changeFlow.ts, and only after an explicit human click.
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import {
  ROLE_LABEL,
  confirmChange,
  createObjects,
  describeRequest,
  reviewChange,
  type ChangeRequest,
  type ChangeReview,
  type EffectiveEntity,
} from './changeFlow';
import type { CreateInput } from './changeFlow';
import { loadSimState, nextSimId, saveSimState, simReducer, type Draft, type NewActivity, type SimState } from './simCore';

import { SimCtx, type SimApi } from './simContext';

export { EntityActions, PrepareChange } from './EntityActions';
export { useSim, type SimApi } from './simContext';
export type { Draft, DraftCreative } from './simCore';

export function SimProvider({ children }: { children: ReactNode }) {
  const { role } = useAppState();
  const [state, dispatch] = useReducer(simReducer, undefined, () => loadSimState());
  const stateRef = useRef<SimState>(state);
  stateRef.current = state;

  useEffect(() => {
    saveSimState(state);
  }, [state]);

  const actor = ROLE_LABEL[role];
  const nowIso = () => new Date().toISOString();

  const review = useCallback((entity: EffectiveEntity, request: ChangeRequest) => reviewChange(entity, request, role), [role]);

  const logRejection = useCallback(
    (r: ChangeReview) => {
      const a: NewActivity = {
        at: nowIso(),
        actor,
        platform: r.entity.platform,
        action: `${describeRequest(r.request)} ${r.entity.level.replace('_', ' ')}`,
        entityId: r.entity.id,
        entityName: r.entity.name,
        detail: `Rejected by safety rules: ${r.issues.join('; ') || 'not allowed'}`,
        outcome: 'rejected',
      };
      dispatch({ type: 'log', activity: a });
    },
    [actor],
  );

  const confirm = useCallback(
    async (r: ChangeReview) => {
      const result = await confirmChange(r, role);
      const before = r.lines.map((l) => `${l.label}: ${l.before} → ${l.after}`).join('; ');
      const base = {
        at: nowIso(),
        actor,
        platform: r.entity.platform,
        action: `${describeRequest(r.request)} ${r.entity.level.replace('_', ' ')}`,
        entityId: r.entity.id,
        entityName: r.entity.name,
      };
      if (!result.success) {
        dispatch({ type: 'log', activity: { ...base, detail: `${before}. ${result.message}`, outcome: 'rejected' } });
        return result;
      }
      const validatedOnly = result.mode === 'validated_only';
      dispatch({
        type: 'change',
        entityId: r.entity.id,
        patch: result.patch,
        validatedOnly,
        at: base.at,
        activity: {
          ...base,
          detail: validatedOnly ? `${before}. Validated only, not applied.` : `${before}. Read-back: ${result.readBack ?? 'ok'}.`,
          outcome: validatedOnly ? 'validated_not_applied' : 'applied_in_simulation',
        },
      });
      return result;
    },
    [role, actor],
  );

  const create = useCallback(
    async (input: CreateInput, fromDraftId?: string) => {
      const s = stateRef.current;
      const prefix = input.platform === 'meta' ? 'sim-meta' : 'sim-google';
      const ids = { campaignId: nextSimId(s, `${prefix}-campaign`), adId: nextSimId({ ...s, idCounter: s.idCounter + 1 }, `${prefix}-ad`) };
      const result = await createObjects(input, role, ids);
      const base = { at: nowIso(), actor, platform: input.platform, entityId: ids.campaignId, entityName: input.campaign.name };
      if (!result.success) {
        dispatch({ type: 'log', activity: { ...base, action: 'Create campaign (PAUSED)', detail: `Rejected: ${result.message}`, outcome: 'rejected' } });
        return result;
      }
      const validatedOnly = result.mode === 'validated_only';
      const detail = validatedOnly ? 'Validated only, nothing created.' : 'Created with status PAUSED. Activation needs a separate confirmed action.';
      const activity: NewActivity[] = result.entities.map((e) => ({
        ...base,
        action: `Create ${e.level === 'ad' ? 'ad' : 'campaign'} (PAUSED)`,
        entityId: e.id,
        entityName: e.name,
        detail,
        outcome: validatedOnly ? 'validated_not_applied' : 'applied_in_simulation',
      }));
      dispatch({ type: 'created', entities: result.entities, activity });
      if (fromDraftId && !validatedOnly) dispatch({ type: 'deleteDraft', id: fromDraftId });
      return result;
    },
    [role, actor],
  );

  const saveDraft = useCallback(
    (d: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Draft => {
      const s = stateRef.current;
      const existing = d.id ? s.drafts.find((x) => x.id === d.id) : undefined;
      const at = nowIso();
      const draft: Draft = { ...d, id: existing?.id ?? nextSimId(s, 'draft'), createdAt: existing?.createdAt ?? at, updatedAt: at };
      dispatch({
        type: 'saveDraft',
        draft,
        activity: { at, actor, platform: draft.platform, action: existing ? 'Update draft' : 'Save draft', entityId: draft.id, entityName: draft.campaignName, detail: 'Saved locally in this browser. Nothing was sent.', outcome: 'draft_saved' },
      });
      return draft;
    },
    [actor],
  );

  const deleteDraft = useCallback(
    (id: string) => {
      const d = stateRef.current.drafts.find((x) => x.id === id);
      dispatch({
        type: 'deleteDraft',
        id,
        activity: d ? { at: nowIso(), actor, platform: d.platform, action: 'Delete draft', entityId: d.id, entityName: d.campaignName, detail: 'Draft removed from this browser.', outcome: 'draft_saved' } : undefined,
      });
    },
    [actor],
  );

  const api = useMemo<SimApi>(
    () => ({
      overlay: (id) => state.overlays[id],
      created: state.created,
      activity: state.activity,
      reset: () => dispatch({ type: 'reset', at: nowIso(), actor }),
      drafts: state.drafts,
      dismissed: state.dismissed,
      role,
      review,
      confirm,
      logRejection,
      create,
      saveDraft,
      deleteDraft,
      dismiss: (key) => dispatch({ type: 'dismiss', key }),
      restore: (key) => dispatch({ type: 'restore', key }),
      restoreAll: () => dispatch({ type: 'restoreAll' }),
      logActivity: (a) => dispatch({ type: 'log', activity: { ...a, at: nowIso(), actor } }),
    }),
    [state, role, actor, review, confirm, logRejection, create, saveDraft, deleteDraft],
  );

  return <SimCtx.Provider value={api}>{children}</SimCtx.Provider>;
}

