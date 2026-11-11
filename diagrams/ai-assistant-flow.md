# AI assistant flow

The model never sees a write capability. It calls read-only tools, every tool result becomes a numbered fact, and every number in the final answer must trace back to a fact.

```mermaid
flowchart TB
  subgraph REQ["Request"]
    Q["User question"]
    CHK["Auth, role, rate limit"]
    CR["Change-request detector"]
  end
  subgraph LOOP["Tool loop (max 6 rounds)"]
    LLM["Model"]
    T["Read-only tools, server executed"]
    L["Fact ledger F1, F2, ..."]
  end
  subgraph GATE["Answer gates"]
    J["Valid JSON?"]
    GR["Every number grounded?"]
    CL["Claims a change?"]
    REP["One repair round"]
  end
  subgraph OUTP["Output"]
    OK["Answer with fact citations"]
    FB["Rules-based limited mode"]
    DR["Optional local draft"]
  end
  Q --> CHK --> CR --> LLM
  LLM --> T --> L --> LLM
  LLM --> J --> GR --> CL
  CL -- "pass" --> OK
  J -- "fail" --> REP
  GR -- "fail" --> REP
  CL -- "fail" --> REP
  REP --> LLM
  REP -- "still failing" --> FB
  CR -. "note: assistant cannot change ads" .-> OK
  OK -. "editor role only" .-> DR

  classDef n fill:#f3f3f3,stroke:#555555,color:#111111
  classDef ok fill:#e6f6ea,stroke:#1e7a3c,color:#0a2d16
  classDef warn fill:#fff4d6,stroke:#9a6b00,color:#2b1d00
  classDef blk fill:#fde8e8,stroke:#b3261e,color:#3b0b08
  class Q,CHK,CR,LLM,T,L,J,GR,CL n
  class OK,DR ok
  class REP,FB warn
```

<details>
<summary>Reading notes</summary>

- A local draft is a stored proposal in the application database. Nothing is sent to an ad platform from the assistant; a human opens the editor, sees a preview read from the platform, and confirms.
- Timeouts, provider errors and refusals also end in the limited-mode fallback, which is labelled as such.
</details>
