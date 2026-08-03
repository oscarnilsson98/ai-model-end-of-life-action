import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  appendCommand,
  appendSummary,
  emitAnnotation,
  emitCommand,
  type Environment,
  type Log,
} from "./github.ts";
import { canonicalSha256 } from "../shared/status.ts";
import { compact, resultIcon as sharedResultIcon } from "../shared/text.ts";
import type { AssessmentReport, LifecycleFinding } from "../shared/types.ts";

const MAX_DETAIL_OUTPUT_BYTES = 120 * 1024;
const MAX_TOTAL_OUTPUT_BYTES = 700 * 1024;
const MAX_REPORT_BYTES = 25 * 1024 * 1024;
const MAX_ANNOTATIONS = 10;

/**
 * Neutralize repository-derived text for the Markdown job summary. Beyond HTML
 * escaping this defuses the Markdown constructs that would otherwise let a
 * crafted path, model id, or diagnostic break out of a table cell or render as
 * an image or link: pipes, backticks, brackets, and line breaks.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/#/g, "&#35;")
    .replace(/\\/g, "&#92;")
    .replace(/\|/g, "&#124;")
    .replace(/`/g, "&#96;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/!/g, "&#33;")
    .replace(/\(/g, "&#40;")
    .replace(/\)/g, "&#41;")
    .replace(/\*/g, "&#42;")
    .replace(/_/g, "&#95;")
    .replace(/~/g, "&#126;")
    .replace(/@/g, "&#64;")
    .replace(/:/g, "&#58;")
    .replace(/\./g, "&#46;")
    .replace(/[\r\n]+/g, "<br>");
}

function resultIcon(report: AssessmentReport): string {
  return sharedResultIcon(report.result, report.scanStatus);
}

function deliveryLine(
  report: AssessmentReport,
  options: Readonly<{ notificationPending?: boolean }> = {},
): string {
  if (options.notificationPending) {
    return "Delivery: GitHub Actions summary published; Slack snapshot pending";
  }
  if (report.notificationStatus === "disabled") return "Delivery: GitHub Actions summary only";
  if (report.notificationStatus === "sent") return "Delivery: GitHub Actions summary + Slack snapshot";
  if (report.notificationStatus === "failed") {
    return `Delivery: GitHub Actions summary; Slack failed (${escapeHtml(compact(report.notificationReason, 300))})`;
  }
  return `Delivery: GitHub Actions summary; Slack skipped (${escapeHtml(compact(report.notificationReason, 300))})`;
}

function findingRow(finding: LifecycleFinding): string {
  const deadline =
    finding.shutdownDate === undefined
      ? "Not announced"
      : `${escapeHtml(finding.shutdownDate)} (${finding.daysUntilShutdown ?? "?"}d)`;
  const delta = finding.delta === undefined ? "—" : finding.delta;
  return `| <code>${escapeHtml(compact(finding.modelId, 160))}</code> | ${escapeHtml(finding.servingPlatform)} | ${escapeHtml(finding.outcome)} | ${escapeHtml(delta)} | ${deadline} |`;
}

export function renderSummary(
  report: AssessmentReport,
  options: Readonly<{ notificationPending?: boolean }> = {},
): string {
  const actionable = report.lifecycleFindings.filter(
    (finding) => finding.outcome === "breach" || finding.outcome === "warning",
  );
  const visibleSources = report.evidenceSources.slice(0, 20);
  const hiddenSourceCount = report.evidenceSources.length - visibleSources.length;
  const sourceText =
    report.evidenceSources.length === 1
      ? "repository only"
      : `${visibleSources
          .map(
            (source) =>
              `${compact(source.id, 180)} (${source.kind}, ${source.health})`,
          )
          .join(" + ")}${hiddenSourceCount > 0 ? ` + ${hiddenSourceCount} more` : ""}`;
  const lines = [
    "## AI model lifecycle",
    "",
    `${resultIcon(report)} **${report.result}** · ${report.counts.blocking} blocking · ${report.counts.advisory} advisory · ${report.counts.unresolved} unresolved`,
    "",
    `Evidence: ${escapeHtml(sourceText)} · Scan: ${report.scanStatus} · Comparison: ${report.comparisonStatus}`,
    deliveryLine(report, options),
    "",
  ];
  if (report.result === "unknown") {
    lines.push(
      "### Outcome",
      "",
      "A trustworthy lifecycle result could not be produced. Review the failed or partial coverage diagnostics below.",
      "",
    );
  } else if (actionable.length === 0) {
    lines.push(
      "### Outcome",
      "",
      "No actionable lifecycle risk found in eligible repository evidence.",
      "",
    );
    if (report.evidenceSources.length === 1) {
      lines.push(
        "No runtime or control-plane evidence source was supplied; those systems were not assessed.",
        "",
      );
    }
  } else {
    lines.push(
      "### Actionable lifecycle findings",
      "",
      "| Model | Serving platform | Outcome | Change | Shutdown |",
      "| --- | --- | --- | --- | --- |",
      ...actionable.slice(0, 100).map(findingRow),
      "",
    );
    if (actionable.length > 100) {
      lines.push(`${actionable.length - 100} additional finding(s) are in the local JSON report.`, "");
    }
  }
  if (report.unresolvedReferences.length > 0) {
    lines.push(
      "### Conditional and unresolved evidence",
      "",
      ...report.unresolvedReferences.slice(0, 50).map((fact) => {
        const location = fact.locations[0];
        return `- <code>${escapeHtml(compact(fact.rawValue, 180))}</code> — ${escapeHtml(compact(fact.detectorRuleId, 240))} · ${fact.modelResolution}/${fact.platformResolution}${location === undefined ? "" : ` · <code>${escapeHtml(compact(location.path, 300))}</code>`}`;
      }),
      "",
    );
  }
  const external = report.evidenceSources.filter((source) => source.kind !== "repository");
  if (external.length > 0) {
    lines.push(
      "### External evidence health",
      "",
      ...external
        .slice(0, 50)
        .map((source) => `- ${escapeHtml(compact(source.id, 180))}: **${source.health}**`),
      ...(external.length > 50
        ? [`- ${external.length - 50} additional source(s) are in the JSON report.`]
        : []),
      "",
    );
  }
  if (report.policyDiff.length > 0) {
    lines.push(
      "### Policy and evidence changes",
      "",
      ...report.policyDiff.slice(0, 100).map((change) => `- ${escapeHtml(compact(change, 500))}`),
      "",
    );
  }
  const suppressed = report.lifecycleFindings.filter(
    (finding): finding is LifecycleFinding & { suppressedBy: string } =>
      finding.suppressedBy !== undefined,
  );
  if (suppressed.length > 0) {
    lines.push(
      "### Active suppressions",
      "",
      ...suppressed.slice(0, 100).map(
        (finding) =>
          `- <code>${escapeHtml(compact(finding.modelId, 160))}</code> on ${escapeHtml(
            compact(finding.servingPlatform, 80),
          )} — <code>${escapeHtml(compact(finding.suppressedBy, 160))}</code>`,
      ),
      ...(suppressed.length > 100
        ? [`- ${suppressed.length - 100} additional suppressed finding(s) are in the JSON report.`]
        : []),
      "",
    );
  }
  if (report.diagnostics.length > 0) {
    lines.push(
      "<details>",
      "<summary>Coverage and provenance diagnostics</summary>",
      "",
      ...report.diagnostics.slice(0, 200).map(
        (diagnostic) =>
          `- ${escapeHtml(compact(diagnostic.code, 180))}${diagnostic.path === undefined ? "" : ` · <code>${escapeHtml(compact(diagnostic.path, 300))}</code>`}: ${escapeHtml(compact(diagnostic.message, 800))}`,
      ),
      "",
      "</details>",
      "",
    );
  }
  const feedFreshness =
    report.feed.generatedAt === "" || report.feed.ageDays === null
      ? "unavailable"
      : `${escapeHtml(report.feed.generatedAt)} (${report.feed.ageDays}d old)`;
  lines.push(
    `Feed: source <code>${report.feed.sourceFeedSha256}</code> · active <code>${report.feed.activeRecordsSha256}</code> · generated ${feedFreshness}`,
    `Detector manifest: <code>${report.detectorManifestSha256}</code> · Report: <code>${escapeHtml(compact(report.reportPath, 500))}</code>`,
    "",
  );
  return lines.join("\n");
}

function annotationText(finding: LifecycleFinding): string {
  const deadline =
    finding.shutdownDate === undefined
      ? "shutdown date not announced"
      : `shutdown ${finding.shutdownDate} (${finding.daysUntilShutdown ?? "?"} day(s))`;
  return `${finding.modelId} on ${finding.servingPlatform}: ${deadline}. ${finding.reasons.join(" ")}`;
}

export function publishAnnotations(report: AssessmentReport, log: Log = console.log): void {
  const actionable = report.lifecycleFindings.filter(
    (finding) =>
      (finding.outcome === "breach" || finding.outcome === "warning") &&
      finding.delta !== "unchanged" &&
      finding.delta !== "resolved",
  );
  let emitted = 0;
  for (const finding of actionable) {
    if (emitted >= MAX_ANNOTATIONS) break;
    const location = finding.locations[0];
    if (location === undefined || Buffer.byteLength(location.path, "utf8") > 1_024) {
      emitCommand(
        finding.outcome === "breach" ? "error" : "warning",
        compact(annotationText(finding), 2_000),
        log,
      );
    } else {
      emitAnnotation(
        finding.outcome === "breach" ? "error" : "warning",
        compact(annotationText(finding), 2_000),
        {
          title: "AI model lifecycle",
          file: location.path,
          line: location.line,
          col: location.column,
        },
        log,
      );
    }
    emitted += 1;
  }
  if (actionable.length > emitted) {
    emitCommand(
      "notice",
      `${actionable.length - emitted} additional lifecycle annotation(s) were collapsed into the summary and report.`,
      log,
    );
  }
}

function boundedJson<T>(values: readonly T[]): { json: string; truncated: boolean } {
  const complete = JSON.stringify(values);
  if (Buffer.byteLength(complete, "utf8") <= MAX_DETAIL_OUTPUT_BYTES) {
    return { json: complete, truncated: false };
  }
  const parts: string[] = [];
  let bytes = 2;
  for (const value of values) {
    const serialized = JSON.stringify(value);
    const addition = Buffer.byteLength(serialized, "utf8") + (parts.length === 0 ? 0 : 1);
    if (bytes + addition > MAX_DETAIL_OUTPUT_BYTES) break;
    parts.push(serialized);
    bytes += addition;
  }
  return { json: `[${parts.join(",")}]`, truncated: true };
}

function outputSize(outputs: Readonly<Record<string, string>>): number {
  return Object.entries(outputs).reduce(
    (total, [key, value]) =>
      total + Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8") + 100,
    0,
  );
}

export function writeAssessmentReport(report: AssessmentReport): void {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_REPORT_BYTES) {
    throw new Error(`The complete assessment report exceeds ${MAX_REPORT_BYTES} bytes.`);
  }
  mkdirSync(dirname(report.reportPath), { recursive: true });
  writeFileSync(report.reportPath, serialized, { encoding: "utf8", mode: 0o600 });
}

export function publishCoreOutputs(report: AssessmentReport, environment: Environment): void {
  const sources = boundedJson(report.evidenceSources);
  const evidence = boundedJson(report.evidenceFacts);
  const findings = boundedJson(report.lifecycleFindings);
  const unresolved = boundedJson(report.unresolvedReferences);
  report.outputTruncated =
    sources.truncated || evidence.truncated || findings.truncated || unresolved.truncated;
  const evidenceFingerprint = canonicalSha256(
    "ai-model-eol/evidence-set/v3",
    report.evidenceFacts.map((fact) => fact.evidenceId).sort(),
  );
  const findingFingerprint = canonicalSha256(
    "ai-model-eol/finding-set/v3",
    report.lifecycleFindings.map((finding) => finding.findingId).sort(),
  );
  const outputs: Record<string, string> = {
    result: report.result,
    "baseline-result": report.baselineResult ?? "",
    "target-result": report.targetResult ?? "",
    "scan-status": report.scanStatus,
    "baseline-scan-status": report.baselineScanStatus ?? "",
    "target-scan-status": report.targetScanStatus ?? "",
    "comparison-status": report.comparisonStatus,
    "exit-reason": report.exitReason,
    "target-kind": report.targetKind,
    "evidence-health": report.evidenceHealth,
    "evidence-sources": sources.json,
    "evidence-facts": evidence.json,
    "lifecycle-findings": findings.json,
    "unresolved-references": unresolved.json,
    counts: JSON.stringify(report.counts),
    "source-feed-sha256": report.feed.sourceFeedSha256,
    "normalized-feed-sha256": report.feed.normalizedFeedSha256,
    "active-records-sha256": report.feed.activeRecordsSha256,
    "feed-adapter-manifest-sha256": report.feed.feedAdapterManifestSha256,
    "feed-generated-at": report.feed.generatedAt,
    "feed-age-days": report.feed.ageDays === null ? "" : String(report.feed.ageDays),
    "detector-manifest-sha256": report.detectorManifestSha256,
    "evidence-fingerprint": evidenceFingerprint,
    "finding-fingerprint": findingFingerprint,
    "scan-fingerprint": report.scanFingerprint,
    "alert-fingerprint": report.alertFingerprint,
    "output-truncated": String(report.outputTruncated),
    "report-path": report.reportPath,
  };
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["evidence-facts"] = "[]";
    outputs["unresolved-references"] = "[]";
    outputs["output-truncated"] = "true";
    report.outputTruncated = true;
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["lifecycle-findings"] = "[]";
    outputs["output-truncated"] = "true";
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["evidence-sources"] = "[]";
    outputs["output-truncated"] = "true";
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    throw new Error("Required GitHub outputs exceed the bounded publication budget.");
  }
  for (const [name, value] of Object.entries(outputs)) {
    appendCommand(environment.GITHUB_OUTPUT, name, value);
  }
}

export function publishNotificationOutputs(report: AssessmentReport, environment: Environment): void {
  appendCommand(environment.GITHUB_OUTPUT, "notification-status", report.notificationStatus);
  appendCommand(environment.GITHUB_OUTPUT, "notification-reason", report.notificationReason);
}

export function publishSummary(
  report: AssessmentReport,
  environment: Environment,
  options: Readonly<{ notificationPending?: boolean }> = {},
): void {
  appendSummary(environment.GITHUB_STEP_SUMMARY, renderSummary(report, options));
}

export function publishNotificationSummary(
  report: AssessmentReport,
  environment: Environment,
): void {
  appendSummary(
    environment.GITHUB_STEP_SUMMARY,
    [
      "## Notification delivery",
      "",
      `Slack: **${report.notificationStatus}** · ${escapeHtml(compact(report.notificationReason, 800))}`,
      "",
    ].join("\n"),
  );
}
