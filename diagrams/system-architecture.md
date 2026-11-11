# System architecture

Read-only sources flow into one reconciled database; the AI assistant and the dashboards read from it; the only write path to an ad platform is a human-confirmed, scoped flow.

```mermaid
flowchart LR
  subgraph SRC["Sources (read-only)"]
    META["Meta Marketing API"]
    GADS["Google Ads API"]
    LEADS["Meta lead forms"]
    SALES["Sales backend"]
    XLS["Excel workbook"]
    STR["Stripe"]
    CSV["Historical CSV exports"]
  end

  subgraph ING["Ingestion"]
    AD["Adapters (live / demo)"]
    SYNC["Scheduled sync runner"]
    LOCK["Per-source DB lock"]
  end

  subgraph STORE["PostgreSQL via Prisma"]
    DB[("Normalised tables, env column")]
    RUNS["Sync runs and coverage"]
    ISS["Data issues"]
  end

  subgraph CORE["Domain logic (pure)"]
    SPEND["Canonical spend"]
    ATTR["Order source and attribution"]
    CMP["Comparison"]
    REC["Rules recommendations"]
    AUD["Accuracy audit"]
  end

  subgraph APP["Next.js application"]
    UI["Dashboards, reports, PDF"]
    ASSIST["Grounded AI assistant"]
    EDIT["Campaign editor"]
  end

  subgraph WRITE["Write path (human confirmed)"]
    MW["Meta write: scoped, live"]
    GW["Google write: validate-only"]
  end

  META --> AD
  GADS --> AD
  LEADS --> AD
  SALES --> AD
  XLS --> AD
  STR --> AD
  CSV --> SYNC
  AD --> SYNC
  SYNC --> LOCK
  SYNC --> DB
  SYNC --> RUNS
  SYNC --> ISS
  DB --> SPEND
  DB --> ATTR
  DB --> CMP
  DB --> REC
  DB --> AUD
  SPEND --> UI
  ATTR --> UI
  CMP --> UI
  REC --> UI
  AUD --> UI
  SPEND --> ASSIST
  ATTR --> ASSIST
  REC --> ASSIST
  ASSIST -. "local draft only" .-> EDIT
  UI --> EDIT
  EDIT --> MW
  EDIT --> GW

  classDef src fill:#e8f1fb,stroke:#1f5fa8,color:#0b2545
  classDef proc fill:#f3f3f3,stroke:#555555,color:#111111
  classDef store fill:#fff4d6,stroke:#9a6b00,color:#2b1d00
  classDef app fill:#e6f6ea,stroke:#1e7a3c,color:#0a2d16
  classDef warn fill:#fde8e8,stroke:#b3261e,color:#3b0b08
  class META,GADS,LEADS,SALES,XLS,STR,CSV src
  class AD,SYNC,LOCK,SPEND,ATTR,CMP,REC,AUD proc
  class DB,RUNS,ISS store
  class UI,ASSIST,EDIT app
  class MW,GW warn
```

<details>
<summary>Reading notes</summary>

- Every table carries an `env` column so demo and live data cannot mix.
- The assistant has no edge to the write path. Its only output towards the editor is a local draft that a human must still preview and confirm.
- The Google write box is validate-only: requests are checked by the platform but not applied.
</details>
