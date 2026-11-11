// Independent reference implementation for the Sedem Ads showcase. Not production source.
//
// Human-confirmed write workflow for ad platforms:
//   draft -> preview (current state read via adapter) -> validated -> confirmed by a human
//   (EDITOR or ADMIN) -> executed once -> read-back verified -> audit log.
// New objects are always created PAUSED. AI-origin proposals can only exist as drafts until a
// human confirms them. The workflow is the only holder of the adapters, and a platform in
// `validate_only` mode never receives a mutate call.

import type { Platform } from './spend.js';

export type CapabilityMode = 'live' | 'validate_only' | 'off';
export type CapabilityMap = Record<Platform, CapabilityMode>;

/** Default posture of the showcase: Meta live, Google validate-only. Configurable per instance. */
export const DEFAULT_CAPABILITIES: CapabilityMap = { meta: 'live', google: 'validate_only' };

export type EntityType = 'campaign' | 'ad_set' | 'ad';
export type EntityStatus = 'ACTIVE' | 'PAUSED';

export interface EntityState {
  id: string;
  type: EntityType;
  name: string;
  status: EntityStatus;
  dailyBudgetMinor?: number | null;
}

export type Operation =
  | { type: 'pause'; entityType: EntityType; entityId: string }
  | { type: 'resume'; entityType: EntityType; entityId: string }
  | { type: 'set_budget'; entityType: EntityType; entityId: string; newDailyBudgetMinor: number }
  | {
      type: 'create';
      entityType: EntityType;
      name: string;
      parentId?: string;
      dailyBudgetMinor?: number;
      /** Must be omitted or PAUSED. Activation is a separate, separately confirmed `resume`. */
      initialStatus?: EntityStatus;
    };

export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN';

export interface Actor {
  id: string;
  kind: 'human' | 'ai' | 'system';
  role: Role;
}

export type ProposalStatus =
  | 'draft'
  | 'previewed'
  | 'validated'
  | 'rejected'
  | 'confirmed'
  | 'executing'
  | 'executed_validate_only'
  | 'verified'
  | 'verification_failed'
  | 'failed';

export interface Preview {
  before: EntityState | null;
  after: Partial<EntityState> | null;
  summary: string;
}

export interface Proposal {
  id: string;
  platform: Platform;
  accountId: string;
  operation: Operation;
  origin: 'human' | 'ai';
  createdBy: string;
  createdAt: string;
  status: ProposalStatus;
  preview?: Preview;
  validation?: { ok: boolean; issues: string[] };
  confirmedBy?: string;
  confirmedAt?: string;
  execution?: {
    mode: 'live' | 'validate_only';
    entityId?: string;
    readBack?: EntityState | null;
    verified?: boolean;
    error?: string;
  };
}

export interface AuditLogEntry {
  seq: number;
  at: string;
  proposalId: string;
  action: string;
  actorId: string;
  platform: Platform;
  accountId: string;
  detail?: string;
}

export type WriteErrorCode =
  | 'FORBIDDEN'
  | 'HUMAN_REQUIRED'
  | 'INVALID_STATE'
  | 'CAPABILITY_OFF'
  | 'ACCOUNT_NOT_ALLOWED'
  | 'UNSAFE_OPERATION'
  | 'ADAPTER_MISSING';

export class WriteSafetyError extends Error {
  constructor(
    public readonly code: WriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WriteSafetyError';
  }
}

export interface MutationRequest {
  platform: Platform;
  accountId: string;
  operation: Operation;
  /** The proposal id. Adapters use it to make a retried request a no-op. */
  idempotencyKey: string;
}

/** The only door to a platform. Injected; the workflow decides when each method may be called. */
export interface WriteAdapter {
  readState(accountId: string, entityId: string): Promise<EntityState | null>;
  /** Platform-side dry run. Must not change anything. */
  validateOnly(request: MutationRequest): Promise<{ ok: boolean; message?: string }>;
  /** Real change. Never called in validate_only mode or before human confirmation. */
  mutate(request: MutationRequest): Promise<{ entityId: string }>;
}

export interface WorkflowOptions {
  adapters: Partial<Record<Platform, WriteAdapter>>;
  capabilities?: Partial<CapabilityMap>;
  /** Explicit allow-list per platform. A platform without an entry allows no account. */
  allowedAccounts: Partial<Record<Platform, readonly string[]>>;
  /** Largest allowed relative change of a daily budget, in percent. Default 30. */
  maxBudgetChangePercent?: number;
  now?: () => Date;
}

const CAN_CONFIRM: readonly Role[] = ['EDITOR', 'ADMIN'];

export class WriteWorkflow {
  private readonly proposals = new Map<string, Proposal>();
  private readonly log: AuditLogEntry[] = [];
  private readonly capabilities: CapabilityMap;
  private readonly maxPct: number;
  private readonly now: () => Date;
  private counter = 0;

  constructor(private readonly options: WorkflowOptions) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...options.capabilities };
    this.maxPct = options.maxBudgetChangePercent ?? 30;
    this.now = options.now ?? (() => new Date());
  }

  get auditLog(): readonly AuditLogEntry[] {
    return this.log.map((e) => ({ ...e }));
  }

  get(id: string): Proposal {
    const p = this.proposals.get(id);
    if (!p) throw new WriteSafetyError('INVALID_STATE', `Unknown proposal ${id}`);
    return clone(p);
  }

  list(): Proposal[] {
    return [...this.proposals.values()].map((p) => clone(p));
  }

  /**
   * Create a draft. Anyone allowed to propose (an AI actor, or a human EDITOR/ADMIN) ends up
   * with status `draft`; nothing is read from or written to a platform here.
   */
  createProposal(input: { platform: Platform; accountId: string; operation: Operation; actor: Actor }): Proposal {
    const { platform, accountId, operation, actor } = input;
    if (actor.kind === 'human' && !CAN_CONFIRM.includes(actor.role)) {
      throw new WriteSafetyError('FORBIDDEN', `Role ${actor.role} may not propose changes`);
    }
    if (operation.type === 'create' && operation.initialStatus === 'ACTIVE') {
      throw new WriteSafetyError('UNSAFE_OPERATION', 'New objects are always created PAUSED; activate with a separate confirmed resume');
    }
    this.assertAccount(platform, accountId);
    const id = `proposal-${String(++this.counter).padStart(4, '0')}`;
    const proposal: Proposal = {
      id,
      platform,
      accountId,
      operation: clone(operation),
      origin: actor.kind === 'ai' ? 'ai' : 'human',
      createdBy: actor.id,
      createdAt: this.now().toISOString(),
      status: 'draft',
    };
    this.proposals.set(id, proposal);
    this.record(proposal, 'created', actor.id, `origin=${proposal.origin}`);
    return clone(proposal);
  }

  /** Read the current platform state and show what would change. Read-only. */
  async preview(id: string): Promise<Proposal> {
    const p = this.mutable(id);
    this.expect(p, ['draft']);
    this.assertCapability(p);
    this.assertAccount(p.platform, p.accountId);
    const op = p.operation;
    let before: EntityState | null = null;
    if (op.type !== 'create') before = await this.adapter(p.platform).readState(p.accountId, op.entityId);
    let after: Partial<EntityState> | null;
    let summary: string;
    switch (op.type) {
      case 'pause':
        after = { status: 'PAUSED' };
        summary = `Pause ${op.entityType} ${op.entityId}`;
        break;
      case 'resume':
        after = { status: 'ACTIVE' };
        summary = `Resume ${op.entityType} ${op.entityId}`;
        break;
      case 'set_budget':
        after = { dailyBudgetMinor: op.newDailyBudgetMinor };
        summary = `Set daily budget of ${op.entityType} ${op.entityId} to ${op.newDailyBudgetMinor} minor units`;
        break;
      case 'create':
        after = { name: op.name, type: op.entityType, status: 'PAUSED', dailyBudgetMinor: op.dailyBudgetMinor ?? null };
        summary = `Create ${op.entityType} "${op.name}" (PAUSED)`;
        break;
    }
    p.preview = { before, after, summary };
    p.status = 'previewed';
    this.record(p, 'previewed', 'system', summary);
    return clone(p);
  }

  /** Check the previewed change against safety rules. Moves to `validated` or `rejected`. */
  validate(id: string): Proposal {
    const p = this.mutable(id);
    this.expect(p, ['previewed']);
    const issues: string[] = [];
    const op = p.operation;
    const before = p.preview?.before ?? null;
    if (op.type !== 'create' && before === null) issues.push('entity not found on the platform');
    if (op.type === 'pause' && before?.status === 'PAUSED') issues.push('entity is already paused');
    if (op.type === 'resume' && before?.status === 'ACTIVE') issues.push('entity is already active');
    if (op.type === 'set_budget') {
      if (!Number.isSafeInteger(op.newDailyBudgetMinor) || op.newDailyBudgetMinor <= 0) {
        issues.push('new budget must be a positive integer of minor units');
      } else if (before) {
        const old = before.dailyBudgetMinor ?? null;
        if (old === null || old <= 0) issues.push('current budget is unknown or not set at this level');
        else {
          const pct = (Math.abs(op.newDailyBudgetMinor - old) / old) * 100;
          if (pct > this.maxPct) issues.push(`budget change of ${pct.toFixed(1)}% exceeds the ${this.maxPct}% limit`);
        }
      }
    }
    if (op.type === 'create') {
      if (op.name.trim() === '') issues.push('name must not be empty');
      if (op.dailyBudgetMinor !== undefined && (!Number.isSafeInteger(op.dailyBudgetMinor) || op.dailyBudgetMinor <= 0)) {
        issues.push('budget must be a positive integer of minor units');
      }
    }
    p.validation = { ok: issues.length === 0, issues };
    p.status = issues.length === 0 ? 'validated' : 'rejected';
    this.record(p, issues.length === 0 ? 'validated' : 'rejected', 'system', issues.join('; ') || undefined);
    return clone(p);
  }

  /** The human gate. Only a human with role EDITOR or ADMIN can move a validated proposal forward. */
  confirm(id: string, actor: Actor): Proposal {
    const p = this.mutable(id);
    if (actor.kind !== 'human') {
      throw new WriteSafetyError('HUMAN_REQUIRED', 'Only a human can confirm a change; AI and automation cannot');
    }
    if (!CAN_CONFIRM.includes(actor.role)) {
      throw new WriteSafetyError('FORBIDDEN', `Role ${actor.role} may not confirm changes`);
    }
    this.expect(p, ['validated']);
    p.status = 'confirmed';
    p.confirmedBy = actor.id;
    p.confirmedAt = this.now().toISOString();
    this.record(p, 'confirmed', actor.id);
    return clone(p);
  }

  /**
   * Execute exactly once. Throws unless the proposal is `confirmed`. In validate_only mode the
   * adapter's validateOnly is called and mutate never is. In live mode: one mutate, then a
   * read-back that must match the previewed result.
   */
  async execute(id: string): Promise<Proposal> {
    const p = this.mutable(id);
    if (p.status !== 'confirmed') {
      throw new WriteSafetyError(
        'INVALID_STATE',
        `Proposal ${id} is "${p.status}"; execution requires human confirmation and happens at most once`,
      );
    }
    this.assertCapability(p);
    this.assertAccount(p.platform, p.accountId);
    const mode = this.capabilities[p.platform] as 'live' | 'validate_only';
    p.status = 'executing'; // set before any await so a concurrent second call is refused
    const adapter = this.adapter(p.platform);
    const request: MutationRequest = {
      platform: p.platform,
      accountId: p.accountId,
      operation: clone(p.operation),
      idempotencyKey: p.id,
    };
    const actor = p.confirmedBy ?? 'unknown';
    try {
      if (mode === 'validate_only') {
        const res = await adapter.validateOnly(request);
        p.execution = { mode, verified: res.ok, error: res.ok ? undefined : res.message };
        p.status = 'executed_validate_only';
        this.record(p, 'validate_only_executed', actor, res.ok ? 'platform accepted the dry run' : res.message);
        return clone(p);
      }
      const { entityId } = await adapter.mutate(request);
      this.record(p, 'executed', actor, `entity ${entityId}`);
      const readBack = await adapter.readState(p.accountId, entityId);
      const verified = this.matches(p, readBack);
      p.execution = { mode, entityId, readBack, verified };
      p.status = verified ? 'verified' : 'verification_failed';
      this.record(p, verified ? 'verified' : 'verification_failed', 'system');
    } catch (err) {
      p.execution = { mode, error: err instanceof Error ? err.message : String(err) };
      p.status = 'failed';
      this.record(p, 'failed', actor, p.execution.error);
    }
    return clone(p);
  }

  private matches(p: Proposal, state: EntityState | null): boolean {
    if (!state || !p.preview?.after) return false;
    const after = p.preview.after;
    if (after.status !== undefined && state.status !== after.status) return false;
    if (after.dailyBudgetMinor !== undefined && after.dailyBudgetMinor !== null && state.dailyBudgetMinor !== after.dailyBudgetMinor) return false;
    if (p.operation.type === 'create' && state.name !== p.operation.name) return false;
    return true;
  }

  private adapter(platform: Platform): WriteAdapter {
    const a = this.options.adapters[platform];
    if (!a) throw new WriteSafetyError('ADAPTER_MISSING', `No adapter configured for ${platform}`);
    return a;
  }

  private assertCapability(p: Proposal): void {
    if (this.capabilities[p.platform] === 'off') {
      throw new WriteSafetyError('CAPABILITY_OFF', `Writes to ${p.platform} are switched off`);
    }
  }

  private assertAccount(platform: Platform, accountId: string): void {
    const allowed = this.options.allowedAccounts[platform] ?? [];
    if (!allowed.includes(accountId)) {
      throw new WriteSafetyError('ACCOUNT_NOT_ALLOWED', `Account ${accountId} is not on the ${platform} write allow-list`);
    }
  }

  private mutable(id: string): Proposal {
    const p = this.proposals.get(id);
    if (!p) throw new WriteSafetyError('INVALID_STATE', `Unknown proposal ${id}`);
    return p;
  }

  private expect(p: Proposal, allowed: ProposalStatus[]): void {
    if (!allowed.includes(p.status)) {
      throw new WriteSafetyError('INVALID_STATE', `Proposal ${p.id} is "${p.status}", expected ${allowed.join(' or ')}`);
    }
  }

  private record(p: Proposal, action: string, actorId: string, detail?: string): void {
    this.log.push({
      seq: this.log.length + 1,
      at: this.now().toISOString(),
      proposalId: p.id,
      action,
      actorId,
      platform: p.platform,
      accountId: p.accountId,
      ...(detail !== undefined ? { detail } : {}),
    });
  }
}

export interface SimulatedAdapterOptions {
  /** Apply a wrong value on mutate, to exercise read-back verification. */
  driftOnMutate?: boolean;
  /** Make mutate throw, to exercise failure handling. */
  failMutate?: boolean;
}

/** In-memory adapter for demos and tests. Holds no credentials and touches no network. */
export class SimulatedWriteAdapter implements WriteAdapter {
  mutateCalls = 0;
  validateCalls = 0;
  readCalls = 0;
  private readonly store = new Map<string, EntityState>();
  private readonly processed = new Map<string, string>();
  private created = 0;

  constructor(private readonly options: SimulatedAdapterOptions = {}) {}

  seed(accountId: string, state: EntityState): void {
    this.store.set(`${accountId}/${state.id}`, { ...state });
  }

  async readState(accountId: string, entityId: string): Promise<EntityState | null> {
    this.readCalls += 1;
    const s = this.store.get(`${accountId}/${entityId}`);
    return s ? { ...s } : null;
  }

  async validateOnly(request: MutationRequest): Promise<{ ok: boolean; message?: string }> {
    this.validateCalls += 1;
    const op = request.operation;
    if (op.type !== 'create' && !this.store.has(`${request.accountId}/${op.entityId}`)) {
      return { ok: false, message: 'entity not found' };
    }
    return { ok: true };
  }

  async mutate(request: MutationRequest): Promise<{ entityId: string }> {
    this.mutateCalls += 1;
    if (this.options.failMutate) throw new Error('simulated platform error');
    const done = this.processed.get(request.idempotencyKey);
    if (done) return { entityId: done };
    const op = request.operation;
    let entityId: string;
    if (op.type === 'create') {
      entityId = `sim-${++this.created}`;
      this.store.set(`${request.accountId}/${entityId}`, {
        id: entityId,
        type: op.entityType,
        name: op.name,
        status: 'PAUSED', // the platform side also refuses to create active objects
        dailyBudgetMinor: op.dailyBudgetMinor ?? null,
      });
    } else {
      entityId = op.entityId;
      const key = `${request.accountId}/${entityId}`;
      const cur = this.store.get(key);
      if (!cur) throw new Error('entity not found');
      if (op.type === 'pause') cur.status = this.options.driftOnMutate ? 'ACTIVE' : 'PAUSED';
      if (op.type === 'resume') cur.status = 'ACTIVE';
      if (op.type === 'set_budget') cur.dailyBudgetMinor = this.options.driftOnMutate ? op.newDailyBudgetMinor + 1 : op.newDailyBudgetMinor;
    }
    this.processed.set(request.idempotencyKey, entityId);
    return { entityId };
  }
}

/** Deep copy of plain JSON-compatible data (no Node or DOM globals needed). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
