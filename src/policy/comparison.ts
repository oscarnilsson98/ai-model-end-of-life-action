import { evaluateEvidence } from "./evaluate.ts";
import {
  applyTrustedInputs,
  defaultPolicy,
  monotonicPolicy,
  policyDiff,
} from "./policy.ts";
import {
  canonicalSha256,
  combineEvidenceHealth,
  combineScanStatus,
  compareOutcome,
  compareResult,
  resultFromFindings,
  strongerResult,
} from "../shared/status.ts";
import type { DetectionResult } from "../detection/detectors.ts";
import type { V3FeedIndex } from "../lifecycle/feed.ts";
import type { SnapshotClaimsInspection } from "../evidence/snapshot-claims.ts";
import type {
  ActionInputs,
  AssertionClaim,
  ComparisonStatus,
  CoverageDiagnostic,
  Evaluation,
  EvidenceFact,
  EvidenceSourceInspection,
  LifecycleFinding,
  Policy,
  Result,
  ScanStatus,
} from "../shared/types.ts";

export type ComparisonEvaluation = {
  result: Exclude<Result, "unknown">;
  baselineResult: Exclude<Result, "unknown">;
  targetResult: Exclude<Result, "unknown">;
  scanStatus: Exclude<ScanStatus, "failed">;
  baselineScanStatus: Exclude<ScanStatus, "failed">;
  targetScanStatus: Exclude<ScanStatus, "failed">;
  comparisonStatus: Extract<ComparisonStatus, "available" | "partial">;
  evaluation: Evaluation;
  baseline: Evaluation;
  policy: Policy;
  policyDiff: string[];
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutableClaimIdentity(fact: EvidenceFact): string {
  return JSON.stringify([
    fact.origin,
    fact.kind,
    fact.modelId ?? null,
    fact.servingPlatform ?? null,
    fact.scope,
    fact.environment,
    fact.sourceId ?? null,
  ]);
}

function assertionById(claims: SnapshotClaimsInspection): Map<string, AssertionClaim> {
  return new Map(claims.policy.policy.assertions.map((assertion) => [assertion.evidenceId, assertion]));
}

function assertionRefreshAccepted(base: AssertionClaim, target: AssertionClaim): boolean {
  return (
    JSON.stringify([
      base.evidenceId,
      base.modelId,
      base.servingPlatform,
      base.scope,
      base.environment,
      base.assertedAt,
    ]) ===
      JSON.stringify([
        target.evidenceId,
        target.modelId,
        target.servingPlatform,
        target.scope,
        target.environment,
        target.assertedAt,
      ]) &&
    Date.parse(target.reviewedAt) > Date.parse(base.reviewedAt) &&
    Date.parse(target.reviewAfter) > Date.parse(base.reviewAfter) &&
    Date.parse(target.expiresAt) > Date.parse(base.expiresAt)
  );
}

function documentsBySource(
  claims: SnapshotClaimsInspection,
): Map<string, EvidenceSourceInspection> {
  const documents = claims.evidenceDocuments.filter(
    (document): document is EvidenceSourceInspection & { sourceId: string } =>
      document.valid && document.sourceId !== undefined,
  );
  const counts = new Map<string, number>();
  for (const document of documents) {
    counts.set(document.sourceId, (counts.get(document.sourceId) ?? 0) + 1);
  }
  return new Map(
    documents
      .filter((document) => counts.get(document.sourceId) === 1)
      .map((document) => [document.sourceId, document]),
  );
}

function externalRefreshAccepted(
  base: EvidenceSourceInspection,
  target: EvidenceSourceInspection,
): boolean {
  return (
    base.sourceId === target.sourceId &&
    base.sourceKind === target.sourceKind &&
    base.sourceEnvironment === target.sourceEnvironment &&
    base.lineageIdentity === target.lineageIdentity &&
    base.sourceVersionTime !== undefined &&
    target.sourceVersionTime !== undefined &&
    base.freshnessBoundary !== undefined &&
    target.freshnessBoundary !== undefined &&
    base.expiresAt !== undefined &&
    target.expiresAt !== undefined &&
    Date.parse(target.sourceVersionTime) > Date.parse(base.sourceVersionTime) &&
    Date.parse(target.freshnessBoundary) > Date.parse(base.freshnessBoundary) &&
    Date.parse(target.expiresAt) > Date.parse(base.expiresAt)
  );
}

/** The effective source-document view used by target reporting on comparison runs. */
export function monotonicEvidenceSourceDocuments(
  baseClaims: SnapshotClaimsInspection,
  targetClaims: SnapshotClaimsInspection,
): EvidenceSourceInspection[] {
  const baseDocuments = documentsBySource(baseClaims);
  const targetDocuments = documentsBySource(targetClaims);
  const result = new Map<string, EvidenceSourceInspection>();
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    result.set(
      sourceId,
      targetDocument !== undefined && externalRefreshAccepted(baseDocument, targetDocument)
        ? targetDocument
        : baseDocument,
    );
  }
  for (const [sourceId, targetDocument] of targetDocuments) {
    if (!result.has(sourceId)) result.set(sourceId, targetDocument);
  }
  return [...result.values()].sort((left, right) => {
    const leftId = left.sourceId ?? left.path;
    const rightId = right.sourceId ?? right.path;
    return compareText(leftId, rightId) || compareText(left.path, right.path);
  });
}

function applyEvidenceSourceCoverage(
  evaluation: Evaluation,
  documents: readonly EvidenceSourceInspection[],
): Evaluation {
  const sourceHealth = combineEvidenceHealth(
    ...documents.map((document) => document.health),
  );
  const sourcePartial = documents.some(
    (document) => document.partialCoverage || document.health !== "current",
  );
  return {
    ...evaluation,
    result:
      evaluation.result === "no-actionable-risk" && sourceHealth !== "current"
        ? "advisory"
        : evaluation.result,
    scanStatus:
      evaluation.scanStatus === "partial" || sourcePartial ? "partial" : "complete",
    evidenceHealth: combineEvidenceHealth(evaluation.evidenceHealth, sourceHealth),
  };
}

function strongerClaim(base: EvidenceFact, target: EvidenceFact): EvidenceFact {
  return {
    ...base,
    policyEligible: base.policyEligible || target.policyEligible,
    confidence: base.confidence === "high" || target.confidence === "high" ? "high" : base.confidence,
    evidenceHealth: combineEvidenceHealth(
      base.evidenceHealth ?? "current",
      target.evidenceHealth ?? "current",
    ),
    locations: [...base.locations, ...target.locations].slice(0, 20),
    resolutionTrace: [...base.resolutionTrace, ...target.resolutionTrace],
  };
}

function acceptedRefresh(base: EvidenceFact, target: EvidenceFact): EvidenceFact {
  return {
    ...target,
    policyEligible: base.policyEligible || target.policyEligible,
    confidence: base.confidence === "high" || target.confidence === "high" ? "high" : target.confidence,
    locations: [...base.locations, ...target.locations].slice(0, 20),
    resolutionTrace: [...base.resolutionTrace, ...target.resolutionTrace],
  };
}

function monotonicClaimFacts(
  baseClaims: SnapshotClaimsInspection,
  targetClaims: SnapshotClaimsInspection,
): EvidenceFact[] {
  const baseAssertions = assertionById(baseClaims);
  const targetAssertions = assertionById(targetClaims);
  const baseDocuments = documentsBySource(baseClaims);
  const targetDocuments = documentsBySource(targetClaims);
  const baseById = new Map(baseClaims.facts.map((fact) => [fact.evidenceId, fact]));
  const targetById = new Map(targetClaims.facts.map((fact) => [fact.evidenceId, fact]));
  const result = new Map<string, EvidenceFact>();

  for (const [evidenceId, baseFact] of baseById) {
    const targetFact = targetById.get(evidenceId);
    if (targetFact === undefined || immutableClaimIdentity(baseFact) !== immutableClaimIdentity(targetFact)) {
      result.set(evidenceId, baseFact);
      continue;
    }
    let refreshAccepted = false;
    if (baseFact.origin === "manual-claim") {
      const baseAssertion = baseAssertions.get(evidenceId);
      const targetAssertion = targetAssertions.get(evidenceId);
      refreshAccepted =
        baseAssertion !== undefined &&
        targetAssertion !== undefined &&
        assertionRefreshAccepted(baseAssertion, targetAssertion);
    } else if (baseFact.sourceId !== undefined && targetFact.sourceId === baseFact.sourceId) {
      const baseDocument = baseDocuments.get(baseFact.sourceId);
      const targetDocument = targetDocuments.get(baseFact.sourceId);
      refreshAccepted =
        baseDocument !== undefined &&
        targetDocument !== undefined &&
        externalRefreshAccepted(baseDocument, targetDocument);
    }
    result.set(
      evidenceId,
      refreshAccepted
        ? acceptedRefresh(baseFact, targetFact)
        : strongerClaim(baseFact, targetFact),
    );
  }
  for (const [evidenceId, targetFact] of targetById) {
    if (!result.has(evidenceId) && !baseById.has(evidenceId)) result.set(evidenceId, targetFact);
  }

  // A valid source refresh controls target health for every carried record from that source.
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    if (targetDocument === undefined || !externalRefreshAccepted(baseDocument, targetDocument)) continue;
    for (const [evidenceId, fact] of result) {
      if (fact.sourceId === sourceId) {
        result.set(evidenceId, {
          ...fact,
          evidenceHealth: targetDocument.health,
        });
      }
    }
  }
  return [...result.values()].sort((left, right) => compareText(left.evidenceId, right.evidenceId));
}

function claimChangeDiagnostics(
  base: SnapshotClaimsInspection,
  target: SnapshotClaimsInspection,
): CoverageDiagnostic[] {
  const diagnostics: CoverageDiagnostic[] = [];
  if (!target.policy.valid) {
    diagnostics.push({
      code: "invalid-target-policy",
      message: "The target policy is invalid and excluded from trusted evaluation.",
      path: ".github/ai-model-lifecycle.yml",
      severity: "notice",
    });
  }
  for (const document of target.evidenceDocuments.filter((candidate) => !candidate.valid)) {
    diagnostics.push({
      code: "invalid-target-evidence",
      message: `Target evidence document ${document.path} is invalid and excluded.`,
      path: document.path,
      severity: "notice",
    });
  }
  const targetFacts = new Map(target.facts.map((fact) => [fact.evidenceId, fact]));
  for (const baseFact of base.facts) {
    const targetFact = targetFacts.get(baseFact.evidenceId);
    if (targetFact === undefined) {
      diagnostics.push({
        code: "claim-deletion-ignored",
        message: `Target deletion of claim ${baseFact.evidenceId} cannot weaken this PR evaluation.`,
        ...(baseFact.locations[0]?.path === undefined ? {} : { path: baseFact.locations[0].path }),
        severity: "notice",
      });
    } else if (immutableClaimIdentity(baseFact) !== immutableClaimIdentity(targetFact)) {
      diagnostics.push({
        code: "claim-lineage-mutation-ignored",
        message: `Target mutation of immutable claim lineage ${baseFact.evidenceId} is ignored.`,
        ...(targetFact.locations[0]?.path === undefined ? {} : { path: targetFact.locations[0].path }),
        severity: "notice",
      });
    }
  }
  const baseAssertions = assertionById(base);
  const targetAssertions = assertionById(target);
  for (const [evidenceId, baseAssertion] of baseAssertions) {
    const targetAssertion = targetAssertions.get(evidenceId);
    if (
      targetAssertion !== undefined &&
      !assertionRefreshAccepted(baseAssertion, targetAssertion) &&
      JSON.stringify(baseAssertion) !== JSON.stringify(targetAssertion)
    ) {
      diagnostics.push({
        code: "assertion-refresh-rejected",
        message: `Same-ID assertion refresh ${evidenceId} is not strictly later or changes immutable lineage.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "notice",
      });
    }
  }
  const baseDocuments = documentsBySource(base);
  const targetDocuments = documentsBySource(target);
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    if (targetDocument === undefined) {
      diagnostics.push({
        code: "evidence-source-deletion-ignored",
        message: `Target deletion of evidence source ${sourceId} cannot weaken this PR evaluation.`,
        path: baseDocument.path,
        severity: "notice",
      });
    } else if (
      targetDocument !== undefined &&
      baseDocument.digest !== targetDocument.digest &&
      !externalRefreshAccepted(baseDocument, targetDocument)
    ) {
      diagnostics.push({
        code: "evidence-refresh-rejected",
        message: `Same-ID evidence-source refresh ${sourceId} is not strictly later or changes immutable lineage.`,
        path: targetDocument.path,
        severity: "notice",
      });
    }
  }
  return diagnostics;
}

function mergeFindings(
  left: readonly LifecycleFinding[],
  right: readonly LifecycleFinding[],
): LifecycleFinding[] {
  const result = new Map<string, LifecycleFinding>();
  for (const source of [left, right]) {
    for (const finding of source) {
      const existing = result.get(finding.semanticKey);
      if (existing === undefined) {
        result.set(finding.semanticKey, { ...finding });
      } else if (compareOutcome(finding.outcome, existing.outcome) > 0) {
        result.set(finding.semanticKey, {
          ...finding,
          evidenceIds: [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText),
          locations: [...existing.locations, ...finding.locations].slice(0, 20),
        });
      } else {
        existing.evidenceIds = [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText);
        existing.locations = [...existing.locations, ...finding.locations].slice(0, 20);
      }
    }
  }
  return [...result.values()].sort((a, b) => compareText(a.semanticKey, b.semanticKey));
}

/**
 * Drop structurally-identical repeats while keeping first-occurrence order. The
 * monotonic target evaluation is seeded with the base-policy evaluation's
 * diagnostics, so a plain concatenation would report every target diagnostic twice.
 */
function dedupeDiagnostics(
  diagnostics: readonly CoverageDiagnostic[],
): CoverageDiagnostic[] {
  const seen = new Set<string>();
  const result: CoverageDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.message,
      diagnostic.path ?? null,
      diagnostic.severity,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function mergeEvaluations(left: Evaluation, right: Evaluation): Evaluation {
  const findings = mergeFindings(left.findings, right.findings);
  const evidence = new Map([...left.evidence, ...right.evidence].map((fact) => [fact.evidenceId, fact]));
  const unresolved = new Map(
    [...left.unresolved, ...right.unresolved].map((fact) => [fact.evidenceId, fact]),
  );
  return {
    result: strongerResult(
      resultFromFindings(findings),
      strongerResult(left.result, right.result),
    ),
    scanStatus: combineScanStatus(left.scanStatus, right.scanStatus) as "complete" | "partial",
    evidence: [...evidence.values()].sort((a, b) => compareText(a.evidenceId, b.evidenceId)),
    findings,
    unresolved: [...unresolved.values()].sort((a, b) => compareText(a.evidenceId, b.evidenceId)),
    diagnostics: dedupeDiagnostics([...left.diagnostics, ...right.diagnostics]),
    evidenceHealth: combineEvidenceHealth(left.evidenceHealth, right.evidenceHealth),
  };
}

function isClaimFreshnessDiagnostic(diagnostic: CoverageDiagnostic): boolean {
  return (
    diagnostic.code === "assertion-review-overdue" ||
    diagnostic.code === "assertion-expired" ||
    diagnostic.code === "evidence-source-review-overdue" ||
    diagnostic.code === "evidence-source-stale" ||
    diagnostic.code === "evidence-source-expired"
  );
}

function baseExtractionIsPartial(
  detection: DetectionResult,
  claims: SnapshotClaimsInspection,
): boolean {
  return (
    detection.scanStatus === "partial" ||
    claims.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "partial" && !isClaimFreshnessDiagnostic(diagnostic),
    )
  );
}

function addDelta(
  baseline: Evaluation,
  target: Evaluation,
  comparisonPartial: boolean,
): { findings: LifecycleFinding[]; result: Exclude<Result, "unknown"> } {
  const baseByKey = new Map(baseline.findings.map((finding) => [finding.semanticKey, finding]));
  const targetByKey = new Map(target.findings.map((finding) => [finding.semanticKey, finding]));
  const findings: LifecycleFinding[] = [];
  for (const finding of target.findings) {
    const base = baseByKey.get(finding.semanticKey);
    let delta: LifecycleFinding["delta"];
    if (base === undefined) delta = comparisonPartial ? "comparison-unknown" : "new";
    else if (compareOutcome(finding.outcome, base.outcome) > 0) delta = "worsened";
    else delta = "unchanged";
    const copy = { ...finding, delta };
    if (delta === "comparison-unknown" && copy.outcome === "breach") {
      copy.outcome = "warning";
      copy.reasons = [
        ...copy.reasons,
        "Base extraction coverage is partial; this target fact cannot be classified as a new blocker.",
      ];
    }
    findings.push(copy);
  }
  for (const base of baseline.findings) {
    if (!targetByKey.has(base.semanticKey)) {
      findings.push({
        ...base,
        outcome: "none",
        delta: "resolved",
        reasons: [...base.reasons, "The ordinary repository evidence is absent from the target."],
      });
    }
  }
  const actionableDelta = findings.filter(
    (finding) =>
      finding.delta === "new" ||
      finding.delta === "worsened" ||
      finding.delta === "comparison-unknown",
  );
  let result = resultFromFindings(actionableDelta);
  if (compareResult(target.result, baseline.result) > 0) {
    const increasedResult =
      comparisonPartial && target.result === "blocking" ? "advisory" : target.result;
    result = strongerResult(result, increasedResult);
  }
  return { findings, result };
}

export function evaluateComparison(input: {
  baseDetection: DetectionResult;
  targetDetection: DetectionResult;
  baseClaims: SnapshotClaimsInspection;
  targetClaims: SnapshotClaimsInspection;
  feed: V3FeedIndex;
  inputs: ActionInputs;
  now: number;
}): ComparisonEvaluation {
  const trustedBasePolicy = input.baseClaims.policy.policy;
  const proposedTargetPolicy = applyTrustedInputs(
    input.targetClaims.policy.valid ? input.targetClaims.policy.policy : defaultPolicy(),
    input.inputs,
  );
  const effectiveTargetPolicy = monotonicPolicy(trustedBasePolicy, proposedTargetPolicy);
  const claimDiagnostics = claimChangeDiagnostics(input.baseClaims, input.targetClaims);
  const baseEvidence = [...input.baseDetection.evidence, ...input.baseClaims.facts];
  const targetClaims = monotonicClaimFacts(input.baseClaims, input.targetClaims);
  const targetEvidence = [...input.targetDetection.evidence, ...targetClaims];
  const targetTrustedDiagnostics = input.targetClaims.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "failed",
  );
  const baseline = applyEvidenceSourceCoverage(evaluateEvidence({
    evidence: baseEvidence,
    feed: input.feed,
    policy: trustedBasePolicy,
    now: input.now,
    scanStatus: combineScanStatus(
      input.baseDetection.scanStatus,
      input.baseClaims.scanStatus,
    ) as "complete" | "partial",
    diagnostics: [...input.baseDetection.diagnostics, ...input.baseClaims.diagnostics],
  }), [...documentsBySource(input.baseClaims).values()]);
  const effectiveSourceDocuments = monotonicEvidenceSourceDocuments(
    input.baseClaims,
    input.targetClaims,
  );
  const effectiveSourceDiagnostics = effectiveSourceDocuments.flatMap(
    (document) => document.diagnostics,
  ).filter(
    (diagnostic) => !targetTrustedDiagnostics.some(
      (targetDiagnostic) =>
        targetDiagnostic.code === diagnostic.code &&
        targetDiagnostic.path === diagnostic.path &&
        targetDiagnostic.message === diagnostic.message,
    ),
  );
  const targetUnderBase = applyEvidenceSourceCoverage(evaluateEvidence({
    evidence: targetEvidence,
    feed: input.feed,
    policy: trustedBasePolicy,
    now: input.now,
    scanStatus: combineScanStatus(
      input.targetDetection.scanStatus,
      input.targetClaims.scanStatus,
    ) as "complete" | "partial",
    diagnostics: [
      ...input.targetDetection.diagnostics,
      ...targetTrustedDiagnostics,
      ...effectiveSourceDiagnostics,
    ],
  }), effectiveSourceDocuments);
  // When the monotonic policy is structurally identical to the trusted base policy
  // (the common case: no target policy change), re-evaluating the same evidence under
  // it is a no-op; reuse the base-policy evaluation instead.
  const policyDomain = "ai-model-eol/comparison-policy-identity/v3";
  const targetUnderMonotonic =
    canonicalSha256(policyDomain, effectiveTargetPolicy) ===
      canonicalSha256(policyDomain, trustedBasePolicy)
      ? targetUnderBase
      : applyEvidenceSourceCoverage(evaluateEvidence({
        evidence: targetEvidence,
        feed: input.feed,
        policy: effectiveTargetPolicy,
        now: input.now,
        scanStatus: targetUnderBase.scanStatus,
        diagnostics: targetUnderBase.diagnostics,
      }), effectiveSourceDocuments);
  const target = mergeEvaluations(targetUnderBase, targetUnderMonotonic);
  // Base freshness debt does not hide base facts. If a valid target refresh restores
  // those facts to current health, it must not make comparison or run coverage partial.
  // Base extraction blind spots still make every potentially new target blocker
  // comparison-unknown.
  const comparisonPartial =
    baseExtractionIsPartial(input.baseDetection, input.baseClaims) ||
    target.scanStatus === "partial";
  const delta = addDelta(baseline, target, comparisonPartial);
  const policyChanges = policyDiff(input.baseClaims.policy, input.targetClaims.policy, input.inputs);
  const baseSuppressions = new Set(
    trustedBasePolicy.suppressions.map((suppression) => JSON.stringify(suppression)),
  );
  const proposedSuppression = proposedTargetPolicy.suppressions.some(
    (suppression) => !baseSuppressions.has(JSON.stringify(suppression)),
  );
  // An undeclared platform set matches every platform, so declaring one — or
  // dropping a platform the base declared — proposes narrower lifecycle matching.
  const proposedPlatformNarrowing =
    proposedTargetPolicy.servingPlatforms.length > 0 &&
    (trustedBasePolicy.servingPlatforms.length === 0 ||
      !trustedBasePolicy.servingPlatforms.every((servingPlatform) =>
        proposedTargetPolicy.servingPlatforms.includes(servingPlatform),
      ));
  const attemptedWeakening =
    proposedTargetPolicy.warnWithinDays < trustedBasePolicy.warnWithinDays ||
    (trustedBasePolicy.failWithinDays !== null &&
      (proposedTargetPolicy.failWithinDays === null ||
        proposedTargetPolicy.failWithinDays < trustedBasePolicy.failWithinDays)) ||
    (!trustedBasePolicy.allowPartial && proposedTargetPolicy.allowPartial) ||
    proposedSuppression ||
    proposedPlatformNarrowing;
  let result = delta.result;
  if (
    result === "no-actionable-risk" &&
    (claimDiagnostics.length > 0 || attemptedWeakening)
  ) {
    result = "advisory";
  }
  const evaluation: Evaluation = {
    ...target,
    result,
    findings: delta.findings,
    diagnostics: [...target.diagnostics, ...claimDiagnostics],
  };
  return {
    result,
    baselineResult: baseline.result,
    targetResult: target.result,
    scanStatus: comparisonPartial ? "partial" : "complete",
    baselineScanStatus: baseline.scanStatus,
    targetScanStatus: target.scanStatus,
    comparisonStatus: comparisonPartial ? "partial" : "available",
    evaluation,
    baseline,
    policy: effectiveTargetPolicy,
    policyDiff: [
      ...policyChanges,
      ...(attemptedWeakening ? ["A target policy weakening was ignored for this comparison."] : []),
      ...claimDiagnostics.map((diagnostic) => diagnostic.message),
    ],
  };
}
