import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

function required(name: string): string {
  const value = Bun.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name}: expected a non-empty action output.`);
  }
  return value;
}

function assertEqual(name: string, actual: string | undefined, expected: string): void {
  if ((actual ?? "") !== expected) {
    throw new Error(
      `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
    );
  }
}

function assertSha256(name: string): string {
  const value = required(name);
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name}: expected a lowercase SHA-256, got ${JSON.stringify(value)}.`);
  }
  return value;
}

const result = required("RESULT");
const eventName = required("EVENT_NAME");
assertEqual("RESULT", result, "no-actionable-risk");
assertEqual("SCAN_STATUS", Bun.env.SCAN_STATUS, "complete");
assertEqual("EXIT_REASON", Bun.env.EXIT_REASON, "none");
assertEqual("EVIDENCE_HEALTH", Bun.env.EVIDENCE_HEALTH, "current");
assertEqual("OUTPUT_TRUNCATED", Bun.env.OUTPUT_TRUNCATED, "false");
assertEqual("NOTIFICATION_STATUS", Bun.env.NOTIFICATION_STATUS, "disabled");
if (!required("NOTIFICATION_REASON").toLowerCase().includes("webhook")) {
  throw new Error("NOTIFICATION_REASON should explain that no Slack webhook was configured.");
}

if (eventName === "pull_request") {
  assertEqual("COMPARISON_STATUS", Bun.env.COMPARISON_STATUS, "available");
  assertEqual("TARGET_KIND", Bun.env.TARGET_KIND, "synthetic-merge");
  assertEqual("BASELINE_RESULT", required("BASELINE_RESULT"), "no-actionable-risk");
  assertEqual("TARGET_RESULT", required("TARGET_RESULT"), "no-actionable-risk");
} else {
  assertEqual("COMPARISON_STATUS", Bun.env.COMPARISON_STATUS, "not-applicable");
  assertEqual("TARGET_KIND", Bun.env.TARGET_KIND, "commit");
  assertEqual("BASELINE_RESULT", Bun.env.BASELINE_RESULT, "");
  assertEqual("TARGET_RESULT", Bun.env.TARGET_RESULT, "");
}

const digests = {
  sourceFeedSha256: assertSha256("SOURCE_FEED_SHA256"),
  normalizedFeedSha256: assertSha256("NORMALIZED_FEED_SHA256"),
  activeRecordsSha256: assertSha256("ACTIVE_RECORDS_SHA256"),
  feedAdapterManifestSha256: assertSha256("ADAPTER_MANIFEST_SHA256"),
  detectorManifestSha256: assertSha256("DETECTOR_MANIFEST_SHA256"),
  scanFingerprint: assertSha256("SCAN_FINGERPRINT"),
  alertFingerprint: assertSha256("ALERT_FINGERPRINT"),
};
assertEqual(
  "SOURCE_FEED_SHA256",
  digests.sourceFeedSha256,
  createHash("sha256")
    .update(readFileSync(new URL("../fixtures/hermetic-lifecycle-feed.json", import.meta.url)))
    .digest("hex"),
);

const counts = JSON.parse(required("COUNTS")) as Record<string, unknown>;
for (const key of [
  "evidence",
  "findings",
  "blocking",
  "advisory",
  "notices",
  "unresolved",
]) {
  if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
    throw new Error(`COUNTS.${key}: expected a non-negative integer.`);
  }
}

const reportPath = required("REPORT_PATH");
if (!statSync(reportPath).isFile()) {
  throw new Error(`REPORT_PATH is not a regular file: ${reportPath}.`);
}
const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
if (
  report.schemaVersion !== 3 ||
  report.result !== result ||
  report.scanStatus !== "complete" ||
  report.comparisonStatus !== Bun.env.COMPARISON_STATUS ||
  report.exitReason !== "none" ||
  report.notificationStatus !== "disabled"
) {
  throw new Error(`Unexpected complete report state: ${JSON.stringify(report)}.`);
}
const event = report.event as Record<string, unknown> | undefined;
if (
  event?.eventName !== eventName ||
  typeof event.targetOid !== "string" ||
  !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(event.targetOid)
) {
  throw new Error(`Report contains an invalid selected Git event: ${JSON.stringify(event)}.`);
}
const feed = report.feed as Record<string, unknown> | undefined;
if (
  feed?.sourceFeedSha256 !== digests.sourceFeedSha256 ||
  feed.normalizedFeedSha256 !== digests.normalizedFeedSha256 ||
  feed.activeRecordsSha256 !== digests.activeRecordsSha256 ||
  feed.feedAdapterManifestSha256 !== digests.feedAdapterManifestSha256 ||
  report.detectorManifestSha256 !== digests.detectorManifestSha256 ||
  report.scanFingerprint !== digests.scanFingerprint ||
  report.alertFingerprint !== digests.alertFingerprint
) {
  throw new Error("Report provenance does not match the published action outputs.");
}
