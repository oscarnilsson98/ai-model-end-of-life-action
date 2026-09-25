import { expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  publishAnnotations,
  publishCoreOutputs,
  renderSummary,
} from "../../src/action/publish.ts";
import type { AssessmentReport } from "../../src/shared/types.ts";

function cleanReport(): AssessmentReport {
  return {
    schemaVersion: 3,
    evaluatedAt: "2026-08-02T00:00:00Z",
    result: "no-actionable-risk",
    scanStatus: "complete",
    comparisonStatus: "not-applicable",
    exitReason: "none",
    targetKind: "commit",
    event: {
      eventName: "schedule",
      targetOid: "a".repeat(40),
      targetKind: "commit",
      comparisonRequested: false,
    },
    evidenceHealth: "current",
    evidenceSources: [{ id: "repository", kind: "repository", health: "current" }],
    evidenceFacts: [],
    lifecycleFindings: [],
    unresolvedReferences: [],
    diagnostics: [],
    counts: {
      evidence: 0,
      findings: 0,
      blocking: 0,
      advisory: 0,
      notices: 0,
      unresolved: 0,
      byScope: {
        application: 0,
        deployment: 0,
        test: 0,
        example: 0,
        documentation: 0,
        unknown: 0,
      },
      byResolution: { resolved: 0, dynamic: 0, unresolved: 0 },
    },
    policyDiff: [],
    feed: {
      sourceFeedSha256: "a".repeat(64),
      normalizedFeedSha256: "b".repeat(64),
      activeRecordsSha256: "c".repeat(64),
      feedAdapterManifestSha256: "d".repeat(64),
      generatedAt: "2026-08-02T00:00:00Z",
      ageDays: 0,
    },
    detectorManifestSha256: "e".repeat(64),
    scanFingerprint: "f".repeat(64),
    alertFingerprint: "0".repeat(64),
    outputTruncated: false,
    notificationStatus: "disabled",
    notificationReason: "no Slack webhook configured",
    reportPath: "/tmp/report.json",
  };
}

test("v3 summary bounds clean language to assessed evidence", () => {
  const report = cleanReport();
  expect(renderSummary(report)).toContain(
    "No actionable lifecycle risk found in eligible repository evidence",
  );
  expect(renderSummary(report)).toContain("those systems were not assessed");
});

test("unknown results never render a clean outcome", () => {
  const report: AssessmentReport = {
    ...cleanReport(),
    result: "unknown",
    scanStatus: "failed",
    exitReason: "assessment-failed",
    evidenceHealth: "invalid",
    evidenceSources: [{ id: "repository", kind: "repository", health: "invalid" }],
    diagnostics: [{ code: "feed-invalid", message: "feed failed", severity: "failed" }],
    feed: {
      sourceFeedSha256: "0".repeat(64),
      normalizedFeedSha256: "0".repeat(64),
      activeRecordsSha256: "0".repeat(64),
      feedAdapterManifestSha256: "0".repeat(64),
      generatedAt: "",
      ageDays: null,
    },
    notificationReason: "assessment failed",
  };
  const summary = renderSummary(report);
  expect(summary).toContain("A trustworthy lifecycle result could not be produced");
  expect(summary).not.toContain("No actionable lifecycle risk found");
});

test("one collapsed finding annotates once and names every candidate platform", () => {
  const report = cleanReport();
  report.lifecycleFindings = [
    {
      findingId: "finding",
      semanticKey: "semantic",
      evidenceIds: ["evidence"],
      modelId: "o4-mini",
      servingPlatform: "azure",
      servingPlatforms: ["azure", "openai"],
      lifecycleMatch: "exact",
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-10-16",
      daysUntilShutdown: 74,
      replacementModels: [],
      sourceUrls: [],
      feedConflict: false,
      outcome: "warning",
      reasons: ["Serving platform is ambiguous across azure, openai."],
      scope: "application",
      environment: "unknown",
      confidence: "low",
      selectorKind: "model-id",
      locations: [{ path: "packages/ai-client/src/models.ts", line: 23, column: 10 }],
    },
  ];

  const lines: string[] = [];
  publishAnnotations(report, (line: string) => lines.push(line));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("o4-mini on azure or openai: shutdown 2026-10-16 (in 74d).");
  expect(renderSummary(report)).toContain("azure or openai");

  // A suppression may name any covered platform, so the suppression list must not
  // attribute the suppression to the reported record's platform alone.
  const suppressed = cleanReport();
  suppressed.lifecycleFindings = [
    { ...report.lifecycleFindings[0]!, outcome: "none", suppressedBy: "registry-listing" },
  ];
  const suppressionLine = renderSummary(suppressed)
    .split("\n")
    .find((line) => line.includes("registry-listing"));
  expect(suppressionLine).toContain("azure or openai");
});

test("annotates degraded coverage so an upstream outage is not a silent green check", () => {
  const report = cleanReport();
  // An unavailable feed produces no findings at all, so the coverage diagnostic is the
  // only thing that can make the degradation visible in the Checks UI.
  report.scanStatus = "partial";
  report.diagnostics = [
    {
      code: "feed-unavailable",
      message: "The upstream lifecycle feed could not be loaded.",
      severity: "partial",
    },
    { code: "some-notice", message: "Informational only.", severity: "notice" },
  ];

  const lines: string[] = [];
  publishAnnotations(report, (line: string) => lines.push(line));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("::warning");
  expect(lines[0]).toContain("feed-unavailable");
});

test("collapses coverage annotations beyond the published bound", () => {
  const report = cleanReport();
  report.scanStatus = "partial";
  report.diagnostics = Array.from({ length: 7 }, (_, index) => ({
    code: `blind-spot-${index}`,
    message: "A blob no detector assessed.",
    severity: "partial" as const,
  }));

  const lines: string[] = [];
  publishAnnotations(report, (line: string) => lines.push(line));
  expect(lines.filter((line) => line.startsWith("::warning"))).toHaveLength(5);
  expect(lines.at(-1)).toContain("2 additional coverage diagnostic(s)");
});

function lifecycleFinding(
  overrides: Partial<AssessmentReport["lifecycleFindings"][number]>,
): AssessmentReport["lifecycleFindings"][number] {
  return {
    findingId: "finding",
    semanticKey: "semantic",
    evidenceIds: ["evidence"],
    modelId: "gpt-old",
    servingPlatform: "openai",
    servingPlatforms: ["openai"],
    lifecycleMatch: "exact",
    lifecycleStatus: "shutdown-scheduled",
    shutdownDate: "2026-08-20",
    daysUntilShutdown: 18,
    replacementModels: [],
    sourceUrls: [],
    feedConflict: false,
    outcome: "warning",
    reasons: ["Shutdown is 18 UTC calendar day(s) away."],
    scope: "application",
    environment: "production",
    confidence: "high",
    selectorKind: "model-id",
    locations: [{ path: "src/chat.ts", line: 1, column: 1 }],
    ...overrides,
  };
}

// Summary cells are Markdown-escaped, so parentheses render from entities.
const openParen = "&#40;";
const closeParen = "&#41;";

test("the summary leads with the shutdown and names the deprecation that opened the horizon", () => {
  const report = cleanReport();
  report.result = "advisory";
  report.lifecycleFindings = [
    lifecycleFinding({
      deprecationDate: "2026-06-01",
      shutdownDate: "2027-06-01",
      daysUntilShutdown: 303,
      daysUntilDeprecation: -62,
    }),
  ];

  // The shutdown is when calls fail; the deprecation says why a distant shutdown warns.
  expect(renderSummary(report)).toContain(
    `| shutdown 2027-06-01 ${openParen}in 303d${closeParen} · deprecated 2026-06-01 ${openParen}62d ago${closeParen} |`,
  );
});

test("the summary names only the shutdown when it is the nearer deadline", () => {
  const report = cleanReport();
  report.result = "advisory";
  report.lifecycleFindings = [
    lifecycleFinding({ deprecationDate: "2026-08-20", daysUntilDeprecation: 18 }),
  ];

  const summary = renderSummary(report);
  expect(summary).toContain(`| shutdown 2026-08-20 ${openParen}in 18d${closeParen} |`);
  expect(summary).not.toContain("deprecat");
});

test("the summary marks a model that has already shut down", () => {
  const report = cleanReport();
  report.result = "advisory";
  report.lifecycleFindings = [
    lifecycleFinding({
      deprecationDate: "2025-10-28",
      shutdownDate: "2026-02-19",
      daysUntilShutdown: -164,
      daysUntilDeprecation: -278,
    }),
    lifecycleFinding({
      findingId: "today",
      semanticKey: "today",
      modelId: "gpt-today",
      shutdownDate: "2026-08-02",
      daysUntilShutdown: 0,
    }),
  ];

  const summary = renderSummary(report);
  // Once the model is gone the earlier deprecation is noise.
  expect(summary).toContain(
    `| **shut down 2026-02-19 ${openParen}164d ago${closeParen}** |`,
  );
  expect(summary).toContain(
    `| **shuts down today ${openParen}2026-08-02${closeParen}** |`,
  );
  expect(summary).not.toContain("deprecat");
});

test("the summary and annotations order findings by shutdown whatever the report order", () => {
  const report = cleanReport();
  report.result = "advisory";
  // Pull-request findings arrive in comparison-merge order, not date order.
  report.lifecycleFindings = [
    lifecycleFinding({
      findingId: "a",
      semanticKey: "a",
      modelId: "gpt-deprecated-long-ago",
      deprecationDate: "2025-06-01",
      daysUntilDeprecation: -427,
      shutdownDate: "2027-06-01",
      daysUntilShutdown: 303,
    }),
    lifecycleFinding({
      findingId: "b",
      semanticKey: "b",
      modelId: "gpt-next-week",
      shutdownDate: "2026-08-09",
      daysUntilShutdown: 7,
    }),
    lifecycleFinding({
      findingId: "c",
      semanticKey: "c",
      modelId: "gpt-already-gone",
      shutdownDate: "2026-07-01",
      daysUntilShutdown: -32,
    }),
  ];

  const summary = renderSummary(report);
  const order = ["gpt-already-gone", "gpt-next-week", "gpt-deprecated-long-ago"];
  expect(order.map((model) => summary.indexOf(model))).toEqual(
    order.map((model) => summary.indexOf(model)).toSorted((left, right) => left - right),
  );
  const lines: string[] = [];
  publishAnnotations(report, (line: string) => lines.push(line));
  expect(lines.map((line) => order.find((model) => line.includes(`::${model} `)))).toEqual(order);
});

test("the summary names imminent shutdowns that are only notices", () => {
  const report = cleanReport();
  report.lifecycleFindings = [
    lifecycleFinding({
      findingId: "test-soon",
      semanticKey: "test-soon",
      modelId: "gpt-test-soon",
      outcome: "notice",
      scope: "test",
      daysUntilShutdown: 3,
      shutdownDate: "2026-08-05",
      locations: [{ path: "tests/chat.py", line: 1, column: 1 }],
    }),
    lifecycleFinding({
      findingId: "test-later",
      semanticKey: "test-later",
      modelId: "gpt-test-later",
      outcome: "notice",
      scope: "test",
      daysUntilShutdown: 31,
      shutdownDate: "2026-09-02",
    }),
    lifecycleFinding({
      findingId: "test-gone",
      semanticKey: "test-gone",
      modelId: "gpt-test-gone",
      outcome: "notice",
      scope: "test",
      daysUntilShutdown: -1,
      shutdownDate: "2026-08-01",
    }),
    // A notice in application scope sits outside the configured warning horizon.
    lifecycleFinding({
      findingId: "outside-horizon",
      semanticKey: "outside-horizon",
      modelId: "gpt-outside-horizon",
      outcome: "notice",
      scope: "application",
      daysUntilShutdown: 10,
    }),
  ];

  const summary = renderSummary(report);
  expect(summary).toContain(
    "### Shutting down within 30 days outside application and deployment scope",
  );
  expect(summary).toContain(
    `- <code>gpt-test-soon</code> on openai — shutdown 2026-08-05 ${openParen}in 3d${closeParen} · test · <code>tests/chat&#46;py</code>`,
  );
  expect(summary).not.toContain("gpt-test-later");
  expect(summary).not.toContain("gpt-test-gone");
  expect(summary).not.toContain("gpt-outside-horizon");
  // Notices never turn the outcome actionable.
  expect(summary).toContain("No actionable lifecycle risk found in eligible repository evidence");
});

test("active suppressions stay visible in the summary", () => {
  const report = cleanReport();
  report.lifecycleFindings = [
    {
      findingId: "finding",
      semanticKey: "semantic",
      evidenceIds: ["evidence"],
      modelId: "gpt-old",
      servingPlatform: "openai",
      servingPlatforms: ["openai"],
      lifecycleMatch: "exact",
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-08-20",
      daysUntilShutdown: 18,
      replacementModels: [],
      sourceUrls: ["https://example.com"],
      feedConflict: false,
      outcome: "none",
      reasons: ["Suppressed by reviewed policy."],
      scope: "application",
      environment: "production",
      confidence: "high",
      selectorKind: "model-id",
      locations: [{ path: "src/chat.ts", line: 1, column: 1 }],
      suppressedBy: "approved-exception",
    },
  ];

  const summary = renderSummary(report);
  expect(summary).toContain("Active suppressions");
  expect(summary).toContain("approved-exception");
  expect(summary).toContain("gpt-old");
});

test("repository text cannot inject HTML, Markdown links, tables, mentions, or autolinks", () => {
  const attack = "</details> | injected | ![click](https://attacker.example) @octocat www.attacker.example `code`";
  const report = cleanReport();
  report.notificationStatus = "failed";
  report.notificationReason = attack;
  report.evidenceSources = [
    { id: "repository", kind: "repository", health: "current" },
    { id: attack, kind: "external-source", health: "review-overdue" },
  ];
  report.lifecycleFindings = [
    {
      findingId: "finding",
      semanticKey: "semantic",
      evidenceIds: ["evidence"],
      modelId: attack,
      servingPlatform: "openai",
      servingPlatforms: ["openai"],
      lifecycleMatch: "exact",
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2026-08-20",
      daysUntilShutdown: 18,
      replacementModels: [],
      sourceUrls: [],
      feedConflict: false,
      outcome: "warning",
      reasons: [attack],
      scope: "application",
      environment: "production",
      confidence: "high",
      selectorKind: "model-id",
      locations: [{ path: attack, line: 1, column: 1 }],
    },
  ];
  report.diagnostics = [
    { code: attack, message: attack, path: attack, severity: "partial" },
  ];
  report.policyDiff = [attack];

  const summary = renderSummary(report);
  for (const unsafe of [
    "</details> | injected |",
    "![click]",
    "https://attacker.example",
    "@octocat",
    "www.attacker.example",
    "`code`",
  ]) {
    expect(summary).not.toContain(unsafe);
  }
  expect(summary).toContain("&lt;/details&gt;");
  expect(summary).toContain("&#124; injected &#124;");
  expect(summary).toContain("https&#58;//attacker&#46;example");
  expect(summary).toContain("&#64;octocat");
});

test("multibyte detail outputs compact linearly within the publication budget", () => {
  const directory = mkdtempSync(join(tmpdir(), "model-eol-publish-"));
  try {
    const outputPath = join(directory, "output.txt");
    const report = cleanReport();
    report.evidenceSources = [
      { id: "repository", kind: "repository", health: "current" },
      ...Array.from({ length: 5_000 }, (_, index) => ({
        id: `source-${index}-${"🙂".repeat(30)}`,
        kind: "external-source" as const,
        health: "current" as const,
      })),
    ];

    publishCoreOutputs(report, { GITHUB_OUTPUT: outputPath });

    const output = readFileSync(outputPath, "utf8");
    expect(report.outputTruncated).toBe(true);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThan(700 * 1024);
    expect(output).toContain("evidence-sources<<");
    expect(renderSummary(report).length).toBeLessThan(25_000);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
