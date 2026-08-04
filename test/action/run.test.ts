import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETECTOR_MANIFEST_VERSION } from "../../src/detection/manifest.ts";
import { detectSnapshot, type DetectionResult } from "../../src/detection/detectors.ts";
import type { ResolvedEventSelection } from "../../src/repository/event.ts";
import { loadV3FeedJson, type LoadedV3Feed } from "../../src/lifecycle/feed.ts";
import {
  DEFAULT_GIT_TREE_SNAPSHOT_LIMITS,
  type GitTreeSnapshot,
  type GitTreeSnapshotEntry,
} from "../../src/repository/git.ts";
import type { Environment } from "../../src/action/github.ts";
import { inspectPolicy } from "../../src/policy/policy.ts";
import { ActionRunError, run, type RunDependencies } from "../../src/action/run.ts";
import type { SnapshotClaimsInspection } from "../../src/evidence/snapshot-claims.ts";
import type {
  AssessmentReport,
  EventSelection,
  EvidenceFact,
  EvidenceHealth,
} from "../../src/shared/types.ts";

const NOW = Date.parse("2026-08-02T00:00:00Z");
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const TARGET = "c".repeat(40);
const POLICY = "schemaVersion: 1\npolicy:\n  failWithinDays: 30\n";
const temporaryDirectories: string[] = [];

const FEED: LoadedV3Feed = loadV3FeedJson(
  JSON.stringify({
    schemaVersion: 3,
    adapter: { id: "fixture", version: "1", sourceSha256: "d".repeat(64) },
    generatedAt: "2026-08-02T00:00:00Z",
    records: [
      {
        recordId: "openai-gpt-old",
        servingPlatform: "openai",
        primarySourceUrl: "https://example.com/openai/gpt-old",
        supersedesRecordIds: [],
        recordKind: "model",
        modelId: "gpt-old",
        literalScanEligible: true,
        lifecycleStatus: "shutdown-scheduled",
        shutdownDate: "2026-08-20",
        replacementModels: [],
      },
    ],
  }),
);

/** Same feed contents, produced at an arbitrary earlier instant. */
function feedGeneratedAt(generatedAt: string): LoadedV3Feed {
  return loadV3FeedJson(
    JSON.stringify({
      schemaVersion: 3,
      adapter: { id: "fixture", version: "1", sourceSha256: "d".repeat(64) },
      generatedAt,
      records: [
        {
          recordId: "openai-gpt-old",
          servingPlatform: "openai",
          primarySourceUrl: "https://example.com/openai/gpt-old",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "gpt-old",
          literalScanEligible: true,
          lifecycleStatus: "shutdown-scheduled",
          shutdownDate: "2026-08-20",
          replacementModels: [],
        },
      ],
    }),
  );
}

/** Frozen 62 days before NOW: well past the 30-day default horizon. */
const STALE_FEED: LoadedV3Feed = feedGeneratedAt("2026-06-01T00:00:00Z");

const PARTIAL_FEED: LoadedV3Feed = {
  ...FEED,
  index: {
    ...FEED.index,
    diagnostics: [
      ...FEED.index.diagnostics,
      {
        kind: "feed-pair-set-change",
        addedPairCount: 1,
        removedPairCount: 1,
        addedPairs: [["OpenAI", "unreviewed-model"]],
        removedPairs: [["OpenAI", "reviewed-model"]],
      },
    ],
  },
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixtureEnvironment(inputs: Environment = {}): {
  directory: string;
  environment: Environment;
  outputPath: string;
  reportPath: string;
  summaryPath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "ai-model-eol-run-test-"));
  temporaryDirectories.push(directory);
  const outputPath = join(directory, "output.txt");
  const reportPath = join(directory, "report.json");
  const summaryPath = join(directory, "summary.md");
  return {
    directory,
    environment: {
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: summaryPath,
      GITHUB_EVENT_NAME: "schedule",
      GITHUB_SHA: TARGET,
      ...inputs,
    },
    outputPath,
    reportPath,
    summaryPath,
  };
}

function outputs(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*)<<(.*)$/.exec(lines[index] ?? "");
    if (match === null) continue;
    const key = match[1];
    const delimiter = match[2];
    if (key === undefined || delimiter === undefined) continue;
    const values: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      values.push(lines[index] ?? "");
      index += 1;
    }
    result[key] = values.join("\n");
  }
  return result;
}

function reportFrom(path: string): AssessmentReport {
  return JSON.parse(readFileSync(path, "utf8")) as AssessmentReport;
}

function entry(path: string, text: string, index: number): GitTreeSnapshotEntry {
  const bytes = new TextEncoder().encode(text);
  return {
    pathBytes: new TextEncoder().encode(path),
    displayPath: path,
    mode: "100644",
    kind: "regular",
    objectId: index.toString(16).padStart(40, "0"),
    declaredObjectType: "blob",
    objectSize: bytes.byteLength,
    content: { state: "available", bytes },
  };
}

function snapshot(
  treeObjectId: string,
  options: { policy?: string; scanStatus?: "complete" | "partial" } = {},
): GitTreeSnapshot {
  const entries = options.policy === undefined
    ? []
    : [entry(".github/ai-model-lifecycle.yml", options.policy, 1)];
  const assessedBytes = entries.reduce(
    (total, candidate) => total + (candidate.objectSize ?? 0),
    0,
  );
  return {
    treeObjectId,
    scanStatus: options.scanStatus ?? "complete",
    entries,
    diagnostics: [],
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length,
      uniqueObjectCount: entries.length,
      uniqueBlobObjectCount: entries.length,
      availableBlobEntryCount: entries.length,
      oversizedBlobEntryCount: 0,
      unavailableBlobEntryCount: 0,
      symlinkEntryCount: 0,
      gitlinkEntryCount: 0,
      lfsPointerEntryCount: 0,
      assessedBlobBytes: assessedBytes,
      readObjectBytes: assessedBytes,
      readObjectCount: entries.length,
      metadataBytes: 0,
    },
    limits: { ...DEFAULT_GIT_TREE_SNAPSHOT_LIMITS },
  };
}

const JSX_SOURCE = `import { useChat } from "ai/react";

export default function Page() {
  const { messages } = useChat({ model: "gpt-old" });
  return <ul>{messages.map((message) => <li key={message.id}>{message.text}</li>)}</ul>;
}
`;

/** A snapshot whose only source blob is JSX that no published tokenizer accepts. */
function jsxSnapshot(treeObjectId: string): GitTreeSnapshot {
  const entries = [entry("app/page.tsx", JSX_SOURCE, 2)];
  const assessedBytes = entries.reduce(
    (total, candidate) => total + (candidate.objectSize ?? 0),
    0,
  );
  const base = snapshot(treeObjectId);
  return {
    ...base,
    entries,
    stats: {
      ...base.stats,
      entryCount: entries.length,
      blobEntryCount: entries.length,
      uniqueObjectCount: entries.length,
      uniqueBlobObjectCount: entries.length,
      availableBlobEntryCount: entries.length,
      assessedBlobBytes: assessedBytes,
      readObjectBytes: assessedBytes,
      readObjectCount: entries.length,
    },
  };
}

function evidence(evidenceId = "repository:model:gpt-old"): EvidenceFact {
  return {
    evidenceId,
    origin: "repository",
    kind: "sdk-argument",
    confidence: "high",
    scope: "application",
    environment: "production",
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
  };
}

function detection(
  facts: readonly EvidenceFact[],
  scanStatus: "complete" | "partial" = "complete",
): DetectionResult {
  return { evidence: [...facts], diagnostics: [], scanStatus };
}

function sourceClaims(options: {
  sourceVersionTime: string;
  freshnessBoundary: string;
  expiresAt: string;
  health?: EvidenceHealth;
  digest?: string;
}): SnapshotClaimsInspection {
  const health = options.health ?? "current";
  const diagnostics = health === "current"
    ? []
    : [{
        code: `evidence-source-${health}`,
        message: `Evidence source is ${health}.`,
        path: ".github/ai-model-evidence/prod.json",
        severity: "partial" as const,
      }];
  return {
    policy: inspectPolicy(undefined),
    evidenceDocuments: [
      {
        path: ".github/ai-model-evidence/prod.json",
        digest: options.digest ?? options.sourceVersionTime,
        sourceId: "prod-gateway",
        sourceKind: "runtime-observation",
        sourceEnvironment: "production",
        lineageIdentity: "prod-gateway/runtime-observation/production",
        sourceVersionTime: options.sourceVersionTime,
        freshnessBoundary: options.freshnessBoundary,
        expiresAt: options.expiresAt,
        rawEvidenceIds: [],
        present: true,
        valid: true,
        health,
        partialCoverage: false,
        facts: [],
        diagnostics,
      },
    ],
    facts: [],
    diagnostics,
    evidenceHealth: health,
    scanStatus: health === "current" ? "complete" : "partial",
    invalid: false,
  };
}

function emptyClaims(): SnapshotClaimsInspection {
  return {
    policy: inspectPolicy(undefined),
    evidenceDocuments: [],
    facts: [],
    diagnostics: [],
    evidenceHealth: "current",
    scanStatus: "complete",
    invalid: false,
  };
}

function nonComparisonEvent(): ResolvedEventSelection {
  return {
    selection: {
      eventName: "schedule",
      targetOid: TARGET,
      targetKind: "commit",
      comparisonRequested: false,
    },
    comparisonStatus: "not-applicable",
    diagnostics: [],
  };
}

function comparisonEvent(
  status: "available" | "unavailable" = "available",
): ResolvedEventSelection {
  return {
    selection: {
      eventName: "pull_request",
      targetOid: TARGET,
      targetKind: status === "available" ? "synthetic-merge" : "synthetic-merge-uncompared",
      baseOid: BASE,
      submittedHeadOid: HEAD,
      comparisonRequested: true,
    },
    comparisonStatus: status,
    diagnostics:
      status === "available"
        ? []
        : [{
            code: "trusted-base-unavailable",
            message: "The exact base is unavailable locally.",
            severity: "partial",
          }],
    targetParentOids: [HEAD, BASE],
  };
}

function dependencies(
  fixture: ReturnType<typeof fixtureEnvironment>,
  overrides: RunDependencies = {},
): RunDependencies {
  return {
    environment: fixture.environment,
    repositoryPath: fixture.directory,
    reportPath: fixture.reportPath,
    now: () => NOW,
    log: () => {},
    loadFeed: async () => FEED,
    resolveEvent: nonComparisonEvent,
    readSnapshot: (_repositoryPath, treeish) => snapshot(treeish),
    detect: () => detection([]),
    ...overrides,
  };
}

async function rejectedReport(promise: Promise<AssessmentReport>): Promise<AssessmentReport> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ActionRunError);
    return (error as ActionRunError).report;
  }
  throw new Error("Expected the v3 run to fail.");
}

describe("v3 production orchestration", () => {
  test("publishes a blocking assessment and report before returning failure", async () => {
    const fixture = fixtureEnvironment({ "INPUT_FAIL-WITHIN-DAYS": "30" });
    const report = await rejectedReport(
      run(
        dependencies(fixture, {
          detect: () => detection([evidence()]),
        }),
      ),
    );

    expect(report).toMatchObject({
      result: "blocking",
      scanStatus: "complete",
      comparisonStatus: "not-applicable",
      exitReason: "policy-breach",
    });
    expect(report.baselineResult).toBeUndefined();
    expect(report.targetResult).toBeUndefined();
    expect(existsSync(fixture.reportPath)).toBe(true);
    expect(reportFrom(fixture.reportPath)).toEqual(report);
    expect(outputs(fixture.outputPath)).toMatchObject({
      result: "blocking",
      "scan-status": "complete",
      "exit-reason": "policy-breach",
      "baseline-result": "",
      "target-result": "",
      "report-path": fixture.reportPath,
    });
    expect(readFileSync(fixture.summaryPath, "utf8")).toContain("**blocking**");
  });

  test("does not fail an unrelated PR for unchanged base debt", async () => {
    const fixture = fixtureEnvironment({ GITHUB_EVENT_NAME: "pull_request" });
    const report = await run(
      dependencies(fixture, {
        resolveEvent: () => comparisonEvent("available"),
        readSnapshot: (_repositoryPath, treeish) => snapshot(treeish, { policy: POLICY }),
        detect: () => detection([evidence()]),
      }),
    );

    expect(report).toMatchObject({
      result: "no-actionable-risk",
      baselineResult: "blocking",
      targetResult: "blocking",
      scanStatus: "complete",
      baselineScanStatus: "complete",
      targetScanStatus: "complete",
      comparisonStatus: "available",
      exitReason: "none",
    });
    const reportedEvent = report.event as EventSelection & { targetParentOids?: string[] };
    expect(reportedEvent.targetParentOids).toEqual([HEAD, BASE]);
    expect(report.lifecycleFindings[0]?.delta).toBe("unchanged");
  });

  test("reports a deleted base evidence source and preserves refresh health semantics", async () => {
    const baseSource = sourceClaims({
      sourceVersionTime: "2026-08-01T00:00:00Z",
      freshnessBoundary: "2026-09-01T00:00:00Z",
      expiresAt: "2026-10-01T00:00:00Z",
      digest: "base-current",
    });
    const deletionFixture = fixtureEnvironment({ GITHUB_EVENT_NAME: "pull_request" });
    const deletion = await run(
      dependencies(deletionFixture, {
        resolveEvent: () => comparisonEvent("available"),
        inspectClaims: ({ snapshot: inspected }) =>
          inspected.treeObjectId === BASE ? baseSource : emptyClaims(),
      }),
    );
    expect(deletion.result).toBe("advisory");
    expect(deletion.diagnostics).toContainEqual(
      expect.objectContaining({ code: "evidence-source-deletion-ignored" }),
    );
    expect(deletion.evidenceSources).toContainEqual({
      id: "prod-gateway",
      kind: "external-source",
      health: "current",
    });

    const staleBase = sourceClaims({
      sourceVersionTime: "2026-06-01T00:00:00Z",
      freshnessBoundary: "2026-07-01T00:00:00Z",
      expiresAt: "2026-09-01T00:00:00Z",
      health: "stale",
      digest: "base-stale",
    });
    const freshTarget = sourceClaims({
      sourceVersionTime: "2026-08-01T00:00:00Z",
      freshnessBoundary: "2026-10-01T00:00:00Z",
      expiresAt: "2027-01-01T00:00:00Z",
      digest: "target-current",
    });
    const refreshFixture = fixtureEnvironment({ GITHUB_EVENT_NAME: "pull_request" });
    const refresh = await run(
      dependencies(refreshFixture, {
        resolveEvent: () => comparisonEvent("available"),
        inspectClaims: ({ snapshot: inspected }) =>
          inspected.treeObjectId === BASE ? staleBase : freshTarget,
      }),
    );
    expect(refresh.evidenceSources).toContainEqual({
      id: "prod-gateway",
      kind: "external-source",
      health: "current",
    });
    expect(refresh.scanStatus).toBe("complete");
  });

  test("fails unknown plus partial when comparison authority is unavailable", async () => {
    const fixture = fixtureEnvironment({
      GITHUB_EVENT_NAME: "pull_request",
      "INPUT_SLACK-WEBHOOK": "https://hooks.slack.test/services/test",
    });
    let notificationCalls = 0;
    const report = await rejectedReport(
      run(
        dependencies(fixture, {
          resolveEvent: () => comparisonEvent("unavailable"),
          detect: () => detection([evidence()]),
          deliverNotification: async () => {
            notificationCalls += 1;
            return { status: "skipped", detail: "comparison event" };
          },
        }),
      ),
    );

    expect(notificationCalls).toBe(1);
    expect(report).toMatchObject({
      result: "unknown",
      scanStatus: "partial",
      comparisonStatus: "unavailable",
      exitReason: "trusted-base-unavailable",
      notificationStatus: "skipped",
    });
    expect(report.targetResult).toBeUndefined();
    expect(report.targetScanStatus).toBeUndefined();
    expect(report.lifecycleFindings).toHaveLength(1);
    const reportedEvent = report.event as EventSelection & { targetParentOids?: string[] };
    expect(reportedEvent.targetParentOids).toEqual([HEAD, BASE]);
  });

  test("fails closed for partial coverage only when enforcement is enabled", async () => {
    const enforced = fixtureEnvironment({ "INPUT_FAIL-WITHIN-DAYS": "30" });
    const failed = await rejectedReport(
      run(
        dependencies(enforced, {
          detect: () => detection([], "partial"),
        }),
      ),
    );
    expect(failed).toMatchObject({
      result: "no-actionable-risk",
      scanStatus: "partial",
      exitReason: "partial-disallowed",
    });

    const advisoryOnly = fixtureEnvironment();
    const succeeded = await run(
      dependencies(advisoryOnly, {
        detect: () => detection([], "partial"),
      }),
    );
    expect(succeeded).toMatchObject({
      result: "no-actionable-risk",
      scanStatus: "partial",
      exitReason: "none",
    });
  });

  test("enforces on a JSX repository without requiring allow-partial", async () => {
    const fixture = fixtureEnvironment({ "INPUT_FAIL-WITHIN-DAYS": "30" });
    const report = await run(
      dependencies(fixture, {
        readSnapshot: (_repositoryPath, treeish) => jsxSnapshot(treeish),
        detect: detectSnapshot,
      }),
    );

    // The tokenizer cannot accept JSX, so the semantic pass is discarded on every
    // run. The lexical fallback still assessed the blob, so coverage stays complete
    // and enforcement remains usable without buying `allow-partial: true`.
    expect(report).toMatchObject({
      scanStatus: "complete",
      exitReason: "none",
    });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic-tokenization-incomplete@1",
      path: "app/page.tsx",
      severity: "notice",
    }));
    expect(
      report.evidenceFacts.some((fact) => fact.kind === "lexical" && fact.modelId === "gpt-old"),
    ).toBe(true);
    expect(outputs(fixture.outputPath)).toMatchObject({
      "scan-status": "complete",
      "exit-reason": "none",
    });
  });

  test("propagates quarantined legacy pair-set drift as enforceable partial coverage", async () => {
    const cases = [
      {
        inputs: {},
        rejects: false,
        exitReason: "none",
      },
      {
        inputs: { "INPUT_FAIL-WITHIN-DAYS": "30" },
        rejects: true,
        exitReason: "partial-disallowed",
      },
      {
        inputs: {
          "INPUT_FAIL-WITHIN-DAYS": "30",
          "INPUT_ALLOW-PARTIAL": "true",
        },
        rejects: false,
        exitReason: "none",
      },
    ] as const;

    for (const testCase of cases) {
      const fixture = fixtureEnvironment(testCase.inputs);
      const invocation = run(
        dependencies(fixture, { loadFeed: async () => PARTIAL_FEED }),
      );
      const report = testCase.rejects
        ? await rejectedReport(invocation)
        : await invocation;
      expect(report).toMatchObject({
        result: "no-actionable-risk",
        scanStatus: "partial",
        exitReason: testCase.exitReason,
      });
      expect(report.diagnostics).toEqual([
        expect.objectContaining({ code: "feed-pair-set-change", severity: "partial" }),
      ]);
      expect(readFileSync(fixture.summaryPath, "utf8")).toContain(
        "No unreviewed row was normalized into lifecycle authority",
      );
    }
  });

  test("degrades coverage when the upstream feed stopped updating", async () => {
    const fixture = fixtureEnvironment();
    const report = await run(dependencies(fixture, { loadFeed: async () => STALE_FEED }));
    expect(report).toMatchObject({
      // Warning-only runs stay green, but the all-clear is no longer presented as complete.
      result: "no-actionable-risk",
      scanStatus: "partial",
      exitReason: "none",
    });
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: "feed-stale", severity: "partial" }),
    ]);
    expect(report.diagnostics[0]?.message).toContain("2026-06-01T00:00:00Z");
    expect(report.diagnostics[0]?.message).toContain("30 day(s)");
    expect(report.feed).toMatchObject({ generatedAt: "2026-06-01T00:00:00Z", ageDays: 62 });
    expect(readFileSync(fixture.summaryPath, "utf8")).toContain(
      "A feed that stopped updating reports a permanent all-clear",
    );
  });

  test("fails an enforced run closed on a stale feed unless partial is allowed", async () => {
    const enforced = fixtureEnvironment({ "INPUT_FAIL-WITHIN-DAYS": "30" });
    const failed = await rejectedReport(
      run(dependencies(enforced, { loadFeed: async () => STALE_FEED })),
    );
    expect(failed).toMatchObject({
      scanStatus: "partial",
      exitReason: "partial-disallowed",
    });

    const permitted = fixtureEnvironment({
      "INPUT_FAIL-WITHIN-DAYS": "30",
      "INPUT_ALLOW-PARTIAL": "true",
    });
    const tolerated = await run(
      dependencies(permitted, { loadFeed: async () => STALE_FEED }),
    );
    expect(tolerated).toMatchObject({ scanStatus: "partial", exitReason: "none" });
  });

  test("honours a configured feed-age horizon in both directions", async () => {
    const cases = [
      { horizon: "90", scanStatus: "complete", stale: false },
      { horizon: "61", scanStatus: "partial", stale: true },
      { horizon: "62", scanStatus: "complete", stale: false },
      // An emptied input disables the guard outright, matching the v1 escape hatch.
      { horizon: "", scanStatus: "complete", stale: false },
      { horizon: "0", scanStatus: "partial", stale: true },
    ] as const;

    for (const testCase of cases) {
      const fixture = fixtureEnvironment({ "INPUT_MAX-FEED-AGE-DAYS": testCase.horizon });
      const report = await run(dependencies(fixture, { loadFeed: async () => STALE_FEED }));
      expect(report.scanStatus).toBe(testCase.scanStatus);
      expect(
        report.diagnostics.some((diagnostic) => diagnostic.code === "feed-stale"),
      ).toBe(testCase.stale);
    }
  });

  test("never lets a stale feed weaken a comparison", async () => {
    // Staleness measures the one feed snapshot both sides share, so it must degrade the
    // run's declared coverage without touching per-side extraction. Routing it through
    // detection instead would make the comparison partial, reclassify this genuinely new
    // breach as `comparison-unknown`, and downgrade it to a warning: a stale upstream
    // would then turn an enforced failure into a green advisory.
    const policy = "schemaVersion: 1\npolicy:\n  failWithinDays: 30\n  allowPartial: true\n";
    const comparison = (feed: LoadedV3Feed): RunDependencies => ({
      resolveEvent: () => comparisonEvent("available"),
      loadFeed: async () => feed,
      readSnapshot: (_repositoryPath, treeish) => snapshot(treeish, { policy }),
      detect: (inspected) =>
        detection(inspected.treeObjectId === BASE ? [] : [evidence()]),
    });

    const fresh = await rejectedReport(
      run(
        dependencies(
          fixtureEnvironment({ GITHUB_EVENT_NAME: "pull_request" }),
          comparison(FEED),
        ),
      ),
    );
    const stale = await rejectedReport(
      run(
        dependencies(
          fixtureEnvironment({ GITHUB_EVENT_NAME: "pull_request" }),
          comparison(STALE_FEED),
        ),
      ),
    );

    for (const report of [fresh, stale]) {
      expect(report).toMatchObject({
        result: "blocking",
        comparisonStatus: "available",
        baselineScanStatus: "complete",
        targetScanStatus: "complete",
        exitReason: "policy-breach",
      });
      expect(report.lifecycleFindings[0]).toMatchObject({
        delta: "new",
        outcome: "breach",
      });
    }
    expect(fresh.scanStatus).toBe("complete");
    expect(stale.scanStatus).toBe("partial");
    expect(stale.diagnostics).toContainEqual(
      expect.objectContaining({ code: "feed-stale", severity: "partial" }),
    );
  });

  test("fails an enforced comparison closed on a stale feed", async () => {
    const fixture = fixtureEnvironment({
      GITHUB_EVENT_NAME: "pull_request",
      "INPUT_FAIL-WITHIN-DAYS": "30",
    });
    const report = await rejectedReport(
      run(
        dependencies(fixture, {
          resolveEvent: () => comparisonEvent("available"),
          loadFeed: async () => STALE_FEED,
        }),
      ),
    );
    expect(report).toMatchObject({
      result: "no-actionable-risk",
      scanStatus: "partial",
      comparisonStatus: "available",
      exitReason: "partial-disallowed",
    });
  });

  test("publishes feed freshness as an output consumers can alert on", async () => {
    const fresh = fixtureEnvironment();
    await run(dependencies(fresh));
    expect(outputs(fresh.outputPath)).toMatchObject({
      "feed-generated-at": "2026-08-02T00:00:00Z",
      "feed-age-days": "0",
      "scan-status": "complete",
    });

    const stale = fixtureEnvironment();
    await run(dependencies(stale, { loadFeed: async () => STALE_FEED }));
    expect(outputs(stale.outputPath)).toMatchObject({
      "feed-generated-at": "2026-06-01T00:00:00Z",
      "feed-age-days": "62",
      "scan-status": "partial",
    });
  });

  test("leaves feed freshness outputs empty when the feed never loaded", async () => {
    const fixture = fixtureEnvironment();
    await rejectedReport(
      run(
        dependencies(fixture, {
          loadFeed: async () => {
            throw new Error("fixture feed unavailable");
          },
        }),
      ),
    );
    expect(outputs(fixture.outputPath)).toMatchObject({
      "feed-generated-at": "",
      "feed-age-days": "",
      "scan-status": "failed",
    });
  });

  test("publishes unknown plus failed when the feed cannot be loaded", async () => {
    const fixture = fixtureEnvironment();
    const report = await rejectedReport(
      run(
        dependencies(fixture, {
          loadFeed: async () => {
            throw new Error("fixture feed schema failed");
          },
        }),
      ),
    );

    expect(report).toMatchObject({
      result: "unknown",
      scanStatus: "failed",
      exitReason: "assessment-failed",
    });
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "feed-failed", severity: "failed" }),
    );
    expect(reportFrom(fixture.reportPath)).toEqual(report);
    expect(outputs(fixture.outputPath)).toMatchObject({
      result: "unknown",
      "scan-status": "failed",
      "exit-reason": "assessment-failed",
    });
  });

  test("attempts notification only after core publication and keeps health independent", async () => {
    const fixture = fixtureEnvironment({
      "INPUT_SLACK-WEBHOOK": "https://hooks.slack.test/services/test",
      "INPUT_NOTIFICATION-FAILURE-MODE": "warn",
    });
    let observedInitialReport = false;
    const report = await run(
      dependencies(fixture, {
        detect: () => detection([evidence()]),
        deliverNotification: async ({ report: notificationReport }) => {
          expect(outputs(fixture.outputPath).result).toBe("advisory");
          expect(readFileSync(fixture.summaryPath, "utf8")).toContain(
            "Slack snapshot pending",
          );
          expect(reportFrom(fixture.reportPath)).toMatchObject({
            result: "advisory",
            scanStatus: "complete",
            notificationStatus: "disabled",
          });
          expect(notificationReport.result).toBe("advisory");
          observedInitialReport = true;
          return { status: "failed", detail: "Slack webhook returned HTTP 503." };
        },
      }),
    );

    expect(observedInitialReport).toBe(true);
    expect(report).toMatchObject({
      result: "advisory",
      scanStatus: "complete",
      notificationStatus: "failed",
      notificationReason: "Slack webhook returned HTTP 503.",
      exitReason: "notification-failed",
    });
    expect(reportFrom(fixture.reportPath)).toEqual(report);
    expect(outputs(fixture.outputPath)).toMatchObject({
      result: "advisory",
      "scan-status": "complete",
      "notification-status": "failed",
      "exit-reason": "notification-failed",
    });
    expect(readFileSync(fixture.summaryPath, "utf8")).toContain(
      "Slack: **failed** · Slack webhook returned HTTP 503&#46;",
    );
  });
});

describe("v3 release-gate exit and orchestration matrix", () => {
  test("publishes deterministic clean, advisory, blocking, partial, and failed fixtures", async () => {
    const cases: ReadonlyArray<{
      name: string;
      inputs?: Environment;
      hasEvidence?: boolean;
      detectionStatus?: "complete" | "partial";
      feedFailure?: boolean;
      notificationFailure?: boolean;
      shouldReject?: boolean;
      expected: Pick<AssessmentReport, "result" | "scanStatus" | "exitReason">;
    }> = [
      {
        name: "clean complete",
        expected: {
          result: "no-actionable-risk",
          scanStatus: "complete",
          exitReason: "none",
        },
      },
      {
        name: "advisory complete",
        hasEvidence: true,
        expected: { result: "advisory", scanStatus: "complete", exitReason: "none" },
      },
      {
        name: "blocking complete",
        inputs: { "INPUT_FAIL-WITHIN-DAYS": "30" },
        hasEvidence: true,
        shouldReject: true,
        expected: {
          result: "blocking",
          scanStatus: "complete",
          exitReason: "policy-breach",
        },
      },
      {
        name: "partial warning-only",
        detectionStatus: "partial" as const,
        expected: {
          result: "no-actionable-risk",
          scanStatus: "partial",
          exitReason: "none",
        },
      },
      {
        name: "partial enforcement fails closed",
        inputs: { "INPUT_FAIL-WITHIN-DAYS": "30" },
        detectionStatus: "partial" as const,
        shouldReject: true,
        expected: {
          result: "no-actionable-risk",
          scanStatus: "partial",
          exitReason: "partial-disallowed",
        },
      },
      {
        name: "partial explicitly allowed",
        inputs: {
          "INPUT_FAIL-WITHIN-DAYS": "30",
          "INPUT_ALLOW-PARTIAL": "true",
        },
        detectionStatus: "partial" as const,
        expected: {
          result: "no-actionable-risk",
          scanStatus: "partial",
          exitReason: "none",
        },
      },
      {
        name: "blocking remains blocking when partial is allowed",
        inputs: {
          "INPUT_FAIL-WITHIN-DAYS": "30",
          "INPUT_ALLOW-PARTIAL": "true",
        },
        hasEvidence: true,
        detectionStatus: "partial" as const,
        shouldReject: true,
        expected: {
          result: "blocking",
          scanStatus: "partial",
          exitReason: "policy-breach",
        },
      },
      {
        name: "operational feed failure",
        feedFailure: true,
        shouldReject: true,
        expected: {
          result: "unknown",
          scanStatus: "failed",
          exitReason: "assessment-failed",
        },
      },
      {
        name: "configured notification failure",
        inputs: { "INPUT_SLACK-WEBHOOK": "https://hooks.slack.test/services/release-matrix" },
        hasEvidence: true,
        notificationFailure: true,
        shouldReject: true,
        expected: {
          result: "advisory",
          scanStatus: "complete",
          exitReason: "notification-failed",
        },
      },
    ];

    for (const releaseCase of cases) {
      const fixture = fixtureEnvironment({ ...(releaseCase.inputs ?? {}) });
      const invocation = run(
        dependencies(fixture, {
          detect: () =>
            detection(
              releaseCase.hasEvidence === true ? [evidence(`matrix:${releaseCase.name}`)] : [],
              releaseCase.detectionStatus ?? "complete",
            ),
          ...(releaseCase.feedFailure === true
            ? {
                loadFeed: async (): Promise<LoadedV3Feed> => {
                  throw new Error("release-matrix feed failure");
                },
              }
            : {}),
          ...(releaseCase.notificationFailure === true
            ? {
                deliverNotification: async () => ({
                  status: "failed" as const,
                  detail: "release-matrix notification failure",
                }),
              }
            : {}),
        }),
      );
      const report = releaseCase.shouldReject === true
        ? await rejectedReport(invocation)
        : await invocation;

      expect(report, releaseCase.name).toMatchObject(releaseCase.expected);
      expect(reportFrom(fixture.reportPath), releaseCase.name).toEqual(report);
      expect(outputs(fixture.outputPath), releaseCase.name).toMatchObject({
        result: releaseCase.expected.result,
        "scan-status": releaseCase.expected.scanStatus,
        "exit-reason": releaseCase.expected.exitReason,
        "report-path": fixture.reportPath,
      });
      expect(readFileSync(fixture.summaryPath, "utf8"), releaseCase.name).toContain(
        `**${releaseCase.expected.result}**`,
      );
    }
  });
});
