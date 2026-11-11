# Data flow and reconciliation

How raw rows become numbers that card, chart, monthly view and PDF all agree on, and how every paid order lands in exactly one source class.

## Spend and ratios

```mermaid
flowchart TB
  subgraph IN["Ingest"]
    A["API pull, 7-day chunks"]
    B["Re-read recent days for corrections"]
    C["Historical CSV, gap days only"]
  end
  subgraph NORM["Normalise"]
    D["Day replaced in one transaction"]
    E["Decimal money, account timezone day"]
  end
  subgraph COV["Coverage"]
    F["Successful sync runs define covered days"]
    G["No row on covered day = 0"]
    H["Uncovered day = no data"]
  end
  subgraph OUT["Canonical output"]
    I["Completed days only"]
    J["Sum in decimal, round once"]
    K["Ratios from sums"]
    L["Card = chart = monthly = PDF"]
  end
  A --> D
  B --> D
  C --> D
  D --> E --> F
  F --> G
  F --> H
  G --> I
  H --> I
  I --> J --> K --> L

  classDef n fill:#f3f3f3,stroke:#555555,color:#111111
  classDef ok fill:#e6f6ea,stroke:#1e7a3c,color:#0a2d16
  classDef gap fill:#fff4d6,stroke:#9a6b00,color:#2b1d00
  class A,B,C,D,E,F,I,J n
  class G,K,L ok
  class H gap
```

## Order source classification

```mermaid
flowchart LR
  subgraph O["Orders"]
    P["Eligible paid orders"]
  end
  subgraph EV["Evidence (strongest wins)"]
    E4["Verified lead link"]
    E3["Ad / ad group"]
    E2["Campaign"]
    E1["Platform label"]
  end
  subgraph CL["Exactly one class"]
    M["Meta"]
    G["Google"]
    C["Chatbot/AI"]
    PP["Partner portal"]
    OV["Other verified"]
    U["Unknown"]
    X["Conflicting"]
  end
  subgraph R["Reconciliation"]
    S["Sum of classes = eligible orders and revenue"]
    ROAS["ROAS only from strict evidence"]
  end
  P --> E4
  P --> E3
  P --> E2
  P --> E1
  E4 --> M
  E1 --> G
  E1 --> C
  E1 --> PP
  E1 --> OV
  P --> U
  E4 --> X
  M --> S
  G --> S
  C --> S
  PP --> S
  OV --> S
  U --> S
  X --> S
  M --> ROAS
  G --> ROAS

  classDef n fill:#f3f3f3,stroke:#555555,color:#111111
  classDef cls fill:#e8f1fb,stroke:#1f5fa8,color:#0b2545
  classDef warn fill:#fde8e8,stroke:#b3261e,color:#3b0b08
  classDef ok fill:#e6f6ea,stroke:#1e7a3c,color:#0a2d16
  class P,E1,E2,E3,E4 n
  class M,G,C,PP,OV,U cls
  class X warn
  class S,ROAS ok
```

<details>
<summary>Reading notes</summary>

- Conflicting means contradictory platform evidence; it is excluded from every numerator and from ROAS but stays in the all-sales total.
- A platform label alone (level 1) fills the source split but does not by itself make an order strict paid-ad revenue for a campaign.
- Unknown is never relabelled "organic".
</details>
