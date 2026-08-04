import {
  defaultRequestPolicy,
  postSlack,
  type FetchLike,
} from "../shared/http.ts";
import { parseHttpsUrl } from "./input.ts";
import { deprecationLeadsHorizon, earliestLifecycleDays } from "../shared/status.ts";
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
const RUN_ID_PATTERN = /^[0-9]{1,20}$/;
/** Only RFC 3986 HTTP(S) characters, so report-owned text can never break out of Slack link syntax. */
const SAFE_LINK_PATTERN = /^https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,2000}$/;
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** A finding the snapshot may name: a live breach or warning that the target still carries. */
type NotifiableFinding = LifecycleFinding & { outcome: "breach" | "warning" };

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

/** Lexical evidence names a model without proving a call site, so its lines say so. */
function isTextMatch(finding: LifecycleFinding): boolean {
  return finding.confidence === "low";
}

/**
 * Split live breach and warning findings into the ones the snapshot names and the ones it
 * only counts. Every counted finding lands in exactly one side, so `Counts:` always
 * reconciles with the finding list. Low-confidence lexical matches are named and labelled
 * rather than dropped: a repository with no typed SDK call site has nothing else to report.
 */
function partitionFindings(report: AssessmentReport): {
  listed: NotifiableFinding[];
  withheld: NotifiableFinding[];
} {
  const outcomeRank: Readonly<Record<"breach" | "warning", number>> = {
    breach: 0,
    warning: 1,
  };
  const notifiable = report.lifecycleFindings.filter(
    (finding): finding is NotifiableFinding =>
      (finding.outcome === "breach" || finding.outcome === "warning") &&
      finding.delta !== "resolved",
  );
  const listed = notifiable
    .filter((finding) => !PROTECTED_SCOPES.has(finding.scope))
    .sort((left, right) => {
      const outcomeDifference = outcomeRank[left.outcome] - outcomeRank[right.outcome];
      if (outcomeDifference !== 0) return outcomeDifference;
      // Verified evidence outranks a bare text match so the bounded view never buries it.
      const tierDifference = Number(isTextMatch(left)) - Number(isTextMatch(right));
      if (tierDifference !== 0) return tierDifference;
      const leftDays = earliestLifecycleDays(left) ?? Number.POSITIVE_INFINITY;
      const rightDays = earliestLifecycleDays(right) ?? Number.POSITIVE_INFINITY;
      if (leftDays !== rightDays) return leftDays - rightDays;
      const platformDifference = compareText(left.servingPlatform, right.servingPlatform);
      return platformDifference !== 0
        ? platformDifference
        : compareText(left.modelId, right.modelId);
    });
  return {
    listed,
    withheld: notifiable.filter((finding) => PROTECTED_SCOPES.has(finding.scope)),
  };
}

function dateText(label: string, date: string, days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isSafeInteger(days)) {
    return `${label} ${date}`;
  }
  if (days < 0) return `${label} ${date} (${Math.abs(days)}d overdue)`;
  if (days === 0) return `${label} ${date} (today)`;
  return `${label} ${date} (${days}d)`;
}

function deadlineText(finding: LifecycleFinding): string {
  if (finding.shutdownDate === undefined) return "shutdown date not announced";
  return dateText("shutdown", finding.shutdownDate, finding.daysUntilShutdown);
}

/** Report-owned URLs become links only when they cannot alter the surrounding mrkdwn. */
function safeLink(candidate: string | undefined): string | null {
  if (candidate === undefined) return null;
  const trimmed = candidate.trim();
  if (!SAFE_LINK_PATTERN.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  return parsed.username === "" && parsed.password === "" ? trimmed : null;
}

/** Slack resolves `&amp;` back to `&` inside a link, so query separators survive escaping. */
function slackLink(url: string, label: string): string {
  return `<${url.replace(/&/g, "&amp;")}|${label}>`;
}

function replacementText(finding: LifecycleFinding): string | null {
  const replacement = finding.replacementModels[0];
  if (replacement === undefined) return null;
  const platform = replacement.servingPlatform;
  return `→ ${
    platform === undefined || platform === finding.servingPlatform
      ? replacement.modelId
      : `${platform}/${replacement.modelId}`
  }`;
}

function findingLabel(finding: NotifiableFinding): string {
  if (finding.outcome === "breach") return "BLOCKING";
  return isTextMatch(finding) ? "ADVISORY (text match)" : "ADVISORY";
}

function findingLine(finding: NotifiableFinding): string {
  const qualifiers: string[] = [];
  // Name the deprecation whenever it is the nearer date, so an advisory driven by a
  // deprecation is not read as a false alarm against a distant shutdown.
  if (deprecationLeadsHorizon(finding) && finding.deprecationDate !== undefined) {
    qualifiers.push(
      dateText("deprecation", finding.deprecationDate, finding.daysUntilDeprecation),
    );
  }
  qualifiers.push(deadlineText(finding));
  if (finding.delta !== undefined && finding.delta !== "unchanged") {
    qualifiers.push(finding.delta);
  }
  if (finding.feedConflict) qualifiers.push("feed conflict");
  const replacement = replacementText(finding);
  if (replacement !== null) qualifiers.push(replacement);
  const line = `• *${findingLabel(finding)}* ${slackText(
    servingPlatformLabel(finding),
    160,
  )} / ${slackText(finding.modelId, 180)} — ${qualifiers
    .map((value) => slackText(value, 100))
    .join(" · ")}`;
  const source = safeLink(finding.sourceUrls[0]);
  return source === null ? line : `${line} · ${slackLink(source, "source")}`;
}

/** The run link is the only way an alert reader can reach the job summary and artifacts. */
function workflowRunUrl(): string | null {
  const repository = repositoryName();
  const runId = process.env.GITHUB_RUN_ID?.trim();
  const server = process.env.GITHUB_SERVER_URL?.trim();
  if (repository === null || server === undefined) return null;
  if (runId === undefined || !RUN_ID_PATTERN.test(runId)) return null;
  let origin: string;
  try {
    const parsed = new URL(server);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      return null;
    }
    origin = parsed.origin;
  } catch {
    return null;
  }
  return safeLink(`${origin}/${repository}/actions/runs/${runId}`);
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
  const { listed, withheld } = partitionFindings(report);
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

  lines.push("", `*Actionable findings (${listed.length}):*`);
  if (listed.length === 0 && withheld.length === 0) {
    lines.push("• None in the bounded notification view.");
  } else {
    lines.push(...listed.slice(0, MAX_ACTIONABLE_FINDINGS).map(findingLine));
    if (listed.length > MAX_ACTIONABLE_FINDINGS) {
      lines.push(`• … ${listed.length - MAX_ACTIONABLE_FINDINGS} more finding(s) in the report`);
    }
    if (withheld.length > 0) {
      lines.push(
        `• ${withheld.length} counted finding(s) outside application and deployment scope stay in the job summary.`,
      );
    }
  }

  const runUrl = workflowRunUrl();
  const reportHint = reportFileHint(report.reportPath);
  const trailer: string[] = [];
  if (runUrl !== null) trailer.push(`*Run:* ${slackLink(runUrl, "workflow run")}`);
  if (reportHint !== null) {
    trailer.push(`*Report:* ${reportHint} (runner-local; upload it as an artifact to retain it)`);
  }
  if (trailer.length > 0) lines.push("", ...trailer);
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
