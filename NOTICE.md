# Notice

Copyright © 2026 Matej Gaberc ([@gabercmatej](https://github.com/gabercmatej)) for the showcase
material in this repository: documentation, diagrams, the independent reference library in
`packages/analytics-core/`, the synthetic examples in `examples/` and the scripts in `scripts/`.
All rights reserved.

This repository is a portfolio and engineering showcase of **Sedem Ads**, a private production
system built for **Pravnik na dlani**, a Slovenian legal-services company. It is published so that
readers can understand the architecture, the data-integrity rules and the engineering approach.

- **No licence is granted.** Publishing this material does not give anyone permission to use,
  copy, modify or redistribute it, in whole or in part. No open-source licence applies unless a
  file explicitly says otherwise.
- **No production source code.** The company's authorization to publish the production source is
  not documented, so none of it is included. `packages/analytics-core/` is an **independent
  reference implementation** written for this showcase. It implements the same documented rules
  (ratios from sums, missing data is not zero, evidence-based attribution, human-confirmed writes)
  but it is not a copy of, or an extract from, the production code. See
  [WHATS_PUBLIC.md](WHATS_PUBLIC.md).
- **Client name.** "Pravnik na dlani" is named only to give the case study context. This
  repository is not an official channel of that company.
- **Synthetic data only.** Every company, campaign, ad, lead, order and amount in `examples/` and
  in the reference library's generator is invented and labelled
  `DEMO DATA — NOT REAL BUSINESS RESULTS`. No real business result appears anywhere in this
  repository.
- **Third-party names.** Meta, Facebook, Instagram, Google Ads, Stripe, Crossty, Anthropic, Claude
  and other product names belong to their respective owners and are used only to describe
  integrations.

For questions about this work, please open an issue on this repository.
