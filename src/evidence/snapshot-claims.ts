import { canonicalSha256, combineEvidenceHealth } from "../shared/status.ts";
import {
  DEFAULT_EVIDENCE_PREFIX,
  inspectEvidenceDocument,
} from "./external-evidence.ts";
import type { GitTreeSnapshot, GitTreeSnapshotEntry } from "../repository/git.ts";
import {
  assertionsToEvidence,
  defaultPolicy,
  inspectPolicy,
  matchRepositoryPattern,
  POLICY_PATH,
} from "../policy/policy.ts";
import type {
  CoverageDiagnostic,
  EvidenceFact,
  EvidenceHealth,
  EvidenceSourceInspection,
  PolicyInspection,
} from "../shared/types.ts";

export type SnapshotClaimsInspection = {
  policy: PolicyInspection;
  evidenceDocuments: EvidenceSourceInspection[];
  facts: EvidenceFact[];
  diagnostics: CoverageDiagnostic[];
  evidenceHealth: EvidenceHealth;
  scanStatus: "complete" | "partial";
  invalid: boolean;
};

function utf8Path(entry: GitTreeSnapshotEntry): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(entry.pathBytes);
  } catch {
    return null;
  }
}

function entryMap(snapshot: GitTreeSnapshot): Map<string, GitTreeSnapshotEntry> {
  const result = new Map<string, GitTreeSnapshotEntry>();
  for (const entry of snapshot.entries) {
    const path = utf8Path(entry);
    if (path !== null) result.set(path, entry);
  }
  return result;
}

function unavailablePolicy(message: string, digestSeed: unknown): PolicyInspection {
  return {
    policy: defaultPolicy(),
    present: true,
    valid: false,
    digest: canonicalSha256("ai-model-eol/policy-document/v3", digestSeed),
    diagnostics: [
      { code: "invalid-policy", message, path: POLICY_PATH, severity: "failed" },
    ],
    rawAssertionIds: [],
  };
}

export function inspectSnapshotPolicy(snapshot: GitTreeSnapshot): PolicyInspection {
  const entry = entryMap(snapshot).get(POLICY_PATH);
  if (entry === undefined) return inspectPolicy(undefined);
  if (
    (entry.kind !== "regular" && entry.kind !== "executable") ||
    entry.content.state !== "available"
  ) {
    return unavailablePolicy(
      "The checked-in policy must be an available regular Git blob.",
      [entry.objectId, entry.content.state],
    );
  }
  try {
    return inspectPolicy(new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes));
  } catch {
    return unavailablePolicy("The checked-in policy must be valid UTF-8.", entry.objectId);
  }
}

function invalidEvidence(path: string, entry: GitTreeSnapshotEntry, message: string): EvidenceSourceInspection {
  return {
    path,
    digest: canonicalSha256("ai-model-eol/external-evidence-document/v3", [
      entry.objectId,
      entry.content.state,
    ]),
    rawEvidenceIds: [],
    present: true,
    valid: false,
    health: "invalid",
    partialCoverage: false,
    facts: [],
    diagnostics: [
      { code: "invalid-evidence-document", message, path, severity: "failed" },
    ],
  };
}

function isDefaultEvidencePath(path: string): boolean {
  return (
    path.startsWith(DEFAULT_EVIDENCE_PREFIX) &&
    path.length > DEFAULT_EVIDENCE_PREFIX.length &&
    path.endsWith(".json")
  );
}

export function inspectSnapshotClaims(options: {
  snapshot: GitTreeSnapshot;
  now: number;
  policy?: PolicyInspection;
  additionalEvidencePatterns?: readonly string[];
}): SnapshotClaimsInspection {
  const policy = options.policy ?? inspectSnapshotPolicy(options.snapshot);
  const entries = entryMap(options.snapshot);
  const configuredPatterns = [
    ...new Set([
      ...policy.policy.usageEvidenceFiles,
      ...(options.additionalEvidencePatterns ?? []),
    ]),
  ].sort();
  const candidatePaths = [...entries.keys()]
    .filter(
      (path) =>
        isDefaultEvidencePath(path) ||
        configuredPatterns.some((pattern) => matchRepositoryPattern(pattern, path)),
    )
    .sort();
  const evidenceDocuments = candidatePaths.map((path): EvidenceSourceInspection => {
    const entry = entries.get(path);
    if (entry === undefined) throw new Error("Evidence path disappeared during inspection.");
    if (
      (entry.kind !== "regular" && entry.kind !== "executable") ||
      entry.content.state !== "available"
    ) {
      return invalidEvidence(
        path,
        entry,
        "A configured evidence document must be an available regular Git blob.",
      );
    }
    return inspectEvidenceDocument(path, entry.content.bytes, options.now);
  });
  const diagnostics: CoverageDiagnostic[] = [];
  let scanStatus: "complete" | "partial" = "complete";
  for (const pattern of configuredPatterns) {
    if (!candidatePaths.some((path) => matchRepositoryPattern(pattern, path))) {
      scanStatus = "partial";
      diagnostics.push({
        code: "configured-evidence-missing",
        message: `Configured evidence pattern ${pattern} matched no tracked document.`,
        path: POLICY_PATH,
        severity: "partial",
      });
    }
  }
  const assertionInspection = assertionsToEvidence(policy.policy.assertions, options.now);
  diagnostics.push(...assertionInspection.diagnostics);
  if (assertionInspection.diagnostics.some((diagnostic) => diagnostic.severity === "partial")) {
    scanStatus = "partial";
  }
  for (const document of evidenceDocuments) {
    diagnostics.push(...document.diagnostics);
    if (
      document.valid &&
      (document.partialCoverage || document.health !== "current")
    ) {
      scanStatus = "partial";
    }
  }

  const validDocuments = evidenceDocuments.filter((document) => document.valid);
  const sourceIds = validDocuments
    .map((document) => document.sourceId)
    .filter((sourceId): sourceId is string => sourceId !== undefined);
  let invalid = !policy.valid || evidenceDocuments.some((document) => !document.valid);
  const sourceIdCounts = new Map<string, number>();
  for (const sourceId of sourceIds) {
    sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) ?? 0) + 1);
  }
  if ([...sourceIdCounts.values()].some((count) => count > 1)) {
    invalid = true;
    diagnostics.push({
      code: "duplicate-evidence-source-id",
      message: "Evidence source IDs must be unique in one Git tree.",
      severity: "failed",
    });
  }
  const uniqueSourceDocuments = validDocuments.filter(
    (document) =>
      document.sourceId === undefined || (sourceIdCounts.get(document.sourceId) ?? 0) === 1,
  );
  const allFacts = [
    ...assertionInspection.facts,
    ...uniqueSourceDocuments.flatMap((document) => document.facts),
  ];
  const evidenceIdCounts = new Map<string, number>();
  for (const fact of allFacts) {
    evidenceIdCounts.set(fact.evidenceId, (evidenceIdCounts.get(fact.evidenceId) ?? 0) + 1);
  }
  if ([...evidenceIdCounts.values()].some((count) => count > 1)) {
    invalid = true;
    diagnostics.push({
      code: "duplicate-evidence-id",
      message: "User-supplied evidence IDs must be globally unique in one Git tree.",
      severity: "failed",
    });
  }
  const facts = allFacts.filter((fact) => (evidenceIdCounts.get(fact.evidenceId) ?? 0) === 1);
  const evidenceHealth = combineEvidenceHealth(
    assertionInspection.health,
    ...validDocuments.map((document) => document.health),
  );
  return {
    policy,
    evidenceDocuments,
    facts,
    diagnostics,
    evidenceHealth,
    scanStatus,
    invalid,
  };
}
