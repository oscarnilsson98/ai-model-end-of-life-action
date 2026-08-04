import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateComparison,
  monotonicEvidenceSourceDocuments,
} from "../policy/comparison.ts";
import { detectSnapshot, type DetectionResult } from "../detection/detectors.ts";
import { evaluateEvidence } from "../policy/evaluate.ts";
import { resolveEventSelection, type ResolvedEventSelection } from "../repository/event.ts";
import { loadLifecycleFeed } from "../lifecycle/feed-source.ts";
import { feedAgeInDays, type LoadedV3Feed } from "../lifecycle/feed.ts";
import {
  readGitTreeSnapshot,
  GitTreeSnapshotError,
  type GitTreeSnapshot,
} from "../repository/git.ts";
import {
  appendCommand,
  getInput,
  maskSecret,
  type Environment,
  type Log,
} from "./github.ts";
import { parseActionInputs } from "./input.ts";
import { DETECTOR_MANIFEST_SHA256 } from "../detection/manifest.ts";
import {
  deliverSlackNotification,
  type SlackDeliveryResult,
} from "./notification.ts";
import {
  applyTrustedInputs,
  defaultPolicy,
} from "../policy/policy.ts";
import {
  publishAnnotations,
  publishCoreOutputs,
  publishNotificationSummary,
  publishNotificationOutputs,
  publishSummary,
  writeAssessmentReport,
} from "./publish.ts";
import {
  inspectSnapshotClaims,
  inspectSnapshotPolicy,
  type SnapshotClaimsInspection,
} from "../evidence/snapshot-claims.ts";
import {
  alertFingerprint,
  buildCounts,
  canonicalSha256,
  chooseExitReason,
  combineEvidenceHealth,
  combineScanStatus,
  scanFingerprint,
} from "../shared/status.ts";
import { compact } from "../shared/text.ts";
import { DEFAULT_MAX_FEED_AGE_DAYS } from "../shared/limits.ts";
import type {
  ActionInputs,
  AssessmentReport,
  ComparisonStatus,
  CoverageDiagnostic,
  Evaluation,
  EventSelection,
  EvidenceHealth,
  EvidenceSourceInspection,
  FeedIdentity,
  Policy,
  PolicyInspection,
  Result,
  ScanStatus,
} from "../shared/types.ts";

const UNAVAILABLE_SHA256 = canonicalSha256("ai-model-eol/unavailable/v3", null);

const DEFAULT_INPUTS: ActionInputs = {
  warnWithinDays: null,
  failWithinDays: null,
  allowPartial: null,
  maxFeedAgeDays: DEFAULT_MAX_FEED_AGE_DAYS,
  notificationFailureMode: "fail",
};

type ClaimsInspector = typeof inspectSnapshotClaims;

export type RunDependencies = {
  environment?: Environment;
  repositoryPath?: string;
  eventPayload?: unknown;
  now?: () => number;
  reportPath?: string;
  log?: Log;
  loadFeed?: () => Promise<LoadedV3Feed>;
  resolveEvent?: () => ResolvedEventSelection;
  readSnapshot?: (repositoryPath: string, treeish: string) => GitTreeSnapshot;
  detect?: (snapshot: GitTreeSnapshot, feed: LoadedV3Feed["index"]) => DetectionResult;
  inspectPolicy?: (snapshot: GitTreeSnapshot) => PolicyInspection;
  inspectClaims?: ClaimsInspector;
  deliverNotification?: (options: {
    webhookUrl: string;
    report: AssessmentReport;
  }) => Promise<SlackDeliveryResult>;
};

type AssessmentProduct = {
  report: AssessmentReport;
  policy: Policy;
  inputs: ActionInputs;
};

export class ActionRunError extends Error {
  constructor(
    message: string,
    readonly report: AssessmentReport,
  ) {
    super(message);
    this.name = "ActionRunError";
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return compact(message, 2_000);
}

function reportPath(environment: Environment, requested: string | undefined): string {
  if (requested !== undefined) return requested;
  const parent = environment.RUNNER_TEMP || tmpdir();
  const directory = mkdtempSync(join(parent, "ai-model-eol-"));
  return join(directory, "report.json");
}

const FULL_HEX_OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function fallbackEvent(environment: Environment): EventSelection {
  const eventName = environment.GITHUB_EVENT_NAME?.trim() || "local";
  const comparisonRequested = eventName === "pull_request" || eventName === "merge_group";
  const targetSha = environment.GITHUB_SHA?.trim() ?? "";
  return {
    eventName,
    targetOid: FULL_HEX_OID_PATTERN.test(targetSha) ? targetSha : "unavailable",
    // On pull_request events GITHUB_SHA is the synthetic merge ref; an early failure
    // means it was never validated or compared, which is exactly "uncompared".
    targetKind:
      eventName === "merge_group"
        ? "merge-group"
        : eventName === "pull_request"
          ? "synthetic-merge-uncompared"
          : "commit",
    comparisonRequested,
  };
}

/** Keep validated synthetic-merge parent order in the serialized report. */
function reportEvent(resolved: ResolvedEventSelection): EventSelection {
  if (resolved.targetParentOids === undefined) return resolved.selection;
  return {
    ...resolved.selection,
    targetParentOids: [...resolved.targetParentOids],
  };
}

function unavailableFeed(): FeedIdentity {
  return {
    sourceFeedSha256: UNAVAILABLE_SHA256,
    normalizedFeedSha256: UNAVAILABLE_SHA256,
    activeRecordsSha256: UNAVAILABLE_SHA256,
    feedAdapterManifestSha256: UNAVAILABLE_SHA256,
    generatedAt: "",
    ageDays: null,
  };
}

type FeedFreshness = {
  readonly generatedAt: string;
  readonly ageDays: number;
  readonly maxAgeDays: number | null;
  readonly stale: boolean;
};

/**
 * Measure the loaded feed against the configured freshness horizon. A frozen upstream keeps
 * serving a well-formed document, so nothing else in the pipeline can tell the difference
 * between "nothing is deprecated" and "nobody has looked since May".
 */
function feedFreshness(
  feed: LoadedV3Feed,
  maxAgeDays: number | null,
  nowMs: number,
): FeedFreshness {
  const generatedAt = feed.index.envelope.generatedAt;
  const ageDays = feedAgeInDays(generatedAt, nowMs);
  return {
    generatedAt,
    ageDays,
    maxAgeDays,
    stale: maxAgeDays !== null && ageDays > maxAgeDays,
  };
}

function feedIdentity(feed: LoadedV3Feed, freshness: FeedFreshness): FeedIdentity {
  return { ...feed.digests, generatedAt: freshness.generatedAt, ageDays: freshness.ageDays };
}

function feedDiagnostics(
  feed: LoadedV3Feed,
  freshness: FeedFreshness,
): CoverageDiagnostic[] {
  const staleness: CoverageDiagnostic[] = freshness.stale
    ? [
        {
          code: "feed-stale",
          // Deliberately states the production instant and the horizon rather than the elapsed
          // day count: a frozen feed then yields a stable diagnostic, so scan-fingerprint does
          // not churn daily while the outage persists. The live age is a published output.
          message: `The upstream lifecycle feed was generated at ${freshness.generatedAt}, which is older than the configured max-feed-age-days horizon of ${String(freshness.maxAgeDays)} day(s). A feed that stopped updating reports a permanent all-clear, so lifecycle coverage is not trustworthy.`,
          severity: "partial",
        },
      ]
    : [];
  const upstream = feed.index.diagnostics.map((diagnostic): CoverageDiagnostic => {
    if (diagnostic.kind === "feed-conflict") {
      return {
        code: diagnostic.kind,
        message: `The lifecycle feed has conflicting active records for ${diagnostic.servingPlatform}/${diagnostic.modelId}.`,
        severity: "notice",
      };
    }
    const renderPairs = (
      pairs: readonly (readonly [provider: string, identifier: string])[],
    ) => pairs.slice(0, 10).map(([provider, identifier]) => `${provider}/${identifier}`).join(", ");
    const added = renderPairs(diagnostic.addedPairs);
    const removed = renderPairs(diagnostic.removedPairs);
    return {
      code: diagnostic.kind,
      message: `The untyped lifecycle-feed pair set changed: ${diagnostic.addedPairCount} unreviewed addition(s) were quarantined${added === "" ? "" : ` (${added})`}; ${diagnostic.removedPairCount} reviewed pair(s) were absent${removed === "" ? "" : ` (${removed})`}. No unreviewed row was normalized into lifecycle authority.`,
      severity: "partial",
    };
  });
  return [...upstream, ...staleness];
}

function applyFeedCoverage(
  detection: DetectionResult,
  feed: LoadedV3Feed,
): DetectionResult {
  if (!feed.index.diagnostics.some((diagnostic) => diagnostic.kind === "feed-pair-set-change")) {
    return detection;
  }
  return detection.scanStatus === "partial"
    ? detection
    : { ...detection, scanStatus: "partial" };
}

/**
 * Degrade the run's declared coverage for a stale feed, deliberately at run level rather
 * than per snapshot side. Staleness is a property of the single feed snapshot both
 * comparison sides share, so it must not reach the per-side detection status: that would
 * make `comparison-status` partial and reclassify a genuinely new target breach as
 * `comparison-unknown`, which downgrades it to a warning. Enforcement still fails closed
 * here through `decisionFor`, without laundering a definite breach into an advisory.
 */
function applyFeedFreshnessCoverage(
  scanStatus: Exclude<ScanStatus, "failed">,
  freshness: FeedFreshness,
): Exclude<ScanStatus, "failed"> {
  return freshness.stale ? "partial" : scanStatus;
}

function reportEvidenceSources(
  evaluation: Pick<Evaluation, "evidence" | "evidenceHealth">,
  inspections: readonly SnapshotClaimsInspection[],
  effectiveDocuments?: readonly EvidenceSourceInspection[],
): AssessmentReport["evidenceSources"] {
  const result: AssessmentReport["evidenceSources"] = [
    { id: "repository", kind: "repository", health: "current" },
  ];
  const manual = evaluation.evidence.filter((fact) => fact.origin === "manual-claim");
  if (manual.length > 0) {
    result.push({
      id: "checked-in-assertions",
      kind: "manual-claim",
      health: combineEvidenceHealth(
        ...manual.map((fact) => fact.evidenceHealth ?? "current"),
      ),
    });
  }
  const external = new Map<string, EvidenceHealth>();
  const documents = effectiveDocuments ?? inspections.flatMap(
    (inspection) => inspection.evidenceDocuments,
  );
  for (const document of documents) {
    const id = document.sourceId ?? document.path;
    const previous = external.get(id);
    external.set(
      id,
      previous === undefined
        ? document.health
        : combineEvidenceHealth(previous, document.health),
    );
  }
  for (const [id, health] of [...external].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    result.push({ id, kind: "external-source", health });
  }
  return result;
}

function finishReport(input: {
  evaluatedAt: string;
  result: Result;
  baselineResult?: Result;
  targetResult?: Result;
  scanStatus: ScanStatus;
  baselineScanStatus?: ScanStatus;
  targetScanStatus?: ScanStatus;
  comparisonStatus: ComparisonStatus;
  exitReason: AssessmentReport["exitReason"];
  event: EventSelection;
  evaluation?: Evaluation;
  diagnostics?: readonly CoverageDiagnostic[];
  policyDiff?: readonly string[];
  feed?: FeedIdentity;
  evidenceSources?: AssessmentReport["evidenceSources"];
  reportPath: string;
}): AssessmentReport {
  const evaluation = input.evaluation;
  const evidenceFacts = evaluation?.evidence ?? [];
  const lifecycleFindings = evaluation?.findings ?? [];
  const unresolvedReferences = evaluation?.unresolved ?? [];
  const report: AssessmentReport = {
    schemaVersion: 3,
    evaluatedAt: input.evaluatedAt,
    result: input.result,
    ...(input.baselineResult === undefined ? {} : { baselineResult: input.baselineResult }),
    ...(input.targetResult === undefined ? {} : { targetResult: input.targetResult }),
    scanStatus: input.scanStatus,
    ...(input.baselineScanStatus === undefined
      ? {}
      : { baselineScanStatus: input.baselineScanStatus }),
    ...(input.targetScanStatus === undefined
      ? {}
      : { targetScanStatus: input.targetScanStatus }),
    comparisonStatus: input.comparisonStatus,
    exitReason: input.exitReason,
    targetKind: input.event.targetKind,
    event: input.event,
    evidenceHealth: evaluation?.evidenceHealth ?? "current",
    evidenceSources:
      input.evidenceSources ?? [
        { id: "repository", kind: "repository", health: "current" },
      ],
    evidenceFacts,
    lifecycleFindings,
    unresolvedReferences,
    diagnostics: [...(input.diagnostics ?? evaluation?.diagnostics ?? [])],
    counts: buildCounts(evidenceFacts, lifecycleFindings, unresolvedReferences),
    policyDiff: [...(input.policyDiff ?? [])],
    feed: input.feed ?? unavailableFeed(),
    detectorManifestSha256: DETECTOR_MANIFEST_SHA256,
    scanFingerprint: UNAVAILABLE_SHA256,
    alertFingerprint: alertFingerprint(lifecycleFindings),
    outputTruncated: false,
    notificationStatus: "disabled",
    notificationReason: "no Slack webhook configured",
    reportPath: input.reportPath,
  };
  report.scanFingerprint = scanFingerprint(report);
  return report;
}

function failureProduct(input: {
  evaluatedAt: string;
  reportPath: string;
  environment: Environment;
  error: unknown;
  stage: string;
  event?: EventSelection;
  comparisonStatus?: ComparisonStatus;
  feed?: FeedIdentity;
  inputs?: ActionInputs;
  diagnostics?: readonly CoverageDiagnostic[];
}): AssessmentProduct {
  const event = input.event ?? fallbackEvent(input.environment);
  const diagnostic: CoverageDiagnostic = {
    code: `${input.stage}-failed`,
    message: safeMessage(input.error),
    severity: "failed",
  };
  return {
    report: finishReport({
      evaluatedAt: input.evaluatedAt,
      result: "unknown",
      scanStatus: "failed",
      comparisonStatus:
        input.comparisonStatus ?? (event.comparisonRequested ? "unavailable" : "not-applicable"),
      exitReason: "assessment-failed",
      event,
      diagnostics: [...(input.diagnostics ?? []), diagnostic],
      ...(input.feed === undefined ? {} : { feed: input.feed }),
      reportPath: input.reportPath,
    }),
    policy: defaultPolicy(),
    inputs: input.inputs ?? DEFAULT_INPUTS,
  };
}

function decisionFor(
  result: Exclude<Result, "unknown">,
  scanStatus: Exclude<ScanStatus, "failed">,
  policy: Policy,
): AssessmentReport["exitReason"] {
  return chooseExitReason(
    result === "blocking" ? "policy-breach" : "none",
    scanStatus === "partial" && policy.failWithinDays !== null && !policy.allowPartial
      ? "partial-disallowed"
      : "none",
  );
}

function diagnosticTargetEvaluation(input: {
  detection: DetectionResult;
  claims: SnapshotClaimsInspection;
  feed: LoadedV3Feed;
  freshness: FeedFreshness;
  inputs: ActionInputs;
  now: number;
  extraDiagnostics: readonly CoverageDiagnostic[];
}): { evaluation: Evaluation; policy: Policy } {
  const policy = applyTrustedInputs(
    input.claims.policy.valid ? input.claims.policy.policy : defaultPolicy(),
    input.inputs,
  );
  const claimDiagnostics = input.claims.diagnostics.map((diagnostic) =>
    diagnostic.severity === "failed"
      ? { ...diagnostic, severity: "notice" as const }
      : diagnostic,
  );
  return {
    evaluation: evaluateEvidence({
      evidence: [...input.detection.evidence, ...input.claims.facts],
      feed: input.feed.index,
      policy,
      now: input.now,
      scanStatus: combineScanStatus(
        input.detection.scanStatus,
        input.claims.scanStatus,
      ) as "complete" | "partial",
      diagnostics: [
        ...input.extraDiagnostics,
        ...input.detection.diagnostics,
        ...claimDiagnostics,
        ...feedDiagnostics(input.feed, input.freshness),
      ],
    }),
    policy,
  };
}

async function assess(
  dependencies: RunDependencies,
  environment: Environment,
  evaluatedAtMs: number,
  localReportPath: string,
  log: Log,
): Promise<AssessmentProduct> {
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();
  const repositoryPath = dependencies.repositoryPath ?? environment.GITHUB_WORKSPACE ?? process.cwd();
  let stage = "inputs";
  let inputs = DEFAULT_INPUTS;
  let resolvedEvent: ResolvedEventSelection | undefined;
  let feed: LoadedV3Feed | undefined;
  let freshness: FeedFreshness | undefined;
  try {
    const rawWebhook = getInput("slack-webhook", environment);
    if (rawWebhook !== undefined && rawWebhook !== "") maskSecret(rawWebhook, log);
    inputs = parseActionInputs(environment);

    stage = "event-selection";
    resolvedEvent =
      dependencies.resolveEvent?.() ??
      resolveEventSelection({
        repositoryPath,
        environment,
        ...(dependencies.eventPayload === undefined
          ? {}
          : { eventPayload: dependencies.eventPayload }),
      });

    stage = "feed";
    feed = await (dependencies.loadFeed?.() ?? loadLifecycleFeed());
    freshness = feedFreshness(feed, inputs.maxFeedAgeDays, evaluatedAtMs);

    const readSnapshot =
      dependencies.readSnapshot ??
      ((path: string, treeish: string) =>
        readGitTreeSnapshot({ repositoryPath: path, treeish }));
    const detector = dependencies.detect ?? detectSnapshot;
    const policyInspector = dependencies.inspectPolicy ?? inspectSnapshotPolicy;
    const claimsInspector = dependencies.inspectClaims ?? inspectSnapshotClaims;

    stage = "target-snapshot";
    const targetSnapshot = readSnapshot(repositoryPath, resolvedEvent.selection.targetOid);
    stage = "target-detection";
    const targetDetection = applyFeedCoverage(detector(targetSnapshot, feed.index), feed);
    const targetPolicy = policyInspector(targetSnapshot);

    if (resolvedEvent.comparisonStatus === "unavailable") {
      stage = "target-claims";
      const targetClaims = claimsInspector({
        snapshot: targetSnapshot,
        now: evaluatedAtMs,
        policy: targetPolicy,
      });
      const diagnostic = diagnosticTargetEvaluation({
        detection: targetDetection,
        claims: targetClaims,
        feed,
        freshness,
        inputs,
        now: evaluatedAtMs,
        extraDiagnostics: resolvedEvent.diagnostics,
      });
      return {
        report: finishReport({
          evaluatedAt,
          result: "unknown",
          scanStatus: "partial",
          comparisonStatus: "unavailable",
          exitReason: "trusted-base-unavailable",
          event: reportEvent(resolvedEvent),
          evaluation: diagnostic.evaluation,
          diagnostics: diagnostic.evaluation.diagnostics,
          policyDiff: targetClaims.policy.valid
            ? []
            : ["Target policy/configuration is invalid and non-authoritative."],
          feed: feedIdentity(feed, freshness),
          evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims]),
          reportPath: localReportPath,
        }),
        policy: diagnostic.policy,
        inputs,
      };
    }

    if (!resolvedEvent.selection.comparisonRequested) {
      stage = "target-claims";
      const targetClaims = claimsInspector({
        snapshot: targetSnapshot,
        now: evaluatedAtMs,
        policy: targetPolicy,
      });
      const diagnostic = diagnosticTargetEvaluation({
        detection: targetDetection,
        claims: targetClaims,
        feed,
        freshness,
        inputs,
        now: evaluatedAtMs,
        extraDiagnostics: resolvedEvent.diagnostics,
      });
      if (targetClaims.invalid) {
        return {
          report: finishReport({
            evaluatedAt,
            result: "unknown",
            scanStatus: "failed",
            comparisonStatus: "not-applicable",
            exitReason: "assessment-failed",
            event: reportEvent(resolvedEvent),
            evaluation: diagnostic.evaluation,
            diagnostics: [
              ...targetClaims.diagnostics,
              ...targetDetection.diagnostics,
              ...feedDiagnostics(feed, freshness),
            ],
            feed: feedIdentity(feed, freshness),
            evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims]),
            reportPath: localReportPath,
          }),
          policy: diagnostic.policy,
          inputs,
        };
      }
      const scanStatus = applyFeedFreshnessCoverage(
        diagnostic.evaluation.scanStatus,
        freshness,
      );
      const exitReason = decisionFor(
        diagnostic.evaluation.result,
        scanStatus,
        diagnostic.policy,
      );
      return {
        report: finishReport({
          evaluatedAt,
          result: diagnostic.evaluation.result,
          scanStatus,
          comparisonStatus: "not-applicable",
          exitReason,
          event: reportEvent(resolvedEvent),
          evaluation: diagnostic.evaluation,
          diagnostics: diagnostic.evaluation.diagnostics,
          feed: feedIdentity(feed, freshness),
          evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims]),
          reportPath: localReportPath,
        }),
        policy: diagnostic.policy,
        inputs,
      };
    }

    const baseOid = resolvedEvent.selection.baseOid;
    if (baseOid === undefined) {
      throw new Error("A comparison event did not provide a trusted base object ID.");
    }
    stage = "base-snapshot";
    let baseSnapshot: GitTreeSnapshot;
    try {
      baseSnapshot = readSnapshot(repositoryPath, baseOid);
    } catch (error) {
      if (error instanceof GitTreeSnapshotError && error.code === "tree-unavailable") {
        const targetClaims = claimsInspector({
          snapshot: targetSnapshot,
          now: evaluatedAtMs,
          policy: targetPolicy,
        });
        const unavailableDiagnostics: CoverageDiagnostic[] = [
          ...resolvedEvent.diagnostics,
          {
            code: "trusted-base-unavailable",
            message: safeMessage(error),
            severity: "partial",
          },
        ];
        const diagnostic = diagnosticTargetEvaluation({
          detection: targetDetection,
          claims: targetClaims,
          feed,
          freshness,
          inputs,
          now: evaluatedAtMs,
          extraDiagnostics: unavailableDiagnostics,
        });
        return {
          report: finishReport({
            evaluatedAt,
            result: "unknown",
            scanStatus: "partial",
            comparisonStatus: "unavailable",
            exitReason: "trusted-base-unavailable",
            event: reportEvent(resolvedEvent),
            evaluation: diagnostic.evaluation,
            diagnostics: diagnostic.evaluation.diagnostics,
            feed: feedIdentity(feed, freshness),
            evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims]),
            reportPath: localReportPath,
          }),
          policy: diagnostic.policy,
          inputs,
        };
      }
      throw error;
    }

    stage = "comparison-claims";
    const basePolicy = policyInspector(baseSnapshot);
    const baseClaims = claimsInspector({
      snapshot: baseSnapshot,
      now: evaluatedAtMs,
      policy: basePolicy,
    });
    if (baseClaims.invalid) {
      throw new Error(
        `Trusted base policy or evidence is invalid: ${baseClaims.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join("; ")}`,
      );
    }
    const targetClaims = claimsInspector({
      snapshot: targetSnapshot,
      now: evaluatedAtMs,
      policy: targetPolicy,
      additionalEvidencePatterns: basePolicy.policy.usageEvidenceFiles,
    });
    stage = "base-detection";
    const baseDetection = applyFeedCoverage(detector(baseSnapshot, feed.index), feed);
    stage = "comparison-evaluation";
    const comparison = evaluateComparison({
      baseDetection,
      targetDetection,
      baseClaims,
      targetClaims,
      feed: feed.index,
      inputs,
      now: evaluatedAtMs,
    });
    const diagnostics = [
      ...resolvedEvent.diagnostics,
      ...comparison.evaluation.diagnostics,
      ...comparison.baseline.diagnostics,
      ...feedDiagnostics(feed, freshness),
    ];
    // Feed staleness degrades only the run's declared coverage. The per-side statuses and
    // `comparison-status` describe extraction over each snapshot, which one shared feed
    // snapshot cannot make asymmetric.
    const scanStatus = applyFeedFreshnessCoverage(comparison.scanStatus, freshness);
    const exitReason = decisionFor(comparison.result, scanStatus, comparison.policy);
    return {
      report: finishReport({
        evaluatedAt,
        result: comparison.result,
        baselineResult: comparison.baselineResult,
        targetResult: comparison.targetResult,
        scanStatus,
        baselineScanStatus: comparison.baselineScanStatus,
        targetScanStatus: comparison.targetScanStatus,
        comparisonStatus: comparison.comparisonStatus,
        exitReason,
        event: reportEvent(resolvedEvent),
        evaluation: comparison.evaluation,
        diagnostics,
        policyDiff: comparison.policyDiff,
        feed: feedIdentity(feed, freshness),
        evidenceSources: reportEvidenceSources(
          comparison.evaluation,
          [targetClaims],
          monotonicEvidenceSourceDocuments(baseClaims, targetClaims),
        ),
        reportPath: localReportPath,
      }),
      policy: comparison.policy,
      inputs,
    };
  } catch (error) {
    return failureProduct({
      evaluatedAt,
      reportPath: localReportPath,
      environment,
      error,
      stage,
      ...(resolvedEvent === undefined ? {} : { event: reportEvent(resolvedEvent) }),
      ...(resolvedEvent === undefined
        ? {}
        : { comparisonStatus: resolvedEvent.comparisonStatus }),
      ...(feed === undefined || freshness === undefined
        ? {}
        : { feed: feedIdentity(feed, freshness) }),
      inputs,
      ...(resolvedEvent === undefined ? {} : { diagnostics: resolvedEvent.diagnostics }),
    });
  }
}

function failureMessage(report: AssessmentReport): string {
  switch (report.exitReason) {
    case "assessment-failed":
      return "The AI model lifecycle assessment failed; see the report diagnostics.";
    case "trusted-base-unavailable":
      return "The trusted comparison base is unavailable; the diagnostic target scan is non-authoritative.";
    case "policy-breach":
      return "A definite AI model lifecycle finding breached the configured policy.";
    case "partial-disallowed":
      return "The assessment is partial and trusted enforcement does not allow partial success.";
    case "notification-failed":
      return "The configured Slack lifecycle notification could not be delivered.";
    case "none":
      return "The action failed unexpectedly.";
  }
}

function fallbackPublicationReport(report: AssessmentReport, error: unknown): AssessmentReport {
  return finishReport({
    evaluatedAt: report.evaluatedAt,
    result: "unknown",
    scanStatus: "failed",
    comparisonStatus: report.comparisonStatus,
    exitReason: "assessment-failed",
    event: report.event,
    diagnostics: [
      ...report.diagnostics,
      {
        code: "publication-failed",
        message: safeMessage(error),
        severity: "failed",
      },
    ],
    feed: report.feed,
    reportPath: report.reportPath,
  });
}

function publishCore(
  initialReport: AssessmentReport,
  environment: Environment,
  log: Log,
  notificationPending: boolean,
): AssessmentReport {
  let report = initialReport;
  try {
    publishCoreOutputs(report, environment);
    writeAssessmentReport(report);
    publishAnnotations(report, log);
    publishSummary(report, environment, { notificationPending });
    return report;
  } catch (error) {
    report = fallbackPublicationReport(report, error);
    publishCoreOutputs(report, environment);
    writeAssessmentReport(report);
    publishSummary(report, environment, { notificationPending });
    return report;
  }
}

/** Run one complete v3 assessment and publish all available diagnostics before failing. */
export async function run(dependencies: RunDependencies = {}): Promise<AssessmentReport> {
  const environment = dependencies.environment ?? process.env;
  const log = dependencies.log ?? console.log;
  const evaluatedAtMs = (dependencies.now ?? Date.now)();
  const localReportPath = reportPath(environment, dependencies.reportPath);
  const product = await assess(
    dependencies,
    environment,
    evaluatedAtMs,
    localReportPath,
    log,
  );
  let report = publishCore(
    product.report,
    environment,
    log,
    product.inputs.slackWebhook !== undefined,
  );
  let notificationFailureShouldFail = false;

  if (product.inputs.slackWebhook === undefined) {
    report.notificationStatus = "disabled";
    report.notificationReason = "no Slack webhook configured";
  } else {
    try {
      const deliver = dependencies.deliverNotification ?? deliverSlackNotification;
      const delivery = await deliver({
        webhookUrl: product.inputs.slackWebhook,
        report,
      });
      report.notificationStatus = delivery.status;
      report.notificationReason =
        delivery.detail ??
        (delivery.status === "sent"
          ? "Slack snapshot delivered"
          : "Slack snapshot delivery was skipped");
      if (delivery.status === "failed") {
        report.exitReason = chooseExitReason(report.exitReason, "notification-failed");
        notificationFailureShouldFail = product.inputs.notificationFailureMode === "fail";
      }
    } catch (error) {
      report.notificationStatus = "failed";
      report.notificationReason = "Slack webhook delivery failed.";
      report.exitReason = chooseExitReason(report.exitReason, "notification-failed");
      notificationFailureShouldFail = product.inputs.notificationFailureMode === "fail";
    }
  }

  // Core outputs, report, annotations, and assessment summary already exist before notification
  // delivery. Update only notification-dependent state and append a bounded delivery result.
  writeAssessmentReport(report);
  appendCommand(environment.GITHUB_OUTPUT, "exit-reason", report.exitReason);
  publishNotificationOutputs(report, environment);
  if (product.inputs.slackWebhook !== undefined) {
    publishNotificationSummary(report, environment);
  }

  const coreFailed =
    report.result === "unknown" ||
    report.scanStatus === "failed" ||
    report.exitReason === "trusted-base-unavailable" ||
    report.exitReason === "policy-breach" ||
    report.exitReason === "partial-disallowed" ||
    report.exitReason === "assessment-failed";
  log(
    `AI model lifecycle: ${report.result}; scan ${report.scanStatus}; ${report.counts.findings} finding(s); exit reason ${report.exitReason}.`,
  );
  if (coreFailed || notificationFailureShouldFail) {
    throw new ActionRunError(failureMessage(report), report);
  }
  return report;
}
