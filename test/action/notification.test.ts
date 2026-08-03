import { describe, expect, test } from "bun:test";
import { deliverSlackNotification } from "../../src/action/notification.ts";
import type {
  AssessmentReport,
  LifecycleFinding,
} from "../../src/shared/types.ts";

const TARGET = "a".repeat(40);
const WEBHOOK = "https://hooks.slack.test/services/a/b/secret-token";

function finding(overrides: Partial<LifecycleFinding> = {}): LifecycleFinding {
  return {
    findingId: "finding",
    semanticKey: "semantic",
    evidenceIds: ["evidence"],
    modelId: "gpt-old",
    servingPlatform: "openai",
    lifecycleMatch: "exact",
    lifecycleStatus: "shutdown-scheduled",
    shutdownDate: "2026-08-20",
    daysUntilShutdown: 18,
    replacementModels: [],
    sourceUrls: ["https://provider.example/deprecations"],
    feedConflict: false,
    outcome: "warning",
    reasons: ["INTERNAL_SECRET_REASON"],
    scope: "application",
    environment: "unknown",
    confidence: "high",
    selectorKind: "model-id",
    locations: [{ path: "/secret/workspace/src/chat.ts", line: 1, column: 1 }],
    ...overrides,
  };
}

function report(overrides: Partial<AssessmentReport> = {}): AssessmentReport {
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
      targetOid: TARGET,
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
    notificationReason: "not attempted",
    reportPath: "/secret/runner/path/ai-model-lifecycle-report.json",
    ...overrides,
  };
}

type CapturedRequest = {
  input: string | URL | Request;
  init?: RequestInit;
};

async function withEnvironment<T>(
  overrides: Readonly<Record<string, string | undefined>>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map(
    Object.keys(overrides).map((key) => [key, process.env[key]] as const),
  );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function deliveredText(
  assessment: AssessmentReport,
  environment: Readonly<Record<string, string | undefined>> = {},
): Promise<string> {
  let captured: CapturedRequest | undefined;
  const result = await withEnvironment(environment, () =>
    deliverSlackNotification({
      webhookUrl: WEBHOOK,
      report: assessment,
      fetchImpl: async (input, init) => {
        captured = init === undefined ? { input } : { input, init };
        return new Response(null, { status: 204 });
      },
    }),
  );
  expect(result.status).toBe("sent");
  return payloadText(captured as CapturedRequest);
}

function payloadText(request: CapturedRequest): string {
  const body = request.init?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON string request body.");
  const payload = JSON.parse(body) as { text?: unknown };
  if (typeof payload.text !== "string") throw new Error("Expected a Slack text payload.");
  return payload.text;
}

describe("v3 Slack snapshot delivery", () => {
  test("sends a clean bounded snapshot with authoritative event identity", async () => {
    const requests: CapturedRequest[] = [];
    const assessment = report();
    const result = await deliverSlackNotification({
      webhookUrl: WEBHOOK,
      report: assessment,
      fetchImpl: async (input, init) => {
        requests.push(init === undefined ? { input } : { input, init });
        return new Response("ok", { status: 200 });
      },
    });

    expect(result).toEqual({ status: "sent" });
    expect(assessment.notificationStatus).toBe("disabled");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      input: WEBHOOK,
      init: {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
      },
    });
    const text = payloadText(requests[0] as CapturedRequest);
    expect(text).toContain("AI model lifecycle snapshot");
    expect(text).toContain("Result:* no-actionable-risk");
    expect(text).toContain("Scan:* complete");
    expect(text).toContain("0 blocking · 0 advisory · 0 unresolved");
    expect(text).toContain("Event:* schedule");
    expect(text).toContain(`Target:* ${TARGET}`);
    expect(text).toContain("ai-model-lifecycle-report.json");
    expect(text).toContain("upload it as an artifact");
    expect(text).not.toContain("/secret/runner/path");
    expect(text).not.toContain("secret-token");

    const repository = process.env.GITHUB_REPOSITORY?.trim();
    if (/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository ?? "")) {
      expect(text).toContain(`Repository:* ${repository}`);
    } else {
      expect(text).not.toContain("Repository:*");
    }
  });

  test("includes only bounded actionable findings and safe freshness state", async () => {
    let captured: CapturedRequest | undefined;
    const lifecycleFindings = [
      finding({
        findingId: "blocking",
        modelId: "danger<@U123>@channel_*`",
        outcome: "breach",
        daysUntilShutdown: -2,
        environment: "production",
        delta: "worsened",
      }),
      finding({
        findingId: "advisory",
        modelId: "medium-advisory",
        servingPlatform: "anthropic",
        confidence: "medium",
        scope: "deployment",
        delta: "new",
      }),
      finding({
        findingId: "lexical",
        modelId: "lexical-model",
        confidence: "low",
      }),
      finding({ findingId: "test", modelId: "test-model", scope: "test" }),
      finding({ findingId: "resolved", modelId: "resolved-model", delta: "resolved" }),
      ...Array.from({ length: 20 }, (_, index) =>
        finding({
          findingId: `extra-${index}`,
          modelId: `extra-${index}-${"😀".repeat(300)}`,
          daysUntilShutdown: 30 + index,
        }),
      ),
    ];
    const assessment = report({
      result: "blocking",
      evidenceHealth: "review-overdue",
      evidenceSources: [
        { id: "repository", kind: "repository", health: "current" },
        {
          id: "runtime-@channel-<@U123>",
          kind: "external-source",
          health: "review-overdue",
        },
      ],
      lifecycleFindings,
      diagnostics: [
        { code: "secret", message: "DO_NOT_SEND_DIAGNOSTIC", severity: "notice" },
      ],
      policyDiff: ["DO_NOT_SEND_POLICY_DIFF"],
      counts: {
        ...report().counts,
        evidence: 30,
        findings: lifecycleFindings.length,
        blocking: 1,
        advisory: lifecycleFindings.length - 1,
        unresolved: 2,
      },
    });

    const result = await deliverSlackNotification({
      webhookUrl: WEBHOOK,
      report: assessment,
      fetchImpl: async (input, init) => {
        captured = init === undefined ? { input } : { input, init };
        return new Response(null, { status: 204 });
      },
    });

    expect(result.status).toBe("sent");
    expect(captured).toBeDefined();
    const text = payloadText(captured as CapturedRequest);
    expect(text.indexOf("BLOCKING")).toBeLessThan(text.indexOf("ADVISORY"));
    expect(text).toContain("danger&lt;@​U123&gt;@​channel＿∗ˋ");
    expect(text).toContain("2d overdue");
    expect(text).toContain("medium-advisory");
    expect(text).toContain("review-overdue");
    // Verified findings outrank the text match, which the bounded view then defers.
    expect(text).toContain("*Actionable findings (23):*");
    expect(text).toContain("13 more finding(s) in the report");
    expect(text).toContain(
      "1 counted finding(s) outside application and deployment scope stay in the job summary.",
    );
    expect(text).toContain("<https://provider.example/deprecations|source>");
    expect(text).not.toContain("<@U123>");
    expect(text).not.toContain("@channel");
    expect(text).not.toContain("lexical-model");
    expect(text).not.toContain("test-model");
    expect(text).not.toContain("resolved-model");
    expect(text).not.toContain("INTERNAL_SECRET_REASON");
    expect(text).not.toContain("DO_NOT_SEND_DIAGNOSTIC");
    expect(text).not.toContain("DO_NOT_SEND_POLICY_DIFF");
    expect(text).not.toContain("/secret/workspace/src/chat.ts");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(12_000);
  });

  test("names low-confidence findings an advisory result counted", async () => {
    const lifecycleFindings = [
      finding({
        findingId: "lexical-a",
        semanticKey: "lexical-a",
        modelId: "o4-mini",
        confidence: "low",
        daysUntilShutdown: 81,
        shutdownDate: "2026-10-23",
        replacementModels: [{ modelId: "gpt-5.1", servingPlatform: "openai" }],
      }),
      finding({
        findingId: "lexical-b",
        semanticKey: "lexical-b",
        modelId: "gpt-4.5-preview",
        confidence: "low",
        replacementModels: [{ modelId: "claude-x", servingPlatform: "anthropic" }],
      }),
    ];
    const text = await deliveredText(
      report({
        result: "advisory",
        scanStatus: "partial",
        lifecycleFindings,
        counts: { ...report().counts, findings: 2, advisory: 2, notices: 2 },
      }),
    );

    expect(text).toContain("*Result:* advisory");
    expect(text).toContain("*Actionable findings (2):*");
    expect(text).not.toContain("None in the bounded notification view.");
    expect(text).toContain("*ADVISORY (text match)* openai / o4-mini");
    expect(text).toContain("*ADVISORY (text match)* openai / gpt-4.5-preview");
    // A replacement on a different platform keeps the platform prefix.
    expect(text).toContain("→ gpt-5.1");
    expect(text).toContain("→ anthropic/claude-x");
  });

  test("reconciles the counts line with the listed and withheld findings", async () => {
    const lifecycleFindings = [
      finding({ findingId: "breach", semanticKey: "breach", outcome: "breach" }),
      finding({ findingId: "warning", semanticKey: "warning", modelId: "warned" }),
      finding({ findingId: "docs", semanticKey: "docs", scope: "documentation" }),
      finding({ findingId: "example", semanticKey: "example", scope: "example" }),
      finding({ findingId: "notice", semanticKey: "notice", outcome: "notice" }),
    ];
    const counted = { blocking: 1, advisory: 3, notices: 1, unresolved: 4 };
    const text = await deliveredText(
      report({
        result: "blocking",
        lifecycleFindings,
        counts: { ...report().counts, findings: lifecycleFindings.length, ...counted },
      }),
    );

    expect(text).toContain("*Counts:* 1 blocking · 3 advisory · 4 unresolved");
    expect(text).toContain("*Actionable findings (2):*");
    expect(text).toContain(
      "• 2 counted finding(s) outside application and deployment scope stay in the job summary.",
    );
    // Listed plus withheld accounts for every blocking and advisory count in the report.
    expect(2 + 2).toBe(counted.blocking + counted.advisory);
  });

  test("explains an empty list instead of contradicting withheld findings", async () => {
    const withheldOnly = await deliveredText(
      report({
        result: "advisory",
        lifecycleFindings: [finding({ scope: "test" })],
        counts: { ...report().counts, findings: 1, advisory: 1 },
      }),
    );
    expect(withheldOnly).toContain("*Actionable findings (0):*");
    expect(withheldOnly).toContain(
      "• 1 counted finding(s) outside application and deployment scope stay in the job summary.",
    );
    expect(withheldOnly).not.toContain("None in the bounded notification view.");

    const nothingCounted = await deliveredText(report());
    expect(nothingCounted).toContain("*Actionable findings (0):*");
    expect(nothingCounted).toContain("• None in the bounded notification view.");
  });

  test("links the workflow run only from complete and trusted run identity", async () => {
    const assessment = report({
      result: "advisory",
      lifecycleFindings: [finding()],
      counts: { ...report().counts, findings: 1, advisory: 1 },
    });
    const linked = await deliveredText(assessment, {
      GITHUB_SERVER_URL: "https://github.example",
      GITHUB_REPOSITORY: "acme/service",
      GITHUB_RUN_ID: "17654321",
    });
    expect(linked).toContain(
      "*Run:* <https://github.example/acme/service/actions/runs/17654321|workflow run>",
    );

    for (const broken of [
      { GITHUB_SERVER_URL: "http://github.example" },
      { GITHUB_SERVER_URL: "https://user:pass@github.example" },
      { GITHUB_SERVER_URL: undefined },
      { GITHUB_RUN_ID: "17654321; rm -rf /" },
      { GITHUB_RUN_ID: undefined },
      { GITHUB_REPOSITORY: "not a repository" },
      { GITHUB_REPOSITORY: undefined },
    ]) {
      const text = await deliveredText(assessment, {
        GITHUB_SERVER_URL: "https://github.example",
        GITHUB_REPOSITORY: "acme/service",
        GITHUB_RUN_ID: "17654321",
        ...broken,
      });
      expect(text).not.toContain("*Run:*");
      expect(text).toContain("*Report:*");
    }
  });

  test("renders only source URLs that cannot escape Slack link syntax", async () => {
    const hostile = [
      "https://provider.example/deprecations|@channel",
      "https://provider.example/a>b",
      "javascript:alert(1)",
      "https://user:pass@provider.example/deprecations",
      "not a url",
      " ",
    ];
    for (const sourceUrl of hostile) {
      const text = await deliveredText(
        report({
          result: "advisory",
          lifecycleFindings: [finding({ sourceUrls: [sourceUrl] })],
          counts: { ...report().counts, findings: 1, advisory: 1 },
        }),
      );
      expect(text).toContain("gpt-old");
      expect(text).not.toContain("|source>");
      expect(text).not.toContain("@channel");
    }

    const clean = await deliveredText(
      report({
        result: "advisory",
        lifecycleFindings: [finding({ sourceUrls: ["http://provider.example/eol?a=1&b=2#x"] })],
        counts: { ...report().counts, findings: 1, advisory: 1 },
      }),
    );
    expect(clean).toContain("<http://provider.example/eol?a=1&amp;b=2#x|source>");
    expect(clean).not.toContain("?a=1&b=2");
  });

  test("skips PR, merge-group, and local reports without touching the webhook", async () => {
    let requests = 0;
    for (const [eventName, targetKind] of [
      ["pull_request", "synthetic-merge"],
      ["merge_group", "merge-group"],
      ["local", "commit"],
    ] as const) {
      const result = await deliverSlackNotification({
        webhookUrl: "not even a valid URL",
        report: report({
          targetKind,
          event: {
            eventName,
            targetOid: TARGET,
            targetKind,
            comparisonRequested: eventName !== "local",
          },
        }),
        fetchImpl: async () => {
          requests += 1;
          return new Response(null, { status: 200 });
        },
      });
      expect(result).toMatchObject({ status: "skipped" });
    }
    expect(requests).toBe(0);
  });

  test("returns bounded failure details and never retries uncertain delivery", async () => {
    let requests = 0;
    const httpFailure = await deliverSlackNotification({
      webhookUrl: WEBHOOK,
      report: report(),
      fetchImpl: async () => {
        requests += 1;
        return new Response("uncertain", { status: 500 });
      },
    });
    expect(httpFailure).toEqual({
      status: "failed",
      detail: "Slack webhook returned HTTP 500.",
    });
    expect(requests).toBe(1);
    expect(httpFailure.detail).not.toContain(WEBHOOK);
    expect(httpFailure.detail).not.toContain("secret-token");

    const transportFailure = await deliverSlackNotification({
      webhookUrl: WEBHOOK,
      report: report(),
      fetchImpl: async () => {
        throw new Error(`Could not connect to ${WEBHOOK} with TOP_SECRET_TOKEN`);
      },
    });
    expect(transportFailure).toEqual({
      status: "failed",
      detail: "Slack webhook delivery failed.",
    });

    const invalid = await deliverSlackNotification({
      webhookUrl: "http://hooks.slack.test/secret",
      report: report(),
      fetchImpl: async () => {
        throw new Error("must not be called");
      },
    });
    expect(invalid).toEqual({
      status: "failed",
      detail: "Slack webhook configuration is invalid.",
    });
  });
});
