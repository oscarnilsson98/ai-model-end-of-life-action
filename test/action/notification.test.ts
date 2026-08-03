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
    sourceUrls: ["https://secret.example/source"],
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
    expect(text).toContain("more finding(s) in the report");
    expect(text).not.toContain("<@U123>");
    expect(text).not.toContain("@channel");
    expect(text).not.toContain("lexical-model");
    expect(text).not.toContain("test-model");
    expect(text).not.toContain("resolved-model");
    expect(text).not.toContain("INTERNAL_SECRET_REASON");
    expect(text).not.toContain("DO_NOT_SEND_DIAGNOSTIC");
    expect(text).not.toContain("DO_NOT_SEND_POLICY_DIFF");
    expect(text).not.toContain("https://secret.example/source");
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(12_000);
  });

  test("names the deprecation date and orders by the nearest lifecycle date", async () => {
    let captured: CapturedRequest | undefined;
    const assessment = report({
      result: "advisory",
      lifecycleFindings: [
        finding({
          findingId: "near-shutdown",
          modelId: "shutting-down-soon",
          shutdownDate: "2026-09-01",
          daysUntilShutdown: 30,
        }),
        finding({
          findingId: "past-deprecation",
          modelId: "already-deprecated",
          deprecationDate: "2026-06-01",
          shutdownDate: "2027-06-01",
          daysUntilShutdown: 303,
          daysUntilDeprecation: -62,
        }),
      ],
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
    const text = payloadText(captured as CapturedRequest);
    expect(text).toContain("deprecation 2026-06-01 (62d overdue)");
    expect(text).toContain("shutdown 2027-06-01 (303d)");
    // The already-deprecated model is the more urgent of the two.
    expect(text.indexOf("already-deprecated")).toBeLessThan(text.indexOf("shutting-down-soon"));
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
