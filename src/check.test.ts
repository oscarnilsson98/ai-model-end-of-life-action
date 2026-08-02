import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./check.ts";
import type { Environment } from "./github.ts";
import type { FetchLike } from "./http.ts";

const NOW = Date.parse("2026-08-01T12:00:00Z");
const FEED_URL = "https://feed.example.test/deprecations.json";
const SLACK_URL = "https://hooks.slack.test/services/a/b/secret";
const temporaryDirectories: string[] = [];

const DEFAULT_FEED = [
  {
    provider: "OpenAI",
    model_id: "legacy-model",
    shutdown_date: "2026-08-20",
    replacement_models: ["new-model"],
    url: "https://example.com/deprecation",
    last_observed: "2026-08-01",
  },
];

type Harness = {
  environment: Environment;
  fetch: FetchLike;
  outputFile: string;
  summaryFile: string;
  logs: string[];
};

function harness(options: {
  inputs?: Environment;
  feed?: unknown;
  fetch?: FetchLike;
} = {}): Harness {
  const directory = mkdtempSync(join(tmpdir(), "model-eol-run-test-"));
  temporaryDirectories.push(directory);
  const outputFile = join(directory, "output.txt");
  const summaryFile = join(directory, "summary.md");
  const feed = options.feed ?? DEFAULT_FEED;
  return {
    environment: {
      INPUT_MODELS: '[{"id":"legacy-model","provider":"OpenAI"}]',
      "INPUT_DAYS-BEFORE-SHUTDOWN": "90",
      "INPUT_REQUEST-TIMEOUT-SECONDS": "1",
      INPUT_RETRIES: "0",
      "INPUT_FEED-URL": FEED_URL,
      GITHUB_WORKSPACE: directory,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      ...options.inputs,
    },
    fetch:
      options.fetch ??
      (async () =>
        new Response(JSON.stringify(feed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })),
    outputFile,
    summaryFile,
    logs: [],
  };
}

function parseFileCommands(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const outputs: Record<string, string> = {};
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^([A-Za-z_][A-Za-z0-9_-]*)<<(.+)$/.exec(lines[index] ?? "");
    if (!header) continue;
    const key = header[1] as string;
    const delimiter = header[2] as string;
    const value: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      value.push(lines[index] ?? "");
      index += 1;
    }
    outputs[key] = value.join("\n");
  }
  return outputs;
}

async function execute(testHarness: Harness) {
  return await run({
    environment: testHarness.environment,
    fetch: testHarness.fetch,
    now: () => NOW,
    sleep: async () => undefined,
    random: () => 0,
    log: (line) => testHarness.logs.push(line),
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("action orchestration and outputs", () => {
  test("publishes complete outputs, a bounded summary, and safe warning annotations", async () => {
    const testHarness = harness();
    const result = await execute(testHarness);
    const outputs = parseFileCommands(testHarness.outputFile);

    expect(Object.keys(outputs)).toEqual([
      "has-findings",
      "findings",
      "finding-count",
      "has-breaches",
      "breach-count",
      "checked-model-count",
      "matched-model-count",
      "unmatched-model-count",
      "feed-content-age-days",
      "feed-record-count",
      "feed-sha256",
      "lifecycle-feed-sha256",
      "inventory-sha256",
      "alert-fingerprint",
      "next-alert-fingerprint",
      "audit-record",
      "notification-sent",
      "notification-reason",
      "unmatched-models",
      "discovered-models",
      "discovered-model-count",
      "untracked-discovered-model-count",
      "discovery-match-count",
      "discovery-output-truncated",
    ]);

    expect(result).toMatchObject({
      feedSize: 1,
      matchedModelCount: 1,
      unmatchedModels: [],
      feedContentAgeDays: 0,
      breaching: [],
      unmatchedBreaching: [],
      breachCount: 0,
    });
    expect(outputs).toMatchObject({
      "has-findings": "true",
      "finding-count": "1",
      "has-breaches": "false",
      "breach-count": "0",
      "checked-model-count": "1",
      "matched-model-count": "1",
      "unmatched-model-count": "0",
      "feed-content-age-days": "0",
      "feed-record-count": "1",
      "unmatched-models": "[]",
      "notification-sent": "false",
      "notification-reason": "disabled",
      "next-alert-fingerprint": "",
      "discovered-models": "[]",
      "discovered-model-count": "0",
      "untracked-discovered-model-count": "0",
      "discovery-match-count": "0",
      "discovery-output-truncated": "false",
    });
    expect(JSON.parse(outputs.findings ?? "null")).toEqual(result.findings);
    expect(result.findings[0]?.findingId).toMatch(/^[0-9a-f]{64}$/);
    expect(outputs["feed-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(outputs["lifecycle-feed-sha256"]).toBe(result.lifecycleFeedSha256);
    expect(outputs["inventory-sha256"]).toBe(result.inventorySha256);
    expect(outputs["alert-fingerprint"]).toBe(result.alertFingerprint);
    expect(JSON.parse(outputs["audit-record"] ?? "null")).toEqual(result.auditRecord);
    expect(readFileSync(testHarness.summaryFile, "utf8")).toContain(
      "## AI model end-of-life check",
    );
    expect(
      testHarness.logs.some((line) =>
        line.startsWith("::warning::Deprecations feed reports legacy-model"),
      ),
    )
      .toBe(true);
    expect(testHarness.logs.at(-1)).toContain("1 lifecycle finding(s), 0 policy breach(es)");
  });

  test("uses a checksum-pinned workspace feed snapshot without making a request", async () => {
    let requests = 0;
    const testHarness = harness({
      inputs: {
        "INPUT_FEED-URL": "",
        "INPUT_FEED-FILE": "feed-snapshot.json",
      },
      fetch: async () => {
        requests += 1;
        throw new Error("network must not be used");
      },
    });
    const rawFeed = `${JSON.stringify(DEFAULT_FEED, null, 2)}\n`;
    writeFileSync(
      join(testHarness.environment.GITHUB_WORKSPACE as string, "feed-snapshot.json"),
      rawFeed,
      "utf8",
    );
    testHarness.environment["INPUT_EXPECTED-FEED-SHA256"] = createHash("sha256")
      .update(rawFeed, "utf8")
      .digest("hex");

    const result = await execute(testHarness);
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(requests).toBe(0);
    expect(result.feedSha256).toBe(testHarness.environment["INPUT_EXPECTED-FEED-SHA256"]);
    expect(outputs["feed-sha256"]).toBe(result.feedSha256);
    expect(readFileSync(testHarness.summaryFile, "utf8")).toContain("source=file");
  });

  test("reports exact source discovery at file coordinates without affecting policy", async () => {
    const testHarness = harness({
      feed: [
        ...DEFAULT_FEED,
        {
          provider: "Azure",
          model_id: "gpt-4",
          shutdown_date: "2026-09-01",
          last_observed: "2026-08-01",
        },
        {
          provider: "OpenAI",
          model_id: "gpt-4",
          shutdown_date: "2026-09-01",
          last_observed: "2026-08-01",
        },
      ],
      inputs: {
        "INPUT_DISCOVER-MODELS": "true",
        "INPUT_DISCOVERY-PATHS": "src",
      },
    });
    const workspace = testHarness.environment.GITHUB_WORKSPACE as string;
    mkdirSync(join(workspace, "src"));
    writeFileSync(join(workspace, "src", "app.ts"), 'const model = "gpt-4";\n', "utf8");

    const result = await execute(testHarness);
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(result.breachCount).toBe(0);
    expect(result.discovery?.models[0]).toMatchObject({
      id: "gpt-4",
      ambiguous: true,
      tracked: false,
      locations: [{ path: "src/app.ts", line: 1, column: 16 }],
    });
    expect(outputs).toMatchObject({
      "has-breaches": "false",
      "discovered-model-count": "1",
      "untracked-discovered-model-count": "1",
      "discovery-match-count": "1",
    });
    expect(JSON.parse(outputs["discovered-models"] ?? "null")[0]).toMatchObject({
      id: "gpt-4",
      tracked: false,
    });
    expect(
      testHarness.logs.some((line) =>
        line.startsWith(
          "::warning title=Report-only AI model discovery,file=src/app.ts,line=1,col=16::",
        ),
      ),
    ).toBe(true);
    expect(readFileSync(testHarness.summaryFile, "utf8")).toContain(
      "### Report-only source discovery",
    );
  });

  test("writes outputs and the job summary before throwing for a policy breach", async () => {
    const testHarness = harness({
      inputs: { "INPUT_FAIL-WITHIN-DAYS": "30" },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "1 item(s) breached the configured policy (1 dated lifecycle, 0 undated lifecycle, 0 unmatched feed history)",
    );
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(outputs).toMatchObject({
      "has-findings": "true",
      "finding-count": "1",
      "has-breaches": "true",
      "breach-count": "1",
    });
    expect(JSON.parse(outputs.findings ?? "null")[0]).toMatchObject({
      id: "legacy-model",
      daysUntilShutdown: 19,
    });
    expect(readFileSync(testHarness.summaryFile, "utf8")).toContain(
      "❌ Reported date inside failure threshold",
    );
    expect(
      testHarness.logs.some((line) =>
        line.startsWith("::error::Deprecations feed reports legacy-model"),
      ),
    )
      .toBe(true);
  });

  test("fails on an undated deprecation only when that policy is enabled", async () => {
    const undatedFeed = [
      {
        provider: "Cohere",
        model_id: "command-r",
        shutdown_date: "",
        deprecation_date: "2025-09-15",
        last_observed: "2026-07-31",
      },
    ];
    const testHarness = harness({
      feed: undatedFeed,
      inputs: {
        INPUT_MODELS: '[{"id":"command-r","provider":"Cohere"}]',
        "INPUT_FAIL-ON-UNDATED": "true",
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "0 dated lifecycle, 1 undated lifecycle, 0 unmatched feed history",
    );
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(outputs["has-breaches"]).toBe("true");
    expect(JSON.parse(outputs.findings ?? "null")[0]).toMatchObject({
      id: "command-r",
      status: "date-unknown",
      shutdownDate: null,
      daysUntilShutdown: null,
    });
  });

  test("can fail closed when an inventory declaration has no exact feed history", async () => {
    const testHarness = harness({
      inputs: {
        INPUT_MODELS: '[{"id":"legacy-modle","provider":"OpenAI"}]',
        "INPUT_FAIL-ON-UNMATCHED": "true",
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "0 dated lifecycle, 0 undated lifecycle, 1 unmatched feed history",
    );
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(outputs).toMatchObject({
      "has-findings": "false",
      "finding-count": "0",
      "has-breaches": "true",
      "breach-count": "1",
      "matched-model-count": "0",
      "unmatched-model-count": "1",
    });
    expect(JSON.parse(outputs["unmatched-models"] ?? "null")).toEqual([
      { id: "legacy-modle", provider: "OpenAI" },
    ]);
    const summary = readFileSync(testHarness.summaryFile, "utf8");
    expect(summary).toContain("breached the configured feed-history policy");
    expect(summary).not.toContain("✅");
    expect(
      testHarness.logs.some((line) =>
        line.includes("No exact deprecations-feed history was found for legacy-modle (OpenAI)"),
      ),
    ).toBe(true);
  });

  test("rejects a failure threshold outside the reporting window before fetching", async () => {
    let requests = 0;
    const testHarness = harness({
      inputs: {
        "INPUT_DAYS-BEFORE-SHUTDOWN": "30",
        "INPUT_FAIL-WITHIN-DAYS": "31",
      },
      fetch: async () => {
        requests += 1;
        return new Response("[]");
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "fail-within-days (31) must not exceed days-before-shutdown (30)",
    );
    expect(requests).toBe(0);
    expect(existsSync(testHarness.outputFile)).toBe(false);
  });

  test("rejects a hidden undated failure policy before fetching", async () => {
    let requests = 0;
    const testHarness = harness({
      inputs: {
        "INPUT_INCLUDE-UNDATED": "false",
        "INPUT_FAIL-ON-UNDATED": "true",
      },
      fetch: async () => {
        requests += 1;
        return new Response("[]");
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "`fail-on-undated` cannot be true when `include-undated` is false",
    );
    expect(requests).toBe(0);
  });

  test("fails safely before writing outputs that exceed the aggregate runner budget", async () => {
    const models = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index).padEnd(256, "\\"),
      provider: "A".padEnd(100, "\\"),
    }));
    const testHarness = harness({
      feed: [
        {
          provider: "A",
          model_id: "different-model",
          shutdown_date: "2027-01-01",
          last_observed: "2026-08-01",
        },
      ],
      inputs: { INPUT_MODELS: JSON.stringify(models) },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      /combined outputs are too large for GitHub Actions/,
    );
    expect(existsSync(testHarness.outputFile)).toBe(false);
  });

  test("drops report-only discovery detail before primary finding context", async () => {
    const lifecycleRecords = Array.from({ length: 4 }, (_, index) => ({
      provider: "OpenAI",
      model_id: `alert-${index}`,
      shutdown_date: "2026-08-20",
      deprecation_context: `important-${index}-${"c".repeat(80_000)}`,
      last_observed: "2026-08-01",
    }));
    const discoveryRecords = Array.from({ length: 600 }, (_, index) => ({
      provider: "OpenAI",
      model_id: `unused-${index}-${"x".repeat(180)}`,
      shutdown_date: "2028-01-01",
      last_observed: "2026-08-01",
    }));
    const testHarness = harness({
      feed: [...lifecycleRecords, ...discoveryRecords],
      inputs: {
        INPUT_MODELS: JSON.stringify(
          lifecycleRecords.map((record) => ({ id: record.model_id, provider: "OpenAI" })),
        ),
        "INPUT_DISCOVER-MODELS": "true",
        "INPUT_DISCOVERY-PATHS": "source.txt",
      },
    });
    writeFileSync(
      join(testHarness.environment.GITHUB_WORKSPACE as string, "source.txt"),
      discoveryRecords.map((record) => record.model_id).join("\n"),
      "utf8",
    );

    await execute(testHarness);
    const outputs = parseFileCommands(testHarness.outputFile);
    expect(outputs["discovered-models"]).toBe("[]");
    expect(outputs["discovery-output-truncated"]).toBe("true");
    expect(JSON.parse(outputs.findings ?? "null")).toSatisfy(
      (findings: Array<{ context?: string }>) =>
        findings.length === 4 && findings.every((finding) => finding.context?.length === 80_012),
    );
    expect(testHarness.logs.some((line) => line.includes("detailed discovery results were omitted")))
      .toBe(true);
    expect(testHarness.logs.some((line) => line.includes("verbose finding context was omitted")))
      .toBe(false);
  });

  test("respects GitHub's separate warning and error annotation budgets", async () => {
    const feed = Array.from({ length: 30 }, (_, index) => ({
      provider: "OpenAI",
      model_id: `model-${index}`,
      shutdown_date: index < 15 ? "2026-08-10" : "2026-09-15",
      last_observed: "2026-08-01",
    }));
    const testHarness = harness({
      feed,
      inputs: {
        INPUT_MODELS: JSON.stringify(
          feed.map((item) => ({ id: item.model_id, provider: "OpenAI" })),
        ),
        "INPUT_FAIL-WITHIN-DAYS": "30",
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(/15 item\(s\).*15 dated lifecycle/);
    expect(
      testHarness.logs.filter((line) =>
        line.startsWith("::error::Deprecations feed reports"),
      ),
    ).toHaveLength(9);
    expect(
      testHarness.logs.filter((line) =>
        line.startsWith("::warning::Deprecations feed reports"),
      ),
    ).toHaveLength(10);
    expect(testHarness.logs.find((line) => line.startsWith("::notice::"))).toContain(
      "11 action annotation(s) were suppressed",
    );
  });
});

describe("content-age policy", () => {
  const providerFeed = [
    {
      provider: "OpenAI",
      model_id: "unrelated-fresh-model",
      shutdown_date: "2027-01-01",
      last_observed: "2026-08-01",
    },
    {
      provider: "Anthropic",
      model_id: "claude-old",
      shutdown_date: "2026-08-25",
      last_observed: "2026-06-16",
    },
  ];

  test("checks named providers even when unrelated global feed content is fresh", async () => {
    const testHarness = harness({
      feed: providerFeed,
      inputs: {
        INPUT_MODELS: '[{"id":"claude-old","provider":"Anthropic"}]',
        "INPUT_MAX-FEED-AGE-DAYS": "30",
      },
    });

    await expect(execute(testHarness)).rejects.toThrow(
      "Newest recorded Anthropic feed content is 46 day(s) old (max 30)",
    );
    expect(existsSync(testHarness.outputFile)).toBe(false);
  });

  test("does not enforce content age unless the caller opts in", async () => {
    const testHarness = harness({
      feed: providerFeed,
      inputs: {
        INPUT_MODELS: '[{"id":"claude-old","provider":"Anthropic"}]',
      },
    });
    const result = await execute(testHarness);
    expect(result.feedContentAgeDays).toBe(0);
    expect(result.providerFreshness).toEqual([
      { provider: "Anthropic", ageDays: 46, newestTimestamp: Date.parse("2026-06-16") },
    ]);
  });

  test("fails closed when opted-in content-age checks have no timestamps", async () => {
    const testHarness = harness({
      feed: [
        {
          provider: "OpenAI",
          model_id: "legacy-model",
          shutdown_date: "2026-08-20",
        },
      ],
      inputs: { "INPUT_MAX-FEED-AGE-DAYS": "30" },
    });
    await expect(execute(testHarness)).rejects.toThrow(
      "content-age checking is enabled, but the feed carries no",
    );
  });
});

describe("caller-managed notification change detection", () => {
  test("does not advance caller state while Slack delivery is disabled", async () => {
    const previousFingerprint = "0".repeat(64);
    const testHarness = harness({
      inputs: {
        "INPUT_NOTIFICATION-MODE": "on-change",
        "INPUT_PREVIOUS-ALERT-FINGERPRINT": previousFingerprint,
      },
    });

    const result = await execute(testHarness);
    expect(result).toMatchObject({
      notificationSent: false,
      notificationReason: "disabled",
      nextAlertFingerprint: previousFingerprint,
    });
    expect(parseFileCommands(testHarness.outputFile)["next-alert-fingerprint"]).toBe(
      previousFingerprint,
    );
  });

  test("skips an unchanged alert and sends changed and resolved states", async () => {
    const baseline = harness();
    const baselineResult = await execute(baseline);

    let slackRequests = 0;
    const slackBodies: string[] = [];
    const fetchImplementation: FetchLike = async (input, init) => {
      if (String(input) === FEED_URL) return new Response(JSON.stringify(DEFAULT_FEED));
      if (String(input) === SLACK_URL && init?.method === "POST") {
        slackRequests += 1;
        slackBodies.push(String(init.body));
        return new Response("ok");
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    };

    const unchanged = harness({
      fetch: fetchImplementation,
      inputs: {
        "INPUT_SLACK-WEBHOOK": SLACK_URL,
        "INPUT_NOTIFICATION-MODE": "on-change",
        "INPUT_PREVIOUS-ALERT-FINGERPRINT": baselineResult.alertFingerprint,
      },
    });
    const unchangedResult = await execute(unchanged);
    expect(unchangedResult).toMatchObject({
      notificationSent: false,
      notificationReason: "unchanged",
      nextAlertFingerprint: baselineResult.alertFingerprint,
    });
    expect(slackRequests).toBe(0);
    expect(parseFileCommands(unchanged.outputFile)).toMatchObject({
      "notification-sent": "false",
      "notification-reason": "unchanged",
      "next-alert-fingerprint": baselineResult.alertFingerprint,
    });

    const changed = harness({
      fetch: fetchImplementation,
      inputs: {
        "INPUT_SLACK-WEBHOOK": SLACK_URL,
        "INPUT_NOTIFICATION-MODE": "on-change",
        "INPUT_PREVIOUS-ALERT-FINGERPRINT": "0".repeat(64),
      },
    });
    const changedResult = await execute(changed);
    expect(changedResult).toMatchObject({
      notificationSent: true,
      notificationReason: "changed",
      nextAlertFingerprint: changedResult.alertFingerprint,
    });
    expect(slackRequests).toBe(1);

    const resolved = harness({
      feed: [
        {
          ...DEFAULT_FEED[0],
          shutdown_date: "2027-08-20",
        },
      ],
      fetch: async (input, init) => {
        if (String(input) === FEED_URL) {
          return new Response(
            JSON.stringify([{ ...DEFAULT_FEED[0], shutdown_date: "2027-08-20" }]),
          );
        }
        return fetchImplementation(input, init);
      },
      inputs: {
        "INPUT_SLACK-WEBHOOK": SLACK_URL,
        "INPUT_NOTIFICATION-MODE": "on-change",
        "INPUT_PREVIOUS-ALERT-FINGERPRINT": changedResult.alertFingerprint,
      },
    });
    const resolvedResult = await execute(resolved);
    expect(resolvedResult).toMatchObject({
      findings: [],
      notificationSent: true,
      notificationReason: "resolved",
      nextAlertFingerprint: resolvedResult.alertFingerprint,
    });
    expect(slackRequests).toBe(2);
    expect(slackBodies.at(-1)).toContain("alert resolved");
  });
});

describe("Slack notification failure policy", () => {
  function slackHarness(mode: "warn" | "error", failWithinDays?: string) {
    let slackRequests = 0;
    const fetchImplementation: FetchLike = async (input, init) => {
      const url = String(input);
      if (url === FEED_URL) return new Response(JSON.stringify(DEFAULT_FEED));
      if (url === SLACK_URL && init?.method === "POST") {
        slackRequests += 1;
        return new Response("gateway failure", { status: 502, statusText: "Bad Gateway" });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const inputs: Environment = {
      "INPUT_SLACK-WEBHOOK": SLACK_URL,
      "INPUT_NOTIFICATION-FAILURE-MODE": mode,
      INPUT_RETRIES: "3",
    };
    if (failWithinDays) inputs["INPUT_FAIL-WITHIN-DAYS"] = failWithinDays;
    return {
      testHarness: harness({ inputs, fetch: fetchImplementation }),
      slackRequests: () => slackRequests,
    };
  }

  test("warn mode preserves a successful lifecycle check", async () => {
    const { testHarness, slackRequests } = slackHarness("warn");
    const previousFingerprint = "0".repeat(64);
    testHarness.environment["INPUT_NOTIFICATION-MODE"] = "on-change";
    testHarness.environment["INPUT_PREVIOUS-ALERT-FINGERPRINT"] = previousFingerprint;
    await expect(execute(testHarness)).resolves.toMatchObject({
      breaching: [],
      notificationReason: "error",
      nextAlertFingerprint: previousFingerprint,
    });
    expect(slackRequests()).toBe(1);
    expect(testHarness.logs[0]).toBe(`::add-mask::${SLACK_URL}`);
    expect(
      testHarness.logs.some(
        (line) =>
          line === "::warning::Slack notification failed after 1 attempt(s): HTTP 502 Bad Gateway.",
      ),
    ).toBe(true);
    expect(parseFileCommands(testHarness.outputFile)).toMatchObject({
      "has-findings": "true",
      "notification-sent": "false",
      "notification-reason": "error",
      "next-alert-fingerprint": previousFingerprint,
    });
    const summary = readFileSync(testHarness.summaryFile, "utf8");
    expect(summary).toContain("### Notification delivery");
    expect(summary).toContain("Slack delivery failed");
  });

  test("error mode fails after publishing outputs", async () => {
    const { testHarness, slackRequests } = slackHarness("error");
    await expect(execute(testHarness)).rejects.toThrow(
      "Slack notification failed after 1 attempt(s): HTTP 502 Bad Gateway",
    );
    expect(slackRequests()).toBe(1);
    expect(parseFileCommands(testHarness.outputFile)).toMatchObject({
      "has-findings": "true",
      "has-breaches": "false",
      "notification-reason": "error",
      "next-alert-fingerprint": "",
    });
    const summary = readFileSync(testHarness.summaryFile, "utf8");
    expect(summary.match(/^## AI model end-of-life check$/gm)).toHaveLength(1);
    expect(summary).toContain("Slack delivery failed");
  });

  test("reports both a lifecycle breach and a notification failure", async () => {
    const { testHarness, slackRequests } = slackHarness("error", "30");
    await expect(execute(testHarness)).rejects.toThrow(
      /breached the configured policy.*Slack notification also failed/,
    );
    expect(slackRequests()).toBe(1);
    expect(parseFileCommands(testHarness.outputFile)["has-breaches"]).toBe("true");
  });

  test("reserves the final warning-annotation slot for warn-mode delivery failures", async () => {
    const feed = Array.from({ length: 12 }, (_, index) => ({
      provider: "OpenAI",
      model_id: `warning-${index}`,
      shutdown_date: "2026-08-20",
      last_observed: "2026-08-01",
    }));
    const fetchImplementation: FetchLike = async (input) => {
      if (String(input) === FEED_URL) return new Response(JSON.stringify(feed));
      if (String(input) === SLACK_URL) return new Response("failure", { status: 502 });
      throw new Error(`Unexpected request: ${String(input)}`);
    };
    const testHarness = harness({
      feed,
      fetch: fetchImplementation,
      inputs: {
        INPUT_MODELS: JSON.stringify(
          feed.map((item) => ({ id: item.model_id, provider: "OpenAI" })),
        ),
        "INPUT_SLACK-WEBHOOK": SLACK_URL,
        "INPUT_NOTIFICATION-FAILURE-MODE": "warn",
      },
    });

    await expect(execute(testHarness)).resolves.toMatchObject({ findings: { length: 12 } });
    expect(
      testHarness.logs.filter((line) =>
        line.startsWith("::warning::Deprecations feed reports"),
      ),
    ).toHaveLength(9);
    expect(testHarness.logs.filter((line) => line.startsWith("::warning::Slack"))).toHaveLength(1);
    expect(testHarness.logs.find((line) => line.startsWith("::notice::"))).toContain(
      "3 action annotation(s) were suppressed",
    );
  });
});
