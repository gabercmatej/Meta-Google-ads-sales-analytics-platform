// Independent reference implementation for the Sedem Ads showcase. Not production source.
import { describe, expect, it } from 'vitest';
import {
  type Actor,
  type Operation,
  DEFAULT_CAPABILITIES,
  SimulatedWriteAdapter,
  WriteSafetyError,
  WriteWorkflow,
} from '../src/index.js';

const ACCOUNT = 'meta-demo-account';
const editor: Actor = { id: 'u-editor', kind: 'human', role: 'EDITOR' };
const admin: Actor = { id: 'u-admin', kind: 'human', role: 'ADMIN' };
const viewer: Actor = { id: 'u-viewer', kind: 'human', role: 'VIEWER' };
const ai: Actor = { id: 'assistant', kind: 'ai', role: 'ADMIN' };

function setup(opts: { drift?: boolean; fail?: boolean; capabilities?: Parameters<typeof makeWorkflow>[1] } = {}) {
  const adapter = new SimulatedWriteAdapter({ driftOnMutate: opts.drift, failMutate: opts.fail });
  adapter.seed(ACCOUNT, { id: 'meta-c1', type: 'campaign', name: 'Demo campaign', status: 'ACTIVE', dailyBudgetMinor: 10000 });
  adapter.seed(ACCOUNT, { id: 'meta-c2', type: 'campaign', name: 'Paused demo', status: 'PAUSED', dailyBudgetMinor: 5000 });
  const wf = makeWorkflow(adapter, opts.capabilities);
  return { adapter, wf };
}

function makeWorkflow(adapter: SimulatedWriteAdapter, capabilities?: Partial<Record<'meta' | 'google', 'live' | 'validate_only' | 'off'>>) {
  return new WriteWorkflow({
    adapters: { meta: adapter, google: adapter },
    allowedAccounts: { meta: [ACCOUNT], google: [ACCOUNT] },
    capabilities,
    now: () => new Date('2026-01-01T12:00:00Z'),
  });
}

const pause: Operation = { type: 'pause', entityType: 'campaign', entityId: 'meta-c1' };

async function toConfirmed(wf: WriteWorkflow, operation: Operation = pause, platform: 'meta' | 'google' = 'meta') {
  const p = wf.createProposal({ platform, accountId: ACCOUNT, operation, actor: editor });
  await wf.preview(p.id);
  wf.validate(p.id);
  wf.confirm(p.id, editor);
  return p.id;
}

async function code(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WriteSafetyError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('happy path', () => {
  it('draft, preview, validate, confirm, execute once, read back, audit log', async () => {
    const { wf, adapter } = setup();
    const id = await toConfirmed(wf);
    const done = await wf.execute(id);
    expect(done.status).toBe('verified');
    expect(done.execution?.verified).toBe(true);
    expect(done.execution?.readBack?.status).toBe('PAUSED');
    expect(adapter.mutateCalls).toBe(1);
    expect(wf.auditLog.map((e) => e.action)).toEqual(['created', 'previewed', 'validated', 'confirmed', 'executed', 'verified']);
    expect(wf.auditLog.every((e) => e.accountId === ACCOUNT)).toBe(true);
  });

  it('the preview reads the current state from the platform', async () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    const prev = await wf.preview(p.id);
    expect(prev.preview?.before?.status).toBe('ACTIVE');
    expect(prev.preview?.after).toEqual({ status: 'PAUSED' });
    expect(prev.status).toBe('previewed');
  });

  it('a budget change within the limit executes and verifies', async () => {
    const { wf } = setup();
    const id = await toConfirmed(wf, { type: 'set_budget', entityType: 'campaign', entityId: 'meta-c1', newDailyBudgetMinor: 12000 });
    expect((await wf.execute(id)).status).toBe('verified');
  });

  it('timestamps come from the injected clock', () => {
    const { wf } = setup();
    expect(wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor }).createdAt).toBe('2026-01-01T12:00:00.000Z');
  });
});

describe('human gate', () => {
  it('an AI actor can only create a draft', () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: ai });
    expect(p.status).toBe('draft');
    expect(p.origin).toBe('ai');
  });

  it('an AI actor can never confirm, even with an ADMIN role', async () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: ai });
    await wf.preview(p.id);
    wf.validate(p.id);
    expect(await code(() => wf.confirm(p.id, ai))).toBe('HUMAN_REQUIRED');
    expect(await code(() => wf.confirm(p.id, { id: 'cron', kind: 'system', role: 'ADMIN' }))).toBe('HUMAN_REQUIRED');
  });

  it('a VIEWER can neither propose nor confirm', async () => {
    const { wf } = setup();
    expect(await code(() => wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: viewer }))).toBe('FORBIDDEN');
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: ai });
    await wf.preview(p.id);
    wf.validate(p.id);
    expect(await code(() => wf.confirm(p.id, viewer))).toBe('FORBIDDEN');
  });

  it('an ADMIN can confirm an AI draft after review', async () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: ai });
    await wf.preview(p.id);
    wf.validate(p.id);
    expect(wf.confirm(p.id, admin).confirmedBy).toBe('u-admin');
  });

  it('nothing executes before confirmation, in any earlier state', async () => {
    const { wf, adapter } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    expect(await code(() => wf.execute(p.id))).toBe('INVALID_STATE');
    await wf.preview(p.id);
    expect(await code(() => wf.execute(p.id))).toBe('INVALID_STATE');
    wf.validate(p.id);
    expect(await code(() => wf.execute(p.id))).toBe('INVALID_STATE');
    expect(adapter.mutateCalls).toBe(0);
    expect(adapter.validateCalls).toBe(0);
  });
});

describe('state machine', () => {
  it('rejects out-of-order steps', async () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    expect(await code(() => wf.validate(p.id))).toBe('INVALID_STATE');
    expect(await code(() => wf.confirm(p.id, editor))).toBe('INVALID_STATE');
    await wf.preview(p.id);
    expect(await code(() => wf.preview(p.id))).toBe('INVALID_STATE');
  });

  it('execute is once only: a second call is refused and mutates nothing more', async () => {
    const { wf, adapter } = setup();
    const id = await toConfirmed(wf);
    await wf.execute(id);
    expect(await code(() => wf.execute(id))).toBe('INVALID_STATE');
    expect(adapter.mutateCalls).toBe(1);
  });

  it('two concurrent executes produce one mutation', async () => {
    const { wf, adapter } = setup();
    const id = await toConfirmed(wf);
    const results = await Promise.allSettled([wf.execute(id), wf.execute(id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(adapter.mutateCalls).toBe(1);
  });

  it('unknown proposal ids are refused', async () => {
    const { wf } = setup();
    expect(await code(() => wf.get('nope'))).toBe('INVALID_STATE');
  });

  it('returned proposals are copies, so callers cannot mutate workflow state', () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    p.status = 'verified';
    expect(wf.get(p.id).status).toBe('draft');
    expect(wf.list()).toHaveLength(1);
  });
});

describe('validation rules', () => {
  async function validated(operation: Operation) {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation, actor: editor });
    await wf.preview(p.id);
    return wf.validate(p.id);
  }

  it('rejects a budget change beyond the limit', async () => {
    const r = await validated({ type: 'set_budget', entityType: 'campaign', entityId: 'meta-c1', newDailyBudgetMinor: 20000 });
    expect(r.status).toBe('rejected');
    expect(r.validation?.issues[0]).toMatch(/exceeds/);
  });

  it('rejects non-positive and fractional budgets', async () => {
    expect((await validated({ type: 'set_budget', entityType: 'campaign', entityId: 'meta-c1', newDailyBudgetMinor: 0 })).status).toBe('rejected');
    expect((await validated({ type: 'set_budget', entityType: 'campaign', entityId: 'meta-c1', newDailyBudgetMinor: 100.5 })).status).toBe('rejected');
  });

  it('rejects pausing something already paused and resuming something already active', async () => {
    expect((await validated({ type: 'pause', entityType: 'campaign', entityId: 'meta-c2' })).status).toBe('rejected');
    expect((await validated({ type: 'resume', entityType: 'campaign', entityId: 'meta-c1' })).status).toBe('rejected');
  });

  it('rejects an entity that does not exist on the platform', async () => {
    const r = await validated({ type: 'pause', entityType: 'campaign', entityId: 'meta-missing' });
    expect(r.status).toBe('rejected');
    expect(r.validation?.issues).toContain('entity not found on the platform');
  });

  it('a rejected proposal cannot be confirmed or executed', async () => {
    const { wf } = setup();
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: { type: 'pause', entityType: 'campaign', entityId: 'meta-c2' }, actor: editor });
    await wf.preview(p.id);
    wf.validate(p.id);
    expect(await code(() => wf.confirm(p.id, editor))).toBe('INVALID_STATE');
    expect(await code(() => wf.execute(p.id))).toBe('INVALID_STATE');
  });

  it('rejects an empty name on create', async () => {
    expect((await validated({ type: 'create', entityType: 'campaign', name: '  ' })).status).toBe('rejected');
  });
});

describe('new objects are PAUSED', () => {
  it('refuses to propose an ACTIVE creation', () => {
    const { wf } = setup();
    const op: Operation = { type: 'create', entityType: 'campaign', name: 'x', initialStatus: 'ACTIVE' };
    expect(() => wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: op, actor: editor })).toThrow(WriteSafetyError);
  });

  it('a created object comes back PAUSED and activation is a separate confirmed resume', async () => {
    const { wf, adapter } = setup();
    const id = await toConfirmed(wf, { type: 'create', entityType: 'campaign', name: 'New demo', dailyBudgetMinor: 3000 });
    const done = await wf.execute(id);
    expect(done.status).toBe('verified');
    expect(done.execution?.readBack?.status).toBe('PAUSED');
    expect(wf.get(id).preview?.after?.status).toBe('PAUSED');
    const newId = done.execution!.entityId!;
    expect((await adapter.readState(ACCOUNT, newId))?.status).toBe('PAUSED');
    const resumeId = await toConfirmed(wf, { type: 'resume', entityType: 'campaign', entityId: newId });
    expect(resumeId).not.toBe(id);
    expect((await wf.execute(resumeId)).execution?.readBack?.status).toBe('ACTIVE');
  });
});

describe('capabilities and allow-list', () => {
  it('has a documented default posture', () => {
    expect(DEFAULT_CAPABILITIES).toEqual({ meta: 'live', google: 'validate_only' });
  });

  it('Google defaults to validate-only: the dry run is called and mutate never is', async () => {
    const { wf, adapter } = setup();
    const id = await toConfirmed(wf, pause, 'google');
    const done = await wf.execute(id);
    expect(done.status).toBe('executed_validate_only');
    expect(done.execution?.mode).toBe('validate_only');
    expect(adapter.mutateCalls).toBe(0);
    expect(adapter.validateCalls).toBe(1);
    expect((await adapter.readState(ACCOUNT, 'meta-c1'))?.status).toBe('ACTIVE');
  });

  it('a platform switched off cannot preview or execute', async () => {
    const { wf } = setup({ capabilities: { meta: 'off' } });
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    expect(await code(() => wf.preview(p.id))).toBe('CAPABILITY_OFF');
  });

  it('switching off after confirmation still blocks the write', async () => {
    const adapter = new SimulatedWriteAdapter();
    adapter.seed(ACCOUNT, { id: 'meta-c1', type: 'campaign', name: 'x', status: 'ACTIVE', dailyBudgetMinor: 10000 });
    const live = makeWorkflow(adapter);
    const id = await toConfirmed(live);
    expect(await code(() => makeWorkflow(adapter, { meta: 'off' }).execute(id))).toBe('INVALID_STATE');
    expect(adapter.mutateCalls).toBe(0);
  });

  it('an account outside the allow-list is refused at proposal time', async () => {
    const { wf } = setup();
    expect(await code(() => wf.createProposal({ platform: 'meta', accountId: 'meta-other-account', operation: pause, actor: editor }))).toBe('ACCOUNT_NOT_ALLOWED');
  });

  it('a platform without an allow-list entry allows no account', async () => {
    const wf = new WriteWorkflow({ adapters: { meta: new SimulatedWriteAdapter() }, allowedAccounts: {} });
    expect(await code(() => wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor }))).toBe('ACCOUNT_NOT_ALLOWED');
  });

  it('a missing adapter is reported, not ignored', async () => {
    const wf = new WriteWorkflow({ adapters: {}, allowedAccounts: { meta: [ACCOUNT] } });
    const p = wf.createProposal({ platform: 'meta', accountId: ACCOUNT, operation: pause, actor: editor });
    expect(await code(() => wf.preview(p.id))).toBe('ADAPTER_MISSING');
  });
});

describe('read-back verification and failures', () => {
  it('a platform that applies a different value is caught', async () => {
    const { wf } = setup({ drift: true });
    const id = await toConfirmed(wf);
    const done = await wf.execute(id);
    expect(done.status).toBe('verification_failed');
    expect(done.execution?.verified).toBe(false);
    expect(wf.auditLog.at(-1)?.action).toBe('verification_failed');
  });

  it('an adapter error ends as failed and is logged, with no retry', async () => {
    const { wf, adapter } = setup({ fail: true });
    const id = await toConfirmed(wf);
    const done = await wf.execute(id);
    expect(done.status).toBe('failed');
    expect(done.execution?.error).toMatch(/simulated/);
    expect(adapter.mutateCalls).toBe(1);
    expect(await code(() => wf.execute(id))).toBe('INVALID_STATE');
  });
});

describe('audit log', () => {
  it('is sequential, copy-returning and attributes the confirmation to the human', async () => {
    const { wf } = setup();
    await wf.execute(await toConfirmed(wf));
    const log = wf.auditLog;
    expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i + 1));
    expect(log.find((e) => e.action === 'confirmed')?.actorId).toBe('u-editor');
    (log[0] as { action: string }).action = 'tampered';
    expect(wf.auditLog[0]!.action).toBe('created');
  });
});
