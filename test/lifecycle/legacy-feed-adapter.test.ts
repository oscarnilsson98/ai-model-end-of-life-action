import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  DEFAULT_LEGACY_ADAPTER_MANIFEST,
  adaptLegacyFeed,
  legacyPairSetSha256,
  type LegacyFeedAdapterManifest,
} from "../../src/lifecycle/legacy-feed-adapter.ts";
import { loadAdaptedV3Feed } from "../../src/lifecycle/feed.ts";

describe("reviewed legacy feed adapter", () => {
  const pairs = [
    ["OpenAI", "gpt-old"],
    ["OpenAI", "Agent Builder"],
  ] as const;
  const manifest: LegacyFeedAdapterManifest = {
    id: "fixture",
    version: "1",
    reviewedPairs: pairs,
    reviewedPairCount: pairs.length,
    reviewedPairsSha256: legacyPairSetSha256(pairs),
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

  test("classifies every reviewed record explicitly", () => {
    const bytes = sourceBytes(payload);
    const envelope = adaptLegacyFeed(bytes, manifest, Date.parse("2026-08-02T00:00:00Z"));
    expect(envelope.envelope.records.map((record) => record.recordKind)).toEqual(["model", "agent"]);
    expect(envelope.diagnostics).toEqual([]);
    expect(envelope.envelope.adapter.sourceSha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });

  test("ships a self-consistent exact registry for the reviewed upstream snapshot", () => {
    expect(DEFAULT_LEGACY_ADAPTER_MANIFEST.reviewedPairs).toHaveLength(
      DEFAULT_LEGACY_ADAPTER_MANIFEST.reviewedPairCount,
    );
    expect(
      legacyPairSetSha256(DEFAULT_LEGACY_ADAPTER_MANIFEST.reviewedPairs),
    ).toBe(DEFAULT_LEGACY_ADAPTER_MANIFEST.reviewedPairsSha256);
  });

  test("quarantines additions and removals without normalizing unreviewed records", () => {
    const added = adapt([...payload, { ...payload[0], model_id: "new-model" }]);
    expect(added.envelope.records).toHaveLength(2);
    expect(added.envelope.records.some((record) =>
      record.recordKind === "model" && record.modelId === "new-model"
    )).toBe(false);
    expect(added.diagnostics).toEqual([
      expect.objectContaining({ addedPairCount: 1, removedPairCount: 0 }),
    ]);

    const removed = adapt([payload[0]]);
    expect(removed.envelope.records).toHaveLength(1);
    expect(removed.diagnostics).toEqual([
      expect.objectContaining({ addedPairCount: 0, removedPairCount: 1 }),
    ]);

    const renamed = adapt([{ ...payload[0], model_id: "renamed-model" }, payload[1]]);
    expect(renamed.envelope.records).toHaveLength(1);
    expect(renamed.diagnostics).toEqual([
      expect.objectContaining({ addedPairCount: 1, removedPairCount: 1 }),
    ]);
  });

  test("still rejects duplicate source pairs", () => {
    expect(() => adapt([payload[0], payload[0]])).toThrow(/duplicate source provider/);
  });

  test("strictly validates quarantined rows before withholding lifecycle authority", () => {
    expect(() =>
      adapt([
        ...payload,
        { ...payload[0], model_id: "new-model", unexpected_field: true },
      ]),
    ).toThrow(/unreviewed field/);
    expect(() =>
      adapt([
        ...payload,
        { ...payload[0], provider: "Unreviewed Provider", model_id: "new-model" },
      ]),
    ).toThrow(/reviewed platform mapping/);
    expect(() =>
      adapt([
        ...payload,
        {
          ...payload[0],
          model_id: "new-model",
          deprecation_date: "2027-02-01",
          shutdown_date: "2027-01-01",
        },
      ]),
    ).toThrow(/deprecation_date after shutdown_date/);
  });

  test("derives generatedAt and normalized lifecycle digests only from reviewed rows", () => {
    const now = Date.parse("2027-01-02T00:00:00Z");
    const reviewedBytes = sourceBytes(payload);
    const reviewed = adaptLegacyFeed(reviewedBytes, manifest, now);
    const reviewedLoaded = loadAdaptedV3Feed(
      reviewedBytes,
      reviewed.envelope,
      manifest,
      reviewed.diagnostics,
    );
    const changedBytes = sourceBytes([
      ...payload,
      {
        ...payload[0],
        model_id: "quarantined-model",
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

    expect(changed.envelope.generatedAt).toBe(reviewed.envelope.generatedAt);
    expect(changed.envelope.records).toEqual(reviewed.envelope.records);
    expect(changed.envelope.records[0]).toMatchObject({
      recordKind: "model",
      lifecycleStatus: "shutdown-scheduled",
    });
    expect(changedLoaded.digests.sourceFeedSha256).not.toBe(
      reviewedLoaded.digests.sourceFeedSha256,
    );
    expect(changedLoaded.digests.normalizedFeedSha256).toBe(
      reviewedLoaded.digests.normalizedFeedSha256,
    );
    expect(changedLoaded.digests.activeRecordsSha256).toBe(
      reviewedLoaded.digests.activeRecordsSha256,
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
      { ...payload[0], ...metadata, model_id: "quarantined-with-valid-metadata" },
    ]);
    expect(result.envelope.records).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ addedPairCount: 1, removedPairCount: 0 }),
    ]);

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
    for (const [field, value, message] of invalidValues) {
      expect(() =>
        adapt([
          ...payload,
          { ...payload[0], model_id: `quarantined-${field}`, [field]: value },
        ]),
      ).toThrow(message);
    }
    expect(() =>
      adapt([
        ...payload,
        {
          ...payload[0],
          model_id: "quarantined-observation-order",
          first_observed: "2026-08-02",
          last_observed: "2026-08-01",
        },
      ]),
    ).toThrow(/first_observed must be on or before .*last_observed/);
  });

  test("bounds pair-set diagnostic previews while retaining exact counts", () => {
    const additions = Array.from({ length: 60 }, (_, index) => ({
      ...payload[0],
      model_id: `new-model-${index.toString().padStart(2, "0")}`,
    }));
    const result = adapt([...payload, ...additions]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ addedPairCount: 60, removedPairCount: 0 }),
    ]);
    expect(result.diagnostics[0]?.addedPairs).toHaveLength(50);
    expect(result.diagnostics[0]?.removedPairs).toHaveLength(0);
  });

  test("fails the non-empty feed contract when quarantine leaves no reviewed records", () => {
    expect(() => adapt([{ ...payload[0], model_id: "only-unreviewed-model" }])).toThrow(
      /no reviewed records after pair-set quarantine/,
    );
  });

  test("keeps exact pair review order-independent without normalizing source identifiers", () => {
    expect(adapt([...payload].reverse()).envelope.records.map((record) => record.recordKind)).toEqual([
      "agent",
      "model",
    ]);
    expect(() => adapt([{ ...payload[0], model_id: " gpt-old " }, payload[1]])).toThrow(
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

  test("rejects naive, impossible, unknown-offset, and excessively future timestamps", () => {
    const invalidTimestamps = [
      "2026-08-01T00:00:00",
      "2026-02-30T00:00:00Z",
      "2026-08-01T24:00:00Z",
      "2026-08-01T00:00:00-00:00",
    ];
    for (const scrapedAt of invalidTimestamps) {
      expect(() => adapt([{ ...payload[0], scraped_at: scrapedAt }, payload[1]])).toThrow(
        /scraped_at/,
      );
    }
    expect(() =>
      adapt(
        [{ ...payload[0], scraped_at: "2026-08-03T00:00:00.001Z" }, payload[1]],
        manifest,
        Date.parse("2026-08-02T00:00:00Z"),
      ),
    ).toThrow(/further ahead.*one day/);
  });

  test("rejects manifest classifications that are absent, duplicated, or contradictory", () => {
    const absent: LegacyFeedAdapterManifest = {
      ...manifest,
      nonModels: [
        ...manifest.nonModels,
        { provider: "OpenAI", resourceId: "missing", recordKind: "product" },
      ],
    };
    expect(() => adapt(payload, absent)).toThrow(/classifies absent source pair/);

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
