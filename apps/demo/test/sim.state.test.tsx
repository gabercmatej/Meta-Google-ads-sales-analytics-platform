import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppStateProvider } from '../src/state/AppState';
import { SimProvider } from '../src/sim/SimProvider';
import { confirmChange, createObjects, reviewChange, VIEWER_TOOLTIP, type EffectiveEntity } from '../src/sim/changeFlow';
import { emptySimState, loadSimState, parseSimState, saveSimState, simReducer, SIM_STORAGE_KEY, type SimState, type StorageLike } from '../src/sim/simCore';
import { validateDraft } from '../src/sim/draftValidation';
import { getDataset } from '../src/lib/data';
import { seedActivity } from '../src/lib/activitySeed';
import ActivityPage from '../src/pages/ActivityPage';
import AssistantPage from '../src/pages/AssistantPage';

afterEach(cleanup);

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const meta: EffectiveEntity = { id: 'meta-c1', level: 'campaign', platform: 'meta', name: 'Consultations | Prospecting', status: 'ACTIVE', dailyBudgetMinor: 5000 };
const google: EffectiveEntity = { id: 'google-c1', level: 'campaign', platform: 'google', name: 'Search | Core Services', status: 'ACTIVE', dailyBudgetMinor: 4000 };

async function apply(state: SimState, entity: EffectiveEntity, request: Parameters<typeof reviewChange>[1], role: 'EDITOR' | 'VIEWER' = 'EDITOR') {
  const review = await reviewChange(entity, request, role);
  if (!review.ok) return { state, review, result: null };
  const result = await confirmChange(review, role);
  const next = simReducer(state, {
    type: 'change',
    entityId: entity.id,
    patch: result.patch,
    validatedOnly: result.mode === 'validated_only',
    at: '2026-11-11T10:00:00.000Z',
    activity: { at: '2026-11-11T10:00:00.000Z', actor: 'demo', platform: entity.platform, action: request.kind, entityId: entity.id, entityName: entity.name, detail: result.message, outcome: result.mode === 'applied' ? 'applied_in_simulation' : 'validated_not_applied' },
  });
  return { state: next, review, result };
}

describe('simulated change flow', () => {
  it('pauses and resumes a Meta campaign in simulation with a read-back', async () => {
    const paused = await apply(emptySimState(), meta, { kind: 'pause' });
    expect(paused.result?.success).toBe(true);
    expect(paused.result?.message).toBe('Applied in simulation');
    expect(paused.result?.readBack).toContain('PAUSED');
    expect(paused.state.overlays['meta-c1']?.status).toBe('PAUSED');
    expect(paused.state.activity).toHaveLength(1);
    const resumed = await apply(paused.state, { ...meta, status: 'PAUSED' }, { kind: 'resume' });
    expect(resumed.state.overlays['meta-c1']?.status).toBe('ACTIVE');
  });

  it('applies a valid budget change and rejects one above 30% or non-positive', async () => {
    const ok = await apply(emptySimState(), meta, { kind: 'set_budget', newDailyBudgetMinor: 6000 });
    expect(ok.state.overlays['meta-c1']?.dailyBudgetMinor).toBe(6000);
    expect(ok.result?.readBack).toContain('60.00');

    const tooBig = await reviewChange(meta, { kind: 'set_budget', newDailyBudgetMinor: 6600 }, 'EDITOR');
    expect(tooBig.ok).toBe(false);
    expect(tooBig.issues.length).toBeGreaterThan(0);
    const zero = await reviewChange(meta, { kind: 'set_budget', newDailyBudgetMinor: 0 }, 'EDITOR');
    expect(zero.ok).toBe(false);
    const negative = await reviewChange(meta, { kind: 'set_budget', newDailyBudgetMinor: -100 }, 'EDITOR');
    expect(negative.ok).toBe(false);
  });

  it('edits a name locally', async () => {
    const r = await apply(emptySimState(), meta, { kind: 'edit', name: 'Renamed campaign' });
    expect(r.state.overlays['meta-c1']?.name).toBe('Renamed campaign');
  });

  it('Google is validate-only: status stays unchanged and the result says nothing was applied', async () => {
    const r = await apply(emptySimState(), google, { kind: 'pause' });
    expect(r.result?.mode).toBe('validated_only');
    expect(r.result?.message).toBe('Validated only — Google changes are validate-only in this demo, nothing applied');
    expect(r.state.overlays['google-c1']?.status).toBeUndefined();
    expect(r.state.overlays['google-c1']?.validatedOnly).toBe(true);
  });

  it('a Viewer is blocked and nothing is recorded', async () => {
    const r = await apply(emptySimState(), meta, { kind: 'pause' }, 'VIEWER');
    expect(r.review.ok).toBe(false);
    expect(r.review.issues.join(' ')).toContain(VIEWER_TOOLTIP);
    expect(r.state.overlays).toEqual({});
    const created = await createObjects({ platform: 'meta', campaign: { name: 'X', dailyBudgetMinor: 2000 } }, 'VIEWER', { campaignId: 'c', adId: 'a' });
    expect(created.success).toBe(false);
  });

  it('creates objects as PAUSED; Google creation is validate-only', async () => {
    const m = await createObjects({ platform: 'meta', campaign: { name: 'New', dailyBudgetMinor: 2000 }, ad: { name: 'Ad', headline: 'h', primaryText: 't' } }, 'EDITOR', { campaignId: 'sim-meta-campaign-0001', adId: 'sim-meta-ad-0002' });
    expect(m.success).toBe(true);
    expect(m.entities.map((e) => e.status)).toEqual(['PAUSED', 'PAUSED']);
    const g = await createObjects({ platform: 'google', campaign: { name: 'New', dailyBudgetMinor: 2000 } }, 'EDITOR', { campaignId: 'c', adId: 'a' });
    expect(g.mode).toBe('validated_only');
    expect(g.message).toContain('validate-only');
  });
});

describe('draft validation', () => {
  const base = { campaignName: 'Camp', dailyBudgetMinor: 2000, includeAd: true, adName: 'Ad', creative: { headline: 'H', primaryText: 'T', callToAction: 'Learn more', finalUrl: 'https://example.com/a', theme: 'brand' as const } };
  it('accepts a valid draft and rejects external URLs and bad budgets', () => {
    expect(validateDraft(base)).toEqual({});
    expect(validateDraft({ ...base, creative: { ...base.creative, finalUrl: 'https://evil.test/' } }).finalUrl).toBeDefined();
    expect(validateDraft({ ...base, creative: { ...base.creative, finalUrl: 'https://example.com.evil.test/' } }).finalUrl).toBeDefined();
    expect(validateDraft({ ...base, dailyBudgetMinor: 0 }).dailyBudget).toBeDefined();
    expect(validateDraft({ ...base, dailyBudgetMinor: null }).dailyBudget).toBeDefined();
    expect(validateDraft({ ...base, campaignName: ' ' }).campaignName).toBeDefined();
  });
});

describe('sim state, drafts, dismiss and reset', () => {
  it('drafts and dismissals persist through reducer round trips', () => {
    let s = emptySimState();
    const draft = { id: 'draft-0001', platform: 'meta' as const, campaignName: 'D', objective: 'LEADS', dailyBudgetMinor: 2000, includeAd: false, adName: '', creative: { headline: '', primaryText: '', callToAction: 'Learn more', finalUrl: 'https://example.com/', theme: 'brand' as const }, createdAt: 'a', updatedAt: 'a' };
    s = simReducer(s, { type: 'saveDraft', draft });
    s = simReducer(s, { type: 'saveDraft', draft: { ...draft, campaignName: 'D2' } });
    expect(s.drafts).toHaveLength(1);
    expect(s.drafts[0]?.campaignName).toBe('D2');
    s = simReducer(s, { type: 'dismiss', key: 'rising_cpl:meta-c1' });
    s = simReducer(s, { type: 'dismiss', key: 'rising_cpl:meta-c1' });
    expect(s.dismissed).toEqual(['rising_cpl:meta-c1']);
    s = simReducer(s, { type: 'restore', key: 'rising_cpl:meta-c1' });
    expect(s.dismissed).toEqual([]);
    s = simReducer(s, { type: 'deleteDraft', id: 'draft-0001' });
    expect(s.drafts).toEqual([]);
  });

  it('reset clears everything and logs a single reset entry', async () => {
    const changed = await apply(emptySimState(), meta, { kind: 'pause' });
    const s = simReducer({ ...changed.state, dismissed: ['k'] }, { type: 'reset', at: '2026-11-11T10:05:00.000Z', actor: 'demo' });
    expect(s.overlays).toEqual({});
    expect(s.dismissed).toEqual([]);
    expect(s.created).toEqual([]);
    expect(s.activity).toHaveLength(1);
    expect(s.activity[0]?.outcome).toBe('reset');
  });

  it('persists to storage and ignores corrupt or foreign data', async () => {
    const storage = new MemoryStorage();
    const changed = await apply(emptySimState(), meta, { kind: 'pause' });
    expect(saveSimState(changed.state, storage)).toBe(true);
    expect(loadSimState(storage).overlays['meta-c1']?.status).toBe('PAUSED');

    for (const bad of ['{not json', '{"version":99}', '[]', 'null', JSON.stringify({ ...changed.state, activity: 'x' })]) {
      storage.setItem(SIM_STORAGE_KEY, bad);
      expect(loadSimState(storage)).toEqual(emptySimState());
    }
    expect(parseSimState(null)).toBeNull();

    const throwing: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {},
    };
    expect(loadSimState(throwing)).toEqual(emptySimState());
    expect(saveSimState(changed.state, throwing)).toBe(false);
  });
});

function mount(path: string, element: React.ReactNode, routePath: string) {
  const router = createMemoryRouter([{ path: routePath, element }], { initialEntries: [path] });
  render(
    <AppStateProvider>
      <SimProvider>
        <RouterProvider router={router} />
      </SimProvider>
    </AppStateProvider>,
  );
  return router;
}

describe('assistant and activity pages', () => {
  it('shows the label, answers a deep-link question once and offers the tool-call trace', async () => {
    window.localStorage.clear();
    mount('/assistant?q=Compare%20Meta%20and%20Google', <AssistantPage />, '/assistant');
    await waitFor(() => expect(screen.getByText(/Grounded: \d+\/\d+ numbers verified/)).toBeTruthy());
    expect(document.body.textContent).toContain('Demo AI Assistant — simulated, data-grounded analysis');
    for (const h of ['Key numbers', 'Why — evidence', 'What I would do', 'Limits']) expect(screen.getAllByText(h).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Grounded:/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show tool calls' }));
    expect(screen.getByRole('region', { name: 'Tool calls' }).textContent).toContain('performanceTotals');
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    expect(screen.queryByText(/Grounded:/)).toBeNull();
  });

  it('Enter submits and Shift+Enter does not', async () => {
    mount('/assistant', <AssistantPage />, '/assistant');
    const box = screen.getByLabelText('Your question');
    fireEvent.change(box, { target: { value: 'What is the attributable ROAS?' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(screen.queryByText(/Grounded:/)).toBeNull();
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/Grounded:/)).toBeTruthy());
  });

  it('Activity reset requires confirmation and leaves one reset entry', async () => {
    window.localStorage.clear();
    mount('/activity', <ActivityPage />, '/activity');
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByRole('dialog', { name: 'Reset demo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset everything' }));
    await waitFor(() => expect(screen.getAllByText('Reset demo').length).toBeGreaterThan(0));
    // Exactly one session entry (the reset) on top of the seeded synthetic history; the history itself is kept.
    const seeded = seedActivity(getDataset()).length;
    expect(screen.getByText(`${seeded + 1} entries`)).toBeTruthy();
    expect(screen.getAllByText('Synthetic history').length).toBeGreaterThan(0);
  });
});
