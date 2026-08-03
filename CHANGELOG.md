# Changelog

## 3.0.0 — 2026-08-03

V3 is the first production-ready release of the action. It discovers model usage directly from immutable Git trees with no inventory to create or maintain.

### Highlights

- Detects supported OpenAI, Anthropic, Google Gen AI, Amazon Bedrock, Azure Terraform, and consumed environment-binding model references without executing repository code.
- Separates lifecycle outcome, scan coverage, and pull-request comparison health.
- Keeps base-branch policy authoritative and reports policy changes explicitly on pull requests and merge queues.
- Supports additive, freshness-bounded checked-in claims for runtime-only evidence.
- Adds bounded reports, annotations, stable fingerprints, job summaries, and optional Slack snapshots.
- Uses a strict typed lifecycle contract and a reviewed adapter for the public legacy feed; unreviewed pair drift is quarantined as partial coverage instead of becoming lifecycle authority.
- Runs the packaged action hermetically across Linux, macOS, and Windows in CI.

### Launch contract

- Requires no model inventory, provider credentials, custom feed, or generated setup step.
- Requires a Git checkout; pull-request and merge-queue comparison workflows should use complete history.
- Uses `warn-within-days` for advisory timing and `fail-within-days` as the explicit enforcement switch.
- Publishes versioned evidence, lifecycle, coverage, comparison, and provenance contracts.
