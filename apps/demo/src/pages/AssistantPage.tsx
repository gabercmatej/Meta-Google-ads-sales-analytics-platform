import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Card, Button, Badge, EmptyState } from '../components/ui';
import { answerQuestion, ASSISTANT_LABEL, SUGGESTED_QUESTIONS, type AssistantAnswer } from '../ai/engine';
import { getDataset } from '../lib/data';
import { useAppState, PLATFORM_LABELS, PRESET_LABELS } from '../state/AppState';
import { dateRange } from '../lib/format';
import './sim-pages.css';

interface Message {
  id: number;
  question: string;
  answer: AssistantAnswer;
  /** True while the short "thinking" animation is shown. */
  pending: boolean;
}

/** Thinking animation length. Skipped in tests so assertions stay synchronous. */
const THINK_MS = import.meta.env.MODE === 'test' ? 0 : 450;

function AnswerView({ answer, onAsk }: { answer: AssistantAnswer; onAsk: (q: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const g = answer.trace.grounding;
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(answer.text).then(() => setCopied(true));
    } catch {
      /* clipboard unavailable: ignore */
    }
  };
  const s = answer.sections;
  return (
    <div className="ai-answer">
      <div className="ai-answer-head">
        <Badge tone={answer.unsupported ? 'warn' : 'info'}>{answer.intentLabel}</Badge>
        <Badge tone={g.grounded ? 'good' : 'bad'} title="Every number in this answer was checked against the tool results">
          Grounded: {g.verified}/{g.total} numbers verified
        </Badge>
      </div>
      <section>
        <h4>Summary</h4>
        <p>{s.summary}</p>
      </section>
      {s.rows.length > 0 && (
        <section>
          <h4>Key numbers</h4>
          <dl className="ai-rows">
            {s.rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h4>Evidence</h4>
        <ul>
          {s.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Recommendations</h4>
        <ul>
          {s.recs.map((r, i) => (
            <li key={i}>
              {r.text}{' '}
              {r.to && (
                <Link to={r.to} className="ai-link">
                  Open
                </Link>
              )}
              {r.ask && (
                <button type="button" className="ai-link" onClick={() => onAsk(r.ask as string)}>
                  Ask this
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Limits</h4>
        <ul>
          {s.limits.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </section>
      {answer.alternatives.length > 0 && (
        <div className="ai-chips" aria-label="Suggested alternatives">
          {answer.alternatives.map((a) => (
            <button key={a} type="button" className="ai-chip" onClick={() => onAsk(a)}>
              {a}
            </button>
          ))}
        </div>
      )}
      <div className="ai-answer-actions">
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy answer'}
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={showTrace} onClick={() => setShowTrace((v) => !v)}>
          {showTrace ? 'Hide tool calls' : 'Show tool calls'}
        </Button>
      </div>
      {showTrace && (
        <div className="ai-trace" role="region" aria-label="Tool calls">
          <p>
            <strong>Intent:</strong> {answer.trace.intent} (matched by {answer.trace.matchedBy})
          </p>
          <p>
            <strong>Scope:</strong> {PLATFORM_LABELS[answer.trace.platform]}, {answer.trace.period.label} ({answer.trace.period.range}
            {answer.trace.period.explicit ? ', named in the question' : ', from the page filters'})
          </p>
          <p>
            <strong>Tools</strong>
          </p>
          {answer.trace.tools.length === 0 ? (
            <p className="muted">No analytics tool was needed for this answer.</p>
          ) : (
            <ol>
              {answer.trace.tools.map((t, i) => (
                <li key={i}>
                  <code>
                    {t.tool}({t.args})
                  </code>{' '}
                  → {t.result}
                </li>
              ))}
            </ol>
          )}
          <p>
            <strong>Facts used</strong> ({answer.trace.facts.length})
          </p>
          <ul className="ai-facts">
            {answer.trace.facts.map((f, i) => (
              <li key={i}>
                {f.label}: <code>{f.display}</code> <span className="muted">({f.source})</span>
              </li>
            ))}
          </ul>
          <p>
            <strong>Grounding:</strong> {g.verified} of {g.total} numeric tokens matched a fact
            {g.ungrounded.length > 0 && <> (unmatched: {g.ungrounded.join(', ')})</>}.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const app = useAppState();
  const ds = useMemo(() => getDataset(), []);
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const askedFromUrl = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const periodLabel = PRESET_LABELS[app.period.preset];

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question) return;
      const answer = answerQuestion(question, { platform: app.platform, range: app.range, periodLabel }, ds);
      const id = nextId.current++;
      if (THINK_MS === 0) {
        setMessages((m) => [...m, { id, question, answer, pending: false }]);
      } else {
        setMessages((m) => [...m, { id, question, answer, pending: true }]);
        timers.current.push(
          window.setTimeout(() => setMessages((m) => m.map((x) => (x.id === id ? { ...x, pending: false } : x))), THINK_MS),
        );
      }
      setDraft('');
    },
    [app.platform, app.range, periodLabel, ds],
  );

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

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
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  };

  return (
    <div className="ai-page">
      <PageHeader
        title="Assistant"
        description="Ask about spend, leads, creatives, sales or attribution. Every answer is computed from the synthetic dataset and shows its evidence."
        badge={<Badge tone="warn">Simulated</Badge>}
        actions={
          <Button variant="secondary" disabled={messages.length === 0} onClick={() => setMessages([])}>
            Clear conversation
          </Button>
        }
      />
      <p className="ai-label" data-testid="assistant-label">
        {ASSISTANT_LABEL}
      </p>
      <Card title="How this works">
        <p className="ai-info">
          Answers come from a <strong>deterministic intent router</strong> plus <strong>analytics tools</strong> that query the synthetic dataset. Every answer lists
          the tool calls it used. <strong>No language model runs</strong> and no data leaves your browser. The scope follows the page filters
          ({PLATFORM_LABELS[app.platform]}, {periodLabel}
          {app.range ? `, ${dateRange(app.range)}` : ''}) unless the question names a period or a platform.
        </p>
      </Card>

      <Card className="ai-chat">
        <div className="ai-thread" role="log" aria-live="polite" aria-label="Conversation">
          {messages.length === 0 && (
            <EmptyState title="Ask about spend, leads, creatives, sales or attribution">Pick a suggestion below or type your own question.</EmptyState>
          )}
          {messages.map((m) => (
            <div key={m.id} className="ai-turn">
              <div className="bubble bubble-user">{m.question}</div>
              <div className="bubble bubble-ai">
                {m.pending ? (
                  <span className="ai-thinking" role="status" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <AnswerView answer={m.answer} onAsk={ask} />
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="ai-chips" aria-label="Suggested questions">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} type="button" className="ai-chip" onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>

        <form
          className="ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <textarea
            aria-label="Your question"
            rows={2}
            placeholder="Ask a question about the demo data (Enter to send, Shift+Enter for a new line)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
          />
          <Button variant="primary" type="submit" disabled={draft.trim() === ''}>
            Ask
          </Button>
        </form>
      </Card>
    </div>
  );
}
