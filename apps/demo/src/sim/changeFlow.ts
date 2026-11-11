// Simulated management flow built on the real write-safety model from analytics-core:
// preview (read current state) -> validate -> human confirmation -> execute -> read-back -> audit.
// Meta runs "live" against an in-memory adapter; Google is validate-only. Nothing leaves the browser.
import {
  DEFAULT_CAPABILITIES,
  SimulatedWriteAdapter,
  WriteSafetyError,
  WriteWorkflow,
  type Actor,
  type AuditLogEntry,
  type EntityState,
  type EntityType,
  type Operation,
  type Platform,
  type Proposal,
} from '@sedem-ads/analytics-core';
import type { Role } from '../state/AppState';
import type { EntityOverlay, EntityRef, SimEntity } from './contract';

export const DEMO_ACCOUNTS: Record<Platform, string> = { meta: 'demo-meta-account', google: 'demo-google-account' };
export const MAX_BUDGET_CHANGE_PERCENT = 30;
export const VIEWER_TOOLTIP = 'Switch role to Ad editor to make changes';
export const GOOGLE_VALIDATE_ONLY_MESSAGE = 'Validated only — Google changes are validate-only in this demo, nothing applied';

export const ROLE_LABEL: Record<Role, string> = { VIEWER: 'Viewer', EDITOR: 'Ad editor', ADMIN: 'Admin' };

export function canWrite(role: Role): boolean {
  return role === 'EDITOR' || role === 'ADMIN';
}

export function entityTypeOf(level: EntityRef['level']): EntityType {
  return level === 'ad_group' ? 'ad_set' : level;
}

/** Entity as shown to the user: dataset values plus any local overlay. */
export type EffectiveEntity = EntityRef & { headline?: string; primaryText?: string };

export function effectiveEntity(ref: EffectiveEntity, overlay: EntityOverlay | undefined): EffectiveEntity {
  if (!overlay) return ref;
  return {
    ...ref,
    name: overlay.name ?? ref.name,
    status: overlay.status ?? ref.status,
    dailyBudgetMinor: overlay.dailyBudgetMinor !== undefined ? overlay.dailyBudgetMinor : ref.dailyBudgetMinor,
    headline: overlay.headline ?? ref.headline,
    primaryText: overlay.primaryText ?? ref.primaryText,
  };
}

export type ChangeRequest =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'set_budget'; newDailyBudgetMinor: number }
  | { kind: 'edit'; name?: string; headline?: string; primaryText?: string };

export interface ChangeLine {
  label: string;
  before: string;
  after: string;
}

export interface ChangeReview {
  entity: EffectiveEntity;
  request: ChangeRequest;
  role: Role;
  /** Validation passed and the change may be confirmed. */
  ok: boolean;
  issues: string[];
  lines: ChangeLine[];
  mode: 'applied' | 'validated_only';
  /** Internal handles for confirm. Not serialised. */
  _workflow: WriteWorkflow | null;
  _proposalId: string | null;
}

export interface ChangeResult {
  review: ChangeReview;
  mode: 'applied' | 'validated_only';
  success: boolean;
  /** Fields to apply on the overlay (empty when validated only). */
  patch: Pick<EntityOverlay, 'status' | 'dailyBudgetMinor' | 'name' | 'headline' | 'primaryText'>;
  message: string;
  readBack: string | null;
  audit: AuditLogEntry[];
  proposal: Proposal | null;
}

const humanActor = (role: Role): Actor => ({ id: `demo-user-${role.toLowerCase()}`, kind: 'human', role });

function eurText(minor: number | null | undefined): string {
  return minor === null || minor === undefined ? '–' : `€${(minor / 100).toFixed(2)}`;
}

export function describeRequest(req: ChangeRequest): string {
  switch (req.kind) {
    case 'pause':
      return 'Pause';
    case 'resume':
      return 'Resume';
    case 'set_budget':
      return 'Change budget';
    case 'edit':
      return 'Edit';
  }
}

function buildLines(entity: EffectiveEntity, req: ChangeRequest): ChangeLine[] {
  switch (req.kind) {
    case 'pause':
      return [{ label: 'Status', before: entity.status, after: 'PAUSED' }];
    case 'resume':
      return [{ label: 'Status', before: entity.status, after: 'ACTIVE' }];
    case 'set_budget':
      return [{ label: 'Daily budget', before: eurText(entity.dailyBudgetMinor), after: eurText(req.newDailyBudgetMinor) }];
    case 'edit': {
      const out: ChangeLine[] = [];
      if (req.name !== undefined && req.name !== entity.name) out.push({ label: 'Name', before: entity.name, after: req.name });
      if (req.headline !== undefined && req.headline !== (entity.headline ?? '')) out.push({ label: 'Headline', before: entity.headline ?? '–', after: req.headline });
      if (req.primaryText !== undefined && req.primaryText !== (entity.primaryText ?? '')) out.push({ label: 'Primary text', before: entity.primaryText ?? '–', after: req.primaryText });
      return out;
    }
  }
}

function validateEdit(entity: EffectiveEntity, req: Extract<ChangeRequest, { kind: 'edit' }>): string[] {
  const issues: string[] = [];
  if (req.name !== undefined && req.name.trim() === '') issues.push('name must not be empty');
  if (req.name !== undefined && req.name.length > 120) issues.push('name must be at most 120 characters');
  if (req.headline !== undefined && entity.level === 'ad') {
    if (req.headline.trim() === '') issues.push('headline must not be empty');
    if (req.headline.length > 60) issues.push('headline must be at most 60 characters');
  }
  if (req.primaryText !== undefined && req.primaryText.length > 300) issues.push('primary text must be at most 300 characters');
  if (issues.length === 0 && buildLines(entity, req).length === 0) issues.push('nothing to change');
  return issues;
}

function operationFor(entity: EffectiveEntity, req: Exclude<ChangeRequest, { kind: 'edit' }>): Operation {
  const entityType = entityTypeOf(entity.level);
  if (req.kind === 'pause') return { type: 'pause', entityType, entityId: entity.id };
  if (req.kind === 'resume') return { type: 'resume', entityType, entityId: entity.id };
  return { type: 'set_budget', entityType, entityId: entity.id, newDailyBudgetMinor: req.newDailyBudgetMinor };
}

function newWorkflow(entity: EffectiveEntity, now: () => Date): WriteWorkflow {
  const adapter = new SimulatedWriteAdapter();
  const account = DEMO_ACCOUNTS[entity.platform];
  adapter.seed(account, {
    id: entity.id,
    type: entityTypeOf(entity.level),
    name: entity.name,
    status: entity.status,
    dailyBudgetMinor: entity.dailyBudgetMinor,
  });
  return new WriteWorkflow({
    adapters: { [entity.platform]: adapter },
    capabilities: DEFAULT_CAPABILITIES,
    allowedAccounts: { [entity.platform]: [account] },
    maxBudgetChangePercent: MAX_BUDGET_CHANGE_PERCENT,
    now,
  });
}

/** Steps 1-2: read current state, show before -> after, run the safety rules. Writes nothing. */
export async function reviewChange(entity: EffectiveEntity, request: ChangeRequest, role: Role, now: () => Date = () => new Date()): Promise<ChangeReview> {
  const base: ChangeReview = {
    entity,
    request,
    role,
    ok: false,
    issues: [],
    lines: buildLines(entity, request),
    mode: DEFAULT_CAPABILITIES[entity.platform] === 'live' ? 'applied' : 'validated_only',
    _workflow: null,
    _proposalId: null,
  };
  if (!canWrite(role)) return { ...base, issues: [`Role ${role} may not make changes. ${VIEWER_TOOLTIP}.`] };
  if (request.kind === 'edit') {
    const issues = validateEdit(entity, request);
    return { ...base, ok: issues.length === 0, issues };
  }
  const workflow = newWorkflow(entity, now);
  try {
    const draft = workflow.createProposal({ platform: entity.platform, accountId: DEMO_ACCOUNTS[entity.platform], operation: operationFor(entity, request), actor: humanActor(role) });
    await workflow.preview(draft.id);
    const validated = workflow.validate(draft.id);
    return { ...base, ok: validated.validation?.ok === true, issues: validated.validation?.issues ?? [], _workflow: workflow, _proposalId: draft.id };
  } catch (err) {
    return { ...base, issues: [err instanceof WriteSafetyError ? err.message : 'unexpected error'] };
  }
}

function patchFor(request: ChangeRequest): ChangeResult['patch'] {
  switch (request.kind) {
    case 'pause':
      return { status: 'PAUSED' };
    case 'resume':
      return { status: 'ACTIVE' };
    case 'set_budget':
      return { dailyBudgetMinor: request.newDailyBudgetMinor };
    case 'edit':
      return {
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.headline !== undefined ? { headline: request.headline } : {}),
        ...(request.primaryText !== undefined ? { primaryText: request.primaryText } : {}),
      };
  }
}

function readBackText(review: ChangeReview, s: EntityState | null): string | null {
  if (!s) return null;
  if (review.request.kind === 'set_budget') return `daily budget = ${eurText(s.dailyBudgetMinor)}`;
  return `status = ${s.status}`;
}

/** Steps 3-6. Only called after an explicit click by a human in the dialog. */
export async function confirmChange(review: ChangeReview, role: Role): Promise<ChangeResult> {
  const empty: ChangeResult = { review, mode: review.mode, success: false, patch: {}, message: '', readBack: null, audit: [], proposal: null };
  if (!review.ok) return { ...empty, message: review.issues.join('; ') || 'Change was not validated.' };
  if (!canWrite(role)) return { ...empty, message: `Role ${role} may not make changes.` };
  const platformMode = DEFAULT_CAPABILITIES[review.entity.platform];
  if (review.request.kind === 'edit') {
    if (platformMode !== 'live') return { ...empty, mode: 'validated_only', success: true, message: GOOGLE_VALIDATE_ONLY_MESSAGE };
    return { ...empty, mode: 'applied', success: true, patch: patchFor(review.request), message: 'Applied in simulation', readBack: review.lines.map((l) => `${l.label} = ${l.after}`).join('; ') };
  }
  const wf = review._workflow;
  const id = review._proposalId;
  if (!wf || !id) return { ...empty, message: 'Change was not prepared.' };
  try {
    wf.confirm(id, humanActor(role));
    const done = await wf.execute(id);
    const audit = wf.auditLog.filter((e) => e.proposalId === id);
    if (done.status === 'executed_validate_only') {
      return { ...empty, mode: 'validated_only', success: done.execution?.verified === true, message: GOOGLE_VALIDATE_ONLY_MESSAGE, audit, proposal: done };
    }
    const ok = done.status === 'verified';
    return {
      ...empty,
      mode: 'applied',
      success: ok,
      patch: ok ? patchFor(review.request) : {},
      message: ok ? 'Applied in simulation' : 'Read-back did not match; nothing was recorded.',
      readBack: readBackText(review, done.execution?.readBack ?? null),
      audit,
      proposal: done,
    };
  } catch (err) {
    return { ...empty, message: err instanceof WriteSafetyError ? err.message : 'unexpected error' };
  }
}

// ---------------------------------------------------------------------------------------------
// creation (always PAUSED)

export interface CreateInput {
  platform: Platform;
  campaign: { name: string; dailyBudgetMinor: number | null };
  ad?: { name: string; headline: string; primaryText: string };
}

export interface CreateResult {
  success: boolean;
  mode: 'applied' | 'validated_only';
  issues: string[];
  entities: SimEntity[];
  message: string;
}

/**
 * Create a campaign (and optionally its first ad) through the workflow. Objects are PAUSED.
 * Google: validated only, recorded as such, never applied.
 */
export async function createObjects(input: CreateInput, role: Role, ids: { campaignId: string; adId: string }, now: () => Date = () => new Date()): Promise<CreateResult> {
  const mode = DEFAULT_CAPABILITIES[input.platform] === 'live' ? 'applied' : 'validated_only';
  const fail = (issues: string[]): CreateResult => ({ success: false, mode, issues, entities: [], message: issues.join('; ') });
  if (!canWrite(role)) return fail([`Role ${role} may not create objects. ${VIEWER_TOOLTIP}.`]);
  const account = DEMO_ACCOUNTS[input.platform];
  const wf = new WriteWorkflow({
    adapters: { [input.platform]: new SimulatedWriteAdapter() },
    capabilities: DEFAULT_CAPABILITIES,
    allowedAccounts: { [input.platform]: [account] },
    maxBudgetChangePercent: MAX_BUDGET_CHANGE_PERCENT,
    now,
  });
  const actor = humanActor(role);
  const createdAt = now().toISOString();
  const validatedOnly = mode === 'validated_only';
  const steps: { op: Operation; entity: SimEntity }[] = [
    {
      op: { type: 'create', entityType: 'campaign', name: input.campaign.name, ...(input.campaign.dailyBudgetMinor !== null ? { dailyBudgetMinor: input.campaign.dailyBudgetMinor } : {}) },
      entity: { id: ids.campaignId, level: 'campaign', platform: input.platform, name: input.campaign.name, status: 'PAUSED', dailyBudgetMinor: input.campaign.dailyBudgetMinor, campaignId: null, adGroupId: null, createdAt, validatedOnly },
    },
  ];
  if (input.ad) {
    steps.push({
      op: { type: 'create', entityType: 'ad', name: input.ad.name, parentId: ids.campaignId },
      entity: { id: ids.adId, level: 'ad', platform: input.platform, name: input.ad.name, status: 'PAUSED', dailyBudgetMinor: null, campaignId: ids.campaignId, adGroupId: null, createdAt, validatedOnly },
    });
  }
  try {
    for (const s of steps) {
      const p = wf.createProposal({ platform: input.platform, accountId: account, operation: s.op, actor });
      await wf.preview(p.id);
      const v = wf.validate(p.id);
      if (!v.validation?.ok) return fail(v.validation?.issues ?? ['validation failed']);
      wf.confirm(p.id, actor);
      const done = await wf.execute(p.id);
      if (done.status !== 'verified' && done.status !== 'executed_validate_only') return fail([done.execution?.error ?? 'execution failed']);
    }
  } catch (err) {
    return fail([err instanceof WriteSafetyError ? err.message : 'unexpected error']);
  }
  return {
    success: true,
    mode,
    issues: [],
    entities: steps.map((s) => s.entity),
    message: validatedOnly ? `${GOOGLE_VALIDATE_ONLY_MESSAGE}.` : 'Created in simulation — status PAUSED. Activation is a separate confirmed action.',
  };
}
