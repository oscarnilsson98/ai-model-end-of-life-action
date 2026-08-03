import { describe, expect, test } from "bun:test";
import {
  evaluateComparison,
  monotonicEvidenceSourceDocuments,
} from "../../src/policy/comparison.ts";
import { DETECTOR_MANIFEST_VERSION } from "../../src/detection/manifest.ts";
import { buildV3FeedIndex } from "../../src/lifecycle/feed.ts";
import { assertionsToEvidence, inspectPolicy } from "../../src/policy/policy.ts";
import type { DetectionResult } from "../../src/detection/detectors.ts";
import type { SnapshotClaimsInspection } from "../../src/evidence/snapshot-claims.ts";
import type { EvidenceFact, EvidenceHealth } from "../../src/shared/types.ts";

const NOW = Date.parse("2026-08-02T00:00:00Z");
const feed = buildV3FeedIndex({
  schemaVersion: 3,
  adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
  generatedAt: "2026-08-02T00:00:00Z",
  records: [
    {
      recordId: "old",
      servingPlatform: "openai",
      primarySourceUrl: "https://example.com",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "gpt-old",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-08-20",
      replacementModels: [],
    },
  ],
});

function evidence(id: string): EvidenceFact {
  return {
    evidenceId: id,
    origin: "repository",
    kind: "sdk-argument",
    confidence: "high",
    scope: "application",
    environment: "production",
    detectorRuleId: "source.ts.openai.request-model@1",
    detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
    rawValue: "gpt-old",
    modelId: "gpt-old",
    servingPlatform: "openai",
    modelResolution: "resolved",
    selectorKind: "model-id",
    platformResolution: "resolved",
    policyEligible: true,
    locations: [{ path: "src/chat.ts", line: 1, column: 1 }],
    resolutionTrace: [],
  };
}

function dynamicEvidence(id: string): EvidenceFact {
  const fact: EvidenceFact = {
    ...evidence(id),
    rawValue: "MODEL_NAME",
    modelResolution: "dynamic",
    selectorKind: "dynamic",
    policyEligible: false,
  };
  delete fact.modelId;
  return fact;
}

function detection(facts: EvidenceFact[]): DetectionResult {
  return { evidence: facts, diagnostics: [], scanStatus: "complete" };
}

function claims(policyText?: string): SnapshotClaimsInspection {
  return {
    policy: policyText === undefined ? inspectPolicy(undefined) : inspectPolicy(policyText),
    evidenceDocuments: [],
    facts: [],
    diagnostics: [],
    evidenceHealth: "current",
    scanStatus: "complete",
    invalid: false,
  };
}

function assertionClaims(options: {
  reviewedAt: string;
  reviewAfter: string;
  expiresAt: string;
}): SnapshotClaimsInspection {
  const policy = inspectPolicy(`schemaVersion: 1
policy:
  failWithinDays: 30
assertions:
  - evidenceId: remote-prod-chat
    modelId: gpt-old
    servingPlatform: openai
    scope: application
    environment: production
    policyEligible: true
    reason: Production routing claim
    provenance: Reviewed routing configuration
    assertedAt: 2026-01-01T00:00:00Z
    reviewedAt: ${options.reviewedAt}
    reviewAfter: ${options.reviewAfter}
    expiresAt: ${options.expiresAt}
`);
  if (!policy.valid) throw new Error(policy.diagnostics[0]?.message ?? "invalid fixture");
  const assertion = assertionsToEvidence(policy.policy.assertions, NOW);
  return {
    policy,
    evidenceDocuments: [],
    facts: assertion.facts,
    diagnostics: assertion.diagnostics,
    evidenceHealth: assertion.health,
    scanStatus: assertion.health === "current" ? "complete" : "partial",
    invalid: false,
  };
}

function sourceClaims(options: {
  sourceVersionTime: string;
  freshnessBoundary: string;
  expiresAt: string;
  health?: EvidenceHealth;
  digest?: string;
}): SnapshotClaimsInspection {
  const health = options.health ?? "current";
  const diagnostics = health === "current"
    ? []
    : [{
        code: `evidence-source-${health}`,
        message: `Evidence source is ${health}.`,
        path: ".github/ai-model-evidence/prod.json",
        severity: "partial" as const,
      }];
  return {
    policy: inspectPolicy(undefined),
    evidenceDocuments: [
      {
        path: ".github/ai-model-evidence/prod.json",
        digest: options.digest ?? options.sourceVersionTime,
        sourceId: "prod-gateway",
        sourceKind: "runtime-observation",
        sourceEnvironment: "production",
        lineageIdentity: "prod-gateway/runtime-observation/production",
        sourceVersionTime: options.sourceVersionTime,
        freshnessBoundary: options.freshnessBoundary,
        expiresAt: options.expiresAt,
        rawEvidenceIds: [],
        present: true,
        valid: true,
        health,
        partialCoverage: false,
        facts: [],
        diagnostics,
      },
    ],
    facts: [],
    diagnostics,
    evidenceHealth: health,
    scanStatus: health === "current" ? "complete" : "partial",
    invalid: false,
  };
}

const noInputs = {
  warnWithinDays: null,
  failWithinDays: null,
  allowPartial: null,
  notificationFailureMode: "fail" as const,
};

describe("monotonic PR evaluation", () => {
  test("does not fail an unrelated PR for unchanged base debt", () => {
    const policy = `schemaVersion: 1\npolicy:\n  failWithinDays: 30\n`;
    const result = evaluateComparison({
      baseDetection: detection([evidence("same")]),
      targetDetection: detection([evidence("same")]),
      baseClaims: claims(policy),
      targetClaims: claims(policy),
      feed,
      inputs: noInputs,
      now: NOW,
    });
    expect(result.baselineResult).toBe("blocking");
    expect(result.targetResult).toBe("blocking");
    expect(result.result).toBe("no-actionable-risk");
  });

  test("blocks a genuinely new definite target finding", () => {
    const policy = `schemaVersion: 1\npolicy:\n  failWithinDays: 30\n`;
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([evidence("new")]),
      baseClaims: claims(policy),
      targetClaims: claims(policy),
      feed,
      inputs: noInputs,
      now: NOW,
    });
    expect(result.result).toBe("blocking");
  });

  test("ignores a head attempt to remove enforcement", () => {
    const basePolicy = `schemaVersion: 1\npolicy:\n  failWithinDays: 30\n`;
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([evidence("new")]),
      baseClaims: claims(basePolicy),
      targetClaims: claims(`schemaVersion: 1\n`),
      feed,
      inputs: noInputs,
      now: NOW,
    });
    expect(result.result).toBe("blocking");
    expect(result.policyDiff.join(" ")).toMatch(/weakening/i);
  });

  test("reports a same-count target suppression replacement as a weakening attempt", () => {
    const suppression = (id: string, modelId: string) => `schemaVersion: 1
suppressions:
  - suppressionId: ${id}
    target:
      modelId: ${modelId}
      servingPlatform: openai
      detectorRuleIds: [source.ts.openai.request-model@1]
      paths: [src/**]
    reason: Reviewed exception
    createdAt: 2026-08-01T00:00:00Z
    expiresAt: 2026-09-01T00:00:00Z
`;
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([]),
      baseClaims: claims(suppression("base-exception", "gpt-old")),
      targetClaims: claims(suppression("replacement-exception", "another-model")),
      feed,
      inputs: noInputs,
      now: NOW,
    });

    expect(result.result).toBe("advisory");
    expect(result.policy.suppressions.map((entry) => entry.suppressionId)).toEqual([
      "base-exception",
    ]);
    expect(result.policyDiff.join(" ")).toMatch(/weakening/i);
  });

  test("a valid target refresh restores run and comparison coverage", () => {
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([]),
      baseClaims: assertionClaims({
        reviewedAt: "2026-06-01T00:00:00Z",
        reviewAfter: "2026-07-01T00:00:00Z",
        expiresAt: "2026-08-01T00:00:00Z",
      }),
      targetClaims: assertionClaims({
        reviewedAt: "2026-08-01T00:00:00Z",
        reviewAfter: "2026-10-01T00:00:00Z",
        expiresAt: "2027-01-01T00:00:00Z",
      }),
      feed,
      inputs: noInputs,
      now: NOW,
    });

    expect(result.baselineScanStatus).toBe("partial");
    expect(result.targetScanStatus).toBe("complete");
    expect(result.comparisonStatus).toBe("available");
    expect(result.scanStatus).toBe("complete");
    expect(result.result).toBe("blocking");
  });

  test("a new unresolved semantic selector is an advisory delta", () => {
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([dynamicEvidence("new-dynamic")]),
      baseClaims: claims(),
      targetClaims: claims(),
      feed,
      inputs: noInputs,
      now: NOW,
    });

    expect(result.targetResult).toBe("advisory");
    expect(result.result).toBe("advisory");
  });

  test("a head resolution cannot erase the base-policy advisory view", () => {
    const targetPolicy = `schemaVersion: 1
resolutions:
  - resolutionId: resolve-dynamic-safely
    match:
      detectorRuleId: source.ts.openai.request-model@1
      rawValue: MODEL_NAME
      paths:
        - src/**
    resolveTo:
      modelId: model-with-no-feed-record
      servingPlatform: openai
    reason: Proposed target-only mapping
    reviewedAt: 2026-08-01T00:00:00Z
    reviewAfter: 2026-10-01T00:00:00Z
    expiresAt: 2027-01-01T00:00:00Z
`;
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([dynamicEvidence("new-dynamic")]),
      baseClaims: claims(),
      targetClaims: claims(targetPolicy),
      feed,
      inputs: noInputs,
      now: NOW,
    });

    expect(result.targetResult).toBe("advisory");
    expect(result.result).toBe("advisory");
  });

  test("deleting a valid zero-record base source is an advisory weakening", () => {
    const baseClaims = sourceClaims({
      sourceVersionTime: "2026-08-01T00:00:00Z",
      freshnessBoundary: "2026-09-01T00:00:00Z",
      expiresAt: "2026-10-01T00:00:00Z",
    });
    const result = evaluateComparison({
      baseDetection: detection([]),
      targetDetection: detection([]),
      baseClaims,
      targetClaims: claims(),
      feed,
      inputs: noInputs,
      now: NOW,
    });

    expect(result.result).toBe("advisory");
    expect(result.evaluation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "evidence-source-deletion-ignored",
        path: ".github/ai-model-evidence/prod.json",
      }),
    );
    expect(result.policyDiff.join(" ")).toMatch(/deletion of evidence source prod-gateway/i);
  });

  test("effective source reporting accepts only a strictly later valid refresh", () => {
    const baseClaims = sourceClaims({
      sourceVersionTime: "2026-06-01T00:00:00Z",
      freshnessBoundary: "2026-07-01T00:00:00Z",
      expiresAt: "2026-09-01T00:00:00Z",
      health: "stale",
      digest: "base",
    });
    const refreshed = sourceClaims({
      sourceVersionTime: "2026-08-01T00:00:00Z",
      freshnessBoundary: "2026-10-01T00:00:00Z",
      expiresAt: "2027-01-01T00:00:00Z",
      health: "current",
      digest: "target",
    });
    expect(monotonicEvidenceSourceDocuments(baseClaims, refreshed)).toMatchObject([
      { sourceId: "prod-gateway", health: "current", digest: "target" },
    ]);
    expect(monotonicEvidenceSourceDocuments(baseClaims, claims())).toMatchObject([
      { sourceId: "prod-gateway", health: "stale", digest: "base" },
    ]);
  });
});
