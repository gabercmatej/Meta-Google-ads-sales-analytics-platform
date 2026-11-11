# Campaign management

Analytics is read-only. Campaign management is a separate, deliberately narrow capability with its own token, its own allow-list, and a human in the loop for every write. The write-safety rules are reproduced as a pure, testable reference in `packages/analytics-core/src/write-safety.ts`.

See also [`diagrams/campaign-action-controls.md`](../diagrams/campaign-action-controls.md).

## Capability table

| Capability | Status | Notes |
|---|---|---|
| Meta: pause, resume | Live under scoped rules | Allow-listed accounts and approved campaigns only |
| Meta: daily or lifetime budget | Live under scoped rules | Capped by a configured maximum; preview shows the current value read from Meta |
| Meta: rename, end time | Live under scoped rules | |
| Meta: targeting (age, countries), placements | Live under scoped rules | |
| Meta: change ad creative text | Live under scoped rules | Meta does not allow editing an existing creative, so a new creative is created and the ad is rebound |
| Meta: create from draft | Live under scoped rules | Everything is created **paused** |
| Meta: activate created objects | Live under scoped rules | Separate, separately confirmed action |
| Meta: duplicate | Live under scoped rules | Copy is created paused |
| Google: rename, pause/enable, daily budget, keyword add, ad text, create paused search campaign | **Validate-only** | Requests are built, diffed and sent as validate-only. No live Google mutation is enabled or verified |
| Google: removal, bidding strategy changes, shared budget edits, Performance Max and other automated types, offline conversion upload | Not offered | Out of scope by design |
| AI assistant: change anything | Not possible | Can only create a local draft or a structured proposal |
| Demo mode: simulated writes | Available | The public demo (`apps/demo`) runs the same flow on local state: PAUSED creates, Google validate-only, activity log, reset |
| Roadmap | See the README | No dates |

"Live under scoped rules" means implemented and used in production behind all of the controls below, not "any user can change any campaign".

## Controls common to both platforms

1. **Separate credentials.** Writes use their own token, never the read-only analytics token. Without it, write modes cannot run.
2. **Modes.** Meta: off, mock, validate, live. Google: off, validate, live (default off). A mode is configuration, not a UI toggle.
3. **Role.** Only editors and admins can start a write. The first write of each operation type is admin-only until a read-back has verified it.
4. **Allow-lists.** Writable accounts are listed explicitly; Meta additionally restricts writes to an approved set of campaigns.
5. **Preview read from the platform.** The preview shows the live current state, not a cached copy, plus warnings and blockers.
6. **Human confirmation on a hash.** Confirmation binds to a hash of the exact preview. The state is re-read on confirm; if it changed, the write is aborted as stale.
7. **One write, no retry.** A failed write is not retried automatically.
8. **Read-back.** After the write the state is read again and compared. A mismatch is reported as "written but not verified".
9. **Audit.** Every request, confirmation and outcome is logged in a change log.
10. **Caps and stop.** Daily budget is capped by configuration, and an emergency stop disables writes without a restart.
11. **New objects start paused.** Activation is its own confirmed step.

## Google: validate-only flow

Preflight (mode, role, allowed account, stop switch) → read current state through a query → diff and warnings (shared budget, no-op, duplicate, over the cap: blockers are never sent) → `validate_only` request → human confirmation with preview hash and a short expiry → re-read (stale aborts) → one atomic mutate → read-back → audit. In the current production configuration the mode is validate: the final mutate step is not enabled, and live Google mutations are not verified. Amounts convert to micros through exact decimal arithmetic.

## The AI boundary

The assistant and the recommendation engine cannot import the write modules (enforced by a test). They can:
- create a local draft (editor or admin, two draft kinds, writable account only), or
- return a structured Google proposal that opens a prefilled editor.

Both still go through preview and human confirmation.

## Drafts

A guided editor builds campaigns, ad sets and ads as local drafts first. A draft can come from a person or from an AI suggestion. Nothing reaches a platform until a human runs the confirmed flow, and the result is created paused.

## Why so conservative

A write to an ad account spends real money immediately. The design assumption is that the tool is wrong sometimes, the data is stale sometimes, and the operator is tired sometimes; each control exists to catch one of those.
