import { describe, expect, test } from "bun:test";
import {
  assertNoFutureObservations,
  assertRequestedProvidersExist,
  breachingFindings,
  calendarDaysUntil,
  feedContentAgeDays,
  matchDeprecations,
  parseDateOnly,
  relevantProviderFreshness,
  validateFeed,
} from "./feed.ts";
import type { DeprecationRecord } from "./types.ts";

const NOW = Date.parse("2026-08-01T23:30:00Z");

type RecordOverrides = Omit<Partial<DeprecationRecord>, "model_id" | "shutdown_date"> & {
  model_id: string;
  shutdown_date?: string | undefined;
};

function record(overrides: RecordOverrides): DeprecationRecord {
  const { shutdown_date: shutdownDate, ...otherOverrides } = overrides;
  const result: DeprecationRecord = {
    provider: "OpenAI",
    shutdown_date: "2026-08-31",
    last_observed: "2026-08-01",
    ...otherOverrides,
  };
  if ("shutdown_date" in overrides) {
    if (shutdownDate === undefined) delete result.shutdown_date;
    else result.shutdown_date = shutdownDate;
  }
  return result;
}

describe("feed validation", () => {
  test("accepts the raw API and normalizes empty shutdown dates as undated", () => {
    const feed = validateFeed([
      {
        provider: "Cohere",
        model_id: "command-r",
        shutdown_date: "",
        deprecation_date: "2025-09-15",
        replacement_models: ["command-a"],
      },
    ]);
    expect(feed[0]).toMatchObject({
      provider: "Cohere",
      model_id: "command-r",
      deprecation_date: "2025-09-15",
    });
    expect(feed[0]).not.toHaveProperty("shutdown_date");
  });

  test("accepts the documented JSON Feed envelope", () => {
    const feed = validateFeed({
      items: [
        {
          url: "https://example.com/source",
          content_text: "Context",
          date_published: "2026-08-01T01:00:00Z",
          _deprecation: {
            provider: "Anthropic",
            model_id: "claude-old",
            shutdown_date: "2026-09-01",
            replacement_models: ["claude-new"],
          },
        },
      ],
    });
    expect(feed[0]).toMatchObject({
      provider: "Anthropic",
      model_id: "claude-old",
      url: "https://example.com/source",
      deprecation_context: "Context",
    });
  });

  test("fails closed on empty or malformed feed records", () => {
    expect(() => validateFeed([])).toThrow(/no records/);
    expect(() => validateFeed([{"last_observed":"2026-08-01"}])).toThrow(/provider/);
    expect(() =>
      validateFeed([{ provider: "OpenAI", model_id: "x", shutdown_date: "2026-02-30" }]),
    ).toThrow(/real YYYY-MM-DD/);
    expect(() =>
      validateFeed([{ provider: "OpenAI", model_id: "x", replacement_models: "y" }]),
    ).toThrow(/array or null/);
    expect(() =>
      validateFeed([{ provider: "OpenAI", model_id: "x", url: "javascript:alert(1)" }]),
    ).toThrow(/HTTP/);
    expect(() => validateFeed([{ provider: "OpenAI", model_id: "x" }])).toThrow(
      /no shutdown_date, deprecation_date, or announcement_date/,
    );
  });

  test("uses the same Unicode code-point model limit as inventories", () => {
    const modelId = "😀".repeat(256);
    expect(
      validateFeed([{ provider: "OpenAI", model_id: modelId, shutdown_date: "2030-01-01" }]),
    ).toEqual([{ provider: "OpenAI", model_id: modelId, shutdown_date: "2030-01-01" }]);
    expect(() =>
      validateFeed([
        { provider: "OpenAI", model_id: "😀".repeat(257), shutdown_date: "2030-01-01" },
      ]),
    ).toThrow("exceeds 256 characters");
  });

  test("deduplicates identical records and rejects ambiguous duplicates", () => {
    const duplicate = {
      provider: "OpenAI",
      model_id: "x",
      shutdown_date: "2026-08-20",
      replacement_models: ["y"],
    };
    expect(validateFeed([duplicate, { ...duplicate }])).toHaveLength(1);
    expect(() =>
      validateFeed([
        duplicate,
        { ...duplicate, replacement_models: ["different"] },
      ]),
    ).toThrow(/conflicting duplicate records/);
  });
});

describe("date and freshness semantics", () => {
  test("uses stable UTC calendar-day boundaries", () => {
    expect(parseDateOnly("2026-02-29")).toBeNull();
    expect(parseDateOnly("2028-02-29")).not.toBeNull();
    expect(calendarDaysUntil("2026-08-02", NOW)).toBe(1);
    expect(calendarDaysUntil("2026-08-01", NOW)).toBe(0);
    expect(calendarDaysUntil("2026-07-31", NOW)).toBe(-1);
  });

  test("reports global and configured-platform content ages separately", () => {
    const feed = [
      record({ model_id: "fresh", provider: "OpenAI", last_observed: "2026-08-01" }),
      record({ model_id: "old", provider: "Anthropic", last_observed: "2026-06-16" }),
    ];
    expect(feedContentAgeDays(feed, NOW)).toBe(0);
    expect(
      relevantProviderFreshness([{ id: "claude", provider: "anthropic" }], feed, NOW)[0]
        ?.ageDays,
    ).toBe(46);
  });

  test("aggregates freshness safely at the maximum documented feed size", () => {
    const shared = record({
      model_id: "large-feed",
      last_observed: "2026-07-31",
      scraped_at: "2026-08-01T12:00:00Z",
    });
    const feed = Array.from({ length: 100_000 }, () => shared);

    expect(feedContentAgeDays(feed, NOW)).toBe(0);
  });

  test("rejects implausibly future observation timestamps", () => {
    expect(() =>
      assertNoFutureObservations(
        [record({ model_id: "x", last_observed: "2099-01-01" })],
        NOW,
      ),
    ).toThrow(/future last_observed/);
  });
});

describe("matching", () => {
  const feed = [
    record({ model_id: "soon", shutdown_date: "2026-08-20" }),
    record({ model_id: "later", shutdown_date: "2027-01-01" }),
    record({ model_id: "overdue", shutdown_date: "2026-07-01" }),
    record({
      model_id: "undated",
      provider: "Cohere",
      shutdown_date: undefined,
      deprecation_date: "2025-09-15",
    }),
    record({ model_id: "same", provider: "OpenAI", shutdown_date: "2026-08-10" }),
    record({ model_id: "same", provider: "Azure", shutdown_date: "2026-08-11" }),
  ];

  test("matches scheduled, overdue, and undated lifecycle findings", () => {
    const result = matchDeprecations(
      [{ id: "soon" }, { id: "later" }, { id: "overdue" }, { id: "undated", provider: "cohere" }],
      feed,
      90,
      NOW,
    );
    expect(result.findings.map((finding) => finding.id)).toEqual(["overdue", "soon", "undated"]);
    expect(result.findings[0]?.status).toBe("shutdown-passed");
    expect(result.findings[2]).toMatchObject({
      status: "date-unknown",
      shutdownDate: null,
      daysUntilShutdown: null,
    });
  });

  test("respects serving platforms and deduplicates wildcard overlap", () => {
    const result = matchDeprecations(
      [{ id: "same" }, { id: "same", provider: "azure-openai" }, { id: "same" }],
      feed,
      90,
      NOW,
    );
    expect(result.findings.map((finding) => finding.provider)).toEqual(["OpenAI", "Azure"]);
  });

  test("returns transparent unmatched coverage and validates named providers", () => {
    expect(matchDeprecations([{ id: "new-model", provider: "openai" }], feed, 90, NOW))
      .toMatchObject({ matchedModelCount: 0, unmatchedModels: [{ id: "new-model", provider: "openai" }] });
    expect(() => assertRequestedProvidersExist([{ id: "x", provider: "mistral" }], feed)).toThrow(
      /not present.*Available serving platforms/,
    );
  });

  test("applies dated and undated failure policies independently", () => {
    const findings = matchDeprecations(
      [{ id: "soon" }, { id: "undated", provider: "cohere" }],
      feed,
      90,
      NOW,
    ).findings;
    expect(breachingFindings(findings, 30, false).map((finding) => finding.id)).toEqual(["soon"]);
    expect(breachingFindings(findings, null, true).map((finding) => finding.id)).toEqual([
      "undated",
    ]);
  });
});
