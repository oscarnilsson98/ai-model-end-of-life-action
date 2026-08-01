import { describe, expect, test } from "bun:test";
import {
  breachingFindings,
  matchDeprecations,
  normalizeProvider,
  parseFailThreshold,
  parseModels,
  renderSlackText,
  renderSummary,
  type DeprecationRecord,
} from "./check.ts";

const NOW = Date.parse("2026-01-01T00:00:00Z");

function record(overrides: Partial<DeprecationRecord> & Pick<DeprecationRecord, "model_id">): DeprecationRecord {
  return { provider: "openai", shutdown_date: "2026-02-01", ...overrides };
}

describe("parseModels", () => {
  test("accepts objects and bare id strings", () => {
    expect(parseModels('[{"id":"a","provider":"openai"},"b"]')).toEqual([
      { id: "a", provider: "openai" },
      { id: "b" },
    ]);
  });

  test("rejects empty, non-array, and malformed entries", () => {
    expect(() => parseModels("  ")).toThrow(/empty/);
    expect(() => parseModels("{")).toThrow(/not valid JSON/);
    expect(() => parseModels('{"id":"a"}')).toThrow(/must be a JSON array/);
    expect(() => parseModels("[42]")).toThrow(/models\[0\]/);
  });
});

describe("normalizeProvider", () => {
  test("folds case and the -ai suffix but keeps distinct vendors apart", () => {
    expect(normalizeProvider("OpenAI")).toBe(normalizeProvider("openai"));
    expect(normalizeProvider("Google Vertex")).not.toBe(normalizeProvider("google"));
    expect(normalizeProvider("Azure")).not.toBe(normalizeProvider("openai"));
  });
});

describe("matchDeprecations", () => {
  test("flags a model inside the window", () => {
    const findings = matchDeprecations([{ id: "gpt-5.2", provider: "openai" }], [record({ model_id: "gpt-5.2" })], 90, NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: "gpt-5.2", provider: "openai", daysUntilShutdown: 31 });
  });

  test("ignores a shutdown beyond the window", () => {
    const feed = [record({ model_id: "gpt-5.2", shutdown_date: "2027-01-01" })];
    expect(matchDeprecations([{ id: "gpt-5.2" }], feed, 90, NOW)).toEqual([]);
  });

  test("includes an already-passed shutdown with a negative day count", () => {
    const feed = [record({ model_id: "gpt-4", shutdown_date: "2025-12-01" })];
    expect(matchDeprecations([{ id: "gpt-4" }], feed, 90, NOW)[0]?.daysUntilShutdown).toBe(-31);
  });

  test("skips records without a shutdown date", () => {
    expect(matchDeprecations([{ id: "gpt-5.2" }], [record({ model_id: "gpt-5.2", shutdown_date: undefined })], 90, NOW)).toEqual([]);
  });

  test("respects the provider filter but matches any provider when omitted", () => {
    const feed = [record({ model_id: "gpt-5.2", provider: "azure" })];
    expect(matchDeprecations([{ id: "gpt-5.2", provider: "openai" }], feed, 90, NOW)).toEqual([]);
    expect(matchDeprecations([{ id: "gpt-5.2" }], feed, 90, NOW)).toHaveLength(1);
  });

  test("sorts the soonest shutdown first", () => {
    const feed = [
      record({ model_id: "later", shutdown_date: "2026-03-01" }),
      record({ model_id: "sooner", shutdown_date: "2026-01-15" }),
    ];
    const ids = matchDeprecations([{ id: "later" }, { id: "sooner" }], feed, 90, NOW).map((f) => f.id);
    expect(ids).toEqual(["sooner", "later"]);
  });

  test("defaults replacementModels to an empty array", () => {
    const feed = [record({ model_id: "gpt-5.2", replacement_models: null })];
    expect(matchDeprecations([{ id: "gpt-5.2" }], feed, 90, NOW)[0]?.replacementModels).toEqual([]);
  });
});

describe("fail threshold", () => {
  const feed = [
    record({ model_id: "urgent", shutdown_date: "2026-01-20" }),
    record({ model_id: "distant", shutdown_date: "2026-03-15" }),
    record({ model_id: "overdue", shutdown_date: "2025-11-01" }),
  ];
  const findings = matchDeprecations([{ id: "urgent" }, { id: "distant" }, { id: "overdue" }], feed, 90, NOW);

  test("unset or blank never fails", () => {
    expect(parseFailThreshold(undefined)).toBeNull();
    expect(parseFailThreshold("  ")).toBeNull();
    expect(breachingFindings(findings, null)).toEqual([]);
  });

  test("rejects a non-numeric threshold", () => {
    expect(() => parseFailThreshold("soon")).toThrow(/Invalid fail-within-days/);
  });

  test("breaches only the findings at or inside the threshold", () => {
    expect(breachingFindings(findings, parseFailThreshold("30")).map((f) => f.id)).toEqual(["overdue", "urgent"]);
  });

  test("an already-passed shutdown always breaches", () => {
    expect(breachingFindings(findings, 0).map((f) => f.id)).toEqual(["overdue"]);
  });

  test("a threshold matching the report window breaches every finding", () => {
    expect(breachingFindings(findings, 90)).toHaveLength(3);
  });
});

describe("rendering", () => {
  const findings = matchDeprecations(
    [{ id: "gpt-5.2" }],
    [record({ model_id: "gpt-5.2", replacement_models: ["gpt-6"], url: "https://example.com/docs" })],
    90,
    NOW,
  );

  test("summary table links the model and lists the replacement", () => {
    const summary = renderSummary(findings, 1, 10, 90);
    expect(summary).toContain("[`gpt-5.2`](https://example.com/docs)");
    expect(summary).toContain("gpt-6");
    expect(summary).toContain("Checked 1 model(s) against 10 feed entries");
  });

  test("summary reports an all-clear with no findings", () => {
    expect(renderSummary([], 3, 10, 90)).toContain("No models are within 90 day(s) of shutdown");
  });

  test("past-due days render as elapsed, not negative", () => {
    const overdue = matchDeprecations([{ id: "gpt-4" }], [record({ model_id: "gpt-4", shutdown_date: "2025-12-01" })], 90, NOW);
    expect(renderSummary(overdue, 1, 10, 90)).toContain("31 days ago");
  });

  test("slack text names each model and its shutdown date", () => {
    expect(renderSlackText(findings)).toContain("*gpt-5.2* (openai) — shuts down 2026-02-01");
  });
});
