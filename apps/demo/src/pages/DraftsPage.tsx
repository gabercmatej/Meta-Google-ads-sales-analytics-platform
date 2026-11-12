import { useState } from 'react';
import { PageTitle, Button, Badge, EmptyState, Dialog, SimulationNotice } from '../components/ui';
import { PlatformBadge } from '../components/EntityBits';
import { DraftForm, fromDraft, formErrors } from '../sim/DraftForm';
import { useSim } from '../sim/simContext';
import { canWrite, GOOGLE_VALIDATE_ONLY_MESSAGE, VIEWER_TOOLTIP } from '../sim/changeFlow';
import type { Draft } from '../sim/simCore';
import { dateTime, money } from '../lib/format';

type RowNote = { tone: 'ok' | 'bad'; lines: string[] };

export default function DraftsPage() {
  const sim = useSim();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Draft | null>(null);
  const [notes, setNotes] = useState<Record<string, RowNote>>({});
  const allowed = canWrite(sim.role);
  const setNote = (id: string, n: RowNote) => setNotes((s) => ({ ...s, [id]: n }));

  const validate = (d: Draft) => {
    const errs = Object.values(formErrors(fromDraft(d)));
    setNote(d.id, errs.length === 0 ? { tone: 'ok', lines: ['Valid: ready to create (PAUSED).'] } : { tone: 'bad', lines: errs });
  };

  const createFromDraft = async (d: Draft) => {
    const errs = Object.values(formErrors(fromDraft(d)));
    if (errs.length > 0) {
      setNote(d.id, { tone: 'bad', lines: errs });
      return;
    }
    const r = await sim.create(
      {
        platform: d.platform,
        campaign: { name: d.campaignName, dailyBudgetMinor: d.dailyBudgetMinor },
        ...(d.includeAd ? { ad: { name: d.adName, headline: d.creative.headline, primaryText: d.creative.primaryText } } : {}),
      },
      d.id,
    );
    setNote(d.id, r.success ? { tone: 'ok', lines: [r.message, ...(r.mode === 'validated_only' ? [GOOGLE_VALIDATE_ONLY_MESSAGE] : [])] } : { tone: 'bad', lines: r.issues });
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Drafts" sub="Campaigns saved locally in this browser, for Meta and Google together. Drafts are never sent anywhere." badge={<Badge tone="warn">Simulated</Badge>} />
      <SimulationNotice />
      {sim.drafts.length === 0 ? (
        <EmptyState title="No drafts yet">Start in Create campaign and choose Save as draft.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {[...sim.drafts].reverse().map((d) => {
            const note = notes[d.id];
            return (
              <article key={d.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={d.platform} />
                  <strong className="text-sm text-ink">{d.campaignName || 'Untitled draft'}</strong>
                  <span className="text-xs text-ink-3">Updated {dateTime(d.updatedAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">
                  Daily budget {money(d.dailyBudgetMinor)} · {d.includeAd ? `Ad: ${d.adName || '–'}` : 'No ad'}
                </p>
                {note && (
                  <ul className={`mt-2 rounded-lg py-2 pl-7 pr-3 text-sm ${note.tone === 'ok' ? 'bg-positive-soft text-ink' : 'bg-negative-soft text-negative'}`} role={note.tone === 'ok' ? 'status' : 'alert'}>
                    {note.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setEditing(d)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => validate(d)}>
                    Validate
                  </Button>
                  <span title={allowed ? undefined : VIEWER_TOOLTIP}>
                    <Button size="sm" variant="primary" disabled={!allowed} onClick={() => void createFromDraft(d)}>
                      Create (PAUSED)
                    </Button>
                  </span>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(d)}>
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} title="Edit draft" wide onClose={() => setEditing(null)}>
        {editing && <DraftForm key={editing.id} initial={fromDraft(editing)} idPrefix="edit" />}
      </Dialog>

      <Dialog
        open={deleting !== null}
        title="Delete draft"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) sim.deleteDraft(deleting.id);
                setDeleting(null);
              }}
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p>
          Delete <strong>{deleting?.campaignName || 'this draft'}</strong>? It only exists in this browser and cannot be restored.
        </p>
      </Dialog>
    </div>
  );
}
