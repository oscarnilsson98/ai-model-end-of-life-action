import { describe, expect, test } from "bun:test";
import { stableFindingId } from "./digest.ts";
import {
  escapeTableCell,
  formatDays,
  renderDiscoveryAnnotation,
  renderFailureSummary,
  renderFindingAnnotation,
  renderResolvedSlackText,
  renderSlackText,
  renderSummary,
  type SummaryInput,
} from "./render.ts";
import type { Finding } from "./types.ts";

function finding(overrides: Partial<Finding> = {}): Finding {
  const value: Omit<Finding, "findingId"> = {
    id: "legacy-model",
    provider: "OpenAI",
    status: "scheduled",
    shutdownDate: "2026-08-20",
    daysUntilShutdown: 19,
    replacementModels: ["new-model"],
    url: "https://example.com/deprecation",
    ...overrides,
  };
  return { ...value, findingId: stableFindingId(value) };
}

function summaryInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  const findings = overrides.findings ?? [finding()];
  return {
    findings,
    breaching: [],
    models: findings.map((item) => ({ id: item.id, provider: item.provider })),
    matchedModelCount: findings.length,
    unmatchedModels: [],
    unmatchedBreaching: [],
    feedSize: findings.length,
    windowDays: 90,
    feedContentAgeDays: 0,
    providerFreshness: [],
    ...overrides,
    includeUndated: overrides.includeUndated ?? true,
  };
}

describe("job-summary rendering", () => {
  test("escapes Markdown tables, HTML, code delimiters, and line breaks", () => {
    expect(escapeTableCell("a|b`<tag>&\rnext")).toBe(
      "a&#124;b&#96;&lt;tag&gt;&amp;<br>next",
    );

    const hostile = finding({
      id: "bad|`<script>",
      provider: "Open|AI",
      replacementModels: ["next|`<b>"],
      context: "Scoped to free tier ![track](https://tracker.test/pixel)",
    });
    const markdown = renderSummary(summaryInput({ findings: [hostile] }));
    expect(markdown).toContain("bad&#124;&#96;&lt;script&gt;");
    expect(markdown).toContain("Open&#124;AI");
    expect(markdown).toContain("next&#124;&#96;&lt;b&gt;");
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<b>");
    expect(markdown).toContain(
      "<code>Scoped to free tier ![track](https://tracker.test/pixel)</code>",
    );
    expect(markdown).not.toContain("| Scoped to free tier ![track]");
    expect(
      renderSummary(
        summaryInput({
          findings: [
            finding({ provider: "![track](https://tracker.test/pixel)", replacementModels: [] }),
          ],
          providerFreshness: [
            {
              provider: "[track](https://tracker.test/fresh)",
              ageDays: 1,
              newestTimestamp: 1,
            },
          ],
        }),
      ),
    ).not.toContain("| ![track]");
  });

  test("bounds finding rows and inventory coverage details", () => {
    const findings = Array.from({ length: 105 }, (_, index) =>
      finding({ id: `legacy-${index}` }),
    );
    const unmatchedModels = Array.from({ length: 55 }, (_, index) => ({
      id: `unknown-${index}`,
    }));
    const markdown = renderSummary(
      summaryInput({
        findings,
        models: [...findings.map((item) => ({ id: item.id })), ...unmatchedModels],
        unmatchedModels,
      }),
    );

    expect(markdown.match(/^\| (?:\[)?<code>/gm)).toHaveLength(100);
    expect(markdown).toContain("Summary limited to 100 rows; 5 additional finding(s)");
    expect(markdown.match(/^- <code>unknown-/gm)).toHaveLength(50);
    expect(markdown).toContain("- …and 5 more");
    expect(markdown).toContain("is not proof that the model is active");
  });

  test("qualifies all-clear summaries when undated records are excluded", () => {
    const markdown = renderSummary(
      summaryInput({
        findings: [],
        models: [{ id: "model" }],
        matchedModelCount: 1,
        includeUndated: false,
      }),
    );
    expect(markdown).toContain("Undated deprecations were excluded by configuration");
    expect(markdown).not.toContain("no matching undated deprecations were found");
  });

  test("marks unmatched coverage breaches without claiming an all-clear", () => {
    const model = { id: "legacy-modle", provider: "OpenAI" };
    const markdown = renderSummary(
      summaryInput({
        findings: [],
        models: [model],
        matchedModelCount: 0,
        unmatchedModels: [model],
        unmatchedBreaching: [model],
      }),
    );
    expect(markdown).toContain("breached the configured feed-history policy");
    expect(markdown).toContain("- ❌ <code>legacy-modle (OpenAI)</code>");
    expect(markdown).not.toContain("✅");
  });

  test("reports conservative source discovery without changing the all-clear claim", () => {
    const discovered = {
      id: "gpt-4",
      providers: ["Azure", "OpenAI"],
      ambiguous: true,
      occurrenceCount: 2,
      locations: [{ path: "src/a|b.ts", line: 4, column: 9 }],
      locationsTruncated: true,
      tracked: false,
    };
    const markdown = renderSummary(
      summaryInput({
        findings: [],
        models: [{ id: "different", provider: "OpenAI" }],
        matchedModelCount: 1,
        discovery: {
          models: [discovered],
          candidateCount: 10,
          examinedFileCount: 2,
          scannedFileCount: 1,
          scannedByteCount: 42,
          skippedFileCount: 1,
          skippedSymlinkCount: 0,
          matchCount: 2,
        },
      }),
    );
    expect(markdown).toContain("### Report-only source discovery");
    expect(markdown).toContain("Ambiguous:");
    expect(markdown).toContain("src/a&#124;b.ts:4:9");
    expect(markdown).toContain("does not change findings, policy breaches");
    expect(markdown).toContain("Source snippets are never emitted");
    expect(markdown).toContain("This is not an inventory all-clear");
    expect(markdown).not.toContain("✅");
    expect(renderDiscoveryAnnotation(discovered)).toContain(
      "source token does not identify its serving platform",
    );
  });

  test("hard-caps UTF-8 summary bytes for worst-case valid feed fields", () => {
    // The source URL is within the feed's 2,048-code-unit limit, but URL
    // normalization expands every emoji to a 12-character percent encoding.
    const rawUrl = `https://example.com/${"💥".repeat(1_000)}`;
    expect(rawUrl.length).toBeLessThanOrEqual(2_048);
    const expandedUrl = new URL(rawUrl).toString();
    const findings = Array.from({ length: 100 }, (_, index) =>
      finding({
        id: `${index}-${"💥".repeat(120)}`,
        provider: "供".repeat(100),
        replacementModels: Array.from({ length: 100 }, () => "替".repeat(256)),
        url: expandedUrl,
      }),
    );

    const markdown = renderSummary(
      summaryInput({
        findings,
        models: findings.map((item) => ({ id: item.id, provider: item.provider })),
        feedSha256: "a".repeat(64),
        lifecycleFeedSha256: "b".repeat(64),
        inventorySha256: "c".repeat(64),
        notification: {
          sent: false,
          reason: "error",
          error: "delivery <failed>",
        },
      }),
    );
    expect(Buffer.byteLength(markdown, "utf8")).toBeLessThanOrEqual(900_000);
    expect(markdown).toContain("detailed table was omitted");
    expect(markdown).toContain("900000-byte job-summary limit");
    expect(markdown).toContain(`raw feed SHA-256 <code>${"a".repeat(64)}</code>`);
    expect(markdown).toContain("Slack delivery failed");
    expect(markdown).toContain("delivery &lt;failed&gt;");
  });

  test("distinguishes undated breaches and explains content-age semantics", () => {
    const undated = finding({
      status: "date-unknown",
      shutdownDate: null,
      daysUntilShutdown: null,
    });
    const markdown = renderSummary(
      summaryInput({
        findings: [undated],
        breaching: [undated],
        feedContentAgeDays: 46,
        providerFreshness: [{ provider: "Anthropic", ageDays: 46, newestTimestamp: 1 }],
      }),
    );
    expect(markdown).toContain("❌ Reported undated deprecation");
    expect(markdown).toContain("Not announced");
    expect(markdown).toContain("Configured-platform content ages: <code>Anthropic=46d</code>");
    expect(markdown).toContain("not whether every upstream scraper ran successfully");
  });

  test("marks overdue policy breaches explicitly", () => {
    const overdue = finding({
      status: "shutdown-passed",
      shutdownDate: "2026-07-01",
      daysUntilShutdown: -31,
    });
    expect(renderSummary(summaryInput({ findings: [overdue], breaching: [overdue] }))).toContain(
      "Reported shutdown date passed — failure threshold",
    );
  });

  test("escapes fatal errors in failure summaries", () => {
    const markdown = renderFailureSummary("bad <script>&\"quoted\"");
    expect(markdown).toContain("bad &lt;script&gt;&amp;&quot;quoted&quot;");
    expect(markdown).not.toContain("<script>");
    expect(markdown).toContain("<pre>bad &lt;script&gt;");
    expect(Buffer.byteLength(renderFailureSummary("<".repeat(1_000_000)), "utf8")).toBeLessThan(
      100_000,
    );
  });
});

describe("annotations and Slack rendering", () => {
  test("formats dated and undated findings unambiguously", () => {
    expect(formatDays(-2)).toBe("2 day(s) ago");
    expect(formatDays(0)).toBe("Today");
    expect(formatDays(null)).toBe("Unknown");
    expect(renderFindingAnnotation(finding())).toContain(
      "shutdown date 2026-08-20 — 19 day(s)",
    );
    expect(
      renderFindingAnnotation(
        finding({ status: "date-unknown", shutdownDate: null, daysUntilShutdown: null }),
      ),
    ).toContain("as deprecated, but no shutdown date is published");
    expect(
      renderFindingAnnotation(
        finding({ replacementModels: Array.from({ length: 100 }, () => "x".repeat(256)) }),
      ).length,
    ).toBeLessThanOrEqual(4_000);
    expect(renderFindingAnnotation(finding({ context: "scope\u001b[31m red" }))).not.toContain(
      "\u001b",
    );
  });

  test("neutralizes Slack mrkdwn mentions and source-link separators", () => {
    const text = renderSlackText([
      finding({
        id: "<!channel>&model",
        provider: "<@U123>",
        replacementModels: ["<!here>"],
        url: "https://example.com/path?a=1&b=2|label",
      }),
    ]);
    expect(text).toContain("&lt;!channel&gt;&amp;model");
    expect(text).toContain("&lt;@U123&gt;");
    expect(text).toContain("&lt;!here&gt;");
    expect(text).toContain("a=1&amp;b=2%7Clabel|source");
    expect(text).not.toContain("<!channel>");
    expect(renderSlackText([finding({ id: "*bold*_code_~strike~`code`" })])).not.toContain(
      "*bold*",
    );
  });

  test("keeps large notifications below the default Slack bound", () => {
    const findings = Array.from({ length: 500 }, (_, index) =>
      finding({
        id: `model-${index}-${"x".repeat(200)}`,
        replacementModels: [`replacement-${"y".repeat(150)}`],
      }),
    );
    const text = renderSlackText(findings);
    expect(text.length).toBeLessThanOrEqual(3_500);
    expect(text).toContain("more policy signal(s). See the GitHub job summary");
  });

  test("distinguishes lifecycle and unmatched policy breaches in Slack", () => {
    const lifecycle = finding({ context: "Free-tier retirement; paid usage differs." });
    const text = renderSlackText([lifecycle], {
      breaching: [lifecycle],
      unmatchedBreaching: [{ id: "typo-model", provider: "OpenAI" }],
    });
    expect(text).toContain("2 policy breach(es)");
    expect(text).toContain("❌ *legacy-model*");
    expect(text).toContain("Free-tier retirement; paid usage differs.");
    expect(text).toContain("no exact feed history for *typo-model*");
  });

  test("renders a bounded resolution notification", () => {
    expect(renderResolvedSlackText()).toContain("alert resolved");
    expect(renderResolvedSlackText()).toContain("no lifecycle findings");
  });

  test("prioritizes breach identities before warnings when Slack text is truncated", () => {
    const warnings = Array.from({ length: 40 }, (_, index) =>
      finding({
        id: `warning-${index}-${"x".repeat(180)}`,
        context: `Nonblocking context ${"y".repeat(180)}`,
      }),
    );
    const lifecycleBreach = finding({
      id: "critical-undated-model",
      status: "date-unknown",
      shutdownDate: null,
      daysUntilShutdown: null,
    });
    const text = renderSlackText([...warnings, lifecycleBreach], {
      breaching: [lifecycleBreach],
      unmatchedBreaching: [{ id: "critical-inventory-typo", provider: "OpenAI" }],
    });

    expect(text.length).toBeLessThanOrEqual(3_500);
    expect(text).toContain("❌ *critical-undated-model*");
    expect(text).toContain("❌ no exact feed history for *critical-inventory-typo*");
    expect(text).toContain("more policy signal(s)");
  });

  test("retains a breach identity at the maximum validated Slack field bounds", () => {
    const rawUrl = `https://example.com/?${"&".repeat(2_000)}`;
    expect(rawUrl.length).toBeLessThanOrEqual(2_048);
    const extreme = finding({
      id: `critical-model-${"&".repeat(240)}`,
      provider: "&".repeat(100),
      replacementModels: Array.from({ length: 3 }, () => "&".repeat(256)),
      context: "&".repeat(100_000),
      url: new URL(rawUrl).toString(),
    });
    const text = renderSlackText([extreme], { breaching: [extreme] });

    expect(text.length).toBeLessThanOrEqual(3_500);
    expect(text).toContain("• ❌ *critical-model-");
    expect(text).toContain("source URL in GitHub job summary");
    expect(text).not.toContain("…and 1 more policy signal(s)");
  });
});
