# V3 Product Contract

Status: implemented v3.0 behavioral contract.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as requirements.

## Product promise

V3 is an evidence-based repository scanner, not an inventory checker.

> Warn when available evidence points to an AI model with a known deprecation or shutdown.

The normal workflow requires a checkout and the action, with no action inputs, generated inventory, provider credentials, or language setup:

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
        uses: actions/checkout@v7 # Pin a reviewed SHA in production.
        with:
          persist-credentials: false
          fetch-depth: 0

      - name: Check AI model lifecycle
        uses: oscarnilsson98/ai-model-end-of-life-action@v3 # Pin a reviewed release SHA in production.
```

The release README MUST explain that a full reviewed release commit SHA provides the strongest supply-chain pin. The mutable `@v3` form above remains the simplest copy/paste convenience channel.

That workflow is deliberately passive: it annotates and summarizes risks but does not fail for lifecycle advisories. A repository that wants reliable PR and scheduled-run enforcement adds only policy, not a model inventory:

```yaml
# .github/ai-model-lifecycle.yml
schemaVersion: 1
policy:
  failWithinDays: 30
```

The action reads repository and Git data but MUST NOT execute repository code, install repository dependencies, contact provider APIs, or upload source contents. It MAY fetch the configured lifecycle feed and send an explicitly configured notification.

## Non-goals

V3 does not promise to discover every model used at runtime. Static repository evidence cannot prove the contents of remote databases, secrets, provider consoles, external deployment repositories, or runtime routing decisions.

A clean result MUST be bounded to the evidence assessed. The action MUST NOT use wording such as “safe,” “all clear,” “fully covered,” or “no deprecated models are used.”

## Assessment pipeline

The normative pipeline is:

```text
Git snapshots and optional checked-in evidence
  -> evidence facts
  -> model and serving-platform resolution
  -> exact lifecycle-feed join
  -> trusted policy and PR comparison
  -> annotations, summary, outputs, and optional notification
```

Semantic SDK, configuration, and deployment detectors MUST emit evidence independently of the lifecycle feed. The exact lifecycle-ID text matcher is a language-independent fallback and MUST NOT be the primary usage detector.

## Independent result states

V3 exposes three independent state axes:

```text
result: no-actionable-risk | advisory | blocking | unknown
scan-status: complete | partial | failed
comparison-status: available | partial | unavailable | not-applicable
```

`result` describes the actionable lifecycle outcome for this invocation. On non-comparison runs it is the strongest target outcome; on PR/merge-group runs it is the strongest new or worsened delta under the monotonic policy. Separate baseline/target outcomes keep existing debt visible. `scan-status` describes whether the declared assessment coverage completed. `comparison-status` describes whether a trustworthy base/target comparison was possible. Evidence-source freshness is reported separately as `evidence-health`; it may make declared coverage partial without pretending that the scanner crashed.

On a comparison run, `scan-status` equals the least healthy of target assessment coverage and comparison coverage; `baseline-scan-status` and `target-scan-status` are published separately. Neither baseline debt nor delta logic may turn a target or comparison coverage gap from `partial` into `complete`.

### Result precedence

For an assessment with a trustworthy policy outcome, result precedence is:

1. `blocking` when at least one definite finding breaches the effective policy (or is new/worsened on a comparison run).
2. `advisory` when at least one actionable warning, conditional lifecycle risk, review-overdue/stale/expired evidence source, or policy-relevant unresolved selector requires attention (or is new/worsened on a comparison run).
3. `no-actionable-risk` otherwise.

`unknown` is reserved for an assessment that cannot produce a trustworthy lifecycle outcome. It normally accompanies `failed`, but it accompanies `partial` when target evidence was assessed and the trusted PR base/policy was unavailable. A partial scan may otherwise produce `no-actionable-risk`, `advisory`, or `blocking`; partiality is not itself a lifecycle finding.

### Scan status

`complete` means every eligible Git blob and configured evidence source within the declared scope and resource budgets was processed by its applicable v3 detector or fallback. It does not mean all runtime usage is knowable.

`partial` includes at least one of:

- an eligible blob was unavailable, skipped, truncated, or could not be parsed by an applicable detector;
- a configured evidence source, assertion, or resolution is review-overdue, stale, or expired;
- a configured evidence source explicitly declares partial coverage;
- target evidence was assessed but required trusted PR base data or comparison history was unavailable;
- a configured resolution source could not be applied safely;
- the upstream lifecycle feed's `generatedAt` is older than the effective `max-feed-age-days` horizon.

An unsupported file format is diagnostic only unless the file was classified as likely model-bearing input for a published detector. An intentionally dynamic selector is an unresolved evidence fact; it does not by itself make the scanner operationally partial.

Coverage and fidelity are separate concerns. `scan-status` reports coverage: whether every eligible input reached an applicable detector or its fallback. It does not report which detector tier succeeded. A blob a published semantic detector could not tokenize is still assessed by the bounded lexical fallback, exactly as a language with no published semantic detector is, so it is reported as a `semantic-tokenization-incomplete@1` notice and declared coverage stays `complete`. The lost fidelity is already carried by the surviving facts: lexical evidence keeps lexical confidence and is never policy eligible, so it cannot block. A blob no detector assessed at all — over the published per-blob limit, unavailable, or not decodable as UTF-8 — is still a coverage blind spot and still makes coverage partial. This keeps `allow-partial` a decision about genuine blind spots rather than a switch a repository must flip because a valid construct such as JSX is outside the published tokenizers.

`failed` includes feed/schema validation failures, missing or invalid target Git objects, malformed Git object metadata, aggregate evidence-scan budget exhaustion, invalid trusted policy/evidence documents, internal invariant failures, or inability to produce the required bounded outputs. Detail-output compaction is independent of assessment coverage and MUST NOT make a scan partial or failed.

`comparison-status: available` requires complete fact-extraction coverage for the base and target trees. An identified base blob/parser blind spot makes comparison `partial`, not unavailable: readable facts are still classified, but a potentially new target blocker is conservatively marked `comparison-unknown`, advisory at most, and never blocking. That partial comparison also makes run `scan-status: partial`. Evidence freshness debt alone does not hide base facts and therefore does not degrade comparison status. A missing/unreadable base tree or unavailable required base-policy object makes comparison `unavailable` and follows the `unknown + partial` diagnostic fallback. A present but malformed trusted base policy is instead a schema failure: `unknown + failed`.

### Exit-status matrix

Enforcement is enabled when the effective trusted policy sets `fail-within-days`. The default is warning-only and leaves it unset. `allow-partial` defaults to `false` and is trusted policy, not an untrusted PR override.

| Condition | `result` | `scan-status` | Step |
| --- | --- | --- | --- |
| Feed, trusted schema, target snapshot, aggregate scan budget, or internal failure | `unknown` | `failed` | Fail |
| Required PR/merge-group comparison authority unavailable after diagnostic fallback | `unknown` | `partial` | Fail closed |
| No actionable evidence and complete assessment | `no-actionable-risk` | `complete` | Succeed |
| Advisory evidence and complete assessment | `advisory` | `complete` | Succeed |
| Definite effective policy breach | `blocking` | `complete` or `partial` | Fail |
| Partial assessment, enforcement disabled | Derived risk result | `partial` | Succeed with warning |
| Partial assessment, enforcement enabled, `allow-partial: false` | Derived risk result | `partial` | Fail closed |
| Partial assessment, enforcement enabled, `allow-partial: true` | Derived risk result | `partial` | Fail only for `blocking` |
| Notification delivery failure | Unchanged | Unchanged | Follow `notification-failure-mode` |

Lexical-only, model-dynamic, platform-ambiguous, documentation, example, and test evidence MUST NOT produce `blocking` in v3.0. Platform-ambiguous evidence never blocks in v3.0, even if every currently known feed record is within the failure window, because feed platforms do not prove a closed set of possible serving platforms.

Lexical evidence scoped to application/deployment source may produce a clearly labelled `advisory` when its exact typed model ID is inside the warning horizon, but it is never policy eligible. Lexical evidence in unknown, documentation, example, fixture, test, or generated scope produces `notice` only. High/medium-confidence semantic application or deployment evidence with a dynamic model, ambiguous platform, or lifecycle-feed conflict may also produce `advisory`. Repetition changes counts and locations, never outcome severity.

One occurrence whose serving platform the evidence did not establish MUST produce one finding, however many feed providers publish that model ID. Such matches are collapsed into a single finding that carries every candidate platform in `servingPlatforms`, the most severe of their lifecycle outcomes, and the dates of the most urgent candidate record — nearest measured lifecycle date first, undated last, by the same [date precedence](#lifecycle-date-precedence) the warning horizon uses. `servingPlatform` remains the platform of that reported record, and the union of candidate source URLs and replacement models stays in the finding. Human-facing text names every candidate platform, so a collapsed finding never reads as an established platform. Alert volume therefore follows repository evidence, not feed breadth. Platform-resolved semantic evidence is unaffected and keeps one finding per exact pair and active lifecycle signature.

Every run also emits one `exit-reason`: `none | assessment-failed | trusted-base-unavailable | policy-breach | partial-disallowed | notification-failed`. When several conditions apply, precedence is `assessment-failed` > `trusted-base-unavailable` > `policy-breach` > `partial-disallowed` > `notification-failed` > `none`. Required outputs and the job summary are written before optional notification delivery and before the final process exit.

## Evidence model

Machine-readable evidence keeps independent dimensions:

```ts
type EvidenceOrigin = "repository" | "external-source" | "manual-claim";

type EvidenceKind =
  | "sdk-argument"
  | "structured-config"
  | "deployment-resource"
  | "env-binding"
  | "manual-claim"
  | "runtime-observation"
  | "deployment-snapshot"
  | "generated-declaration"
  | "lexical";

type EvidenceConfidence = "high" | "medium" | "low";

type EvidenceScope =
  | "application"
  | "deployment"
  | "test"
  | "example"
  | "documentation"
  | "unknown";

type EvidenceEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test"
  | "unknown";

type ModelResolution = "resolved" | "dynamic" | "unresolved";
type ModelSelectorKind =
  | "model-id"
  | "deployment-name"
  | "resource-name"
  | "routing-selector"
  | "polymorphic"
  | "dynamic"
  | "unknown";
type PlatformResolution = "resolved" | "ambiguous" | "unknown";
type LifecycleMatch = "exact" | "provider-alias" | "none";
type PolicyOutcome = "breach" | "warning" | "notice" | "none";
```

Confidence describes confidence in the evidence fact, not confidence that code is reachable or live traffic exists. A recognized SDK call whose model comes from an environment variable can be high-confidence evidence with `modelResolution: dynamic`.

Application scope and production environment are independent. A direct SDK call in ordinary source is `scope: application`, but its environment remains `unknown` unless a supported deployment relation, trusted base policy, or current trusted evidence establishes production. Selector kind is also independent: Azure deployment names and polymorphic Bedrock selectors are not promoted to model IDs merely because their text equals a feed ID. Dead-code reachability is never claimed.

Human-facing annotations SHOULD compress these dimensions into labels such as `SDK argument · production · Azure` or `Structured config · deployment · platform ambiguous`. Full dimensions and rule provenance belong in outputs and the report.

## Policy eligibility

A finding is eligible for `blocking` only when all of the following hold:

- enforcement is enabled;
- the evidence is one of: high-confidence repository evidence from a rule explicitly marked policy-eligible; a current manual assertion explicitly marked `policyEligible: true`; or a fresh `runtime-observation`/`deployment-snapshot` source explicitly marked `policyEligible: true`;
- scope is `deployment`, or scope is `application` with `environment: production` established by trusted evidence;
- model and serving platform are resolved and `selectorKind` is `model-id`;
- lifecycle matching is exact or uses one deterministic, versioned provider-owned alias rule from the published feed registry;
- the shutdown date is passed or within `fail-within-days`;
- no trusted, current, narrowly targeted suppression applies.

The v3.0 provider-alias registry is empty, so v3.0 blocking lifecycle joins are exact in practice.

Advisory eligibility is intentionally broader: within the warning horizon, resolved or conditional semantic evidence in application/deployment scope is advisory even when environment is unknown; current repository-supplied claims are advisory unless they meet every blocking condition; and application/deployment lexical evidence may be advisory as defined above. Protected/unknown-scope lexical evidence and findings outside the warning horizon are notices only. Undated deprecations with joined evidence are advisory, as are models already inside their published deprecation date — see [Lifecycle date precedence](#lifecycle-date-precedence).

The default warning horizon is 180 UTC calendar days. Findings beyond the warning horizon remain in the bounded report but do not produce annotations unless policy says otherwise.

### Lifecycle date precedence

A feed record may publish an `announcementDate`, a `deprecationDate`, and a `shutdownDate`, and the feed contract requires them to be non-decreasing in that order. They are not interchangeable, and each has exactly one job:

| Date | Meaning | Effect on outcome |
| --- | --- | --- |
| `announcementDate` | When the deprecation was made public | None. It is reported for provenance only. It is in the past for essentially every record, so measuring a horizon against it would make every joined finding actionable and the horizon meaningless. |
| `deprecationDate` | When the provider stops supporting the model | **Opens the warning horizon.** Some providers stop serving here rather than at the shutdown date. |
| `shutdownDate` | When the provider stops serving the model | Opens the warning horizon, and is the only date that opens the **failure** horizon. |

The warning horizon therefore measures the **earliest published transition**: `min(deprecationDate, shutdownDate)`, which given the required ordering is `deprecationDate` whenever one is published. A model whose deprecation date has passed or is near is advisory even when its shutdown is hundreds of days out. A record with no published `shutdownDate` has no measurable end and stays inside the warning horizon at any distance, which is why undated deprecations with joined evidence are advisory.

`failWithinDays` deliberately keeps measuring `shutdownDate` alone. Failing a job is the irreversible direction, and enforcement is contracted against the date the model actually stops being served. A deprecation inside the failure horizon warns; it does not block.

The action captures one `evaluatedAt` UTC instant before evaluation and derives one UTC calendar date from it. Feed lifecycle dates are ISO `YYYY-MM-DD` dates. `daysUntilShutdown` is the signed calendar-day difference `shutdownDate - evaluatedDate`: shutdown today is `0`, a past shutdown is negative, and a shutdown exactly at the configured horizon is included. `daysUntilDeprecation` is the same signed difference against `deprecationDate` and is present in a finding exactly when `deprecationDate` is. Base, target, summary, notification, and fingerprints use the same instant.

“Trusted” means authoritative for this action invocation: valid evidence or policy read from the base Git tree on a pull request/merge group, or from the evaluated target tree on a non-PR run. A target-only PR addition may contribute evidence because that can only strengthen its own result, but it never gains authority to suppress or weaken base policy. Trust does not mean that the repository-supplied claim was independently verified.

## Git snapshot and checkout contract

V3 requires a Git checkout. It MUST enumerate and read committed content through Git objects, not by recursively scanning arbitrary workspace files.

Implementations MUST use equivalent safe operations to:

- enumerate entries with `git ls-tree -r -z --full-tree <tree>`;
- inspect object type and size with `git cat-file --batch-check` before reading permitted blobs with `git cat-file --batch`;
- set `GIT_NO_LAZY_FETCH=1` so partial-clone filters cannot cause an implicit network request;
- parse NUL-delimited raw path bytes safely and render escaped display paths without treating them as shell text;
- never follow workspace symlinks or read a submodule worktree;
- diagnose symlink blobs, submodule gitlinks, Git LFS pointers, missing partial-clone objects, and unavailable blobs;
- classify tracked generated and bundled files instead of blindly excluding paths such as `dist/`.

Regular and executable Git blobs are eligible content. Symlinks are identified as link-text blobs and are never followed or semantically scanned. Gitlinks and valid LFS pointers are declared repository boundaries, not errors by themselves. An unknown tree-entry mode, malformed object response, or inconsistent object type fails the assessment. A published per-blob limit may produce an identified partial blind spot; exhausting the published aggregate assessment budget is a failure, not a green partial result.

Event-to-tree selection is exact:

| Event | Trusted base | Submitted head | Evaluated target | Comparison |
| --- | --- | --- | --- | --- |
| `pull_request` | `event.pull_request.base.sha` | `event.pull_request.head.sha` | Validated synthetic merge at `GITHUB_SHA` | Base versus merge result |
| `merge_group` | `event.merge_group.base_sha` | `event.merge_group.head_sha` | `event.merge_group.head_sha` | Base versus combined merge-group head |
| `schedule`, `workflow_dispatch`, `push`, `release` | None | None | `GITHUB_SHA` | Not applicable |

Every selected value is validated as a full hexadecimal object ID and resolved locally to a commit and tree. For `pull_request`, the synthetic merge commit MUST have the exact event base and head commits as its parents; parent order is recorded but not assumed. This prevents base-branch changes since the PR diverged from being misclassified as head deletions. For `merge_group`, the base MUST be an ancestor of the combined head. The report publishes the selected event, base, submitted head, evaluated target, and `target-kind`.

This follows GitHub's event contract: for `pull_request`, `GITHUB_SHA` is the last merge commit of the pull-request merge branch, while the event payload exposes the exact submitted head and base SHAs. See [GitHub Actions events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows?apiVersion=2022-11-28#pull_request).

[`actions/checkout` fetches a single triggering commit by default](https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches), so the supported workflow documents `fetch-depth: 0`. The action MUST NOT silently fetch missing Git objects or require a token. If the evaluated PR target or submitted head is available but required comparison objects are not:

- target evidence is still scanned;
- `comparison-status` is `unavailable`;
- `scan-status` is `partial`;
- `result` is `unknown` and the step fails closed because trusted enforcement authority cannot be reconstructed;
- base-dependent suppressions, resolutions, assertions, and thresholds are not replaced with head-controlled values;
- the summary states that new-versus-existing risk could not be determined;
- all target-only findings remain visible as non-authoritative diagnostics.

If the synthetic merge tree is readable but the base is unavailable, that merge tree is the diagnostic target with `target-kind: synthetic-merge-uncompared`. If the synthetic merge is unavailable but the exact raw head is readable, the raw head is the diagnostic target with `target-kind: raw-head-fallback`. Both produce the same `unknown + partial` failure. A merge group has no substitute for its exact combined `head_sha`. If no target tree is readable, the assessment is `unknown + failed`.

On scheduled, manual, push, and release runs, `comparison-status` is `not-applicable`.

The supported workflow uses ordinary `pull_request`, never `pull_request_target`. GitHub documents that `pull_request` normally evaluates the PR merge commit with restricted fork credentials, while combining privileged `pull_request_target` execution with untrusted checkout can create a supply-chain vulnerability. The scanner treats every target blob as hostile data even though it never executes that data. See [GitHub's `pull_request_target` security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

## Runtime requirements and resource ceilings

The minimum supported Git version is 2.30.0. V3 relies on the safe `git rev-parse --end-of-options` form and on NUL-delimited and batch plumbing from `git ls-tree` and `git cat-file`. A self-hosted runner MUST provide that Git version or newer before invoking the action.

The following values are hard v3.0 maxima, not tuning defaults. Action inputs cannot raise them. Sizes use binary units (`1 KiB = 1,024 bytes`, `1 MiB = 1,048,576 bytes`).

| Assessment surface | V3.0 ceiling |
| --- | --- |
| Selected Git revision text | 1,024 UTF-8 bytes |
| One selected Git tree | 100,000 entries; 100,000 unique objects; 32 MiB of tree/object metadata; 2 MiB per blob; 100 MiB of permitted blob bodies in total |
| GitHub event payload | 2 MiB; Git selection probes use a 64 KiB process-output buffer |
| Lifecycle feed | 32 MiB and 100,000 records |
| Checked-in policy | 512 KiB; 1,000 entries in each top-level rule list and each nested string list; threshold values from 0 through 36,500 days |
| Each checked-in evidence document | 2 MiB and 10,000 records |
| Detector result | 100,000 evidence facts per Git snapshot |

The feed additionally limits adapter IDs to 128 Unicode code points, adapter versions to 64, record IDs to 256, identifiers to 2,048, display names to 512, and URLs to 2,048. One record may supersede at most 1,000 records and name at most 100 replacement models.

Policy fields limit stable IDs to 128 Unicode code points, model IDs to 256, platform slugs to 63, timestamps to 64, detector rule IDs to 256, path or raw-value list entries to 1,024, and other free text to 4,096. Evidence documents use the same 128-code-point stable-ID, 256-code-point model-ID, 63-code-point platform, 64-code-point timestamp, and 4,096-code-point free-text limits.

A Git blob above 2 MiB is retained as an identified `partial` blind spot. Exhausting an aggregate Git budget, the event, feed, detector-fact, or report budget, or a trusted policy/evidence document budget fails closed with `unknown + failed`. An over-limit target-only PR policy or evidence document follows the monotonic invalid-target contract instead: it is excluded from authority and reported as an advisory configuration change.

Network operations are bounded too. Each lifecycle-feed attempt has a 15-second timeout and there are at most three attempts including retries. Slack has one 15-second attempt and is never retried because a failed response might still have delivered the message.

Publication has independent ceilings:

| Published surface | V3.0 ceiling and behavior |
| --- | --- |
| Complete local JSON report | 25 MiB; overflow produces the bounded `publication-failed` fallback report and `unknown + failed` |
| Each detail action output | 120 KiB; oversized arrays are prefix-compacted and set `output-truncated: true` |
| Core action outputs together | 700 KiB under the v3 file-command size estimate, including keys and protocol overhead; optional detail arrays are removed in a deterministic order before required-output overflow fails publication |
| Workflow annotations | 10; annotation text is compacted to 2,000 UTF-16 code units; a path above 1,024 UTF-8 bytes is emitted as an unlocated command |
| Slack snapshot | 12,000 UTF-8 bytes, 10 actionable findings, and 8 evidence sources; webhook configuration is limited to 8,192 UTF-16 code units |

These limits are part of the release contract. Changing one requires corresponding schema, documentation, and bounded-resource test updates in the same release.

## Monotonic pull-request policy

Once the reviewed action is invoked with the required Git objects, pull-request-controlled data MUST NOT be able to weaken its own evaluation. A repository can still edit or remove its workflow in a pull request unless an organization/repository ruleset or required workflow enforces the job. Release documentation SHOULD recommend a required check plus `CODEOWNERS` review for the workflow and `.github/ai-model-lifecycle.yml`.

The trusted PR policy is the built-in policy plus policy read from the base tree. The validated merge tree is evidence under test. Monotonicity applies to policy and checked-in claims, not ordinary repository evidence: deleting or replacing a risky SDK call in the merge result is a valid remediation.

For base tree `B`, validated merge target `T`, built-in policy `P0`, base configuration `CB`, target configuration `CT`, explicitly supplied runtime policy inputs `I`, and one feed snapshot `F`, the action computes:

```text
PB = MergePolicy(P0, Policy(CB))
PP = MergePolicy(P0, Policy(CT), I)       # proposed policy, may contain weakening attempts
PM = MonotonicPolicy(PB, PP)              # effective target/exit policy

RB = DetectRepositoryEvidence(B)
RT = DetectRepositoryEvidence(T)
AB = InspectAssertions(CB)
AT = InspectAssertions(CT)
JB = InspectClaimDocuments(B, EvidencePaths(CB))
JT = InspectClaimDocuments(T, Union(EvidencePaths(CB), EvidencePaths(CT)))
XB = EffectiveClaims(AB, JB)
XT = MonotonicClaims(XB, EffectiveClaims(AT, JT))

VBB = Evaluate(RB + XB, PB, F)            # trusted baseline
VTB = Evaluate(RT + XT, PB, F)            # merge target under trusted base policy
VTP = Evaluate(RT + XT, PP, F)            # proposed-policy preview
VTM = Evaluate(RT + XT, PM, F)            # target under cross-dimension monotonic policy
Q   = TargetChangeDiagnostics(CB, CT, I, AB, AT, JB, JT)
VM  = MonotonicJoin(VTB, VTM) + Q         # enforced target; VTP remains a preview
D   = Diff(VBB, VM)                        # new | worsened | unchanged | resolved
```

`InspectAssertions` preserves valid and rejected assertion entries from the inspected configuration, including stable IDs and immutable-lineage/freshness fields. `InspectClaimDocuments` returns both usable external claims and raw document diagnostics: candidate path, presence or deletion, blob digest, parse/schema result, stable IDs, and immutable-lineage/freshness fields for valid and rejected entries. Neither operation publishes raw claim contents. Target document inspection uses the union of valid base-declared and target-proposed evidence paths, so removing a declaration or document in the target cannot hide the change. An invalid target path declaration is itself retained by `Q`; it does not grant access to a new path. Invalid trusted-base assertions or claim documents fail the assessment before evaluation, while `EffectiveClaims(AT, JT)` excludes invalid target-only entries.

`EffectiveClaims` combines assertions with checked-in usage-evidence records; it is not ordinary source detection. `MonotonicClaims` retains every base claim when the target deletes or weakens it, adds target claims, and resolves same-ID conflicts in the severity-preserving direction. `Q` emits the separate policy/evidence diff and at least an advisory for an invalid target-only assertion or document, deletion of a base claim document or stable ID, immutable-lineage mutation, rejected/non-later refresh, or other weakening attempt. A valid additive claim or accepted freshness-only refresh remains visible in the diff but is not advisory merely because it changed. `VBB` is not unioned into ordinary target repository evidence, so code genuinely absent from the validated merge target can resolve a detector finding.

`Policy(C)` includes thresholds, `allowPartial`, resolutions, scope/environment rules, suppressions, and declared evidence paths. Assertions are deliberately excluded from `Policy(C)` and enter only through `InspectAssertions` and `EffectiveClaims`. Consequently base resolutions/scope rules/suppressions are present in both `VBB` and `VTB`; `VTP` is the full proposed-policy preview. `PM` combines base authority with every target tightening across dimensions before `VTM` is evaluated. Conflicting target/base mappings are retained as alternatives and evaluation takes the severity-preserving result; a weakening in one dimension can therefore never neutralize a tightening in another. `Q` ensures an invalid target-only assertion/document or attempted weakening is still a visible advisory rather than disappearing. `PM` also controls exit behavior, so a proposed `allowPartial: true` cannot weaken a base `false`.

All runtime action inputs are treated as target-controlled on a comparison run. They are applied only to `PP`, never retroactively to `PB`/`VBB`. Thus a PR that enables or tightens enforcement can make an existing target finding `worsened`; a weakening input is visible in the policy diff but ignored by `VM`. Reliable already-active enforcement belongs in base configuration.

`baseline-result = Outcome(VBB)`, `target-result = Outcome(VM)`, and the run-level `result = Outcome(D)`. Baseline/target assessment-health views are also published. Partial-coverage enforcement is evaluated against run `scan-status`, which includes target and comparison coverage. Under enforcement, either target or comparison partiality fails closed unless effective trusted policy allows partial. Baseline freshness debt alone is not run partiality when a valid target refresh restores target health and fact comparison remains complete.

Policy-affecting action inputs observed during a pull-request or merge-group run are target-controlled. Their strengthening effects may enter `VM`; weakening effects cannot shorten a threshold, enable partial success, disable a detector, narrow scope, or otherwise reduce `VTB`. Policy inputs are trusted normally on scheduled, manual, and default-branch runs.

Head changes MAY:

- add evidence;
- resolve an ambiguity when doing so preserves or increases severity;
- increase confidence or severity;
- preview future ignores, resolutions, assertions, suppressions, and thresholds.

Head changes MUST NOT:

- remove a base assertion from the effective PR evidence set;
- apply a new ignore or suppression to a current PR finding;
- remap evidence to a safer platform or model for the current PR result;
- widen an allowed-partial policy or weaken a threshold;
- reduce the outcome of any base-policy evaluation.

The PR result is `blocking` only when `D` contains a new or worsened blocking signal. It is `advisory` when `D` contains a new/worsened advisory or an attempted suppressive policy change, and `no-actionable-risk` otherwise. Existing base blockers remain visible as unchanged debt but do not fail an unrelated PR. Resolved findings are shown as remediations. Configuration changes receive a separate visible policy diff. Branch protection and review ownership remain the repository’s approval boundary.

When comparison is available or partial, PR annotations SHOULD focus on known new/worsened findings and comparison-unknown advisories, while existing debt remains visible in the summary. Both sides MUST use the same feed snapshot and detector/rule versions.

Repositories using merge queues SHOULD keep the `merge_group` trigger in the supported workflow; GitHub notes that required checks otherwise are not requested for merge groups. See [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows?apiVersion=2022-11-28#merge_group).

## Action inputs and configuration authority

V3.0 has no `models`, `models-file`, `usage-evidence`, repository-path, or language-setup input. The complete action-input surface is:

| Input | Effective `P0` default | Non-PR authority | PR/merge-group authority |
| --- | --- | --- | --- |
| `warn-within-days` | `180` | Trusted | May only increase the warning horizon |
| `fail-within-days` | Unset | Trusted | May enable enforcement or increase the failure horizon; cannot weaken base policy |
| `allow-partial` | `false` | Trusted | `true` is ignored unless already allowed by base policy |
| `max-feed-age-days` | `30` | Trusted | Not target-controlled: it measures the shared feed snapshot, not the target tree |
| `slack-webhook` | Unset | Used only for commit targets when the event name is exactly `schedule`, `workflow_dispatch`, or `push` | Delivery is always skipped on PR/merge-group events |
| `notification-failure-mode` | `fail` | Trusted | Ignored when delivery is skipped |

Day inputs are bounded non-negative integers. A larger horizon is stricter. `I` in the PR equations contains only explicitly supplied, nonempty action inputs. Effective defaults live in `P0`; `action.yml` MUST NOT materialize policy defaults into otherwise omitted inputs. Therefore an omitted `warn-within-days` or `allow-partial` never overrides trusted file configuration.

`max-feed-age-days` is deliberately not one of those zero-input policy overrides, and is not a checked-in policy field. It is a run-level guard over the single feed snapshot that both comparison sides share, so it can never hide a target-specific regression, and `action.yml` MUST materialize its default so that an omitted input leaves the guard armed. Only an explicitly emptied input disables it. Configuration-file fields use camelCase (`warnWithinDays`, `failWithinDays`, `allowPartial`); action inputs use the kebab-case names above. There is no custom feed URL in v3.0: all runs use the release's reviewed default feed contract so a PR cannot redirect lifecycle authority.

## Optional checked-in policy and evidence

The zero-input workflow MUST work without this file. When present, `.github/ai-model-lifecycle.yml` is read from the applicable Git tree and validated strictly.

All configured paths are root-anchored POSIX repository paths. The only pattern operators are `*` within one segment, `?` for one non-separator character, and `**` across segments. Negation, brace expansion, backslashes, absolute paths, empty segments, and `..` are invalid. Matching is case-sensitive against Git path bytes that are valid UTF-8; non-UTF-8 paths remain scannable but cannot be targeted by a policy pattern. The strict schema publishes pattern/count/length bounds.

All timestamps in the examples below are illustrative. Users MUST replace them with the actual creation, observation, review, freshness, and expiry dates before copying an example into a policy or evidence document.

```yaml
schemaVersion: 1

policy:
  warnWithinDays: 180
  failWithinDays: 30
  allowPartial: false

servingPlatforms:
  - openai
  - google

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

resolutions:
  - resolutionId: azure-prod-chat-alias
    match:
      detectorRuleId: source.ts.openai.request-model@1
      rawValue: prod-chat-deployment
      paths:
        - infra/production/**
    resolveTo:
      modelId: gpt-5.2
      servingPlatform: azure
    reason: Deployment alias is defined in the production subscription
    reviewedAt: 2026-08-02T08:00:00Z
    reviewAfter: 2026-11-01T08:00:00Z
    expiresAt: 2027-02-01T08:00:00Z

scopeRules:
  - scopeRuleId: production-api
    detectorRuleIds:
      - source.ts.openai.request-model@1
    paths:
      - services/api/**
    scope: application
    environment: production
    reason: This service is deployed by the production application workflow

suppressions:
  - suppressionId: archived-migration-guide
    target:
      evidenceId: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    reason: Literal appears only in an archived migration document
    createdAt: 2026-08-02T08:00:00Z
    expiresAt: 2026-11-01T08:00:00Z
```

`servingPlatforms` declares the canonical serving platforms this repository actually uses. It restricts lifecycle matching for evidence whose platform the evidence itself did not establish — every lexical match and every `platformResolution: ambiguous` fact — so records published only for undeclared platforms are excluded from matching rather than merely merged into one finding. It never filters platform-resolved semantic evidence, external evidence, or assertions, so a declaration can never hide a finding that could have blocked. An effective declaration is reported as an evidence source and as a `declared-serving-platforms` notice, and each restricted finding records the restriction in its reasons. Omitting the field means undeclared, which matches every platform; on pull requests and merge groups an undeclared base keeps the target undeclared, and two declarations combine as their union, so head configuration can never narrow what the base matched. A head declaration that would narrow base matching is reported as an ignored weakening, exactly like a head suppression.

Assertions add repository-supplied claims about runtime-only facts. They MUST NOT be described as verified, observed, confirmed, or authoritative unless a separately validated external source provides that provenance. Assertions cannot assert absence.

Assertions and external evidence are additive facts, not completeness inventories. Users are never asked to enumerate every model, and omission never means “not used.”

Every assertion has `evidenceKind: manual-claim` and claim confidence `high` by virtue of belonging to `assertions`; this is confidence that the repository made the claim, not independent runtime verification. It requires a stable evidence ID, exact model ID, canonical serving-platform slug, scope, environment, reason, provenance, creation timestamp, review timestamp, and expiry timestamp. `policyEligible` defaults to `false`; setting it to `true` is an explicit enforcement claim and is effective only under the PR trust rules above. IDs are unique ASCII identifiers of 1–128 characters matching `[a-z0-9][a-z0-9._/-]*`.

Source IDs are unique across all configured evidence documents, and user-supplied evidence IDs are globally unique across assertions and evidence documents in one tree. Reusing an ID across base/target means the same claim lineage; an unrelated collision is invalid.

Resolutions refine detector-produced evidence and cannot create evidence. A resolution uses a bounded detector/value/path selector; global wildcard-only resolutions are invalid. Schema validity is independent of current applicability: a resolution matching no fact in one tree is retained as an unused-resolution notice, not treated as invalid. Resolutions change model or platform resolution but not evidence confidence or scope.

Scope rules may set scope/environment only for bounded detector IDs and paths. Conventional path names such as `prod` never establish a production environment by themselves. Documentation, test/fixture, and example scopes are protected and cannot be promoted into policy eligibility by any scope rule in v3.0. A head scope rule can otherwise strengthen its own PR result but cannot demote a base-policy classification.

Suppressions apply after lifecycle joining. They require a stable ID, reason, creation time, expiry, and either an exact evidence ID copied from the report or an exact model/platform selector combined with at least one detector rule ID and bounded path. A model/platform/scope tuple alone is too broad and is invalid; global wildcards are invalid. Suppressed facts remain in machine output. Suppressions cannot hide scan failures, stale/expired evidence, truncation, policy changes, or all unresolved selectors.

### Freshness and expiry

Checked-in assertions and resolutions have four states:

Assertion timestamps satisfy `assertedAt <= reviewedAt < reviewAfter <= expiresAt`; resolution timestamps satisfy `reviewedAt < reviewAfter <= expiresAt`.

| State | Definition | Behavior |
| --- | --- | --- |
| Current | Before `reviewAfter` | Normal processing and policy eligibility |
| Review overdue | At/after `reviewAfter`, before `expiresAt` | Retained, advisory, `scan-status: partial`, not independently blocking |
| Expired | At/after `expiresAt` | Retained as expired evidence, advisory, `scan-status: partial`, not applied for blocking or safe resolution |
| Invalid trusted/base/default-branch document | Schema, ordering, or timestamp failure | `result: unknown`, `scan-status: failed`, step fails |
| Invalid target-only PR document | Schema, ordering, or timestamp failure | Excluded, reported in policy/evidence diff, PR at least advisory; cannot weaken base evaluation |

Expiry never deletes evidence from output. An expired assertion is still joined to lifecycle records and shown as historical/uncertain evidence. An expired resolution is not applied; its underlying fact returns to unresolved or ambiguous. An expired suppression stops applying and the original finding reappears; the expired suppression is reported but does not make the scan partial by itself. Here `partial` means the repository declared an evidence source whose current coverage can no longer be relied on; parsing may still have completed successfully.

Assertions and resolutions also have explicit refresh lineages. For an assertion, `evidenceId`, model ID, platform, scope, environment, and `assertedAt` are immutable. For a resolution, `resolutionId`, its complete match selector, and `resolveTo` pair are immutable. Changing an immutable field requires a new ID. A target same-ID refresh controls target health only when `reviewedAt`, `reviewAfter`, and `expiresAt` are all strictly later than the base values and timestamp ordering remains valid. Other severity-affecting changes such as `policyEligible` still follow the monotonic policy: they may strengthen but cannot weaken the current PR. Base facts/findings retain at least baseline severity, exactly as for external-source refreshes. Deletion or a non-later edit does not refresh health.

## External usage-evidence documents

V3.0 ingests optional evidence documents only as checked-in Git blobs. By default it discovers bounded JSON documents under `.github/ai-model-evidence/`; trusted base policy may declare additional bounded repository paths through `usageEvidenceFiles`. Workspace files created by earlier steps, artifacts, URLs, and action inputs are not trusted evidence channels in v3.0. They may be added in a later version with a separate trust contract.

Every document represents one named source and every record remains a repository-supplied claim. On pull requests, base documents are trusted facts; target additions may add or strengthen preview evidence, but target deletion or mutation cannot weaken base-derived external evidence during that PR.

Stable IDs provide the refresh/remediation path. If the target supplies a valid document with the same source ID and strictly later generation/capture, freshness/review, and expiry boundaries, that target document controls target `evidence-health`. Source kind, environment, and named source-boundary identity are immutable within a source ID; changing them requires a new ID. Base records omitted or weakened by the refresh are still carried at their baseline lifecycle severity for the current PR, while new/strengthened records are added. Thus deleting an expired source leaves target health expired and fails closed under enforcement; committing a valid fresh replacement can restore complete target coverage without letting the PR erase the base findings it is evaluating. After merge, the replacement becomes the next trusted baseline.

The timestamps in this JSON example are illustrative and MUST be replaced with values from the source being represented.

```json
{
  "schemaVersion": 1,
  "source": {
    "id": "prod-gateway-eu",
    "kind": "runtime-observation",
    "claimBasis": "repository-supplied",
    "environment": "production",
    "policyEligible": true,
    "provenance": "Weekly export committed by the platform observability workflow",
    "generatedAt": "2026-08-02T07:05:00Z",
    "observedFrom": "2026-07-26T07:00:00Z",
    "observedThrough": "2026-08-02T07:00:00Z",
    "freshUntil": "2026-08-09T07:05:00Z",
    "expiresAt": "2026-08-30T07:05:00Z",
    "snapshotSemantics": "observations-only"
  },
  "records": [
    {
      "evidenceId": "prod-gateway-eu:gpt-5.2:azure",
      "modelId": "gpt-5.2",
      "servingPlatform": "azure",
      "scope": "application",
      "environment": "production",
      "reason": "Observed routed requests in the named production gateway",
      "firstObservedAt": "2026-07-27T12:14:08Z",
      "lastObservedAt": "2026-08-02T06:51:20Z",
      "observationCount": 1842
    }
  ]
}
```

V3 source kinds are `runtime-observation`, `deployment-snapshot`, and `generated-declaration`. Every source requires the constant `claimBasis: repository-supplied`; v3.0 has no “verified” value. Common source fields are stable source ID, kind, environment, provenance, generation/capture time, expiry boundary, and `policyEligible` (default `false`). Runtime/deployment sources use `freshUntil`; generated declarations use `reviewAfter`. Every record inherits the source kind/provenance and requires a stable evidence ID, exact model ID, canonical serving-platform slug, scope, environment, and reason. A record's `environment` MUST equal its source environment; a producer covering several environments emits separate source documents. A mismatch is invalid rather than resolved by precedence.

Kind-specific requirements are:

- `runtime-observation`: `observedFrom`, `observedThrough`, `snapshotSemantics: observations-only`, and per-record first/last observation times; absence never proves non-use;
- `deployment-snapshot`: `capturedAt`, `snapshotSemantics: complete-for-source | partial`, and a named source boundary; it proves configuration at capture time, not traffic;
- `generated-declaration`: `generatedAt`, generator/ruleset provenance, reason, `reviewAfter`, and `expiresAt`; it is advisory-only until corroborated by repository evidence or a current trusted assertion.

`generatedAt` describes exporter execution, not model use. Observation timestamps describe historical observations, not current deployment.

Evidence-source timestamps are RFC 3339 UTC instants and MUST satisfy the applicable ordering:

```text
runtime-observation: observedFrom <= observedThrough <= generatedAt <= freshUntil <= expiresAt
deployment-snapshot: capturedAt <= freshUntil <= expiresAt
generated-declaration: generatedAt <= reviewAfter <= expiresAt
```

States and behavior:

| Source state | Lifecycle join | Policy eligibility | Scan health |
| --- | --- | --- | --- |
| Current (before kind-specific freshness/review boundary) | Normal | Kind-specific eligibility below | Unchanged |
| Review overdue (`generated-declaration`: `reviewAfter <= now < expiresAt`) | Retained and labelled review overdue | Never independently blocking | `partial` |
| Stale (`runtime-observation`/`deployment-snapshot`: `freshUntil <= now < expiresAt`) | Retained and labelled stale | Not independently blocking | `partial` |
| Expired (`now >= expiresAt`) | Retained as historical/uncertain | Never independently blocking | `partial` |
| Invalid trusted/base/default-branch source | Records are not trusted | None | `failed`; action fails |
| Invalid target-only PR source | Excluded from effective claims; visible policy/evidence diff | None | Target result at least advisory; scan health unchanged |

Regardless of freshness, a `deployment-snapshot` declaring `snapshotSemantics: partial` makes `scan-status: partial`; positive records retain their own eligibility, while absence proves nothing.

Each effective trusted source emits `evidence-health: current | review-overdue | stale | expired | invalid`. The aggregate uses `invalid > expired > stale > review-overdue > current`. Invalid target-only PR documents are reported outside that aggregate because they never become effective sources. Fresh repository evidence supporting the same finding is not demoted by stale external evidence. A stale/expired configured source makes declared coverage partial as required above, but never changes an independently established lifecycle finding from blocking to advisory.

Current trusted manual assertions and fresh `runtime-observation` or `deployment-snapshot` records may be blocking-eligible only when explicitly marked `policyEligible: true`, with registered/resolved platform, exact model ID, and production application or deployment environment. `generated-declaration` records are always advisory-only in v3.0, even if the source sets `policyEligible: true`. Trust describes configuration authority; it does not turn a claim into independently verified fact.

Invalid trusted base/default-branch evidence fails the assessment. Invalid target-only evidence on a pull request is excluded from trusted evaluation, reported as an invalid policy/evidence change, and makes the PR at least advisory; it cannot suppress the base evaluation.

## Feed and serving-platform contract

The single normative feed schema, launch platform registry, source-provider mapping, duplicate/conflict behavior, and alias ownership rules are defined in [v3-detector-contract.md](v3-detector-contract.md). Only records explicitly typed `model` enter model detection or lifecycle joins. V3 MUST NOT use a token-shaped regular expression to distinguish models from features, APIs, prompts, tools, or products.

An untyped default feed is a v3 release blocker unless a reviewed, versioned adapter carries an exact registry of reviewed source pairs and classifications. The adapter MUST verify the registry's pinned count and digest and MUST strictly parse every raw row before deciding whether the pair is reviewed. Received pairs outside the registry MUST NOT enter normalized feed records or lifecycle authority; their counts and a bounded preview MUST remain visible in diagnostics. Reviewed pairs absent from the source MUST likewise be reported. An addition, removal, or rename makes `scan-status: partial`: warning-only evaluation succeeds, while enforcement fails closed unless `allowPartial: true` explicitly permits partial coverage. A later action release is required before an added pair can gain model or non-model authority.

### Upstream freshness

A frozen upstream is indistinguishable from a healthy one at the row level: every document stays well formed, every lookup still resolves, and the run reports a permanent all-clear while newly announced shutdowns never arrive. The feed's own age is therefore normative coverage information, not a nicety.

Every run MUST measure the feed envelope's `generatedAt` against the effective `max-feed-age-days` horizon. Beyond the horizon the run MUST emit a bounded `feed-stale` diagnostic and MUST make `scan-status: partial`, which carries the standard consequences: warning-only evaluation succeeds with a visible signal, enforcement fails closed unless `allowPartial: true`. Feed age MUST NOT by itself change `result`, since staleness is a coverage property rather than a lifecycle finding, and MUST NOT degrade `comparison-status`, since both comparison sides share one feed snapshot.

`generatedAt` is the only freshness signal both feed paths carry: a typed producer states it directly, and the reviewed adapter derives it from the newest reviewed `scraped_at`. The stale diagnostic MUST state the production instant and the configured horizon rather than the elapsed day count, so that a persistent outage yields a stable `scan-fingerprint` instead of churning daily. The measured age and instant MUST be published as `feed-age-days` and `feed-generated-at`, and MUST be empty when the feed never loaded — a feed that fails to load is already `unknown + failed` and needs no separate freshness claim.

Duplicate source pairs, malformed rows, unknown fields or providers, invalid adapter metadata, and typed-feed schema failures produce `unknown + failed`. A source from which quarantine leaves no reviewed records also fails the non-empty feed contract. A syntactically valid but detector-unsupported platform in an already typed feed remains visible as unsupported, nonblocking evidence; it does not invalidate an otherwise valid feed.

## Scheduled visibility and notifications

The warning-only workflow may finish successfully with advisories. GitHub may not proactively notify anyone about a green scheduled run. Documentation MUST state this and the summary MUST show `Delivery: GitHub Actions summary only` when no channel is configured.

For operational visibility, documentation SHOULD recommend one or both of:

- enable trusted enforcement with `failWithinDays: 30` so imminent definite risks trigger GitHub failed-run notifications;
- configure the optional Slack webhook using a secret.

The zero-input workflow keeps `contents: read` and MUST NOT request issue, pull-request write, or security-event permissions. External writes require explicit credentials and configuration.

Slack delivery in v3.0 is a stateless snapshot limited to current actionable lifecycle advisories, blocking findings, and configured evidence-source freshness state. Every finding the report counts as blocking or advisory is either named in the snapshot's finding list or reported there as a withheld count, so a snapshot MUST NOT state a result it then denies. Low-confidence lexical matches are named and labelled `ADVISORY (text match)`, because a repository with no typed SDK call site has no stronger evidence to report; documentation, test, and example scope findings are counted but not named; resolved and unchanged unresolved evidence is excluded. A named finding carries the feed's first replacement model and a link to its primary source when the feed supplies them, and the snapshot links to the workflow run when `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`, and `GITHUB_RUN_ID` are all present and well-formed. Report-owned URLs are rendered as links only when they are credential-free HTTP(S) URLs made of RFC 3986 characters. Delivery is attempted only when the event name is exactly `schedule`, `workflow_dispatch`, or `push` and the selected target is a commit. Every other event—including `pull_request`, `merge_group`, `release`, and local or unknown events—is skipped.

Notification delivery state is independent:

```text
notification-status: disabled | skipped | sent | failed
```

If a channel is explicitly configured, delivery failure defaults to failing the step on eligible `schedule`, `workflow_dispatch`, or `push` commit targets. `notification-failure-mode: warn` MAY override this. Secrets MUST NOT be used for untrusted fork pull requests. Notification failure never changes `result` or `scan-status`; it changes only `notification-status`, `exit-reason`, and possibly the final step exit.

V3 MUST NOT claim on-change delivery unless prior state is durably restored and next state is durably persisted. The action exposes `alert-fingerprint` so a caller that persists prior state can implement unchanged-alert suppression. V3.0 publishes no notification payload or next-state token and owns no durable state.

## Outputs and summary

Primary outputs are:

- `result`
- `baseline-result` and `target-result` when comparison is available or partial
- `scan-status`
- `baseline-scan-status` and `target-scan-status` when comparison is available or partial
- `comparison-status`
- `exit-reason`
- `target-kind`
- aggregate and per-source `evidence-health`
- `evidence-facts`
- `lifecycle-findings`
- `unresolved-references`
- full pre-truncation counts by evidence, scope, resolution, and outcome
- `source-feed-sha256`, `normalized-feed-sha256`, `active-records-sha256`, and `feed-adapter-manifest-sha256`
- `detector-manifest-sha256`
- semantic evidence, finding, scan, and alert fingerprints
- `output-truncated`
- `notification-status` and reason
- `report-path` for the complete bounded local JSON report, available only to later steps in the same job unless the caller explicitly persists it

Large detail belongs in the local report and job summary rather than GitHub outputs. Counts and truncation flags MUST survive detail compaction.

The summary opens with outcome, evidence sources, assessment health, and delivery, for example:

```text
⚠️ 2 lifecycle risks · 1 conditional platform match · 3 unresolved selectors
Evidence: repository + prod-gateway-eu (runtime claim, fresh) · Scan: complete within declared scope
Delivery: GitHub Actions summary only
```

A clean repository-only result uses:

```text
No actionable lifecycle risk found in eligible repository evidence
Evidence: repository only · Scan: complete within repository scope
No runtime or control-plane evidence source was supplied; those systems were not assessed.
```

The detailed summary contains nonempty sections in this order:

1. actionable lifecycle findings;
2. conditional and unresolved evidence;
3. external evidence health;
4. policy/configuration diff on pull requests;
5. active suppressions;
6. collapsed coverage and provenance.

Annotations are aggregated per semantic model/platform finding, with one primary location and bounded secondary locations. Source snippets and secret values are never emitted.

Scanner identity has three layers. A semantic evidence ID derives from rule ID, root-relative Git path, semantic anchor, selector, and occurrence discriminator; it excludes commit OID, blob OID, line, and column. Snapshot provenance separately records the selected commit, blob, rendered path, line, and column. V3.0 does not infer Git rename/copy mappings, so a move changes the evidence ID and location-specific fingerprint; lifecycle delta comparison aggregates the exact lifecycle semantic key, preventing an otherwise unchanged model finding from becoming new merely because its code moved. User-supplied evidence IDs remain stable document identifiers and are never derived from a blob OID.
