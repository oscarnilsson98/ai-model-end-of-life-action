import {
  defaultRequestPolicy,
  postSlack,
  type FetchLike,
} from "../shared/http.ts";
import { parseHttpsUrl } from "./input.ts";
import { servingPlatformLabel } from "../shared/text.ts";
import type {
  AssessmentReport,
  LifecycleFinding,
  NotificationStatus,
} from "../shared/types.ts";

const MAX_SLACK_TEXT_BYTES = 12_000;
const MAX_ACTIONABLE_FINDINGS = 10;
const MAX_EVIDENCE_SOURCES = 8;
const TRUSTED_NOTIFICATION_EVENTS = new Set(["schedule", "workflow_dispatch", "push"]);
const PROTECTED_SCOPES = new Set(["documentation", "example", "test"]);
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export type SlackDeliveryStatus = Extract<
  NotificationStatus,
  "sent" | "skipped" | "failed"
>;

export type SlackDeliveryResult = {
  status: SlackDeliveryStatus;
  /** Safe for summaries and outputs; never contains the webhook or raw transport errors. */
  detail?: string;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compact(value: string, maximum: number): string {
  const singleLine = value
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(/[\u0000-\u001f\u007f\s]+/g, " ")
    .trim();
  const codePoints = [...singleLine];
  if (codePoints.length <= maximum) return singleLine;
  return `${codePoints.slice(0, maximum - 1).join("")}…`;
}

/** Escape Slack mrkdwn controls and neutralize any mention syntax in report-owned text. */
function slackText(value: string, maximum: number): string {
  return compact(value, maximum)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@/g, "@\u200b")
    .replace(/\*/g, "∗")
    .replace(/_/g, "＿")
    .replace(/~/g, "∼")
    .replace(/`/g, "ˋ");
}

function boundedSlackText(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_SLACK_TEXT_BYTES) return value;
  const suffix = "\n… snapshot truncated";
  const byteLimit = MAX_SLACK_TEXT_BYTES - Buffer.byteLength(suffix, "utf8");
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > byteLimit) break;
    result += character;
    bytes += characterBytes;
  }
  return `${result.trimEnd()}${suffix}`;
}

function repositoryName(): string | null {
  const candidate = process.env.GITHUB_REPOSITORY?.trim();
  return candidate !== undefined && REPOSITORY_PATTERN.test(candidate) ? candidate : null;
}

function selectedTarget(report: AssessmentReport): string {
  return OID_PATTERN.test(report.event.targetOid) ? report.event.targetOid : "unavailable";
}

function actionableFindings(report: AssessmentReport): LifecycleFinding[] {
  const outcomeRank: Readonly<Record<"breach" | "warning", number>> = {
    breach: 0,
    warning: 1,
  };
  return report.lifecycleFindings
    .filter(
      (finding): finding is LifecycleFinding & { outcome: "breach" | "warning" } =>
        (finding.outcome === "breach" || finding.outcome === "warning") &&
        finding.delta !== "resolved" &&
        finding.confidence !== "low" &&
        !PROTECTED_SCOPES.has(finding.scope),
    )
    .sort((left, right) => {
      const outcomeDifference = outcomeRank[left.outcome] - outcomeRank[right.outcome];
      if (outcomeDifference !== 0) return outcomeDifference;
      const leftDays = left.daysUntilShutdown ?? Number.POSITIVE_INFINITY;
      const rightDays = right.daysUntilShutdown ?? Number.POSITIVE_INFINITY;
      if (leftDays !== rightDays) return leftDays - rightDays;
      const platformDifference = compareText(left.servingPlatform, right.servingPlatform);
      return platformDifference !== 0
        ? platformDifference
        : compareText(left.modelId, right.modelId);
    });
}

function deadlineText(finding: LifecycleFinding): string {
  if (finding.shutdownDate === undefined) return "shutdown date not announced";
  const days = finding.daysUntilShutdown;
  if (days === null || !Number.isSafeInteger(days)) return `shutdown ${finding.shutdownDate}`;
  if (days < 0) return `shutdown ${finding.shutdownDate} (${Math.abs(days)}d overdue)`;
  if (days === 0) return `shutdown ${finding.shutdownDate} (today)`;
  return `shutdown ${finding.shutdownDate} (${days}d)`;
}

function findingLine(finding: LifecycleFinding): string {
  const label = finding.outcome === "breach" ? "BLOCKING" : "ADVISORY";
  const qualifiers: string[] = [deadlineText(finding)];
  if (finding.delta !== undefined && finding.delta !== "unchanged") {
    qualifiers.push(finding.delta);
  }
  if (finding.feedConflict) qualifiers.push("feed conflict");
  return `• *${label}* ${slackText(servingPlatformLabel(finding), 160)} / ${slackText(
    finding.modelId,
    180,
  )} — ${qualifiers.map((value) => slackText(value, 100)).join(" · ")}`;
}

function reportFileHint(path: string): string | null {
  const normalized = compact(path, 1_024);
  if (normalized === "") return null;
  const components = normalized.split(/[\\/]/);
  const basename = components.at(-1)?.trim();
  return basename ? slackText(basename, 180) : null;
}

function resultIcon(report: AssessmentReport): string {
  if (report.result === "blocking" || report.result === "unknown") return "❌";
  if (report.result === "advisory" || report.scanStatus === "partial") return "⚠️";
  return "✅";
}

function renderSlackSnapshot(report: AssessmentReport): string {
  const repository = repositoryName();
  const findings = actionableFindings(report);
  const externalSources = report.evidenceSources.filter(
    (source) => source.kind !== "repository",
  );
  const lines = [
    `${resultIcon(report)} *AI model lifecycle snapshot*`,
    `*Result:* ${report.result} · *Scan:* ${report.scanStatus} · *Evidence:* ${report.evidenceHealth}`,
    `*Counts:* ${report.counts.blocking} blocking · ${
      report.counts.advisory
    } advisory · ${report.counts.unresolved} unresolved`,
  ];
  if (repository !== null) lines.push(`*Repository:* ${slackText(repository, 201)}`);
  lines.push(
    `*Event:* ${slackText(report.event.eventName, 80)} · *Target:* ${selectedTarget(report)}`,
    `*Evaluated:* ${slackText(report.evaluatedAt, 80)}`,
  );

  if (externalSources.length > 0) {
    lines.push("", "*Checked-in evidence sources:*");
    for (const source of externalSources.slice(0, MAX_EVIDENCE_SOURCES)) {
      lines.push(
        `• ${slackText(source.id, 160)} — ${slackText(source.kind, 40)} / ${source.health}`,
      );
    }
    if (externalSources.length > MAX_EVIDENCE_SOURCES) {
      lines.push(`• … ${externalSources.length - MAX_EVIDENCE_SOURCES} more source(s)`);
    }
  }

  lines.push("", `*Actionable findings (${findings.length}):*`);
  if (findings.length === 0) {
    lines.push("• None in the bounded notification view.");
  } else {
    lines.push(...findings.slice(0, MAX_ACTIONABLE_FINDINGS).map(findingLine));
    if (findings.length > MAX_ACTIONABLE_FINDINGS) {
      lines.push(`• … ${findings.length - MAX_ACTIONABLE_FINDINGS} more finding(s) in the report`);
    }
  }

  const reportHint = reportFileHint(report.reportPath);
  if (reportHint !== null) {
    lines.push(
      "",
      `*Report:* ${reportHint} (runner-local; upload it as an artifact to retain it)`,
    );
  }
  return boundedSlackText(lines.join("\n"));
}

function safeFailureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = /\bHTTP\s+(\d{3})\b/i.exec(message)?.[1];
  if (status !== undefined) return `Slack webhook returned HTTP ${status}.`;
  if (/timed out|abort/i.test(message)) return "Slack webhook request timed out.";
  return "Slack webhook delivery failed.";
}

/**
 * Deliver one stateless Slack snapshot. PR, merge-group, and local events never consume the
 * webhook. Delivery status remains independent from lifecycle result and scan health.
 */
export async function deliverSlackNotification(options: {
  webhookUrl: string;
  report: AssessmentReport;
  fetchImpl?: FetchLike;
}): Promise<SlackDeliveryResult> {
  if (
    !TRUSTED_NOTIFICATION_EVENTS.has(options.report.event.eventName) ||
    options.report.event.targetKind !== "commit"
  ) {
    return {
      status: "skipped",
      detail: `Slack snapshots are disabled for ${slackText(
        options.report.event.eventName,
        80,
      )} events.`,
    };
  }

  let webhookUrl: string;
  try {
    webhookUrl = parseHttpsUrl(options.webhookUrl, "slack-webhook");
  } catch {
    return { status: "failed", detail: "Slack webhook configuration is invalid." };
  }

  try {
    await postSlack(
      webhookUrl,
      renderSlackSnapshot(options.report),
      defaultRequestPolicy(options.fetchImpl),
    );
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", detail: safeFailureDetail(error) };
  }
}
