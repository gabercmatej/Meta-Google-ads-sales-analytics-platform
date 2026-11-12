import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageTitle, Button, Badge, Notice, Skeleton } from '../components/ui';
import { answerQuestion, ASSISTANT_LABEL, INTENT_EXAMPLES, type AssistantAnswer } from '../ai/engine';
import type { PlatformView } from '@sedem-ads/analytics-core';
import { getDataset } from '../lib/data';
import { useAppState, PLATFORM_LABELS, PRESET_LABELS, PERIOD_BAR } from '../state/AppState';
import { dateRange } from '../lib/format';

interface Message {
  id: number;
  question: string;
  answer: AssistantAnswer;
  /** True while the short "thinking" animation is shown. */
  pending: boolean;
}

/** Thinking animation length. Skipped in tests so assertions stay synchronous. */
const THINK_MS = import.meta.env.MODE === 'test' ? 0 : 450;

/** Question cards on the empty screen, grouped like the product. */
const GROUPS: readonly { title: string; ids: readonly string[] }[] = [
  { title: 'Overview', ids: ['spend_summary', 'platform_compare', 'month_over_month', 'lead_trend', 'data_quality', 'how_attribution', 'help'] },
  { title: 'Optimization', ids: ['best_campaign_cpl', 'worst_campaign', 'cpl_rise', 'creative_fatigue', 'top_ads_ctr', 'compare_ads', 'campaign_specific'] },
  { title: 'Sales and budget', ids: ['budget_realloc', 'sales_by_source', 'attributable_roas', 'surplus', 'refunds', 'unknown_source', 'google_label', 'forecast'] },
];

const SCOPES: readonly { value: PlatformView; label: string }[] = [
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads' },
  { value: 'combined', label: 'All' },
];

const eyebrow = 'text-[11px] font-semibold uppercase tracking-wider text-ink-3';
const linkBtn = 'text-xs font-semibold text-brand hover:underline';

function AnswerView({ answer, onAsk }: { answer: AssistantAnswer; onAsk: (q: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const g = answer.trace.grounding;
  const s = answer.sections;
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(answer.text).then(() => setCopied(true));
    } catch {
      /* clipboard unavailable: ignore */
    }
  };
  return (
    <div className="card px-4 py-4 sm:px-5" data-testid="answer">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={answer.unsupported ? 'warn' : 'info'}>{answer.intentLabel}</Badge>
        <Badge tone={g.grounded ? 'good' : 'bad'} title="Every number in this answer was checked against the tool results">
          Grounded: {g.verified}/{g.total} numbers verified
        </Badge>
        <span className="text-xs text-ink-3">
          {PLATFORM_LABELS[answer.trace.platform]} · {answer.trace.period.label}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-ink">{s.summary}</p>

      {s.rows.length > 0 && (
        <section className="mt-4">
          <h4 className={eyebrow}>Key numbers</h4>
          <dl className="mt-1.5 divide-y divide-line rounded-lg border border-line">
            {s.rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <dt className="flex min-w-0 items-center gap-2 text-ink-2">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  {r.label}
                </dt>
                <dd className="tabular shrink-0 font-semibold text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {s.recs.length > 0 && (
        <section className="mt-4 rounded-lg bg-brand-soft px-3.5 py-3">
          <h4 className="text-sm font-semibold text-ink">What I would do</h4>
          <ol className="mt-2 space-y-2">
            {s.recs.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-ink-2">
                <span aria-hidden className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand ring-1 ring-blue-200">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  {r.text}{' '}
                  {r.to && (
                    <Link to={r.to} className={linkBtn}>
                      Open
                    </Link>
                  )}
                  {r.ask && (
                    <button type="button" className={`${linkBtn} ml-1`} onClick={() => onAsk(r.ask as string)}>
                      Ask this
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {s.evidence.length > 0 && (
        <details className="group mt-3 rounded-lg border border-line px-3 py-2" open>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Why — evidence</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {s.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      {s.limits.length > 0 && (
        <div className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Limits</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {s.limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      {answer.alternatives.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested alternatives">
          {answer.alternatives.map((a) => (
            <button key={a} type="button" className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-brand hover:text-brand" onClick={() => onAsk(a)}>
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy answer'}
        </Button>
        <Button size="sm" variant="secondary" aria-expanded={showTrace} onClick={() => setShowTrace((v) => !v)}>
          {showTrace ? 'Hide tool calls' : 'Show tool calls'}
        </Button>
      </div>

      {showTrace && (
        <div className="mt-3 space-y-2 rounded-lg border border-line bg-slate-50 p-3 text-xs text-ink-2" role="region" aria-label="Tool calls">
          <p>
            <strong className="text-ink">Intent:</strong> {answer.trace.intent} (matched by {answer.trace.matchedBy})
          </p>
          <p>
            <strong className="text-ink">Scope:</strong> {PLATFORM_LABELS[answer.trace.platform]}, {answer.trace.period.label} ({answer.trace.period.range}
            {answer.trace.period.explicit ? ', named in the question' : ', from the page filters'})
          </p>
          <p className="font-semibold text-ink">Tools</p>
          {answer.trace.tools.length === 0 ? (
            <p className="text-ink-3">No analytics tool was needed for this answer.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5">
              {answer.trace.tools.map((t, i) => (
                <li key={i} className="break-words">
                  <code className="rounded bg-white px-1 py-px font-mono text-[11px] ring-1 ring-line">
                    {t.tool}({t.args})
                  </code>{' '}
                  → {t.result}
                </li>
              ))}
            </ol>
          )}
          <p className="font-semibold text-ink">Facts used ({answer.trace.facts.length})</p>
          <ul className="space-y-0.5">
            {answer.trace.facts.map((f, i) => (
              <li key={i} className="break-words">
                {f.label}: <code className="font-mono">{f.display}</code> <span className="text-ink-3">({f.source})</span>
              </li>
            ))}
          </ul>
          <p>
            <strong className="text-ink">Grounding:</strong> {g.verified} of {g.total} numeric tokens matched a fact
            {g.ungrounded.length > 0 && <> (unmatched: {g.ungrounded.join(', ')})</>}.
          </p>
        </div>
      )}
    </div>
  );
}

function ContextPanel({ scope, periodLabel, range, last }: { scope: PlatformView; periodLabel: string; range: string; last: AssistantAnswer | null }) {
  const facts = last?.trace.facts ?? [];
  return (
    <aside className="card space-y-4 px-4 py-4 text-sm" aria-label="Answer context">
      <section>
        <h3 className={eyebrow}>Period</h3>
        <p className="mt-1 font-semibold text-ink">{periodLabel}</p>
        <p className="text-xs text-ink-3">{range}</p>
      </section>
      <section>
        <h3 className={eyebrow}>Account and product</h3>
        <dl className="mt-1.5 space-y-1 text-xs">
          {[
            ['Product', 'Demo legal-services product'],
            ['Scope', PLATFORM_LABELS[scope]],
            ['Mode', 'Read-only analysis'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Data</dt>
            <dd className="font-semibold text-amber-700">Simulated (DEMO)</dd>
          </div>
        </dl>
      </section>
      <section>
        <h3 className={eyebrow}>Key numbers</h3>
        {last && last.sections.rows.length > 0 ? (
          <dl className="mt-1.5 space-y-1 text-xs">
            {last.sections.rows.slice(0, 6).map((r) => (
              <div key={r.label} className="flex justify-between gap-3">
                <dt className="min-w-0 truncate text-ink-3">{r.label}</dt>
                <dd className="tabular shrink-0 font-semibold text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-1 text-xs text-ink-3">Numbers from the latest answer appear here.</p>
        )}
      </section>
      <section>
        <h3 className={eyebrow}>Sources and facts</h3>
        {last ? (
          <ul className="mt-1.5 space-y-1 text-xs text-ink-2">
            {[...new Set(last.trace.tools.map((t) => t.tool))].slice(0, 5).map((tool) => (
              <li key={tool} className="truncate">
                <code className="font-mono text-[11px]">{tool}</code>
              </li>
            ))}
            <li className="text-ink-3">
              {facts.length} facts · {last.trace.grounding.verified}/{last.trace.grounding.total} numbers verified
            </li>
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-3">Every answer lists the tool calls and facts it used.</p>
        )}
      </section>
      <p className="border-t border-line pt-3 text-xs leading-snug text-ink-3">The assistant has no path to change ads. It can only suggest; a person reviews and confirms every action.</p>
    </aside>
  );
}

export default function AssistantPage() {
  const app = useAppState();
  const ds = useMemo(() => getDataset(), []);
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<PlatformView>(app.platform);
  const nextId = useRef(1);
  const askedFromUrl = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const periodLabel = PRESET_LABELS[app.period.preset];
  const rangeText = app.range ? dateRange(app.range) : 'No completed days';

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question) return;
      const answer = answerQuestion(question, { platform: scope, range: app.range, periodLabel }, ds);
      const id = nextId.current++;
      setMessages((m) => [...m, { id, question, answer, pending: THINK_MS > 0 }]);
      setDraft('');
    },
    [scope, app.range, periodLabel, ds],
  );

  // Resolve the thinking state in an effect (not a stored timer) so a StrictMode remount cannot leave it stuck.
  const pendingCount = messages.filter((m) => m.pending).length;
  useEffect(() => {
    if (pendingCount === 0) return;
    const t = window.setTimeout(() => setMessages((m) => m.map((x) => (x.pending ? { ...x, pending: false } : x))), THINK_MS);
    return () => window.clearTimeout(t);
  }, [pendingCount]);

  // Deep link /assistant?q=... asks once, then drops the parameter so a refresh does not repeat it.
  useEffect(() => {
    const q = params.get('q');
    if (!q || askedFromUrl.current) return;
    askedFromUrl.current = true;
    ask(q);
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  }, [params, setParams, ask]);

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  };

  const last = [...messages].reverse().find((m) => !m.pending)?.answer ?? null;
  const byId = new Map(INTENT_EXAMPLES.map((i) => [i.id as string, i]));

  return (
    <div className="space-y-4">
      <PageTitle
        title="AI assistant"
        badge={<Badge tone="warn">Simulated</Badge>}
        sub="Answers from verified app data for the selected period and platform. AI cannot change ads; a person always confirms actions."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-xs font-semibold text-ink-2 ring-1 ring-inset ring-line">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Demo mode · no LLM
            </span>
            <label className="sr-only" htmlFor="assistant-period">
              Period
            </label>
            <select
              id="assistant-period"
              className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs font-semibold text-ink-2"
              value={app.period.preset}
              onChange={(e) => app.setPeriod({ preset: e.target.value as typeof app.period.preset, custom: null })}
            >
              {PERIOD_BAR.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              {app.period.preset === 'custom' && <option value="custom">Custom</option>}
            </select>
            <Button variant="secondary" size="sm" disabled={messages.length === 0} onClick={() => setMessages([])}>
              Clear conversation
            </Button>
          </div>
        }
      />

      <div className="grid gap-2 lg:grid-cols-2">
        <Notice tone="info">
          <span data-testid="assistant-label" className="font-semibold">
            {ASSISTANT_LABEL}
          </span>
          <span className="block text-xs">A deterministic intent router calls analytics tools over the synthetic dataset. No language model runs and no data leaves your browser.</span>
        </Notice>
        <Notice tone="gray">
          Read-only. The assistant can suggest changes and link to the relevant page; creating, pausing or budgeting is always a separate, human-confirmed step.
        </Notice>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-4" role="log" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 && (
              <div className="card px-4 py-6 sm:px-6">
                <div className="mx-auto mb-5 max-w-xl text-center">
                  <div aria-hidden className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight text-ink">What would you like to know about your advertising?</h2>
                  <p className="mt-1 text-sm text-ink-3">
                    {PLATFORM_LABELS[scope]} · {periodLabel} ({rangeText}). Pick a question or type your own.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-3" aria-label="Suggested questions">
                  {GROUPS.map((grp) => (
                    <div key={grp.title}>
                      <h3 className={`${eyebrow} mb-2`}>{grp.title}</h3>
                      <div className="space-y-1.5">
                        {grp.ids.map((id) => {
                          const info = byId.get(id);
                          if (!info) return null;
                          return (
                            <button key={id} type="button" className="card card-hover w-full px-3 py-2.5 text-left text-sm text-ink-2" onClick={() => ask(info.example)}>
                              {info.example}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-soft px-3.5 py-2 text-sm text-ink">{m.question}</div>
                </div>
                {m.pending ? (
                  <div className="card space-y-2 px-4 py-4" role="status" aria-label="Thinking">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <AnswerView answer={m.answer} onAsk={ask} />
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="space-y-2">
            <div role="radiogroup" aria-label="Platform" className="inline-flex gap-0.5 rounded-lg border border-line bg-surface p-0.5 text-xs shadow-card">
              {SCOPES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={scope === o.value}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${scope === o.value ? 'bg-brand-soft text-brand' : 'text-ink-3 hover:text-ink'}`}
                  onClick={() => setScope(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2 rounded-card border border-line bg-surface p-2 shadow-card focus-within:border-brand"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <textarea
                aria-label="Your question"
                rows={2}
                className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3"
                placeholder="Ask about spend, leads, creatives, sales or attribution…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
              />
              <Button variant="primary" type="submit" disabled={draft.trim() === ''}>
                Ask
              </Button>
            </form>
            <p className="px-1 text-[11px] text-ink-3">Enter sends, Shift+Enter adds a new line. Answers are simulated from synthetic demo data.</p>
          </div>
        </div>

        <ContextPanel scope={scope} periodLabel={periodLabel} range={rangeText} last={last} />
      </div>
    </div>
  );
}
