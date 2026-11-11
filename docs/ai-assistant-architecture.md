# AI assistant architecture

The assistant answers questions about advertising and sales performance in the application's language. It is a general-purpose hosted model used through tool calls; it is **not fine-tuned**. Its value comes from the tools it can call, the facts it must cite, and the checks that run on its answer. Prompt text is private and not published.

File names below refer to the private repository.

See also [`diagrams/ai-assistant-flow.md`](../diagrams/ai-assistant-flow.md).

## Design principles

1. The model computes nothing it can look up and invents nothing it cannot.
2. Tools are read-only and execute on the server.
3. Every number in an answer must be traceable to a tool result, the data pack, or the user's own text.
4. If the model fails, the user gets a clearly labelled, deterministic limited-mode answer rather than an error or a guess.
5. There is no path from the assistant to an ad platform write.

## Provider abstraction

A small provider interface offers plain chat and chat with tools. Provider failures are classified (max tokens, refusal, rate limited, overloaded, auth, bad request, not found, network, aborted, unknown) so the service can decide between retry, repair and fallback. The model provider is chosen by configuration; with the provider set to "none" the application runs fully on the fallback, which is also how the test suite runs deterministically.

Bounds: at most 6 tool rounds per question, a capped output size, a maximum analysis window of about 400 days, a request timeout, and per-user hourly and daily question limits.

## Tools

Seventeen read-only tools are exposed, grouped by purpose. Each has a zod input schema that is converted to a JSON schema for the model. Invalid input returns an error to the model. An unreachable source returns "no data", which the model is told is not zero.

| Group | What the tools can answer |
|---|---|
| Meta performance | Campaign and ad performance for a period, daily trends, period-over-period comparison |
| Google performance | Campaign performance, conversion actions (Google conversions are not Meta leads and not paid orders) |
| Sales and attribution | Sales and attribution summary, partition of sales by order source, spend breakdown by platform |
| Cross-platform | Platform comparison without summing incompatible results or ROAS across platforms |
| Planning | Budget scenarios (explicitly estimates), configured budgets |
| Recommendations | The deterministic recommendation engine output |
| Hygiene | Data freshness and coverage; a calculator for arithmetic the model must not do mentally |
| Proposals | Prepare a Google campaign management proposal (see below) |

Example questions the real tools can answer (verified against the private tool list):

- "How did spend and cost per lead change in the last 30 days compared with the previous 30?"
- "Which ads are performing worst this month on cost per result, and how confident is that?"
- "What share of confirmed paid orders last month came from each order source?"
- "Compare Meta and Google spend and results for this month. Which numbers can I not add together?"
- "Is the data fresh? Which days are missing?"
- "What would happen to daily spend if I moved this campaign budget up by 20 %?" (returned as a labelled scenario)

Questions the assistant cannot answer, by design: "Pause this ad now." (it explains it cannot change ads), "Which sale did this ad cause?" where no verifiable link exists, "What is my profit?"

## Fact ledger and grounding

Each tool result is stored as a numbered fact (F1, F2, ...). The model must cite facts. Campaigns and ads returned by tools are registered as known objects, so an identifier the model invents does not resolve and is dropped.

A grounding checker then inspects the answer. Every number must appear in the fact pack, in a tool output, or in the user's own text. Details that make this robust in practice:

- Non-metric numbers (fact ids, dates, list numbering) are masked first.
- Both the local decimal convention and the plain one are tried for numbers such as "1.234".
- Rounding or truncation to fewer decimals is accepted; a different value is not.
- Small integers without a unit and plausible years are exempt.

If grounding fails, the validate step returns a correction message and the model gets one repair attempt. The service records that a repair happened.

## Safety checks

- A change-request detector spots requests such as pausing, enabling or changing budgets and adds a note that the assistant cannot change ads.
- A claim detector blocks answers that state a change was made ("I paused...").
- A test statically forbids the assistant and recommendation code from importing any write module.

## Limited mode (deterministic fallback)

If the provider is not configured, fails, times out, returns invalid JSON, still fails grounding after repair, or claims a change, the service answers from a rules-based path: an intent classifier over normalised text selects a fixed analysis and renders it from the same data layer. The answer is labelled as limited mode, not presented as the full assistant.

## Drafts and proposals (the only "action" the AI has)

- A local draft can be created only by an editor or admin, only for two kinds (prepare a creative test, prepare a campaign draft), only in the writable allow-listed account, with sanitised text. It is stored in the application database with an AI-suggestion source. Nothing is sent to Meta.
- A Google management proposal tool returns a structured proposal (pause, enable, set daily budget, rename) with a link that opens a prefilled editor. It executes nothing. The expected-impact text must be labelled as an estimate or scenario, a budget amount must be grounded in a fact, and shared budgets are refused.
- In both cases the human still previews the live platform state and confirms. See [`campaign-management.md`](campaign-management.md).

## Recommendations are a separate layer

Recommendations come from a pure, deterministic rules engine with named thresholds (minimum spend, impressions, results and link clicks before any claim; minimum relative change before flagging a trend). It is deliberately conservative: fewer recommendations rather than noise. Results are compared only within the same result type, and the rules do not use revenue or ROAS and never attribute sales to ads. Each recommendation carries confidence, limitations, a hypothesis, and a structured plan (what, where, why, how much, expected effect, how to measure, risk). Categories are opportunity, attention, improvement, good and insufficient evidence.

An optional AI wording layer can rewrite the text and propose a few copy ideas. It has no tools, receives only aggregated metrics and names, and every number it outputs is checked against the evidence; on mismatch the rule text is kept. Leads, phone numbers, customer names, orders and spreadsheet free text are never sent to the model.

## Known limits

- Answer quality depends on the provider; grounding guarantees traceability of numbers, not correctness of interpretation.
- The in-process rate limiter resets on restart.
- The assistant explains attribution limits but cannot create evidence that does not exist.
