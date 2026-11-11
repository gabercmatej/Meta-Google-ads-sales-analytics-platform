# Security and privacy

This repository is a public portfolio showcase. It contains an independent reference
implementation, synthetic data and documentation. It contains no production source, no real
business data and no credentials.

## What is deliberately not here

- Secrets of any kind: tokens, keys, passwords, webhook secrets.
- Real account, customer, campaign or page identifiers.
- Real people's names, e-mail addresses or phone numbers.
- Real metrics, revenue or customer data. Every number in the demo and the examples comes from a
  seeded random generator and is labelled `DEMO DATA — NOT REAL BUSINESS RESULTS`.
- Host names, server paths, hosting details, build identifiers or deployment steps.
- Any write path to a real advertising platform. The write-safety model runs only against a
  simulated adapter.

## Automated checks

- `npm run privacy-scan` scans the working tree for e-mail addresses, phone numbers, platform id
  shapes, key and token shapes, host names, server paths, deployment fingerprints and a hashed
  name blocklist. `npm run privacy-scan:history` scans every commit, commit message, author
  e-mail and ref name. Findings are printed redacted.
- CI runs both scans on every push and pull request, plus gitleaks from a pinned, checksum-verified
  release binary.
- To protect an additional name without publishing it, add its hash to
  `scripts/privacy-allowlist.json` (`node scripts/privacy-scan.mjs --hash <word>`), or list it in
  the git-ignored `scripts/privacy-blocklist.local.json`.

## Reporting a problem

If you find something in this repository that looks like a secret, a real identifier or personal
data, please do not open a public issue with the details. Use the repository's private security
advisory feature ("Report a vulnerability" under the Security tab) and describe where it is, not
what it is. It will be removed, and if it was a real credential it will be revoked.

## Scope

This is demonstration code. It is not audited, it is not intended for production use, and it makes
no security guarantees beyond the checks listed above.
