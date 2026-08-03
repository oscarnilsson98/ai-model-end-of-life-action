# Changelog

## 3.0.0 — 2026-08-03

V3 replaces inventory checking with zero-input discovery from immutable Git trees.

### Highlights

- Detects supported OpenAI, Anthropic, Google Gen AI, Amazon Bedrock, Azure Terraform, and consumed environment-binding model references without executing repository code.
- Separates lifecycle outcome, scan coverage, and pull-request comparison health.
- Keeps base-branch policy authoritative and reports policy changes explicitly on pull requests and merge queues.
- Supports additive, freshness-bounded checked-in claims for runtime-only evidence.
- Adds bounded reports, annotations, stable fingerprints, job summaries, and optional Slack snapshots.
- Uses a strict typed lifecycle contract and a reviewed adapter for the public legacy feed; unreviewed pair drift is quarantined as partial coverage instead of becoming lifecycle authority.
- Runs the packaged action hermetically across Linux, macOS, and Windows in CI.

### Breaking changes

- Removes every v2 inventory, discovery-path, custom-feed, retry, and notification-deduplication input.
- Requires a Git checkout; pull-request and merge-queue comparison workflows should use complete history.
- Renames the warning horizon input to `warn-within-days` and makes `fail-within-days` the explicit enforcement switch.
- Replaces v2 outputs and report shapes with the v3 evidence, lifecycle, coverage, comparison, and provenance contracts.

See [Migrating from v2](README.md#migrating-from-v2) for the input-by-input migration table.
