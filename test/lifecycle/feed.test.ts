import { describe, expect, test } from "bun:test";
import {
  CANONICAL_PLATFORM_SLUGS,
  PROVIDER_LIFECYCLE_ALIAS_REGISTRY,
  buildV3FeedIndex,
  feedAgeInDays,
  getV3ModelPair,
  isCanonicalPlatformSlug,
  isDateOnly,
  isPlatformSlug,
  isRfc3339UtcInstant,
  lifecycleSignatureIdentity,
  loadAdaptedV3Feed,
  loadV3FeedJson,
  modelPairIdentity,
  parseV3FeedJson,
  platformForSourceProvider,
  validateV3Feed,
} from "../../src/lifecycle/feed.ts";
import type { ModelLifecycleRecord } from "../../src/lifecycle/feed.ts";

const SHA256 = "a".repeat(64);

function modelRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordId: "openai-old-model-event",
    servingPlatform: "openai",
    primarySourceUrl: "https://example.com/openai/old-model",
    supersedesRecordIds: [],
    recordKind: "model",
    modelId: "Case-Sensitive-Model",
    literalScanEligible: true,
    lifecycleStatus: "shutdown-scheduled",
    announcementDate: "2026-07-01",
    deprecationDate: "2026-07-15",
    shutdownDate: "2026-09-01",
    replacementModels: [{ modelId: "replacement-model" }],
    ...overrides,
  };
}

function nonModelRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recordId: "openai-reusable-prompts-event",
    servingPlatform: "openai",
    primarySourceUrl: "https://example.com/openai/reusable-prompts",
    supersedesRecordIds: [],
    recordKind: "prompt",
    resourceId: "reusable-prompts",
    displayName: "Reusable prompts",
    literalScanEligible: false,
    ...overrides,
  };
}

function feedEnvelope(
  records: readonly unknown[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 3,
    adapter: {
      id: "deprecations-info-v3",
      version: "1.0.0",
      sourceSha256: SHA256,
    },
    generatedAt: "2026-08-02T12:34:56Z",
    records,
    ...overrides,
  };
}

function expectInvalid(payload: unknown, message: RegExp | string): void {
  expect(() => validateV3Feed(payload)).toThrow(message);
}

describe("v3 platform registry", () => {
  test("publishes the complete canonical platform set", () => {
    expect(CANONICAL_PLATFORM_SLUGS).toEqual([
      "openai",
      "azure",
      "anthropic",
      "aws-bedrock",
      "google",
      "google-vertex",
      "cohere",
      "groq",
      "xai",
    ]);
    expect(isCanonicalPlatformSlug("aws-bedrock")).toBe(true);
    expect(isCanonicalPlatformSlug("future-platform")).toBe(false);
  });

  test("maps reviewed source providers case-sensitively and never guesses", () => {
    expect(platformForSourceProvider("AWS Bedrock")).toBe("aws-bedrock");
    expect(platformForSourceProvider("Google Vertex")).toBe("google-vertex");
    expect(platformForSourceProvider("OpenAI")).toBe("openai");
    expect(platformForSourceProvider("openai")).toBeNull();
    expect(platformForSourceProvider("Amazon Bedrock")).toBeNull();
    expect(platformForSourceProvider("toString")).toBeNull();
    expect(platformForSourceProvider("__proto__")).toBeNull();
  });

  test("publishes an explicitly empty v3.0 provider-alias registry", () => {
    expect(PROVIDER_LIFECYCLE_ALIAS_REGISTRY).toEqual({
      version: "3.0.0",
      aliases: [],
    });
  });

  test("keeps syntactically valid unsupported slugs distinct", () => {
    expect(isPlatformSlug("future-platform")).toBe(true);
    expect(isPlatformSlug("a".repeat(63))).toBe(true);
    expect(isPlatformSlug("a".repeat(64))).toBe(false);
    expect(isPlatformSlug("Bad_Platform")).toBe(false);
  });
});

describe("strict v3 feed validation", () => {
  test("admits typed models and non-models without using identifier shape", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord(),
        nonModelRecord(),
        modelRecord({
          recordId: "future-platform-model",
          servingPlatform: "future-platform",
          modelId: "ordinary-word",
          literalScanEligible: false,
        }),
      ]),
    );

    expect(index.envelope.records[0]).toMatchObject({ modelId: "Case-Sensitive-Model" });
    expect(index.modelPairs).toHaveLength(2);
    expect(index.activeNonModelRecords).toHaveLength(1);
    expect(index.activeNonModelRecords[0]).toMatchObject({
      recordKind: "prompt",
      resourceId: "reusable-prompts",
    });
    expect(index.lexicalModelPairs.map((pair) => pair.modelId)).toEqual([
      "Case-Sensitive-Model",
    ]);
    expect(getV3ModelPair(index, "future-platform", "ordinary-word")).toMatchObject({
      platformSupport: "unsupported",
      blockingJoinEligible: false,
      lexicalScanEligible: false,
    });
    expect(
      index.modelPairByIdentity.has(modelPairIdentity("openai", "reusable-prompts")),
    ).toBe(false);
  });

  test("rejects unknown fields at every object level", () => {
    expectInvalid({ ...feedEnvelope([modelRecord()]), surprise: true }, /unknown field.*surprise/);
    expectInvalid(
      feedEnvelope([modelRecord()], {
        adapter: {
          id: "adapter",
          version: "1",
          sourceSha256: SHA256,
          provider: "guess-me",
        },
      }),
      /unknown field.*provider/,
    );
    expectInvalid(
      feedEnvelope([modelRecord({ deprecationContext: "not in v3" })]),
      /unknown field.*deprecationContext/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({ replacementModels: [{ modelId: "new", source: "unknown" }] }),
      ]),
      /unknown field.*source/,
    );
    expectInvalid(
      feedEnvelope([nonModelRecord({ modelId: "looks-like-a-model" })]),
      /unknown field.*modelId/,
    );
  });

  test("fails closed for absent, unknown, or internally inconsistent record kinds", () => {
    const missingKind = modelRecord();
    delete missingKind.recordKind;
    expectInvalid(feedEnvelope([missingKind]), /recordKind.*required/);
    expectInvalid(feedEnvelope([modelRecord({ recordKind: "service" })]), /recordKind.*must be model/);
    expectInvalid(
      feedEnvelope([nonModelRecord({ literalScanEligible: true })]),
      /must be false for a non-model record/,
    );
    expectInvalid(feedEnvelope([]), /must contain at least one record/);
  });

  test("requires strict envelope metadata, URLs, and exact globally unique record IDs", () => {
    expectInvalid(feedEnvelope([modelRecord()], { schemaVersion: 2 }), /schemaVersion.*equal 3/);
    expectInvalid(
      feedEnvelope([modelRecord()], {
        adapter: { id: "adapter", version: "1", sourceSha256: "ABC" },
      }),
      /lower-case SHA-256/,
    );
    expectInvalid(
      feedEnvelope([modelRecord({ primarySourceUrl: "file:///tmp/source" })]),
      /absolute HTTP\(S\) URL/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord(),
        modelRecord({ modelId: "another-model" }),
      ]),
      /duplicates record ID/,
    );
  });

  test("parses bounded UTF-8 JSON and rejects malformed bytes", () => {
    const raw = JSON.stringify(feedEnvelope([modelRecord()]));
    expect(parseV3FeedJson(new TextEncoder().encode(raw))).toMatchObject({ schemaVersion: 3 });
    expect(() => parseV3FeedJson(new Uint8Array([0xff]))).toThrow(/valid UTF-8/);
    expect(() => parseV3FeedJson("not json")).toThrow(/valid JSON/);
    expect(() =>
      parseV3FeedJson(
        JSON.stringify(feedEnvelope([modelRecord({ modelId: "bad\ud800value" })])),
      ),
    ).toThrow(/Unicode scalar values/);
  });
});

describe("v3 lifecycle date semantics", () => {
  test("validates dates and UTC instants without host-timezone parsing", () => {
    expect(isDateOnly("2000-02-29")).toBe(true);
    expect(isDateOnly("1900-02-29")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isRfc3339UtcInstant("2026-08-02T12:34:56.123456789Z")).toBe(true);
    expect(isRfc3339UtcInstant("2026-02-30T12:34:56Z")).toBe(false);
    expect(isRfc3339UtcInstant("2026-08-02T24:00:00Z")).toBe(false);
    expect(isRfc3339UtcInstant("2026-08-02T12:34:56+00:00")).toBe(false);
  });

  test("requires real dates in chronological order", () => {
    expectInvalid(
      feedEnvelope([modelRecord({ deprecationDate: "2026-02-30" })]),
      /real YYYY-MM-DD/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({ announcementDate: "2026-08-01", deprecationDate: "2026-07-01" }),
      ]),
      /must not precede announcementDate/,
    );
    expectInvalid(
      feedEnvelope([modelRecord({ deprecationDate: "2026-10-01", shutdownDate: "2026-09-01" })]),
      /must not precede deprecationDate/,
    );
  });

  test("validates lifecycle status relative to the generated UTC date", () => {
    expectInvalid(
      feedEnvelope([
        modelRecord({ lifecycleStatus: "shutdown-scheduled", shutdownDate: "2026-08-02" }),
      ]),
      /must be after.*2026-08-02/,
    );
    expectInvalid(
      feedEnvelope([modelRecord({ lifecycleStatus: "retired", shutdownDate: "2026-08-03" })]),
      /must be on or before.*2026-08-02/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({ lifecycleStatus: "deprecated", deprecationDate: "2026-07-15" }),
      ]),
      /shutdownDate.*must be absent/,
    );

    const deprecated = modelRecord({
      lifecycleStatus: "deprecated",
      deprecationDate: "2026-07-15",
    });
    delete deprecated.shutdownDate;
    const retired = modelRecord({ lifecycleStatus: "retired", shutdownDate: "2026-08-02" });
    expect(validateV3Feed(feedEnvelope([deprecated])).records[0]).toMatchObject({
      lifecycleStatus: "deprecated",
    });
    expect(validateV3Feed(feedEnvelope([retired])).records[0]).toMatchObject({
      lifecycleStatus: "retired",
    });
  });

  test("requires generatedAt to be a real UTC instant", () => {
    expectInvalid(
      feedEnvelope([modelRecord()], { generatedAt: "2026-08-02T12:00:00+02:00" }),
      /UTC instant ending in Z/,
    );
    expectInvalid(
      feedEnvelope([modelRecord()], { generatedAt: "2026-02-30T12:00:00Z" }),
      /UTC instant ending in Z/,
    );
  });
});

describe("v3 supersession and conflict indexing", () => {
  test("keeps superseded records as provenance while evaluating only active records", () => {
    const oldRecord = modelRecord({
      recordId: "old-event",
      shutdownDate: "2026-09-01",
    });
    const newRecord = modelRecord({
      recordId: "corrected-event",
      supersedesRecordIds: ["old-event"],
      shutdownDate: "2026-10-01",
    });
    const index = buildV3FeedIndex(feedEnvelope([oldRecord, newRecord]));
    const pair = getV3ModelPair(index, "openai", "Case-Sensitive-Model");

    expect(index.recordById.has("old-event")).toBe(true);
    expect(index.supersededRecordIds).toEqual(["old-event"]);
    expect(pair).toMatchObject({
      allRecordIds: ["corrected-event", "old-event"],
      activeRecordIds: ["corrected-event"],
      supersededRecordIds: ["old-event"],
      conflict: false,
      lexicalScanEligible: true,
      blockingJoinEligible: true,
    });
    expect(pair?.activeLifecycles[0]?.shutdownDate).toBe("2026-10-01");
  });

  test("rejects missing, self, cross-pair, and cyclic supersession", () => {
    expectInvalid(
      feedEnvelope([modelRecord({ supersedesRecordIds: ["missing"] })]),
      /references missing record ID/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({
          recordId: "self",
          supersedesRecordIds: ["self"],
        }),
      ]),
      /must not reference its own record/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({ recordId: "first" }),
        modelRecord({
          recordId: "second",
          modelId: "different-model",
          supersedesRecordIds: ["first"],
        }),
      ]),
      /same exact platform\/model/,
    );
    expectInvalid(
      feedEnvelope([
        modelRecord({ recordId: "first", supersedesRecordIds: ["second"] }),
        modelRecord({ recordId: "second", supersedesRecordIds: ["first"] }),
      ]),
      /contains a cycle/,
    );
  });

  test("collapses identical active signatures and retains every provenance variant", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord({
          recordId: "source-one",
          replacementModels: [{ modelId: "replacement-a" }],
        }),
        modelRecord({
          recordId: "source-two",
          primarySourceUrl: "https://second.example/model",
          replacementModels: [{ modelId: "replacement-b", servingPlatform: "azure" }],
        }),
      ]),
    );
    const pair = getV3ModelPair(index, "openai", "Case-Sensitive-Model");

    expect(pair?.conflict).toBe(false);
    expect(pair?.activeLifecycles).toHaveLength(1);
    expect(pair?.activeLifecycles[0]?.recordIds).toEqual(["source-one", "source-two"]);
    expect(pair?.activeLifecycles[0]?.primarySourceUrls).toEqual([
      "https://example.com/openai/old-model",
      "https://second.example/model",
    ]);
    expect(pair?.activeLifecycles[0]?.provenance.map((item) => item.replacementModels)).toEqual([
      [{ modelId: "replacement-a" }],
      [{ modelId: "replacement-b", servingPlatform: "azure" }],
    ]);
  });

  test("makes different active signatures a visible nonblocking, nonlexical conflict", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord({ recordId: "date-one", shutdownDate: "2026-09-01" }),
        modelRecord({ recordId: "date-two", shutdownDate: "2026-10-01" }),
      ]),
    );
    const pair = getV3ModelPair(index, "openai", "Case-Sensitive-Model");

    expect(pair).toMatchObject({
      conflict: true,
      lexicalScanEligible: false,
      blockingJoinEligible: false,
    });
    expect(pair?.activeLifecycles).toHaveLength(2);
    expect(index.lexicalModelPairs).toHaveLength(0);
    expect(index.diagnostics).toEqual([
      expect.objectContaining({
        kind: "feed-conflict",
        modelId: "Case-Sensitive-Model",
        activeRecordIds: ["date-one", "date-two"],
      }),
    ]);
  });

  test("treats literal-scan eligibility disagreement as a lifecycle conflict", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord({ recordId: "literal-enabled", literalScanEligible: true }),
        modelRecord({ recordId: "literal-disabled", literalScanEligible: false }),
      ]),
    );
    const pair = getV3ModelPair(index, "openai", "Case-Sensitive-Model");

    expect(pair).toMatchObject({
      conflict: true,
      lexicalScanEligible: false,
      blockingJoinEligible: false,
    });
    expect(pair?.activeLifecycles.map((lifecycle) => lifecycle.literalScanEligible)).toEqual([
      false,
      true,
    ]);
  });

  test("resolves a conflict only through explicit valid supersession", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord({ recordId: "date-one", shutdownDate: "2026-09-01" }),
        modelRecord({ recordId: "date-two", shutdownDate: "2026-10-01" }),
        modelRecord({
          recordId: "resolution",
          shutdownDate: "2026-11-01",
          supersedesRecordIds: ["date-one", "date-two"],
        }),
      ]),
    );
    const pair = getV3ModelPair(index, "openai", "Case-Sensitive-Model");

    expect(pair).toMatchObject({
      conflict: false,
      activeRecordIds: ["resolution"],
      supersededRecordIds: ["date-one", "date-two"],
      lexicalScanEligible: true,
      blockingJoinEligible: true,
    });
    expect(index.diagnostics).toEqual([]);
  });

  test("keeps the same model ID on different platforms as distinct pairs", () => {
    const index = buildV3FeedIndex(
      feedEnvelope([
        modelRecord({ recordId: "openai-event", servingPlatform: "openai" }),
        modelRecord({ recordId: "azure-event", servingPlatform: "azure" }),
      ]),
    );

    expect(index.modelPairs).toHaveLength(2);
    expect(getV3ModelPair(index, "openai", "Case-Sensitive-Model")).toBeDefined();
    expect(getV3ModelPair(index, "azure", "Case-Sensitive-Model")).toBeDefined();
    expect(index.lexicalModelPairs).toHaveLength(2);
  });
});

describe("v3 feed identities and digests", () => {
  test("uses the contract lifecycle tuple and excludes provenance and replacements", () => {
    const first = validateV3Feed(
      feedEnvelope([modelRecord({ recordId: "one" })]),
    ).records[0] as ModelLifecycleRecord;
    const second = validateV3Feed(
      feedEnvelope([
        modelRecord({
          recordId: "two",
          primarySourceUrl: "https://different.example/source",
          replacementModels: [{ modelId: "different-replacement" }],
        }),
      ]),
    ).records[0] as ModelLifecycleRecord;
    const ineligible = validateV3Feed(
      feedEnvelope([modelRecord({ recordId: "three", literalScanEligible: false })]),
    ).records[0] as ModelLifecycleRecord;

    expect(lifecycleSignatureIdentity(first)).toBe(lifecycleSignatureIdentity(second));
    expect(lifecycleSignatureIdentity(first)).not.toBe(lifecycleSignatureIdentity(ineligible));
    expect(modelPairIdentity("openai", "a\u0000b")).not.toBe(
      modelPairIdentity("openai\u0000a", "b"),
    );
  });

  test("separates exact raw bytes from order-stable normalized semantics", () => {
    const one = modelRecord({
      recordId: "one",
      replacementModels: [
        { modelId: "z" },
        { modelId: "a", servingPlatform: "azure" },
      ],
    });
    const two = nonModelRecord({ recordId: "two" });
    const rawOne = JSON.stringify(feedEnvelope([one, two]));
    const rawTwo = JSON.stringify(
      feedEnvelope(
        [
          two,
          {
            ...one,
            replacementModels: [...(one.replacementModels as unknown[])].reverse(),
          },
        ],
        {
          adapter: {
            id: "deprecations-info-v3",
            version: "1.0.0",
            sourceSha256: "b".repeat(64),
          },
        },
      ),
    );
    const first = loadV3FeedJson(rawOne);
    const second = loadV3FeedJson(rawTwo);

    expect(first.digests.sourceFeedSha256).not.toBe(second.digests.sourceFeedSha256);
    expect(first.digests.normalizedFeedSha256).toBe(second.digests.normalizedFeedSha256);
    expect(first.digests.activeRecordsSha256).toBe(second.digests.activeRecordsSha256);
    expect(first.digests.feedAdapterManifestSha256).toBe(
      second.digests.feedAdapterManifestSha256,
    );
    for (const digest of Object.values(first.digests)) expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  test("binds adapter identity to a stable reviewed manifest rather than source bytes", () => {
    const raw = JSON.stringify(feedEnvelope([modelRecord()]));
    const first = loadV3FeedJson(raw, {
      expectedAdapter: { id: "deprecations-info-v3", version: "1.0.0" },
      adapterManifest: {
        id: "deprecations-info-v3",
        version: "1.0.0",
        classifications: ["model"],
      },
    });
    const changedManifest = loadV3FeedJson(raw, {
      adapterManifest: {
        id: "deprecations-info-v3",
        version: "1.0.0",
        classifications: ["model", "non-model"],
      },
    });

    expect(first.digests.sourceFeedSha256).toBe(changedManifest.digests.sourceFeedSha256);
    expect(first.digests.normalizedFeedSha256).toBe(
      changedManifest.digests.normalizedFeedSha256,
    );
    expect(first.digests.activeRecordsSha256).toBe(
      changedManifest.digests.activeRecordsSha256,
    );
    expect(first.digests.feedAdapterManifestSha256).not.toBe(
      changedManifest.digests.feedAdapterManifestSha256,
    );
    expect(() =>
      loadV3FeedJson(raw, {
        expectedAdapter: { id: "different-adapter", version: "1.0.0" },
      }),
    ).toThrow(/not the approved producer/);
    expect(() =>
      loadV3FeedJson(raw, {
        adapterManifest: { id: "wrong-manifest", version: "1.0.0" },
      }),
    ).toThrow(/does not match reviewed manifest/);
  });

  test("atomically binds reviewed adapter output to its exact source bytes", () => {
    const sourceBytes = new TextEncoder().encode("abc");
    const envelope = feedEnvelope([modelRecord()], {
      adapter: {
        id: "reviewed-adapter",
        version: "1",
        sourceSha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
    });
    const loaded = loadAdaptedV3Feed(sourceBytes, envelope, {
      id: "reviewed-adapter",
      version: "1",
      classifications: ["complete-fixture-set"],
    }, [
      {
        kind: "feed-unresolved-provider",
        skippedRecordCount: 1,
        providerCount: 1,
        providers: ["***"],
      },
    ]);

    expect(loaded.digests.sourceFeedSha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(loaded.index.diagnostics).toEqual([
      expect.objectContaining({ kind: "feed-unresolved-provider", skippedRecordCount: 1 }),
    ]);
    expect(() =>
      loadAdaptedV3Feed(new TextEncoder().encode("different"), envelope, {
        id: "reviewed-adapter",
        version: "1",
      }),
    ).toThrow(/exact immutable source bytes/);
    expect(() =>
      loadAdaptedV3Feed(sourceBytes, envelope, {
        id: "wrong-adapter",
        version: "1",
      }),
    ).toThrow(/does not match reviewed manifest/);
  });
});

describe("v3 feed freshness measurement", () => {
  const now = Date.parse("2026-08-02T00:00:00Z");

  test("counts whole elapsed days since feed production", () => {
    expect(feedAgeInDays("2026-08-02T00:00:00Z", now)).toBe(0);
    expect(feedAgeInDays("2026-08-01T00:00:01Z", now)).toBe(0);
    expect(feedAgeInDays("2026-08-01T00:00:00Z", now)).toBe(1);
    expect(feedAgeInDays("2026-06-01T00:00:00Z", now)).toBe(62);
  });

  test("clamps a feed marginally ahead of the runner clock to zero", () => {
    // The reviewed adapter already rejects anything more than a day ahead; ordinary skew
    // must not surface as a negative age or wrap into a spurious freshness pass.
    expect(feedAgeInDays("2026-08-02T06:00:00Z", now)).toBe(0);
    expect(feedAgeInDays("2026-08-03T00:00:00Z", now)).toBe(0);
  });

  test("refuses to measure an unparseable production instant", () => {
    expect(() => feedAgeInDays("not-a-timestamp", now)).toThrow(/Cannot measure feed age/);
  });
});
