import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  adaptLegacyFeed,
  type LegacyFeedAdapterManifest,
} from "../../src/lifecycle/legacy-feed-adapter.ts";
import { loadAdaptedV3Feed } from "../../src/lifecycle/feed.ts";

describe("legacy feed adapter", () => {
  const manifest: LegacyFeedAdapterManifest = {
    id: "fixture",
    version: "1",
    nonModels: [
      { provider: "OpenAI", resourceId: "Agent Builder", recordKind: "agent" },
    ],
    lexicalIneligiblePairs: [],
    dateCorrections: {
      announcementAfterLifecycle: "reject",
      deprecationAfterShutdown: "reject",
    },
  };
  const payload = [
    {
      provider: "OpenAI",
      model_id: "gpt-old",
      deprecation_date: "2026-01-01",
      shutdown_date: "2027-01-01",
      url: "https://example.com/model",
      scraped_at: "2026-08-01T00:00:00Z",
    },
    {
      provider: "OpenAI",
      model_id: "Agent Builder",
      deprecation_date: "2026-01-01",
      url: "https://example.com/agent",
      scraped_at: "2026-08-01T00:00:00Z",
    },
  ];

  function sourceBytes(value: unknown): Uint8Array {
    return Buffer.from(JSON.stringify(value));
  }

  function adapt(
    value: unknown,
    selectedManifest: LegacyFeedAdapterManifest = manifest,
    now = Date.parse("2026-08-02T00:00:00Z"),
  ) {
    return adaptLegacyFeed(sourceBytes(value), selectedManifest, now);
  }

  /**
   * A malformed row is quarantined rather than fatal, so the assertion is on the emitted
   * diagnostic instead of a thrown error. Returns the surviving envelope.
   */
  function expectQuarantined(
    value: unknown,
    reason: RegExp,
    selectedManifest: LegacyFeedAdapterManifest = manifest,
    now = Date.parse("2026-08-02T00:00:00Z"),
  ) {
    const result = adapt(value, selectedManifest, now);
    const invalid = result.diagnostics.find(
      (diagnostic) => diagnostic.kind === "feed-invalid-record",
    );
    if (invalid?.kind !== "feed-invalid-record") {
      throw new Error("expected a feed-invalid-record diagnostic");
    }
    expect(invalid.reasons.join("\n")).toMatch(reason);
    return result;
  }

  test("classifies every record explicitly", () => {
    const bytes = sourceBytes(payload);
    const envelope = adaptLegacyFeed(bytes, manifest, Date.parse("2026-08-02T00:00:00Z"));
    expect(envelope.envelope.records.map((record) => record.recordKind)).toEqual(["model", "agent"]);
    expect(envelope.diagnostics).toEqual([]);
    expect(envelope.envelope.adapter.sourceSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });

  test("admits added and renamed rows immediately, with no diagnostic", () => {
    const added = adapt([...payload, { ...payload[0], model_id: "new-model" }]);
    expect(added.envelope.records).toHaveLength(3);
    expect(added.envelope.records.some((record) =>
      record.recordKind === "model" && record.modelId === "new-model"
    )).toBe(true);
    expect(added.diagnostics).toEqual([]);

    const renamed = adapt([{ ...payload[0], model_id: "renamed-model" }, payload[1]]);
    expect(renamed.envelope.records).toHaveLength(2);
    expect(renamed.diagnostics).toEqual([]);
  });

  test("treats a withdrawn upstream row as ordinary absence", () => {
    const removed = adapt([payload[0]]);
    expect(removed.envelope.records).toHaveLength(1);
    expect(removed.diagnostics).toEqual([]);
  });

  test("derives a slug for an unregistered provider and keeps it join-eligible", () => {
    const result = adapt([
      ...payload,
      { ...payload[0], provider: "Mistral", model_id: "mistral-large-2" },
      { ...payload[0], provider: "Together AI", model_id: "some-model" },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.envelope.records
        .filter((record) => record.recordKind === "model")
        .map((record) => record.servingPlatform),
    ).toEqual(["openai", "mistral", "together-ai"]);

    const loaded = loadAdaptedV3Feed(
      sourceBytes([
        ...payload,
        { ...payload[0], provider: "Mistral", model_id: "mistral-large-2" },
      ]),
      adapt([
        ...payload,
        { ...payload[0], provider: "Mistral", model_id: "mistral-large-2" },
      ]).envelope,
      manifest,
    );
    const derived = loaded.index.modelPairs.find((pair) => pair.servingPlatform === "mistral");
    // Still flagged as outside the detector's registry, because that governs display names
    // and semantic platform proof. It no longer governs blocking authority: a provider the
    // upstream source adds is enforceable on the run that first sees it, given evidence
    // strong enough to reach the policy layer's own bar.
    expect(derived).toMatchObject({
      platformSupport: "unsupported",
      blockingJoinEligible: true,
    });
    expect(derived?.lexicalScanEligible).toBe(true);
    const canonical = loaded.index.modelPairs.find((pair) => pair.servingPlatform === "openai");
    expect(canonical).toMatchObject({ platformSupport: "canonical", blockingJoinEligible: true });
  });

  test("maps every canonical provider label to its registered slug", () => {
    const providers = [
      ["OpenAI", "openai"],
      ["Azure", "azure"],
      ["Anthropic", "anthropic"],
      ["AWS Bedrock", "aws-bedrock"],
      ["Google", "google"],
      ["Google Vertex", "google-vertex"],
      ["Cohere", "cohere"],
      ["Groq", "groq"],
      ["xAI", "xai"],
    ] as const;
    const result = adapt(
      providers.map(([provider], index) => ({
        ...payload[0],
        provider,
        model_id: `model-${index.toString()}`,
      })),
    );
    expect(result.envelope.records.map((record) => record.servingPlatform)).toEqual(
      providers.map(([, slug]) => slug),
    );
  });

  test("skips only rows whose provider label yields no valid slug", () => {
    const result = adapt([...payload, { ...payload[0], provider: "***", model_id: "unusable" }]);
    expect(result.envelope.records).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: "feed-unresolved-provider",
        skippedRecordCount: 1,
        providerCount: 1,
        providers: ["***"],
      }),
    ]);
  });

  test("fails the non-empty feed contract when no provider resolves at all", () => {
    expect(() => adapt([{ ...payload[0], provider: "///", model_id: "unusable" }])).toThrow(
      /no records with a resolvable serving platform/,
    );
  });

  test("quarantines a duplicate source pair and keeps the first occurrence", () => {
    const result = expectQuarantined(
      [payload[0], payload[0]],
      /duplicates source provider\/identifier pair/,
    );
    expect(result.envelope.records).toHaveLength(1);
  });

  test("ignores fields it does not read instead of rejecting the document", () => {
    // An additive upstream column must never cost a consumer their run.
    const result = adapt([
      ...payload,
      { ...payload[0], model_id: "new-model", unexpected_field: true },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.envelope.records).toHaveLength(3);
    expect(
      result.envelope.records.some(
        (record) => record.recordKind === "model" && record.modelId === "new-model",
      ),
    ).toBe(true);
  });

  test("quarantines a row whose own values are malformed", () => {
    const result = expectQuarantined(
      [...payload, { ...payload[0], model_id: "new-model", scraped_at: "not-a-timestamp" }],
      /scraped_at/,
    );
    expect(result.envelope.records).toHaveLength(2);
  });

  test("derives generatedAt and lifecycle digests from every admitted row", () => {
    const now = Date.parse("2027-01-02T00:00:00Z");
    const baseBytes = sourceBytes(payload);
    const base = adaptLegacyFeed(baseBytes, manifest, now);
    const baseLoaded = loadAdaptedV3Feed(baseBytes, base.envelope, manifest, base.diagnostics);
    const changedBytes = sourceBytes([
      ...payload,
      {
        ...payload[0],
        model_id: "added-model",
        scraped_at: "2027-01-02T00:00:00Z",
      },
    ]);
    const changed = adaptLegacyFeed(changedBytes, manifest, now);
    const changedLoaded = loadAdaptedV3Feed(
      changedBytes,
      changed.envelope,
      manifest,
      changed.diagnostics,
    );

    // An added row is authoritative now, so it moves generatedAt and every digest.
    expect(changed.envelope.generatedAt).toBe("2027-01-02T00:00:00.000Z");
    expect(base.envelope.generatedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(changed.envelope.records).toHaveLength(3);
    // Lifecycle status is relative to generatedAt, so an advancing feed date can retire a
    // record that a pinned older date still reported as merely scheduled.
    expect(changed.envelope.records[0]).toMatchObject({
      recordKind: "model",
      lifecycleStatus: "retired",
    });
    expect(base.envelope.records[0]).toMatchObject({
      recordKind: "model",
      lifecycleStatus: "shutdown-scheduled",
    });
    expect(changedLoaded.digests.sourceFeedSha256).not.toBe(baseLoaded.digests.sourceFeedSha256);
    expect(changedLoaded.digests.normalizedFeedSha256).not.toBe(
      baseLoaded.digests.normalizedFeedSha256,
    );
    expect(changedLoaded.digests.activeRecordsSha256).not.toBe(
      baseLoaded.digests.activeRecordsSha256,
    );
  });

  test("accepts and validates the live legacy metadata shapes on every row", () => {
    const metadata = {
      deprecation_context: "First paragraph.\n\nSecond paragraph.",
      content_hash: "0123456789abcdef",
      first_observed: "2026-01-01",
      last_observed: "2026-08-01",
    };
    const result = adapt([
      ...payload.map((record) => ({ ...record, ...metadata })),
      { ...payload[0], ...metadata, model_id: "added-with-valid-metadata" },
    ]);
    expect(result.envelope.records).toHaveLength(3);
    expect(result.diagnostics).toEqual([]);

    const invalidValues: readonly [field: string, value: unknown, message: RegExp][] = [
      ["deprecation_context", { text: "not a string" }, /deprecation_context must be a string/],
      ["deprecation_context", "x".repeat(16_385), /at most 16384 Unicode code points/],
      ["deprecation_context", "invalid\u0000context", /unsupported control characters/],
      ["deprecation_context", "invalid\u0085context", /unsupported control characters/],
      ["content_hash", { hash: "not a string" }, /content_hash must be a non-empty string/],
      ["content_hash", "x".repeat(257), /content_hash is too long/],
      ["first_observed", 20260101, /first_observed must be a non-empty string/],
      ["first_observed", "2026-02-30", /first_observed must be a real YYYY-MM-DD date/],
      ["last_observed", null, /last_observed must be a non-empty string/],
      ["last_observed", "2026-13-01", /last_observed must be a real YYYY-MM-DD date/],
    ];
    // Each bad metadata shape costs its own row and nothing else: the two well-formed
    // rows still make it into the envelope.
    for (const [field, value, message] of invalidValues) {
      const quarantined = expectQuarantined(
        [...payload, { ...payload[0], model_id: `added-${field}`, [field]: value }],
        message,
      );
      expect(quarantined.envelope.records).toHaveLength(2);
    }
    expectQuarantined(
      [
        ...payload,
        {
          ...payload[0],
          model_id: "added-observation-order",
          first_observed: "2026-08-02",
          last_observed: "2026-08-01",
        },
      ],
      /first_observed must be on or before .*last_observed/,
    );
  });

  test("bounds unresolved-provider previews while retaining exact counts", () => {
    const unusable = Array.from({ length: 60 }, (_, index) => ({
      ...payload[0],
      provider: `${"*".repeat(index + 1)}`,
      model_id: `unusable-${index.toString().padStart(2, "0")}`,
    }));
    const result = adapt([...payload, ...unusable]);
    expect(result.envelope.records).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ skippedRecordCount: 60, providerCount: 60 }),
    ]);
    const unresolved = result.diagnostics.find(
      (diagnostic) => diagnostic.kind === "feed-unresolved-provider",
    );
    expect(unresolved?.kind).toBe("feed-unresolved-provider");
    if (unresolved?.kind !== "feed-unresolved-provider") throw new Error("unreachable");
    expect(unresolved.providers).toHaveLength(50);
  });

  test("keeps classification order-independent without normalizing source identifiers", () => {
    expect(adapt([...payload].reverse()).envelope.records.map((record) => record.recordKind)).toEqual([
      "agent",
      "model",
    ]);
    expectQuarantined(
      [{ ...payload[0], model_id: " gpt-old " }, payload[1]],
      /must not have leading or trailing whitespace/,
    );
  });

  test("does not silently discard inverted lifecycle dates", () => {
    const changed = [
      { ...payload[0], deprecation_date: "2027-02-01", shutdown_date: "2027-01-01" },
      payload[1],
    ];
    expect(() => adapt(changed)).toThrow(/deprecation_date after shutdown_date/);
  });

  test("normalizes explicit offsets to a deterministic UTC generatedAt", () => {
    const changed = [
      { ...payload[0], scraped_at: "2026-08-01T23:30:00-02:00" },
      { ...payload[1], scraped_at: "2026-08-02T02:00:00+01:00" },
    ];
    const envelope = adapt(changed, manifest, Date.parse("2026-08-03T00:00:00Z"));
    expect(envelope.envelope.generatedAt).toBe("2026-08-02T01:30:00.000Z");
    expect(envelope.envelope.records[0]).toMatchObject({ lifecycleStatus: "shutdown-scheduled" });
  });

  test("quarantines naive, impossible, unknown-offset, and excessively future timestamps", () => {
    const invalidTimestamps = [
      "2026-08-01T00:00:00",
      "2026-02-30T00:00:00Z",
      "2026-08-01T24:00:00Z",
      "2026-08-01T00:00:00-00:00",
    ];
    for (const scrapedAt of invalidTimestamps) {
      expectQuarantined([{ ...payload[0], scraped_at: scrapedAt }, payload[1]], /scraped_at/);
    }
    expectQuarantined(
      [{ ...payload[0], scraped_at: "2026-08-03T00:00:00.001Z" }, payload[1]],
      /further ahead.*one day/,
    );
  });

  test("treats a classification the source no longer publishes as inert", () => {
    const absent: LegacyFeedAdapterManifest = {
      ...manifest,
      nonModels: [
        ...manifest.nonModels,
        { provider: "OpenAI", resourceId: "missing", recordKind: "product" },
      ],
      lexicalIneligiblePairs: [["OpenAI", "also-missing"]],
    };
    // A stale classification must never stall the feed: upstream drops rows freely.
    const result = adapt(payload, absent);
    expect(result.envelope.records.map((record) => record.recordKind)).toEqual(["model", "agent"]);
    expect(result.diagnostics).toEqual([]);
  });

  test("rejects manifest classifications that are duplicated or contradictory", () => {
    const duplicate: LegacyFeedAdapterManifest = {
      ...manifest,
      nonModels: [...manifest.nonModels, ...manifest.nonModels],
    };
    expect(() => adapt(payload, duplicate)).toThrow(/duplicates non-model source pair/);

    const contradictory: LegacyFeedAdapterManifest = {
      ...manifest,
      lexicalIneligiblePairs: [["OpenAI", "Agent Builder"]],
    };
    expect(() => adapt(payload, contradictory)).toThrow(/redundantly marks non-model/);
  });
});
