import { describe, expect, test } from "bun:test";
import { inspectEvidenceDocument } from "../../src/evidence/external-evidence.ts";

const NOW = Date.parse("2026-08-02T08:00:00Z");

describe("v3 external evidence", () => {
  test("treats runtime evidence as a freshness-bounded repository claim", () => {
    const document = {
      schemaVersion: 1,
      source: {
        id: "prod-gateway",
        kind: "runtime-observation",
        claimBasis: "repository-supplied",
        environment: "production",
        policyEligible: true,
        provenance: "weekly export",
        generatedAt: "2026-08-02T07:05:00Z",
        observedFrom: "2026-07-26T07:00:00Z",
        observedThrough: "2026-08-02T07:00:00Z",
        freshUntil: "2026-08-09T07:05:00Z",
        expiresAt: "2026-08-30T07:05:00Z",
        snapshotSemantics: "observations-only",
      },
      records: [
        {
          evidenceId: "prod-gateway/gpt",
          modelId: "gpt-old",
          servingPlatform: "openai",
          scope: "application",
          environment: "production",
          reason: "observed routed request",
          firstObservedAt: "2026-07-27T12:14:08Z",
          lastObservedAt: "2026-08-02T06:51:20Z",
          observationCount: 42,
        },
      ],
    };
    const inspected = inspectEvidenceDocument(
      ".github/ai-model-evidence/prod.json",
      Buffer.from(JSON.stringify(document)),
      NOW,
    );
    expect(inspected.valid).toBe(true);
    expect(inspected.health).toBe("current");
    expect(inspected.facts[0]).toMatchObject({
      policyEligible: true,
      modelId: "gpt-old",
      servingPlatform: "openai",
    });
  });

  test("retains expired evidence but makes coverage partial", () => {
    const document = {
      schemaVersion: 1,
      source: {
        id: "generated",
        kind: "generated-declaration",
        claimBasis: "repository-supplied",
        environment: "production",
        provenance: "generator output",
        generatedAt: "2026-01-01T00:00:00Z",
        reviewAfter: "2026-02-01T00:00:00Z",
        expiresAt: "2026-03-01T00:00:00Z",
        generator: "runtime-evidence-exporter",
        ruleset: "1",
        reason: "periodic export",
      },
      records: [
        {
          evidenceId: "generated/model",
          modelId: "old-model",
          servingPlatform: "openai",
          scope: "deployment",
          environment: "production",
          reason: "generated declaration",
        },
      ],
    };
    const inspected = inspectEvidenceDocument(
      ".github/ai-model-evidence/generated.json",
      Buffer.from(JSON.stringify(document)),
      NOW,
    );
    expect(inspected.health).toBe("expired");
    expect(inspected.facts[0]?.policyEligible).toBe(false);
    expect(inspected.diagnostics[0]?.severity).toBe("partial");
  });

  test("rejects non-canonical whitespace and measures string limits in Unicode code points", () => {
    const document = {
      schemaVersion: 1,
      source: {
        id: "generated",
        kind: "generated-declaration",
        claimBasis: "repository-supplied",
        environment: "production",
        provenance: "generator output",
        generatedAt: "2026-08-01T00:00:00Z",
        reviewAfter: "2026-08-09T00:00:00Z",
        expiresAt: "2026-09-01T00:00:00Z",
        generator: "evidence-exporter",
        ruleset: "1",
        reason: "periodic export",
      },
      records: [
        {
          evidenceId: "generated/model",
          modelId: "model-1",
          servingPlatform: "openai",
          scope: "deployment",
          environment: "production",
          reason: "😀".repeat(4_096),
        },
      ],
    };

    const canonical = inspectEvidenceDocument(
      ".github/ai-model-evidence/generated.json",
      Buffer.from(JSON.stringify(document)),
      NOW,
    );
    expect(canonical.valid).toBe(true);

    document.source.provenance = " generator output ";
    const padded = inspectEvidenceDocument(
      ".github/ai-model-evidence/generated.json",
      Buffer.from(JSON.stringify(document)),
      NOW,
    );
    expect(padded.valid).toBe(false);
    expect(padded.diagnostics[0]?.message).toContain("leading or trailing whitespace");

    document.source.provenance = "generator output";
    document.source.generatedAt = "2026-02-30T00:00:00Z";
    const impossibleDate = inspectEvidenceDocument(
      ".github/ai-model-evidence/generated.json",
      Buffer.from(JSON.stringify(document)),
      NOW,
    );
    expect(impossibleDate.valid).toBe(false);
    expect(impossibleDate.diagnostics[0]?.message).toContain("real RFC 3339 UTC instant");
  });
});
