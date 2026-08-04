import { createHash } from "node:crypto";
import type {
  AssessmentCounts,
  AssessmentReport,
  EvidenceFact,
  EvidenceHealth,
  EvidenceScope,
  ExitReason,
  LifecycleFinding,
  ModelResolution,
  PolicyOutcome,
  Result,
  ScanStatus,
} from "./types.ts";

const RESULT_RANK: Readonly<Record<Exclude<Result, "unknown">, number>> = {
  "no-actionable-risk": 0,
  advisory: 1,
  blocking: 2,
};

const OUTCOME_RANK: Readonly<Record<PolicyOutcome, number>> = {
  none: 0,
  notice: 1,
  warning: 2,
  breach: 3,
};

const SCAN_RANK: Readonly<Record<ScanStatus, number>> = {
  complete: 0,
  partial: 1,
  failed: 2,
};

const HEALTH_RANK: Readonly<Record<EvidenceHealth, number>> = {
  current: 0,
  "review-overdue": 1,
  stale: 2,
  expired: 3,
  invalid: 4,
};

const EXIT_RANK: Readonly<Record<ExitReason, number>> = {
  none: 0,
  "notification-failed": 1,
  "partial-disallowed": 2,
  "policy-breach": 3,
  "trusted-base-unavailable": 4,
  "assessment-failed": 5,
};

export function strongerResult(
  left: Exclude<Result, "unknown">,
  right: Exclude<Result, "unknown">,
): Exclude<Result, "unknown"> {
  return RESULT_RANK[left] >= RESULT_RANK[right] ? left : right;
}

export function compareResult(
  left: Exclude<Result, "unknown">,
  right: Exclude<Result, "unknown">,
): number {
  return RESULT_RANK[left] - RESULT_RANK[right];
}

export function strongerOutcome(left: PolicyOutcome, right: PolicyOutcome): PolicyOutcome {
  return OUTCOME_RANK[left] >= OUTCOME_RANK[right] ? left : right;
}

export function compareOutcome(left: PolicyOutcome, right: PolicyOutcome): number {
  return OUTCOME_RANK[left] - OUTCOME_RANK[right];
}

export function combineScanStatus(...statuses: readonly ScanStatus[]): ScanStatus {
  let result: ScanStatus = "complete";
  for (const status of statuses) {
    if (SCAN_RANK[status] > SCAN_RANK[result]) result = status;
  }
  return result;
}

export function combineEvidenceHealth(
  ...statuses: readonly EvidenceHealth[]
): EvidenceHealth {
  let result: EvidenceHealth = "current";
  for (const status of statuses) {
    if (HEALTH_RANK[status] > HEALTH_RANK[result]) result = status;
  }
  return result;
}

export function chooseExitReason(...reasons: readonly ExitReason[]): ExitReason {
  let result: ExitReason = "none";
  for (const reason of reasons) {
    if (EXIT_RANK[reason] > EXIT_RANK[result]) result = reason;
  }
  return result;
}

/**
 * Distance to the earliest published lifecycle transition, which is what the warning
 * horizon measures. Some providers stop serving at the deprecation date rather than at
 * the shutdown date, so a nearer deprecation opens the horizon early. A record with no
 * published shutdown date has no measurable end and stays inside the horizon at any
 * distance, which keeps undated deprecations advisory.
 */
export function daysUntilEarliestLifecycleDate(
  daysUntilShutdown: number | null,
  daysUntilDeprecation: number | null | undefined,
): number | null {
  if (daysUntilShutdown === null) return null;
  return daysUntilDeprecation === null || daysUntilDeprecation === undefined
    ? daysUntilShutdown
    : Math.min(daysUntilDeprecation, daysUntilShutdown);
}

export function earliestLifecycleDays(
  finding: Pick<LifecycleFinding, "daysUntilShutdown" | "daysUntilDeprecation">,
): number | null {
  return daysUntilEarliestLifecycleDate(
    finding.daysUntilShutdown,
    finding.daysUntilDeprecation,
  );
}

/**
 * Whether the deprecation is the date the horizon measured. Human-facing surfaces name
 * that date, because a warning reported only against a distant shutdown reads as noise.
 */
export function deprecationLeadsHorizon(
  finding: Pick<
    LifecycleFinding,
    "deprecationDate" | "daysUntilShutdown" | "daysUntilDeprecation"
  >,
): boolean {
  if (finding.deprecationDate === undefined) return false;
  return (
    finding.daysUntilShutdown === null ||
    (finding.daysUntilDeprecation ?? 0) < finding.daysUntilShutdown
  );
}

export function resultFromFindings(
  findings: readonly Pick<LifecycleFinding, "outcome">[],
): Exclude<Result, "unknown"> {
  let result: Exclude<Result, "unknown"> = "no-actionable-risk";
  for (const finding of findings) {
    if (finding.outcome === "breach") result = strongerResult(result, "blocking");
    else if (finding.outcome === "warning") result = strongerResult(result, "advisory");
  }
  return result;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort(compareText)) {
    result[key] = canonicalize(source[key]);
  }
  return result;
}

export function canonicalSha256(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify([domain, canonicalize(value)]), "utf8")
    .digest("hex");
}

export function findingFingerprint(
  finding: Pick<
    LifecycleFinding,
    "modelId" | "servingPlatform" | "lifecycleStatus" | "shutdownDate" | "outcome"
  >,
): string {
  // Hash exactly the picked identity fields. Callers pass full findings, and the
  // fingerprint must not move with volatile fields such as daysUntilShutdown.
  return canonicalSha256("ai-model-eol/finding/v3", {
    modelId: finding.modelId,
    servingPlatform: finding.servingPlatform,
    lifecycleStatus: finding.lifecycleStatus,
    shutdownDate: finding.shutdownDate ?? null,
    outcome: finding.outcome,
  });
}

const SCOPES: readonly EvidenceScope[] = [
  "application",
  "deployment",
  "test",
  "example",
  "documentation",
  "unknown",
];
const RESOLUTIONS: readonly ModelResolution[] = ["resolved", "dynamic", "unresolved"];

export function buildCounts(
  evidence: readonly EvidenceFact[],
  findings: readonly LifecycleFinding[],
  unresolved: readonly EvidenceFact[],
): AssessmentCounts {
  const byScope = Object.fromEntries(SCOPES.map((scope) => [scope, 0])) as Record<
    EvidenceScope,
    number
  >;
  const byResolution = Object.fromEntries(
    RESOLUTIONS.map((resolution) => [resolution, 0]),
  ) as Record<ModelResolution, number>;
  for (const fact of evidence) {
    byScope[fact.scope] += 1;
    byResolution[fact.modelResolution] += 1;
  }
  return {
    evidence: evidence.length,
    findings: findings.length,
    blocking: findings.filter((finding) => finding.outcome === "breach").length,
    advisory: findings.filter((finding) => finding.outcome === "warning").length,
    notices: findings.filter((finding) => finding.outcome === "notice").length,
    unresolved: unresolved.length,
    byScope,
    byResolution,
  };
}

export function scanFingerprint(report: Pick<AssessmentReport, "event" | "scanStatus" | "diagnostics" | "evidenceFacts">): string {
  return canonicalSha256("ai-model-eol/scan/v3", {
    event: report.event,
    scanStatus: report.scanStatus,
    diagnostics: report.diagnostics,
    evidenceIds: report.evidenceFacts.map((fact) => fact.evidenceId).sort(compareText),
  });
}

export function alertFingerprint(findings: readonly LifecycleFinding[]): string {
  const actionableFindingFingerprints = new Set(
    findings
      .filter((finding) => finding.outcome === "breach" || finding.outcome === "warning")
      .map(findingFingerprint),
  );
  return canonicalSha256(
    "ai-model-eol/alert/v3",
    [...actionableFindingFingerprints].sort(compareText),
  );
}
