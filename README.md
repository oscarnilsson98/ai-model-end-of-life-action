# AI Model End-of-Life Check

[![CI](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml/badge.svg)](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml)

Monitor the AI models your application actually serves and get an early warning when one is deprecated or approaching shutdown. This GitHub Action checks an explicit model inventory against the community-maintained [deprecations.info](https://deprecations.info) lifecycle feed, then writes workflow annotations, a job summary, deterministic outputs, and optionally a Slack notification.

The action is inventory-first. Optional source discovery can report exact feed model IDs found in checked-out files, but it never adds models to the inventory, infers a serving platform, or changes policy results.

## Quick start: scheduled monitoring

Providers can announce lifecycle changes independently of code changes, so run the check on a schedule as well as on demand. A non-zero cron minute avoids the busiest part of the hour.

```yaml
name: AI model lifecycle monitor

on:
  schedule:
    - cron: "17 8 * * *"
  workflow_dispatch:

permissions: {}

jobs:
  model-lifecycle:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check deployed models
        uses: oscarnilsson98/ai-model-end-of-life-action@v2
        with:
          models: >-
            [
              {"id":"gpt-5.2","provider":"openai"},
              {"id":"claude-sonnet-4-5","provider":"anthropic"}
            ]
          days-before-shutdown: "90"
          fail-within-days: "30"
```

This reports dated shutdowns from 90 UTC calendar days out, includes matching deprecations whose shutdown date is not yet known, and fails inside 30 days. GitHub scheduled workflows run from the default branch and can be delayed or skipped during periods of high load; the schedule is not a real-time guarantee.

> [!IMPORTANT]
> Examples use the convenient moving `@v2` tag for readability. For production, replace it with the full 40-character commit SHA of the v2 release you reviewed. A full SHA is the strongest immutable GitHub Action reference; `@v2` intentionally moves to compatible releases.

No checkout or language setup is required for an inline inventory. The action ships a committed Node 24 bundle.

## Core behavior

1. Parse, validate, merge, and deduplicate `models` and `models-file`.
2. Load and validate either the upstream feed, a mirror, or a checked-out feed snapshot.
3. Match model IDs exactly and serving platforms through a documented alias map.
4. Report dated shutdowns inside `days-before-shutdown` and, by default, matching undated deprecations.
5. Publish human-readable reports, policy outputs, and reproducibility digests.
6. Fail only when a configured lifecycle or feed-history policy is breached, or when the monitor cannot complete safely.

Date-only provider deadlines use UTC calendar-day arithmetic: the shutdown date is day `0`, and past dates have negative `daysUntilShutdown` values.

## Inventory and policy inputs

At least one of `models` or `models-file` is required, including when source discovery is enabled. Supplying both is supported; their entries are merged and deduplicated.

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `models` | Conditional | `""` | JSON array of model declarations. Each entry is a bare model ID or an object with `id` and optional `provider`. |
| `models-file` | Conditional | `""` | Path to a JSON inventory created or checked out before this action runs. Relative paths resolve from `GITHUB_WORKSPACE`. |
| `days-before-shutdown` | No | `90` | Report a dated record when its shutdown is within this many UTC calendar days, including dates already passed. Range: `0`–`36500`. |
| `fail-within-days` | No | unset | Fail on dated findings at or inside this threshold. It must not exceed `days-before-shutdown`; unset means dated findings are warning-only. |
| `include-undated` | No | `true` | Include matching deprecations that have no published shutdown date. |
| `fail-on-undated` | No | `false` | Fail on an included undated deprecation. Cannot be `true` when `include-undated` is `false`. |
| `fail-on-unmatched` | No | `false` | Fail when a declaration has no exact model/platform history in this deprecations-only feed. Usually leave this disabled for active-model inventories. |
| `job-summary` | No | `true` | Write a bounded findings, feed-history, provenance, and notification report to the job summary. |

Boolean inputs accept only `true` or `false`. Inventories are limited to 1,000 merged entries and 1,000,000 bytes per inventory source.

### Model inventory schema

The inventory schema is published as [model-inventory.schema.json](model-inventory.schema.json):

```json
[
  "provider-agnostic-model-id",
  { "id": "gpt-5.2", "provider": "openai" },
  { "id": "claude-sonnet-4-5", "provider": "aws-bedrock" }
]
```

Objects accept only `id` and optional `provider`. IDs are non-empty strings up to 256 characters; providers are non-empty strings up to 100 characters. Control characters and unknown object fields are rejected.

### Exact matching and serving platforms

Model IDs are exact and case-sensitive. The action does not remove gateway prefixes, region prefixes, version suffixes, aliases, or deployment names. For example, `bedrock/claude-…` and `us.anthropic.claude-…` do not automatically match a feed record named `claude-…`; inventory generation should translate routing identifiers to provider model IDs.

`provider` means the serving platform whose lifecycle applies, not necessarily the model publisher. An Anthropic model served through Amazon Bedrock can have a different retirement date from the Anthropic API, so declare `aws-bedrock` for the former.

Provider matching normalizes Unicode, trims whitespace, ignores case, converts runs of punctuation or spacing to `-` separators, and folds the documented aliases below while keeping distinct platforms separate. Separator changes are accepted only where the resulting alias is listed; arbitrary punctuation inside a provider name is not ignored.

| Canonical platform | Example accepted aliases |
| --- | --- |
| `openai` | `OpenAI`, `Open AI`, `open-ai` |
| `anthropic` | `Anthropic`, `Anthropic AI` |
| `google` | `Google AI`, `Gemini`, `Google Gemini` |
| `google-vertex` | `Vertex`, `Vertex AI`, `Google Vertex AI`, `GCP Vertex` |
| `aws-bedrock` | `AWS`, `Bedrock`, `Amazon Bedrock` |
| `azure` | `Azure OpenAI`, `Azure AI`, `Azure AI Foundry`, `Microsoft Azure` |
| `xai` | `xAI`, `x.AI` |
| `cohere`, `groq` | `Cohere`, `Groq` (case variants) |

An explicitly configured provider must appear somewhere in the feed; otherwise the action fails rather than treating a typo as a clean result. Omitting `provider` is a wildcard across serving platforms and can apply the wrong platform-specific date or produce multiple findings. Prefer explicit providers for deployed models.

## Warning, failure, and qualified results

Use two thresholds to warn early and fail late:

```yaml
- uses: oscarnilsson98/ai-model-end-of-life-action@v2
  with:
    models: '[{"id":"gpt-5.2","provider":"openai"}]'
    days-before-shutdown: "180"
    fail-within-days: "30"
```

Dated records beyond 180 days are not findings. Dated findings from 31–180 days are warnings, while findings at 30 days or less fail the step. Already-passed dates always fall inside a non-negative threshold.

Undated deprecations are independent of the day window. They are included as warning-only findings by default. Set `fail-on-undated: "true"` to block them, or `include-undated: "false"` for dated-only reporting.

Unmatched inventory entries are a separate feed-history signal. Active models are normally absent from a deprecations-only feed, so unmatched does **not** mean invalid, unsupported, or inactive. `fail-on-unmatched: "true"` is only appropriate when every declaration is expected to have historical feed coverage.

> [!NOTE]
> “No findings” means only that no declared model matched a dated record inside the configured window or an included undated record in the validated feed snapshot. If `include-undated` is false, undated records were deliberately excluded. `matched-model-count` means “has exact feed history,” not “is supported.” No result proves that the feed is complete, every scraper ran, or a provider date applies to every region, tier, or API version.

### Gate pull requests with the checked-out inventory

This checks the inventory from the pull request rather than a hard-coded workflow list:

```yaml
name: Model lifecycle gate

on:
  pull_request:

permissions:
  contents: read

jobs:
  lifecycle-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the pull request
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false

      - name: Enforce the lifecycle policy
        uses: oscarnilsson98/ai-model-end-of-life-action@v2
        with:
          models-file: .github/model-inventory.json
          days-before-shutdown: "180"
          fail-within-days: "180"
          fail-on-undated: "true"
```

Do not expose a Slack webhook to workflows triggered by untrusted forks.

## Advanced: report-only source discovery

`discover-models` scans checked-out files for exact, case-sensitive model IDs already present in the validated lifecycle feed. It is an inventory-audit aid, not a model detector or policy source.

| Input | Default | Description |
| --- | --- | --- |
| `discover-models` | `false` | Enable report-only exact source discovery. Discovery never changes inventory, lifecycle findings, or breaches. |
| `discovery-paths` | workspace root | Comma- or newline-separated literal files/directories inside `GITHUB_WORKSPACE`. Globs are not expanded. |

```yaml
steps:
  - name: Check out the repository
    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
    with:
      persist-credentials: false

  - name: Check inventory and report exact source references
    id: eol
    uses: oscarnilsson98/ai-model-end-of-life-action@v2
    with:
      models-file: .github/model-inventory.json
      discover-models: "true"
      discovery-paths: |
        src
        config
```

Discovery compares source text only with conservative machine-like `model_id` values from the feed. It uses exact identifier boundaries, returns file/line/column coordinates without source snippets, and reports every possible feed provider for an ID. `ambiguous: true` means more than one serving platform uses that ID. The action does **not** infer which provider the code uses. A discovered ID is `tracked` only when the explicit inventory contains the same ID with a compatible provider or a provider wildcard. Untracked IDs can produce report-only warning annotations at their first retained location, but they never become policy breaches or Slack alert signals.

Discovery is intentionally bounded:

- At most 100 requested paths, 20,000 eligible feed IDs totaling 250,000 UTF-16 code units, 250,000 matcher-automaton nodes, 50,000 streamed filesystem entries, 25,000 examined files, 25,000 entered directories, 100 MiB of scanned text, and 100,000 occurrences.
- Individual files over 2 MiB are skipped; at most 50 locations are retained per model while the full occurrence count is preserved.
- Paths escaping the workspace are rejected. Symlinks are skipped rather than followed.
- The configured `models-file` and `feed-file` are excluded even when they are inside a requested discovery path, preventing inventory or feed data from reporting itself as source usage.
- Version-control, dependency, cache, virtual-environment, generated, build, coverage, and vendor directories are skipped, including common paths such as `.git`, `node_modules`, `dist`, `build`, `target`, and `vendor`.
- Lockfiles, known binary extensions, NUL-containing files, invalid UTF-8, unreadable files, and oversized files are skipped and reflected in discovery diagnostics.

Exceeding a hard aggregate bound fails safely. Skipped content means discovery is never proof that every model reference was found. Current models absent from the deprecations feed cannot be discovery candidates.

The `discovered-models` output has this report-only shape:

```ts
type PublishedDiscoveredModel = {
  id: string;
  providers: string[]; // possible feed platforms, not inferred usage
  providersTruncated: boolean;
  ambiguous: boolean;
  occurrenceCount: number;
  locations: Array<{ path: string; line: number; column: number }>;
  locationsTruncated: boolean;
  tracked: boolean;
};
```

The published array has its own 100,000-code-unit budget, at most 20 providers and 5 locations per row, and may compact or omit rows. `discovery-output-truncated` reports any such omission. The discovery counts always describe the full bounded scan, even when detailed rows are shortened or removed.

## Advanced: feed snapshots and reproducibility

The action accepts one feed source. If neither custom source is set, it uses `https://deprecations.info/v1/deprecations.json`.

| Input | Default | Description |
| --- | --- | --- |
| `feed-url` | official endpoint | HTTP(S) raw or JSON Feed endpoint. Mutually exclusive with `feed-file`; URL credentials are rejected. |
| `feed-file` | unset | Workspace-local checked-out or previously generated raw/JSON Feed file. Relative paths resolve from `GITHUB_WORKSPACE`. Mutually exclusive with `feed-url`. |
| `expected-feed-sha256` | unset | Expected SHA-256 of the feed’s exact bytes. A mismatch fails before JSON decoding. |
| `max-feed-age-days` | unset | Optional maximum recorded-content age, checked globally and for explicitly configured platforms. Disabled by default. |
| `request-timeout-seconds` | `15` | Timeout for each feed or Slack request. Range: `1`–`300`. |
| `retries` | `2` | Feed retries after network errors, HTTP `408`, `429`, and `5xx`. Range: `0`–`5`; Slack is never retried. |

`feed-file` pins the feed input for reviewable or air-gapped checks and is capped at the same 5 MiB as network responses. Calendar-day results still depend on when the action runs:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
  with:
    persist-credentials: false

- uses: oscarnilsson98/ai-model-end-of-life-action@v2
  with:
    models-file: .github/model-inventory.json
    feed-file: .github/lifecycle-feed.json
    expected-feed-sha256: ${{ vars.MODEL_EOL_FEED_SHA256 }}
```

The `/v1/` in the default feed URL is the upstream **feed schema/API version**. It is independent of this action’s `v2` release line and does not mean the action is using v1 code.

Private mirrors have an important limitation: the action does not accept custom authorization headers, and credentials embedded in a URL are rejected. Use runner-network identity or a trusted proxy, or download the authenticated snapshot in an earlier step and pass it through `feed-file`.

### Digests and audit evidence

The action exposes several hashes because they answer different questions:

| Value | Meaning |
| --- | --- |
| `feed-sha256` | Standard SHA-256 of the exact downloaded or file bytes. Formatting and record order affect it; `expected-feed-sha256` compares against this value. |
| `lifecycle-feed-sha256` | Order-independent digest of normalized lifecycle fields used by the action. Provider aliases and duplicate/order noise are canonicalized; observation timestamps and verbose context are excluded. |
| `inventory-sha256` | Order-independent digest of the merged, deduplicated inventory with provider aliases normalized. |
| `findingId` | Stable identity for canonical provider, exact model ID, and shutdown date (or `null`). It does not change with the daily countdown. |
| `alert-fingerprint` | Observational fingerprint of the current lifecycle signals, breach state, and unmatched entries that breach policy. It ignores daily countdown churn but changes for meaningful lifecycle, source, replacement, status, or policy transitions, regardless of notification delivery. |
| `next-alert-fingerprint` | Notification-state value safe for the caller to persist after notification handling. It advances to the current `alert-fingerprint` after other notification decisions; when delivery errors or Slack is disabled, it retains the caller's previous value, or remains empty when there was none. |
| `audit-record` | Compact deterministic JSON record tying the inventory, semantic feed, raw feed, alert fingerprint, and result counts together. It contains no execution timestamp. |

Raw feeds and JSON Feed documents representing the same lifecycle data can have different `feed-sha256` values but the same `lifecycle-feed-sha256`.

The audit record schema is:

```ts
type AuditRecordV1 = {
  schemaVersion: 1;
  inventorySha256: string;
  lifecycleFeedSha256: string;
  alertFingerprint: string;
  checkedModelCount: number;
  feedRecordCount: number;
  findingCount: number;
  breachCount: number;
  unmatchedBreachCount: number;
  rawFeedSha256: string;
};
```

This compact record is useful for comparisons and evidence, but it is not a complete provenance log: retain the workflow configuration, run timestamp, and GitHub run identity separately.

## Advanced: stateless Slack change notifications

Slack is optional and independent from scheduling. The action does not subscribe to provider events and does not remember previous runs.

| Input | Default | Description |
| --- | --- | --- |
| `slack-webhook` | unset | HTTPS Slack incoming webhook. Plain HTTP and redirects are rejected. |
| `notification-mode` | `always` | `always` sends on every run that has alert signals; `on-change` compares caller-provided fingerprints. |
| `previous-alert-fingerprint` | unset | Last caller-persisted `next-alert-fingerprint`, supplied for `on-change`. Must be 64 hexadecimal characters when set. |
| `notification-failure-mode` | `error` | `error` fails after a delivery failure; `warn` emits a warning without independently changing the configured policy result. |

Alert signals are lifecycle findings plus unmatched declarations only when `fail-on-unmatched` makes them breaches.

- `always`: send when alert signals exist; send nothing for a clear snapshot.
- `on-change` with no previous fingerprint: send an `initial` notification when alerts exist.
- `on-change` with a different fingerprint and current alerts: send a `changed` notification.
- `on-change` with the same fingerprint: skip with reason `unchanged`.
- `on-change` with a previous alert fingerprint and no current alerts: send a `resolved` notification.

```yaml
- name: Check out inventory and persistence tooling
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
  with:
    persist-credentials: false

- name: Check lifecycle state
  id: eol
  uses: oscarnilsson98/ai-model-end-of-life-action@v2
  with:
    models-file: .github/model-inventory.json
    slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    notification-mode: on-change
    previous-alert-fingerprint: ${{ vars.MODEL_EOL_ALERT_FINGERPRINT }}

- name: Persist the new fingerprint in your state store
  if: ${{ always() && steps.eol.outputs.next-alert-fingerprint != '' }}
  env:
    ALERT_FINGERPRINT: ${{ steps.eol.outputs.next-alert-fingerprint }}
  run: ./scripts/store-model-eol-fingerprint.sh "$ALERT_FINGERPRINT"
```

The persistence step is deliberately caller-owned; replace it with your repository variable, artifact, database, or other durable store. Feed the last persisted `next-alert-fingerprint` back through `previous-alert-fingerprint`. Use `alert-fingerprint` to observe or audit the state evaluated by this run; do not use it directly to advance notification state. `next-alert-fingerprint` advances to the current state after decisions such as `initial`, `changed`, `unchanged`, `resolved`, or `no-alerts`. On `error` or `disabled`, it instead retains the previous value; if none existed, it stays empty and the example deliberately writes nothing. This lets a later enabled run retry an alert that was not confirmed delivered.

The caller also owns consistency between runs. Serialize overlapping checks with GitHub Actions `concurrency`, or use a state store with atomic compare-and-set semantics, so an older run cannot overwrite a newer fingerprint.

Slack payloads are bounded and escaped. POSTs are not retried within a run because an interrupted response does not prove the message was not delivered. Such an ambiguous failure preserves the previous fingerprint so a later run retries, which favors eventual delivery but can produce a duplicate if Slack accepted the first POST before the response failed. `notification-sent` and `notification-reason` make the decision observable without implying that the action owns durable state.

## Outputs

All GitHub Action outputs are strings. JSON values below are serialized strings.

### Lifecycle and feed-history outputs

| Output | Description |
| --- | --- |
| `findings` | JSON array of lifecycle findings. Dated findings sort by ascending `daysUntilShutdown`, followed by undated findings. |
| `has-findings` | `"true"` when a dated record is in the report window or an included undated record matches. |
| `finding-count` | Number of lifecycle findings. |
| `has-breaches` | `"true"` when lifecycle policy or `fail-on-unmatched` is breached. |
| `breach-count` | Total lifecycle and unmatched-feed-history breaches. |
| `checked-model-count` | Number of unique inventory declarations after merge and deduplication. |
| `matched-model-count` | Declarations with at least one exact model/platform record anywhere in the feed; this is feed history, not active-model validation. |
| `unmatched-model-count` | Declarations with no exact model/platform history in the feed. |
| `unmatched-models` | JSON array of unmatched declarations. Absence from this feed does not prove a model is active or supported. |
| `feed-content-age-days` | Whole days since the newest observation timestamp, or an empty string when unavailable. This is content recency, not scraper health. |

`has-findings` is intentionally lifecycle-specific. A feed-history-only failure can produce `has-findings: "false"` and `has-breaches: "true"`.

### Provenance and audit outputs

| Output | Description |
| --- | --- |
| `feed-record-count` | Number of validated, normalized feed records. |
| `feed-sha256` | SHA-256 of exact feed bytes. |
| `lifecycle-feed-sha256` | Canonical digest of lifecycle fields used by the action. |
| `inventory-sha256` | Canonical digest of the checked inventory. |
| `alert-fingerprint` | Observational fingerprint of the current policy signals, regardless of notification delivery. |
| `next-alert-fingerprint` | Caller-persistence value for the next run; on `error` or `disabled` it remains the previous value or empty instead of advancing. |
| `audit-record` | Deterministic JSON audit record described above. |

### Notification outputs

| Output | Description |
| --- | --- |
| `notification-sent` | `"true"` only when Slack delivery completed successfully. |
| `notification-reason` | One of `disabled`, `no-alerts`, `always`, `initial`, `changed`, `unchanged`, `resolved`, or `error`. |

### Discovery outputs

| Output | Description |
| --- | --- |
| `discovered-models` | JSON array of unique report-only `PublishedDiscoveredModel` records. `[]` when discovery is disabled or finds none. |
| `discovered-model-count` | Number of unique discovered feed model IDs. |
| `untracked-discovered-model-count` | Discovered model IDs not covered by a compatible inventory declaration. This never breaches policy by itself. |
| `discovery-match-count` | Total exact source occurrences across scanned files. |
| `discovery-output-truncated` | `"true"` when provider/location detail or complete model rows were omitted from `discovered-models`. Full counts remain available. |

Configured policy failures occur after outputs are written. Inventory, feed, configuration, discovery-bound, or validation failures can occur before outputs are available.

### Finding schema

```ts
type FindingV2 = {
  findingId: string;
  id: string;
  provider: string;
  status: "scheduled" | "shutdown-passed" | "date-unknown";
  shutdownDate: string | null;
  daysUntilShutdown: number | null;
  deprecationDate?: string;
  announcementDate?: string;
  replacementModels: string[];
  url?: string;
  context?: string;
};
```

`scheduled` means the shutdown is today or later, `shutdown-passed` means its date is in the past, and `date-unknown` means no shutdown date was published. `shutdownDate` and `daysUntilShutdown` are always present but nullable. Optional fields are omitted when unavailable; verbose `context` can also be omitted if required to stay within GitHub’s aggregate output budget.

### Consume outputs around a policy failure

```yaml
- name: Check lifecycle policy
  id: eol
  continue-on-error: true
  uses: oscarnilsson98/ai-model-end-of-life-action@v2
  with:
    models: '[{"id":"gpt-5.2","provider":"openai"}]'
    days-before-shutdown: "90"
    fail-within-days: "30"

- name: Process completed results
  if: ${{ always() && steps.eol.outputs.audit-record != '' }}
  env:
    FINDINGS: ${{ steps.eol.outputs.findings }}
    AUDIT_RECORD: ${{ steps.eol.outputs.audit-record }}
    HAS_BREACHES: ${{ steps.eol.outputs.has-breaches }}
  shell: bash
  run: |
    jq . <<<"$FINDINGS"
    jq . <<<"$AUDIT_RECORD"
    echo "Policy breach: $HAS_BREACHES"

- name: Preserve the lifecycle gate result
  if: ${{ steps.eol.outcome == 'failure' }}
  shell: bash
  run: exit 1
```

`continue-on-error` is needed only when later steps must consume outputs from a blocking result. The final step restores the failed job outcome.

## Bounded reporting

The action keeps every reporting channel below its practical GitHub or Slack limit:

- Combined GitHub outputs have a conservative budget of 400,000 UTF-16 code units. To fit, the action first replaces report-only `discovered-models` detail with `[]`, then may omit optional finding context; full discovery counts and `discovery-output-truncated` remain available. If required outputs still exceed the budget, the action fails instead of writing a partial result.
- Policy annotations are capped at 4,000 UTF-16 code units each and at 10 warnings plus 9 lifecycle/feed-history errors per step, reserving the final error slot for the step result. Extra annotations are replaced by a notice.
- The detailed job-summary table contains at most 100 finding rows and the full summary is capped at 900,000 UTF-8 bytes; oversized summaries fall back to compact counts.
- Slack text is capped at 3,500 UTF-16 code units and reports omitted policy signals.
- Source discovery has separate filesystem, byte, occurrence, and location bounds described above.

These limits affect presentation, not matching or policy computation. Required machine-readable results are either emitted within the aggregate budget or the action fails safely.

## Content age is not scraper health

`max-feed-age-days` is disabled by default. Observation fields such as `last_observed` and `scraped_at` measure recorded content recency; unchanged records can retain old timestamps even when collection is healthy.

When enabled, the action fails if the newest timestamp globally—or for an explicitly configured serving platform—is older than the limit. It also fails if required timestamps are absent. This can enforce a mirror’s known refresh contract, but it cannot prove that every upstream scraper ran successfully. The action reports `feed-content-age-days` and configured-platform ages even when enforcement is disabled.

## Security and runtime compatibility

- Pin the action to the full commit SHA of a reviewed, immutable `v2.x.y` release. Keep the version in a comment and use Dependabot to update the SHA. The `v2` major tag is a mutable convenience pointer.
- Inline inventories need no `GITHUB_TOKEN` permissions, so use `permissions: {}`. A checked-out inventory, feed snapshot, or source-discovery target normally needs `contents: read` for `actions/checkout`.
- Treat custom feeds and caller-selected file paths as trusted workflow configuration. `expected-feed-sha256` verifies exact bytes but does not make an untrusted feed authoritative.
- Store Slack webhooks as secrets and do not expose them to untrusted pull requests. Parse JSON outputs instead of interpolating them into shell code.
- Discovery emits repository-relative coordinates, not snippets. Those paths still become workflow output and summary data visible to people who can read the run.

The action declares `runs.using: node24`. Current GitHub-hosted runners execute the bundled action without a separate Node install. Self-hosted runners must use a GitHub Actions runner version that supports Node 24 JavaScript actions, and GitHub Enterprise Server deployments must support the `node24` action runtime. Upgrade the runner/GHES environment before adopting v2; there is no Node 20 fallback in this release.

Exact release tags are protected through GitHub Immutable Releases and the release workflow refuses major-tag promotion unless GitHub reports the stable release as immutable. Consumers should still use the release commit SHA for the clearest supply-chain pin. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Limitations

- The core lifecycle result covers only the inventory you provide. Optional discovery sees only conservative exact IDs already present in the deprecations feed; it cannot discover current models absent from the feed, computed names, SDK defaults, aliases, fine-tunes, or dynamic routing.
- Discovery never infers a provider. An ID shared by several platforms remains ambiguous and does not become an inventory entry.
- An unmatched declaration means only “no exact history in this feed.” It does not prove that a model is current, supported, valid, or fully covered.
- Feed data is community-maintained and best-effort. Announcements can be missing, delayed, corrected, or superseded.
- A provider date may describe the earliest shutdown, one region, a usage tier, an API version, a migration program, or a redirected service. Follow the linked primary source before migrating or paging a team.
- Content age is not end-to-end scraper health. No feed replaces provider notices, account emails, contracts, or service dashboards.
- `on-change` notifications are comparison logic, not durable state or event delivery. Reliability depends on the caller correctly persisting `next-alert-fingerprint`, restoring it through `previous-alert-fingerprint`, and preventing overlapping-run state races.
- Private `feed-url` mirrors cannot receive custom authentication headers from this action; fetch them in an earlier trusted step and use `feed-file` when network identity is insufficient.

Treat this action as an early-warning, audit-evidence, and policy-automation layer—not as a provider’s contractual source of truth.

## Migrating from v1 to v2

Update consumers of `findings` before changing the action reference.

| Area | v1 behavior | v2 behavior and migration |
| --- | --- | --- |
| Action reference | `@v1` | Pin a reviewed v2 release commit SHA, or use mutable `@v2` for convenience. |
| Undated deprecations | Ignored because only records with `shutdown_date` became findings. | Included by default with `status: "date-unknown"`. Set `include-undated: "false"` for dated-only behavior. |
| Finding identity | No stable ID. | Every finding has `findingId`; date fields are nullable and `status` distinguishes scheduled, passed, and unknown dates. |
| `has-findings` | Meant a dated shutdown was inside the window. | Also becomes `"true"` for included undated records. Use `has-breaches` for configured blocking policy. |
| Feed age | Enforced at 30 days by default. | Disabled by default because timestamps measure content recency, not scraper health. Opt in only when the signal fits your source. |
| Inventory | Inline `models` was required. | Supply `models`, a checked-out `models-file`, or both. Discovery is optional and never replaces the inventory. |
| Feed sources | Network raw array. | Raw or JSON Feed documents can come from a URL or `feed-file`, with optional exact-byte verification. |
| Notifications | Snapshot Slack delivery. | `notification-mode: always` preserves snapshot behavior; stateless `on-change` requires caller-managed fingerprint persistence and can send resolutions. |
| Outputs | Basic findings and presence. | Feed-history diagnostics, discovery, raw/semantic/inventory hashes, alert fingerprint, notification decision, and deterministic audit evidence are available. |

## Development and releases

The v2 source package is `2.0.0`. Consumer workflows install no dependencies; maintainers use the exact toolchain recorded in `package.json`.

**Bun 1.3.14 is required exactly.** `bun run check` and `bun run build` fail when another Bun version is active, preventing a locally generated bundle from silently differing from CI.

```bash
bun --version # must print 1.3.14
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run build
```

`dist/index.js` is committed. CI rebuilds it, rejects drift, runs deterministic tests, validates the packaged action on Linux, macOS, and Windows, and keeps pull-request tests independent of the live service. A separately classified smoke workflow checks upstream raw/JSON Feed compatibility.

Stable releases use exact `vX.Y.Z` tags; v2 begins at `v2.0.0`, matching `package.json`. Before tagging, rebuild with Bun 1.3.14, merge the release commit into the default branch, and enable GitHub Immutable Releases. Publishing a stable release triggers tag, version, ancestry, toolchain, test, packaged-fixture, and bundle validation before the matching major tag can move. Without release immutability, promotion fails closed.

Before publishing v2, also enable private vulnerability reporting, choose either GitHub’s CodeQL default setup or the checked-in advanced workflow, and configure tag rules so the scoped release workflow can update mutable `v2` while immutable `v2.x.y` releases remain locked.

## License

[MIT](LICENSE)
