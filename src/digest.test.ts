import { describe, expect, test } from "bun:test";
import {
  buildAuditRecord,
  canonicalInventorySha256,
  canonicalLifecycleFeedSha256,
  rawBytesSha256,
  stableAlertFingerprint,
  stableFindingId,
} from "./digest.ts";
import type { DeprecationRecord, Finding, InputModel } from "./types.ts";

const encoder = new TextEncoder();

function record(overrides: Partial<DeprecationRecord> = {}): DeprecationRecord {
  return {
    provider: "OpenAI",
    model_id: "legacy-model",
    shutdown_date: "2026-10-01",
    deprecation_date: "2026-05-01",
    announcement_date: "2026-05-02",
    replacement_models: ["replacement-a", "replacement-b"],
    deprecation_context: "Free-tier retirement; paid usage differs.",
    url: "https://example.com/lifecycle",
    first_observed: "2026-05-02",
    last_observed: "2026-06-01",
    scraped_at: "2026-06-01T12:00:00Z",
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  const value: Omit<Finding, "findingId"> = {
    id: "legacy-model",
    provider: "OpenAI",
    status: "scheduled",
    shutdownDate: "2026-10-01",
    daysUntilShutdown: 60,
    deprecationDate: "2026-05-01",
    announcementDate: "2026-05-02",
    replacementModels: ["replacement-a", "replacement-b"],
    url: "https://example.com/lifecycle",
    context: "Free-tier retirement; paid usage differs.",
    ...overrides,
  };
  return { findingId: stableFindingId(value), ...value };
}

describe("raw and canonical SHA-256 digests", () => {
  test("hashes exact bytes and remains sensitive to byte-level representation", () => {
    const compact = encoder.encode('{"provider":"OpenAI"}');
    const formatted = encoder.encode('{\n  "provider": "OpenAI"\n}');

    expect(rawBytesSha256(encoder.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(rawBytesSha256(compact)).toBe(rawBytesSha256(compact));
    expect(rawBytesSha256(compact)).not.toBe(rawBytesSha256(formatted));
  });

  test("canonicalizes inventory order, duplicates, and provider aliases", () => {
    const first: InputModel[] = [
      { id: "wildcard" },
      { id: "legacy-model", provider: "Open AI" },
      { id: "legacy-model", provider: "open-ai" },
    ];
    const second: InputModel[] = [
      { id: "legacy-model", provider: "OPENAI" },
      { id: "wildcard" },
    ];

    expect(canonicalInventorySha256(first)).toBe(canonicalInventorySha256(second));
    expect(canonicalInventorySha256(first)).not.toBe(
      canonicalInventorySha256([{ id: "different", provider: "openai" }]),
    );
  });

  test("separates raw representation from semantic lifecycle content", () => {
    const feed = [record(), record({ provider: "Anthropic", model_id: "claude-old" })];
    const reversedWithAliases = [
      record({ provider: "Anthropic AI", model_id: "claude-old" }),
      record({ provider: "open-ai" }),
    ];
    const compact = encoder.encode(JSON.stringify(feed));
    const formatted = encoder.encode(JSON.stringify(feed, null, 2));

    expect(rawBytesSha256(compact)).not.toBe(rawBytesSha256(formatted));
    expect(canonicalLifecycleFeedSha256(feed)).toBe(
      canonicalLifecycleFeedSha256(reversedWithAliases),
    );
  });

  test("ignores observation and verbose-context churn but detects lifecycle changes", () => {
    const baseline = [record()];
    const observationalChange = [
      record({
        deprecation_context: "Reworded verbose explanation",
        first_observed: "2026-05-03",
        last_observed: "2026-08-01",
        scraped_at: "2026-08-01T01:02:03Z",
      }),
    ];

    expect(canonicalLifecycleFeedSha256(baseline)).toBe(
      canonicalLifecycleFeedSha256(observationalChange),
    );
    for (const meaningfulChange of [
      [record({ shutdown_date: "2026-11-01" })],
      [record({ deprecation_date: "2026-05-03" })],
      [record({ announcement_date: "2026-05-04" })],
      [record({ replacement_models: ["replacement-c"] })],
      [record({ url: "https://example.com/corrected-source" })],
    ]) {
      expect(canonicalLifecycleFeedSha256(baseline)).not.toBe(
        canonicalLifecycleFeedSha256(meaningfulChange),
      );
    }
  });
});

describe("finding and alert identity", () => {
  test("keeps finding IDs stable across provider aliases and countdown changes", () => {
    const baseline = finding();
    const countdownChanged = { ...baseline, provider: "open-ai", daysUntilShutdown: 1 };
    expect(stableFindingId(baseline)).toBe(
      stableFindingId(countdownChanged),
    );
    expect(stableFindingId(baseline)).not.toBe(
      stableFindingId({ ...baseline, shutdownDate: null }),
    );
  });

  test("is order-independent and does not churn with the daily countdown", () => {
    const first = finding();
    const second = finding({
      id: "undated-model",
      provider: "Anthropic",
      status: "date-unknown",
      shutdownDate: null,
      daysUntilShutdown: null,
    });
    const baseline = stableAlertFingerprint({
      findings: [first, second],
      breaching: [second],
      unmatchedBreaching: [
        { id: "missing-b", provider: "Amazon Bedrock" },
        { id: "missing-a", provider: "OpenAI" },
      ],
    });
    const nextDay = stableAlertFingerprint({
      findings: [
        { ...second, provider: "anthropic-ai" },
        { ...first, provider: "open-ai", daysUntilShutdown: 59 },
      ],
      breaching: [{ ...second, provider: "Anthropic AI" }],
      unmatchedBreaching: [
        { id: "missing-a", provider: "open-ai" },
        { id: "missing-b", provider: "aws" },
      ],
    });

    expect(nextDay).toBe(baseline);
  });

  test("changes for status, content, source, replacement, and breach transitions", () => {
    const baselineFinding = finding();
    const baseline = stableAlertFingerprint({
      findings: [baselineFinding],
      breaching: [],
      unmatchedBreaching: [],
    });
    const fingerprint = (changed: Finding, breaching: Finding[] = []) =>
      stableAlertFingerprint({
        findings: [changed],
        breaching,
        unmatchedBreaching: [],
      });

    expect(fingerprint({ ...baselineFinding, status: "shutdown-passed" })).not.toBe(baseline);
    expect(fingerprint({ ...baselineFinding, context: "Corrected scope" })).not.toBe(baseline);
    expect(fingerprint({ ...baselineFinding, url: "https://example.com/new-source" })).not.toBe(
      baseline,
    );
    expect(fingerprint({ ...baselineFinding, replacementModels: ["replacement-c"] })).not.toBe(
      baseline,
    );
    expect(fingerprint(baselineFinding, [baselineFinding])).not.toBe(baseline);
    expect(
      stableAlertFingerprint({
        findings: [baselineFinding],
        breaching: [],
        unmatchedBreaching: [{ id: "new-unmatched", provider: "openai" }],
      }),
    ).not.toBe(baseline);
  });
});

describe("audit records", () => {
  test("builds a compact deterministic record with optional exact-byte provenance", () => {
    const inventory: InputModel[] = [
      { id: "legacy-model", provider: "OpenAI" },
      { id: "missing-model", provider: "AWS Bedrock" },
    ];
    const feed = [record()];
    const lifecycleFinding = finding();
    const rawFeedBytes = encoder.encode(JSON.stringify(feed));
    const input = {
      inventory,
      feed,
      findings: [lifecycleFinding],
      breaching: [lifecycleFinding],
      unmatchedBreaching: [{ id: "missing-model", provider: "aws" }],
      rawFeedBytes,
    };

    const audit = buildAuditRecord(input);
    expect(audit).toMatchObject({
      schemaVersion: 1,
      checkedModelCount: 2,
      feedRecordCount: 1,
      findingCount: 1,
      breachCount: 2,
      unmatchedBreachCount: 1,
      rawFeedSha256: rawBytesSha256(rawFeedBytes),
    });
    expect(audit.inventorySha256).toHaveLength(64);
    expect(audit.lifecycleFeedSha256).toHaveLength(64);
    expect(audit.alertFingerprint).toHaveLength(64);
    expect(buildAuditRecord({ ...input, inventory: [...inventory].reverse() })).toEqual(audit);

    const withoutRawBytes = buildAuditRecord({
      inventory,
      feed,
      findings: [lifecycleFinding],
      breaching: [lifecycleFinding],
      unmatchedBreaching: [],
    });
    expect(withoutRawBytes).not.toHaveProperty("rawFeedSha256");
  });
});
