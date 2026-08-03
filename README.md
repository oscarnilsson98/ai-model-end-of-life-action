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

Only resolved deployment evidence, or resolved application evidence established as production, can block. Ordinary SDK calls remain advisory because source code alone does not prove where it is deployed. If a known application path is production, add this top-level `scopeRules` section to the same policy file, using the relevant stable rule ID from [the detector contract](docs/v3-detector-contract.md):

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
- the Vercel AI SDK's OpenAI, Anthropic, Google, Google Vertex, Azure, and Amazon Bedrock providers
- Azure Cognitive Services model deployments in Terraform
- model-valued environment bindings connected to supported calls

Other tracked UTF-8 files are checked for exact eligible model IDs from the lifecycle feed. Those text-only matches, documentation, examples, tests, dynamic selectors, and ambiguous serving platforms can warn or appear as notices, but never block.

For the Vercel AI SDK, a provider call is read wherever it appears — `generateText({ model: openai("gpt-5") })`, a `const model = openai(id)` held for later, or a middleware wrapper — because the provider call itself is what selects the model. The provider package pins the serving platform, so these resolve and can block on the same terms as the official SDKs. `azure(...)` names a deployment and `bedrock(...)` is polymorphic, so both need a trusted resolution before they block, exactly as their official-SDK counterparts do.

The supported parsers do not accept every construct in the languages they cover; JSX and TSX element syntax is the most common gap. Such a file falls back to the same text-only matching an unsupported language gets, and a notice names it. Because the file is still assessed, `scan-status` stays `complete` — a repository is never pushed into partial coverage, and so into `allowPartial: true`, by a parser gap. A model selected inside a JSX file is reached by text matching only, whichever SDK it uses.

Integrations that still route model selection through their own abstraction — LangChain, LlamaIndex, LiteLLM, the legacy Google generative SDKs, and AI SDK shapes outside the published rules such as a `"openai/gpt-5"` gateway string — are reported as an `unsupported-integration-import@1` notice naming the framework and the files that import it, so a run cannot look clean while your real call sites went unread. Coverage stays `complete` and enforcement is unaffected; the notice exists because model choices made that way reach the assessment only as low-confidence text matches, which are named in Slack as text matches but can never block.

Static evidence has limits. Remote databases, secrets, provider consoles, external deployment repositories, and runtime routers are outside it. A clean result means only that no actionable lifecycle risk was found in the evidence actually assessed. [Checked-in claims](#optional-runtime-only-claims) can represent known runtime-only facts; they do not prove complete coverage.

The exact support matrix and stable rule IDs are published in [the detector contract](docs/v3-detector-contract.md).

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
| Feed, trusted schema, target snapshot, resource-budget, or internal failure | Fails with `unknown + failed` |
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

The strict policy, evidence, lifecycle-feed, and assessment-report contracts are published in [the v3 schemas](schemas/README.md); their behavioral semantics in [the v3 product contract](docs/v3-product-contract.md).

## Inputs

All inputs are optional.

| Input | Default | Description |
| --- | --- | --- |
| `warn-within-days` | Checked-in policy, otherwise `180` | Warning horizon in UTC calendar days. |
| `fail-within-days` | Unset | Enables enforcement for definite eligible evidence inside the horizon. |
| `allow-partial` | Checked-in policy, otherwise `false` | Permits enforced partial scans to succeed unless they contain a definite breach. |
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

A blob above the 2 MiB per-blob ceiling is reported as an identified partial blind spot. Exhausting an aggregate Git, event, feed, detector-fact, report, or trusted policy/evidence budget fails the assessment with `unknown + failed`. An over-limit target-only PR policy or evidence document is excluded from authority and shown as an advisory configuration change under the monotonic PR rules.

Publication is bounded separately:

| Published surface | Ceiling and behavior |
| --- | --- |
| Complete local JSON report | 25 MiB; a larger report fails publication |
| Detail action outputs | 120 KiB each and 700 KiB across core outputs under the action's file-command size estimate; arrays are compacted and `output-truncated` becomes `true` |
| Workflow annotations | 10; each message is limited to 2,000 UTF-16 code units, and paths above 1,024 UTF-8 bytes are emitted without a source location |
| Slack snapshot | 12,000 UTF-8 bytes, 10 actionable findings, and 8 evidence sources; webhook URLs are limited to 8,192 UTF-16 code units |

</details>

## Feed integrity

The current public upstream feed is not typed. The action wraps it with a release-reviewed adapter manifest that explicitly classifies every reviewed source pair as a model or a specific non-model kind, so entries such as reusable prompts and agent builders never enter model matching.

The adapter carries the exact reviewed source-pair registry. It strictly validates every upstream row, but only reviewed pairs enter the normalized lifecycle feed. New source rows are quarantined as unclassified diagnostics rather than guessed from identifier shape; missing reviewed pairs are also reported. An addition, removal, or rename therefore makes `scan-status: partial`: warning-only runs stay green with a visible diagnostic, while enforcement fails closed unless `allowPartial: true` is set. A later action release must review a new pair before it can gain model or non-model authority.

Malformed rows, duplicate pairs, unknown fields or providers, invalid adapter metadata, and schema failures still produce `unknown + failed`. If no reviewed records remain after quarantine, the non-empty feed contract also fails.

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

The detailed behavioral guarantees are captured in [the product contract](docs/v3-product-contract.md) and [detector contract](docs/v3-detector-contract.md). See [GitHub Releases](https://github.com/oscarnilsson98/ai-model-end-of-life-action/releases) for release history. Maintainers should follow [the release runbook](docs/releasing.md) when publishing a version.
