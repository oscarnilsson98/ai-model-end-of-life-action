import { describe, expect, test } from "bun:test";
import { DETECTOR_MANIFEST_VERSION } from "../../src/detection/manifest.ts";
import { evaluateEvidence } from "../../src/policy/evaluate.ts";
import { buildV3FeedIndex } from "../../src/lifecycle/feed.ts";
import { defaultPolicy } from "../../src/policy/policy.ts";
import type { EvidenceFact } from "../../src/shared/types.ts";

const NOW = Date.parse("2026-08-02T08:00:00Z");
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

const multiPlatformFeed = buildV3FeedIndex({
  schemaVersion: 3,
  adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
  generatedAt: "2026-08-02T00:00:00Z",
  records: [
    {
      recordId: "azure-shared",
      servingPlatform: "azure",
      primarySourceUrl: "https://example.com/azure",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "shared-mini",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-10-16",
      replacementModels: [{ modelId: "azure-next", servingPlatform: "azure" }],
    },
    {
      recordId: "openai-shared",
      servingPlatform: "openai",
      primarySourceUrl: "https://example.com/openai",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "shared-mini",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-10-23",
      replacementModels: [{ modelId: "openai-next", servingPlatform: "openai" }],
    },
    {
      recordId: "google-shared",
      servingPlatform: "google",
      primarySourceUrl: "https://example.com/google",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "shared-mini",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-11-30",
      replacementModels: [],
    },
  ],
});

function lexicalFact(overrides: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    evidenceId: "lexical",
    origin: "repository",
    kind: "lexical",
    confidence: "low",
    scope: "application",
    environment: "unknown",
    detectorRuleId: "fallback.text.lifecycle-id@1",
    detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
    rawValue: "shared-mini",
    modelId: "shared-mini",
    modelResolution: "resolved",
    selectorKind: "model-id",
    platformResolution: "ambiguous",
    policyEligible: false,
    locations: [{ path: "packages/ai-client/src/models.ts", line: 23, column: 10 }],
    resolutionTrace: [],
    ...overrides,
  };
}

function fact(overrides: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    evidenceId: "evidence",
    origin: "repository",
    kind: "sdk-argument",
    confidence: "high",
    scope: "application",
    environment: "unknown",
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
    ...overrides,
  };
}

/** `exactOptionalPropertyTypes` forbids passing an optional key as undefined. */
function factWithout(
  omit: readonly (keyof EvidenceFact)[],
  overrides: Partial<EvidenceFact> = {},
): EvidenceFact {
  const built: Record<string, unknown> = { ...fact(overrides) };
  for (const key of omit) delete built[key];
  return built as EvidenceFact;
}

describe("v3 lifecycle evaluation", () => {
  test("warns for ordinary semantic application evidence", () => {
    const result = evaluateEvidence({
      evidence: [fact()],
      feed,
      policy: defaultPolicy(),
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("advisory");
    expect(result.findings[0]?.outcome).toBe("warning");
  });

  test("blocks only definite production evidence inside enforcement", () => {
    const policy = { ...defaultPolicy(), failWithinDays: 30 };
    const result = evaluateEvidence({
      evidence: [fact({ environment: "production" })],
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("blocking");
  });

  describe("feed-established platform for keyed evidence", () => {
    const enforced = { ...defaultPolicy(), failWithinDays: 30 };
    const keyed = (overrides: Partial<EvidenceFact> = {}) =>
      factWithout(["servingPlatform"], {
        kind: "model-selector-key",
        confidence: "medium",
        detectorRuleId: "source.ts.generic.model-selector@1",
        platformResolution: "ambiguous",
        environment: "production",
        ...overrides,
      });

    test("blocks when the feed publishes the model for exactly one platform", () => {
      const result = evaluateEvidence({
        evidence: [keyed()],
        feed,
        policy: enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result).toBe("blocking");
      expect(result.findings[0]).toMatchObject({
        outcome: "breach",
        servingPlatform: "openai",
      });
    });

    test("stays advisory when the feed spreads the model across platforms", () => {
      // Three platforms publish shared-mini with three different shutdown dates. Nothing
      // establishes which one runs here, so the earliest date warns and cannot fail a job.
      const result = evaluateEvidence({
        evidence: [keyed({ rawValue: "shared-mini", modelId: "shared-mini" })],
        feed: multiPlatformFeed,
        policy: enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result).toBe("advisory");
      expect(result.findings[0]?.outcome).toBe("warning");
    });

    test("keeps an SDK fact with a dynamic endpoint advisory even when feed-unique", () => {
      // An sdk-argument is ambiguous because its client endpoint was dynamic, which usually
      // means a proxy or gateway. Feed uniqueness must not launder that into a block.
      const result = evaluateEvidence({
        evidence: [
          factWithout(["servingPlatform"], {
            environment: "production",
            platformResolution: "ambiguous",
          }),
        ],
        feed,
        policy: enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result).toBe("advisory");
      expect(result.findings[0]?.outcome).toBe("warning");
    });

    test("keeps a keyed literal outside production advisory", () => {
      const result = evaluateEvidence({
        evidence: [keyed({ environment: "unknown" })],
        feed,
        policy: enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result).toBe("advisory");
    });
  });

  test("covers every independent v3 blocking-eligibility condition", () => {
    const enforced = { ...defaultPolicy(), failWithinDays: 30 };
    const eligibleOrigins: Array<{
      name: string;
      overrides: Partial<EvidenceFact>;
    }> = [
      { name: "policy-eligible repository SDK evidence", overrides: {} },
      {
        // Tier A: no SDK was inspected, so the platform is ambiguous on the fact. The feed
        // publishes gpt-old for exactly one platform, which is what establishes it.
        name: "keyed model-selector literal with a feed-resolved platform",
        overrides: {
          kind: "model-selector-key",
          confidence: "medium",
          detectorRuleId: "source.ts.generic.model-selector@1",
          platformResolution: "ambiguous",
        },
      },
      {
        name: "current manual assertion",
        overrides: {
          origin: "manual-claim",
          kind: "manual-claim",
          detectorRuleId: "claim.manual.assertion@1",
          evidenceHealth: "current",
        },
      },
      {
        name: "fresh runtime observation",
        overrides: {
          origin: "external-source",
          kind: "runtime-observation",
          detectorRuleId: "claim.external.runtime-observation@1",
          evidenceHealth: "current",
        },
      },
      {
        name: "fresh deployment snapshot",
        overrides: {
          origin: "external-source",
          kind: "deployment-snapshot",
          detectorRuleId: "claim.external.deployment-snapshot@1",
          evidenceHealth: "current",
        },
      },
    ];
    for (const [index, candidate] of eligibleOrigins.entries()) {
      const result = evaluateEvidence({
        evidence: [
          fact({
            evidenceId: `eligible-${index}`,
            environment: "production",
            ...candidate.overrides,
          }),
        ],
        feed,
        policy: enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result, candidate.name).toBe("blocking");
      expect(result.findings[0]?.outcome, candidate.name).toBe("breach");
    }

    const ineligibleCases: Array<{
      name: string;
      overrides?: Partial<EvidenceFact>;
      policy?: ReturnType<typeof defaultPolicy>;
    }> = [
      { name: "enforcement disabled", policy: defaultPolicy() },
      { name: "fact not marked policy eligible", overrides: { policyEligible: false } },
      { name: "low confidence", overrides: { confidence: "low" } },
      { name: "application environment not production", overrides: { environment: "staging" } },
      { name: "unknown scope", overrides: { scope: "unknown" } },
      { name: "protected documentation scope", overrides: { scope: "documentation" } },
      { name: "model unresolved", overrides: { modelResolution: "unresolved" } },
      { name: "platform ambiguous", overrides: { platformResolution: "ambiguous" } },
      { name: "selector is not a model ID", overrides: { selectorKind: "deployment-name" } },
      { name: "outside failure horizon", policy: { ...enforced, failWithinDays: 10 } },
      { name: "stale evidence", overrides: { evidenceHealth: "stale" } },
      {
        name: "generated declaration cannot block",
        overrides: {
          origin: "external-source",
          kind: "generated-declaration",
          detectorRuleId: "claim.external.generated-declaration@1",
        },
      },
      {
        name: "lexical evidence cannot block",
        overrides: {
          kind: "lexical",
          detectorRuleId: "fallback.text.lifecycle-id@1",
        },
      },
      {
        name: "environment binding cannot block independently",
        overrides: {
          kind: "env-binding",
          detectorRuleId: "binding.env.consumed-model@1",
        },
      },
    ];
    for (const [index, candidate] of ineligibleCases.entries()) {
      const result = evaluateEvidence({
        evidence: [
          fact({
            evidenceId: `ineligible-${index}`,
            environment: "production",
            ...candidate.overrides,
          }),
        ],
        feed,
        policy: candidate.policy ?? enforced,
        now: NOW,
        scanStatus: "complete",
      });
      expect(result.result, candidate.name).not.toBe("blocking");
      expect(
        result.findings.every((finding) => finding.outcome !== "breach"),
        candidate.name,
      ).toBe(true);
    }

    const suppressedFact = fact({ evidenceId: "suppressed", environment: "production" });
    const suppressed = evaluateEvidence({
      evidence: [suppressedFact],
      feed,
      policy: {
        ...enforced,
        suppressions: [
          {
            suppressionId: "matrix-suppression",
            target: { evidenceId: suppressedFact.evidenceId },
            reason: "Bounded release-matrix fixture",
            createdAt: "2026-08-01T00:00:00Z",
            expiresAt: "2026-09-01T00:00:00Z",
          },
        ],
      },
      now: NOW,
      scanStatus: "complete",
    });
    expect(suppressed.result, "current narrow suppression").toBe("no-actionable-risk");
    expect(suppressed.findings[0]?.outcome, "current narrow suppression").toBe("none");
  });

  test("lexical and ambiguous evidence never blocks", () => {
    const policy = { ...defaultPolicy(), failWithinDays: 30 };
    const result = evaluateEvidence({
      evidence: [
        fact({
          kind: "lexical",
          confidence: "low",
          policyEligible: false,
          platformResolution: "ambiguous",
        }),
      ],
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).not.toBe("blocking");
    expect(result.unresolved).toHaveLength(1);
  });

  test("collapses one unproven-platform occurrence into a single finding", () => {
    const result = evaluateEvidence({
      evidence: [lexicalFact()],
      feed: multiPlatformFeed,
      policy: defaultPolicy(),
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding?.servingPlatforms).toEqual(["azure", "google", "openai"]);
    expect(finding?.servingPlatform).toBe("azure");
    expect(finding?.shutdownDate).toBe("2026-10-16");
    expect(finding?.outcome).toBe("warning");
    expect(finding?.sourceUrls).toEqual([
      "https://example.com/azure",
      "https://example.com/google",
      "https://example.com/openai",
    ]);
    expect(finding?.replacementModels.map((replacement) => replacement.modelId)).toEqual([
      "azure-next",
      "openai-next",
    ]);
    expect(finding?.reasons.some((reason) => reason.includes("azure, google, openai"))).toBe(true);
  });

  test("the collapsed finding reports the candidate the warning horizon measures", () => {
    // google's shutdown is the nearest of the three, but azure was already formally
    // deprecated, so azure is the urgent record even though its shutdown is last.
    const horizonFeed = buildV3FeedIndex({
      schemaVersion: 3,
      adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
      generatedAt: "2026-08-02T00:00:00Z",
      records: [
        {
          recordId: "azure-deprecated",
          servingPlatform: "azure",
          primarySourceUrl: "https://example.com/azure",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "shared-mini",
          literalScanEligible: true,
          lifecycleStatus: "shutdown-scheduled",
          deprecationDate: "2026-06-01",
          shutdownDate: "2027-06-01",
          replacementModels: [],
        },
        {
          recordId: "google-sooner-shutdown",
          servingPlatform: "google",
          primarySourceUrl: "https://example.com/google",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "shared-mini",
          literalScanEligible: true,
          lifecycleStatus: "shutdown-scheduled",
          shutdownDate: "2026-10-16",
          replacementModels: [],
        },
      ],
    });
    const result = evaluateEvidence({
      evidence: [lexicalFact()],
      feed: horizonFeed,
      policy: defaultPolicy(),
      now: NOW,
      scanStatus: "complete",
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.servingPlatforms).toEqual(["azure", "google"]);
    expect(result.findings[0]?.servingPlatform).toBe("azure");
    expect(result.findings[0]?.deprecationDate).toBe("2026-06-01");
    expect(result.findings[0]?.shutdownDate).toBe("2027-06-01");
  });

  test("repeated occurrences of one model ID keep producing a single finding", () => {
    const result = evaluateEvidence({
      evidence: [
        lexicalFact(),
        lexicalFact({
          evidenceId: "lexical-second",
          locations: [{ path: "services/api/src/routes.ts", line: 4, column: 2 }],
        }),
      ],
      feed: multiPlatformFeed,
      policy: defaultPolicy(),
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidenceIds).toEqual(["lexical", "lexical-second"]);
    expect(result.findings[0]?.locations).toHaveLength(2);
  });

  test("a suppression naming any covered platform still suppresses the collapsed finding", () => {
    const result = evaluateEvidence({
      evidence: [lexicalFact()],
      feed: multiPlatformFeed,
      policy: {
        ...defaultPolicy(),
        suppressions: [
          {
            suppressionId: "registry-listing",
            target: {
              modelId: "shared-mini",
              servingPlatform: "openai",
              detectorRuleIds: ["fallback.text.lifecycle-id@1"],
              paths: ["packages/ai-client/**"],
            },
            reason: "The registry lists identifiers the service does not call",
            createdAt: "2026-08-01T00:00:00Z",
            expiresAt: "2026-09-01T00:00:00Z",
          },
        ],
      },
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.findings[0]?.suppressedBy).toBe("registry-listing");
    expect(result.findings[0]?.outcome).toBe("none");
  });

  test("declared serving platforms exclude unrelated platforms from unproven matching", () => {
    const policy = { ...defaultPolicy(), servingPlatforms: ["google", "openai"] };
    const result = evaluateEvidence({
      evidence: [lexicalFact()],
      feed: multiPlatformFeed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.servingPlatforms).toEqual(["google", "openai"]);
    expect(result.findings[0]?.shutdownDate).toBe("2026-10-23");
    expect(
      result.findings[0]?.reasons.some((reason) =>
        reason.includes("restricted to the declared serving platform(s): google, openai"),
      ),
    ).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.code === "declared-serving-platforms"),
    ).toBe(true);

    const excluded = evaluateEvidence({
      evidence: [lexicalFact()],
      feed: multiPlatformFeed,
      policy: { ...defaultPolicy(), servingPlatforms: ["anthropic"] },
      now: NOW,
      scanStatus: "complete",
    });
    expect(excluded.findings).toHaveLength(0);
  });

  test("a serving-platform declaration never filters platform-proven evidence", () => {
    const policy = {
      ...defaultPolicy(),
      failWithinDays: 30,
      servingPlatforms: ["google"],
    };
    const result = evaluateEvidence({
      evidence: [fact({ environment: "production" })],
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("blocking");
    expect(result.findings[0]?.servingPlatforms).toEqual(["openai"]);
  });

  test("a narrow suppression cannot hide another contributing production fact", () => {
    const production = fact({
      evidenceId: "production",
      environment: "production",
      locations: [{ path: "src/chat.ts", line: 1, column: 1 }],
    });
    const documentation = fact({
      evidenceId: "documentation",
      kind: "lexical",
      confidence: "low",
      scope: "documentation",
      policyEligible: false,
      detectorRuleId: "fallback.text.lifecycle-id@1",
      locations: [{ path: "docs/models.md", line: 1, column: 1 }],
    });
    const policy = {
      ...defaultPolicy(),
      failWithinDays: 30,
      suppressions: [
        {
          suppressionId: "docs-only",
          target: { evidenceId: documentation.evidenceId },
          reason: "Documentation example",
          createdAt: "2026-08-01T00:00:00Z",
          expiresAt: "2026-09-01T00:00:00Z",
        },
      ],
    };
    const result = evaluateEvidence({
      evidence: [documentation, production],
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("blocking");
    expect(result.findings[0]?.outcome).toBe("breach");
    expect(result.findings[0]?.evidenceIds).toEqual(["documentation", "production"]);
  });

  test("trusted resolutions cannot grant blocking authority to claim or lexical facts", () => {
    const sources: EvidenceFact[] = [
      fact({
        evidenceId: "external",
        origin: "external-source",
        kind: "generated-declaration",
        detectorRuleId: "claim.external.generated-declaration@1",
      }),
      fact({
        evidenceId: "manual",
        origin: "manual-claim",
        kind: "manual-claim",
        detectorRuleId: "claim.manual.assertion@1",
      }),
      fact({
        evidenceId: "lexical",
        kind: "lexical",
        detectorRuleId: "fallback.text.lifecycle-id@1",
      }),
    ].map((source): EvidenceFact => {
      const { modelId: _modelId, servingPlatform: _servingPlatform, ...unresolved } = source;
      return {
        ...unresolved,
        rawValue: "runtime-route",
        modelResolution: "dynamic",
        selectorKind: "dynamic",
        platformResolution: "unknown",
        policyEligible: false,
        scope: "deployment",
        environment: "production",
      };
    });
    const policy = {
      ...defaultPolicy(),
      failWithinDays: 30,
      resolutions: sources.map((source) => ({
        resolutionId: `resolve-${source.evidenceId}`,
        match: {
          detectorRuleId: source.detectorRuleId,
          rawValue: "runtime-route",
          paths: ["**/*.ts"],
        },
        resolveTo: { modelId: "gpt-old", servingPlatform: "openai" },
        reason: "Repository mapping",
        reviewedAt: "2026-08-01T00:00:00Z",
        reviewAfter: "2026-09-01T00:00:00Z",
        expiresAt: "2026-10-01T00:00:00Z",
      })),
    };
    const result = evaluateEvidence({
      evidence: sources,
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("advisory");
    expect(result.findings.every((finding) => finding.outcome !== "breach")).toBe(true);
    expect(result.evidence.every((source) => source.policyEligible === false)).toBe(true);
  });

  test("protected scopes cannot be promoted into blocking evidence", () => {
    const policy = {
      ...defaultPolicy(),
      failWithinDays: 30,
      scopeRules: [
        {
          scopeRuleId: "promote-docs",
          detectorRuleIds: ["source.ts.openai.request-model@1"],
          paths: ["docs/**"],
          scope: "deployment" as const,
          environment: "production" as const,
          reason: "Invalid promotion",
        },
      ],
    };
    const result = evaluateEvidence({
      evidence: [
        fact({
          scope: "documentation",
          locations: [{ path: "docs/example.ts", line: 1, column: 1 }],
        }),
      ],
      feed,
      policy,
      now: NOW,
      scanStatus: "complete",
    });
    expect(result.result).toBe("no-actionable-risk");
    expect(result.evidence[0]?.scope).toBe("documentation");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "protected-scope-promotion-ignored")).toBe(true);
  });
});

describe("warning horizon date precedence", () => {
  function feedWith(dates: Record<string, unknown>) {
    return buildV3FeedIndex({
      schemaVersion: 3,
      adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
      generatedAt: "2026-08-02T00:00:00Z",
      records: [
        {
          recordId: "record",
          servingPlatform: "openai",
          primarySourceUrl: "https://example.com",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "gpt-old",
          literalScanEligible: true,
          replacementModels: [],
          ...dates,
        },
      ],
    });
  }

  function evaluate(dates: Record<string, unknown>, overrides: Partial<EvidenceFact> = {}) {
    return evaluateEvidence({
      evidence: [fact({ environment: "production", ...overrides })],
      feed: feedWith(dates),
      policy: { ...defaultPolicy(), failWithinDays: 30 },
      now: NOW,
      scanStatus: "complete",
    });
  }

  test("a passed deprecation is advisory even when shutdown is far beyond the horizon", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      deprecationDate: "2026-06-01",
      shutdownDate: "2027-06-01",
    });
    const finding = result.findings[0];
    expect(result.result).toBe("advisory");
    expect(finding?.outcome).toBe("warning");
    // The report still carries the true distance to each published date.
    expect(finding?.daysUntilShutdown).toBe(303);
    expect(finding?.daysUntilDeprecation).toBe(-62);
    expect(finding?.reasons).toContain(
      "Deprecation was 62 UTC calendar day(s) ago; shutdown is 303 UTC calendar day(s) away.",
    );
  });

  test("a deprecation inside the failure horizon warns but never blocks", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      deprecationDate: "2026-08-10",
      shutdownDate: "2027-06-01",
    });
    expect(result.result).toBe("advisory");
    expect(result.findings[0]?.outcome).toBe("warning");
  });

  test("a deprecation beyond the horizon stays a notice", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      deprecationDate: "2027-05-01",
      shutdownDate: "2027-06-01",
    });
    expect(result.result).toBe("no-actionable-risk");
    expect(result.findings[0]?.outcome).toBe("notice");
    expect(result.findings[0]?.daysUntilDeprecation).toBe(272);
  });

  test("an announcement alone never opens the horizon", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      announcementDate: "2025-01-01",
      shutdownDate: "2027-06-01",
    });
    expect(result.findings[0]?.outcome).toBe("notice");
    expect(result.findings[0]?.daysUntilDeprecation).toBeUndefined();
  });

  test("an undated shutdown stays advisory at any deprecation distance", () => {
    const result = evaluate({
      lifecycleStatus: "deprecated",
      deprecationDate: "2029-01-01",
    });
    expect(result.result).toBe("advisory");
    expect(result.findings[0]?.outcome).toBe("warning");
    expect(result.findings[0]?.daysUntilShutdown).toBeNull();
  });

  test("shutdown still drives the horizon when it is the nearer date", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      deprecationDate: "2026-08-20",
      shutdownDate: "2026-08-20",
    });
    expect(result.findings[0]?.reasons).toContain("Shutdown is 18 UTC calendar day(s) away.");
  });

  test("enforcement keeps measuring the shutdown date", () => {
    const result = evaluate({
      lifecycleStatus: "shutdown-scheduled",
      deprecationDate: "2026-06-01",
      shutdownDate: "2026-08-20",
    });
    expect(result.result).toBe("blocking");
    expect(result.findings[0]?.outcome).toBe("breach");
  });

  test("findings sort by the deadline the horizon measures", () => {
    const evaluation = evaluateEvidence({
      evidence: [
        fact({ evidenceId: "near-deprecation", rawValue: "gpt-old", modelId: "gpt-old" }),
        fact({
          evidenceId: "near-shutdown",
          rawValue: "gpt-other",
          modelId: "gpt-other",
          locations: [{ path: "src/other.ts", line: 1, column: 1 }],
        }),
      ],
      feed: buildV3FeedIndex({
        schemaVersion: 3,
        adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
        generatedAt: "2026-08-02T00:00:00Z",
        records: [
          {
            recordId: "deprecated-long-ago",
            servingPlatform: "openai",
            primarySourceUrl: "https://example.com",
            supersedesRecordIds: [],
            recordKind: "model",
            modelId: "gpt-old",
            literalScanEligible: true,
            lifecycleStatus: "shutdown-scheduled",
            deprecationDate: "2026-06-01",
            shutdownDate: "2027-06-01",
            replacementModels: [],
          },
          {
            recordId: "shutting-down-soon",
            servingPlatform: "openai",
            primarySourceUrl: "https://example.com",
            supersedesRecordIds: [],
            recordKind: "model",
            modelId: "gpt-other",
            literalScanEligible: true,
            lifecycleStatus: "shutdown-scheduled",
            shutdownDate: "2026-09-01",
            replacementModels: [],
          },
        ],
      }),
      policy: defaultPolicy(),
      now: NOW,
      scanStatus: "complete",
    });
    expect(evaluation.findings.map((finding) => finding.modelId)).toEqual([
      "gpt-old",
      "gpt-other",
    ]);
  });
});
