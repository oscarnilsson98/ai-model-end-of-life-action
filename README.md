# AI Model Lifecycle Monitor

[![CI](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml/badge.svg)](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml)

Finds the AI models referenced by your committed application and deployment code, joins that evidence to the [deprecations.info](https://deprecations.info) lifecycle feed, and warns you before a known shutdown.

There is no inventory to create or maintain. The action reads evidence directly from the Git commit being assessed and writes annotations, a job summary, stable outputs, and a complete JSON report.

## Quick start

```yaml
name: AI model lifecycle

on:
  pull_request:
  merge_group:
    types: [checks_requested]
  schedule:
    - cron: "17 8 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  lifecycle:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out repository history
        uses: actions/checkout@v7
        with:
          persist-credentials: false
          fetch-depth: 0

      - name: Check AI model lifecycle
        id: lifecycle
        uses: oscarnilsson98/ai-model-end-of-life-action@v3
```

That is the complete warning-only setup: no provider credentials, generated inventory, package installation, language setup, or action inputs.

Two things worth knowing before you copy it:

- **`fetch-depth: 0` is required.** Pull-request evaluation compares the exact base commit with GitHub's synthetic merge commit. Without that history the action still shows target diagnostics, but returns `unknown + partial` and fails, because it cannot determine what the pull request introduced.
- **Pin for production.** `@v3` and `@v7` are moving tags that change as releases ship. Pin both to reviewed commit SHAs and let Dependabot keep them current — see [SECURITY.md](SECURITY.md).

## Enable enforcement

The default is advisory: a known lifecycle risk warns but does not fail the job. Add one checked-in policy file to fail when definite production evidence approaches shutdown:

```yaml
# .github/ai-model-lifecycle.yml
schemaVersion: 1

policy:
  failWithinDays: 30
```

Setting `failWithinDays` turns enforcement on. The built-in 180-day warning horizon and fail-closed handling for partial coverage remain in effect unless the policy explicitly overrides them.

Warnings and failures measure different dates. The warning horizon opens at the earliest published lifecycle date, so a model whose deprecation date has already passed is advisory even when its shutdown is a year out — some providers stop serving at the deprecation date. Enforcement stays keyed to the shutdown date, so an early deprecation warns loudly without failing the job. See [lifecycle date precedence](docs/v4-product-contract.md#lifecycle-date-precedence).

Only resolved deployment evidence, or resolved application evidence established as production, can block. Ordinary SDK calls remain advisory because source code alone does not prove where it is deployed. If a known application path is production, add this top-level `scopeRules` section to the same policy file, using the relevant stable rule ID from [the detector contract](docs/v4-detector-contract.md):

```yaml
scopeRules:
  - scopeRuleId: production-api
    detectorRuleIds:
      - source.ts.openai.request-model@1
    paths:
      - services/api/**
    scope: application
    environment: production
    reason: This service is deployed to production
```

Resolved deployment evidence and current production claims can block without a scope rule. Once enforcement is enabled, partial declared coverage fails closed unless trusted policy explicitly sets `allowPartial: true`.

The threshold also works as an action input for simple non-PR workflows:

```yaml
- uses: oscarnilsson98/ai-model-end-of-life-action@v3
  with:
    fail-within-days: "30"
```

Action inputs are target-controlled, so they belong in scheduled and push workflows rather than pull-request ones. On `pull_request` and `merge_group` events an input tightens only the proposed policy, never the trusted base policy it is compared against: a pre-existing finding that the base policy does not enforce becomes `worsened` under a stricter input and blocks the pull request. Steady-state enforcement belongs in the checked-in policy file, where base and head are held to the same thresholds.

On pull requests and merge groups, base-branch policy stays authoritative. Head configuration may add evidence or make policy stricter, but it cannot suppress a base finding, shorten a threshold, weaken scope, or turn partial coverage into success. Policy changes receive their own visible diff.

## What gets scanned

The action reads tracked blobs from the selected Git tree, not arbitrary files in the runner workspace. It never executes repository code or installs repository dependencies.

The action detects static model values in these supported integrations:

- OpenAI's JavaScript/TypeScript and Python SDKs
- Anthropic's JavaScript/TypeScript and Python SDKs
- Google's current Gen AI JavaScript/TypeScript and Python SDKs
- Amazon Bedrock Runtime calls through the AWS JavaScript SDK and boto3
- the Vercel AI SDK's OpenAI, Anthropic, Google, Google Vertex, Azure, Amazon Bedrock, Cohere, Groq, and xAI providers
- Azure Cognitive Services model deployments in Terraform
- model-valued environment bindings connected to supported calls

Beyond those named integrations, any static string held by a key that selects a model is read — `model`, `modelId`, `model_name`, `embeddingModel`, `engine`, and the `deployment` family — at any nesting depth, in JavaScript, TypeScript, Python and Terraform. No import, client, or recognized framework is needed. Every AI SDK converges on the parameter name rather than the call shape, so this is what covers a framework nobody has written a rule for, and what keeps working when an SDK reshapes its call surface in a new major.

The value must equal a lifecycle-feed model ID exactly, so this can never invent a finding — it only names a model the feed already reports. It resolves the model but not the serving platform, so it is reported at medium confidence and blocks only when the feed publishes that model ID for exactly one platform, alongside the usual production or deployment scope requirement.

Other tracked UTF-8 files are checked for exact eligible model IDs from the lifecycle feed. Those text-only matches, documentation, examples, tests, and dynamic selectors can warn or appear as notices, but never block.

For the Vercel AI SDK, a provider call is read wherever it appears — `generateText({ model: openai("gpt-5") })`, a `const model = openai(id)` held for later, or a middleware wrapper — because the provider call itself is what selects the model. The provider package pins the serving platform, so these resolve and can block on the same terms as the official SDKs. `azure(...)` names a deployment and `bedrock(...)` is polymorphic, so both need a trusted resolution before they block, exactly as their official-SDK counterparts do.

The supported parsers do not accept every construct in the languages they cover. JSX and TSX element syntax is read, but a residual gap remains — JSX inside a template-literal substitution, and an opening tag longer than the lookahead. Such a file falls back to the same text-only matching an unsupported language gets, and a notice names it. Because the file is still assessed, `scan-status` stays `complete` — a repository is never pushed into partial coverage, and so into `allowPartial: true`, by a parser gap.

Integrations that still route model selection through their own abstraction — LangChain, LlamaIndex, LiteLLM, the legacy Google generative SDKs, and AI SDK provider packages outside the published rules such as `@ai-sdk/mistral` — are reported as an `unsupported-integration-import.<framework>@1` notice naming the framework and the files that import it, so an unread integration is not left silent. A re-export barrel and a dynamic `import(...)` count as importing it; a type-only import does not. Coverage stays `complete` and enforcement is unaffected. The notice exists because these integrations are read at the generic tier rather than by a rule that understands them: a selection held by a model-selector key still resolves at medium confidence without a proven platform, and anything outside that — a selection passed positionally, wrapped, or computed — reaches the assessment only as a low-confidence text match that can never block.

A text match does not say which provider serves the model, so one occurrence of a model ID that several providers publish is reported once — as a single finding naming every candidate platform and the earliest of their shutdown dates — not once per provider. If the repository only uses some platforms, declare them and the rest stop matching text at all:

```yaml
# .github/ai-model-lifecycle.yml
schemaVersion: 1

servingPlatforms:
  - openai
  - google
```

The declaration applies only where the evidence itself did not establish a platform, so it never hides a finding that could block. It is reported as an evidence source in the job summary and report.

Static evidence has limits. Remote databases, secrets, provider consoles, external deployment repositories, and runtime routers are outside it. A clean result means only that no actionable lifecycle risk was found in the evidence actually assessed. [Checked-in claims](#optional-runtime-only-claims) can represent known runtime-only facts; they do not prove complete coverage.

The exact support matrix and stable rule IDs are published in [the detector contract](docs/v4-detector-contract.md).

## Reading the result

Lifecycle outcome and scanner health are reported separately:

| Output | Values | Meaning |
| --- | --- | --- |
| `result` | `no-actionable-risk`, `advisory`, `blocking`, `unknown` | The lifecycle decision for this run. |
| `scan-status` | `complete`, `partial`, `failed` | Whether declared evidence coverage completed. |
| `comparison-status` | `available`, `partial`, `unavailable`, `not-applicable` | Whether base-versus-target classification was trustworthy. |

Which combinations pass and which fail:

| Condition | Step |
| --- | --- |
| Advisory or clean complete scan | Succeeds |
| Partial scan without enforcement | Succeeds with a warning |
| Definite policy breach | Fails |
| Partial scan with enforcement and `allowPartial: false` | Fails closed |
| Upstream feed older than `max-feed-age-days` | Partial: succeeds with a warning, or fails closed under enforcement |
| Upstream feed unreachable or undecodable | Partial: succeeds with a warning, or fails closed under enforcement |
| Individual upstream rows quarantined as malformed | Partial: succeeds with a warning, or fails closed under enforcement |
| Aggregate detector-fact budget exhausted | Partial: succeeds with a warning, or fails closed under enforcement |
| Typed-feed schema, trusted schema, target snapshot, other resource-budget, or internal failure | Fails with `unknown + failed` |
| Required PR base unavailable | Fails with `unknown + partial` |

Existing base-branch debt stays visible but does not fail an unrelated pull request. A pull request blocks only on a definite new or worsened breach — measured against the trusted base policy, so this holds when enforcement comes from the checked-in policy file rather than from a stricter action input.

## Scheduled runs and Slack

Keep the scheduled trigger even if pull requests are already checked — a provider can announce a shutdown without any repository change.

A warning-only scheduled job finishes green, so it may not attract attention. A Slack incoming webhook makes actionable advisories visible without changing enforcement:

```yaml
- name: Check AI model lifecycle
  uses: oscarnilsson98/ai-model-end-of-life-action@v3
  with:
    slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
```

To rely on GitHub's workflow-failure notifications instead, set `failWithinDays` and make sure the relevant evidence is established as a resolved deployment or as production application use, as described above.

Slack is a snapshot, not a stateful alert subscription. Delivery is attempted only when the event name is exactly `schedule`, `workflow_dispatch`, or `push` and the selected target is a commit. Every other event — including `pull_request`, `merge_group`, `release`, and local or unknown events — is skipped, so untrusted changes cannot consume a webhook.

The message names every blocking and advisory finding in application or deployment scope, with its deadline, the feed's first replacement model, and a link to the provider's deprecation page when the feed supplies one. A match found only in text — the fallback when a repository has no typed SDK call site — is named too and labelled `ADVISORY (text match)`, so an advisory run always says which models it is about. Findings in documentation, test, or example scope are reported as a count and stay in the job summary. The snapshot links back to the workflow run, so the summary, annotations, and any uploaded report are one click away.

A delivery failure does not change `result` or `scan-status`. It changes `notification-status`, `exit-reason`, and, by default, the final step exit; set `notification-failure-mode: warn` to keep delivery best-effort.

## Optional runtime-only claims

Static scanning cannot see a model selected in a remote control plane. Additive checked-in claims describe that evidence without turning the ordinary workflow back into an inventory.

For a small number of facts, use an assertion in the policy file. The timestamps below are examples; replace all four with the claim's real assertion, review, review-after, and expiry timestamps:

```yaml
schemaVersion: 1

assertions:
  - evidenceId: remote-prod-chat
    modelId: gpt-5.2
    servingPlatform: azure
    scope: application
    environment: production
    policyEligible: true
    reason: Selected by the production gateway stored in a remote control plane
    provenance: Reviewed production gateway configuration
    assertedAt: 2026-08-02T08:00:00Z
    reviewedAt: 2026-08-02T08:00:00Z
    reviewAfter: 2026-10-31T08:00:00Z
    expiresAt: 2027-01-29T08:00:00Z
```

For generated deployment or runtime snapshots, check strict JSON evidence documents into `.github/ai-model-evidence/*.json`. Each document and fact carries a stable ID, canonical serving-platform slug, provenance, source lineage, freshness boundary, and expiry. Every entry is treated as a repository-supplied claim — a name such as `runtime-observation` does not imply remote verification.

Review-overdue, stale, and expired evidence stays visible. It becomes advisory and makes declared coverage partial instead of silently disappearing.

The strict policy, evidence, lifecycle-feed, and assessment-report contracts are published in [the v3 schemas](schemas/README.md); their behavioral semantics in [the v3 product contract](docs/v4-product-contract.md).

## Inputs

All inputs are optional.

| Input | Default | Description |
| --- | --- | --- |
| `warn-within-days` | Checked-in policy, otherwise `180` | Warning horizon in UTC calendar days, measured against the earliest published lifecycle date — the deprecation date when the provider published one, otherwise the shutdown date. |
| `fail-within-days` | Unset | Enables enforcement for definite eligible evidence inside the horizon. Measured against the shutdown date only. |
| `allow-partial` | Checked-in policy, otherwise `false` | Permits enforced partial scans to succeed unless they contain a definite breach. |
| `max-feed-age-days` | `30` | Upstream freshness horizon. An older lifecycle feed makes `scan-status` partial. Set to `""` to disable. |
| `slack-webhook` | Unset | HTTPS Slack incoming webhook used only for commit targets on `schedule`, `workflow_dispatch`, or `push`; every other event is skipped. |
| `notification-failure-mode` | `fail` | `fail` or `warn` when configured delivery fails. |

There is intentionally no `models`, `models-file`, workspace path, custom feed URL, or runtime evidence input. The action discovers committed repository evidence and uses the release's reviewed lifecycle-feed contract.

## Outputs

All outputs are strings; JSON values are serialized strings.

| Output | Description |
| --- | --- |
| `result` | Lifecycle result for this invocation. |
| `scan-status` | Overall assessment coverage. |
| `comparison-status` | Health of base-versus-target classification. |
| `exit-reason` | Highest-precedence reason for the final process exit. |
| `target-kind` | Exact Git target selection used by the action. |
| `evidence-health` | Worst checked-in claim freshness state. |
| `feed-generated-at`, `feed-age-days` | When upstream produced the lifecycle feed, and how many whole days ago. Both are empty when the feed was unavailable. |
| `report-path` | Runner-local path to the complete JSON report. |
| `output-truncated` | Whether large detail outputs were compacted. |
| `notification-status`, `notification-reason` | Independent Slack delivery result. |

<details>
<summary>Comparison, detail, and identity outputs</summary>

| Output | Description |
| --- | --- |
| `baseline-result`, `target-result` | Base and effective target outcomes on comparison events. |
| `baseline-scan-status`, `target-scan-status` | Side-specific comparison coverage. |
| `evidence-sources` | JSON source provenance and health. |
| `evidence-facts` | Bounded JSON detector facts. |
| `lifecycle-findings` | Bounded JSON joined lifecycle findings. |
| `unresolved-references` | Bounded JSON dynamic or ambiguous selectors. |
| `counts` | JSON outcome, scope, and resolution counts. |
| `source-feed-sha256` | Identity of exact upstream bytes. |
| `normalized-feed-sha256` | Identity of normalized validated feed semantics. |
| `active-records-sha256` | Identity of active records after supersession. |
| `feed-adapter-manifest-sha256` | Identity of the reviewed legacy-feed classification. |
| `detector-manifest-sha256` | Identity of the detector/rule release. |
| `evidence-fingerprint`, `finding-fingerprint` | Stable fact and finding set identities. |
| `scan-fingerprint`, `alert-fingerprint` | Stable coverage and actionable-alert identities. |

</details>

Detail outputs are bounded for GitHub's file-command limits. When `output-truncated` is `true`, read `report-path` from a later step in the same job or upload it as an artifact:

```yaml
- uses: actions/upload-artifact@v4
  if: ${{ always() }}
  with:
    name: ai-model-lifecycle-report
    path: ${{ steps.lifecycle.outputs.report-path }}
```

## Requirements and limits

The action requires Git 2.30.0 or newer, because it uses `git rev-parse --end-of-options` together with NUL-delimited tree and batch object plumbing. GitHub-hosted runners satisfy this; check `git --version` before using a self-hosted runner.

<details>
<summary>Fixed safety ceilings (cannot be raised with inputs)</summary>

| Assessed input | Ceiling |
| --- | --- |
| One selected Git tree | 100,000 entries, 100,000 unique objects, 32 MiB of tree/object metadata, 2 MiB per blob, and 100 MiB of blob content in total |
| GitHub event payload | 2 MiB |
| Lifecycle feed | 32 MiB and 100,000 records |
| Checked-in policy | 512 KiB; 1,000 entries in each rule or nested string list; threshold values through 36,500 days |
| Each checked-in evidence document | 2 MiB and 10,000 records |
| Detector output | 100,000 evidence facts per Git snapshot |

A blob above the 2 MiB per-blob ceiling is reported as an identified partial blind spot. Exhausting the aggregate detector-fact budget truncates the scan and is reported as an identified partial blind spot. Exhausting an aggregate Git, event, feed, report, or trusted policy/evidence budget fails the assessment with `unknown + failed`. An over-limit target-only PR policy or evidence document is excluded from authority and shown as an advisory configuration change under the monotonic PR rules.

Publication is bounded separately:

| Published surface | Ceiling and behavior |
| --- | --- |
| Complete local JSON report | 25 MiB; a larger report fails publication |
| Detail action outputs | 120 KiB each and 700 KiB across core outputs under the action's file-command size estimate; arrays are compacted and `output-truncated` becomes `true` |
| Workflow annotations | 10; each message is limited to 2,000 UTF-16 code units, and paths above 1,024 UTF-8 bytes are emitted without a source location |
| Slack snapshot | 12,000 UTF-8 bytes, 10 actionable findings, and 8 evidence sources; webhook URLs are limited to 8,192 UTF-16 code units |

</details>

## Feed integrity

The current public upstream feed is not typed. The action wraps it with an adapter manifest that classifies the source's few non-model rows by kind, so entries such as reusable prompts and agent builders never enter model matching, and that marks a small set of short ambiguous identifiers ineligible for literal scanning.

Every well-formed upstream row enters the normalized lifecycle feed as soon as the source publishes it. The adapter holds no allowlist: a newly published deprecation is visible on the next run, with no action release required. Authority is bounded by how strong the evidence is and whether the serving platform is established, not by a platform registry. A provider the upstream source adds is enforceable on the run that first sees it: its platform slug is derived from the provider label, and the registry now governs only display names and the platform proof that a per-provider rule supplies. Where nothing proves the platform, the feed can: a model ID the feed publishes for exactly one platform is established by that fact alone, since a model served elsewhere on a different timeline would carry its own upstream row.

Fields the adapter does not read are ignored, so an additive upstream column never fails a run. Malformed rows and duplicate pairs are quarantined one row at a time with a diagnostic and make `scan-status: partial`, so one bad row costs that row rather than the whole feed. Invalid adapter metadata and schema failures still produce `unknown + failed`. A provider label that yields no valid platform slug at all has its rows skipped with a diagnostic and makes `scan-status: partial`; if no row resolves a platform, or no row is well formed at all, the non-empty feed contract fails.

An upstream feed that cannot be fetched or decoded at all is also `partial` rather than fatal: the run emits a `feed-unavailable` diagnostic and reports that it could not check, so a third-party outage does not break every repository's build at once. Enforced runs still fail closed on that partial coverage under the existing `allowPartial` rules.

### Upstream freshness

A feed that stops updating does not fail: it keeps serving a well-formed document that answers every lookup with a permanent all-clear. Nothing downstream can distinguish that from genuinely having no deprecations, so the action measures the feed itself.

Each run compares the feed's production instant against `max-feed-age-days` (default 30). Beyond that horizon the run emits a `feed-stale` diagnostic and sets `scan-status: partial` — warning-only runs stay green with a visible signal, while enforced runs fail closed under the existing `allowPartial` rules. Set `max-feed-age-days: ""` to disable the guard, for example when pinning a deliberately frozen mirror.

The instant is the feed's `generatedAt`: a typed producer states it directly, and the reviewed adapter derives it from the newest reviewed `scraped_at` in the untyped upstream feed. Both are published every run as `feed-generated-at` and `feed-age-days`, so an external monitor can alert on upstream silence directly instead of inferring it.

Every run publishes the exact source, normalized feed, active-record, adapter-manifest, and detector-manifest identities.

## Security model

- Use only `contents: read`; the action does not request issue, pull-request write, or security-event permissions.
- It reads immutable Git trees and blobs with `git ls-tree` and `git cat-file`; it does not recursively trust the runner workspace.
- Repository code is hostile input and is never executed.
- Lazy Git fetching is disabled; the action does not silently use checkout credentials to retrieve missing history.
- Source contents are not uploaded. Network access is limited to the fixed public lifecycle feed and an explicitly configured Slack webhook.
- Do not expose a Slack webhook to untrusted workflows. Delivery is attempted only for commit targets on `schedule`, `workflow_dispatch`, or `push`; every other event is skipped.

## Development

The repository pins Bun and compiles a Node 24 CommonJS action bundle:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun run test
bun run build
```

`dist/index.js` is committed and must match `src/main.ts`.

The detailed behavioral guarantees are captured in [the product contract](docs/v4-product-contract.md) and [detector contract](docs/v4-detector-contract.md). See [GitHub Releases](https://github.com/oscarnilsson98/ai-model-end-of-life-action/releases) for release history. Maintainers should follow [the release runbook](docs/releasing.md) when publishing a version.
