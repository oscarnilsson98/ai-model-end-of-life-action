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
  expect(lines[0]).toContain("o4-mini on azure or openai: shutdown 2026-10-16 (74 day(s))");
  expect(renderSummary(report)).toContain("azure or openai");
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
