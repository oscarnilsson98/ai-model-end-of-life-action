import { findingKey } from "./feed.ts";
import type { DiscoveredModel, DiscoveryResult } from "./discovery.ts";
import type { NotificationReason } from "./notification.ts";
import type { Finding, InputModel, ProviderFreshness } from "./types.ts";

const MAX_SUMMARY_ROWS = 100;
const MAX_SUMMARY_BYTES = 900_000;
const MAX_SUMMARY_REPLACEMENTS = 3;
const MAX_FRESHNESS_ITEMS = 20;
const MAX_DISCOVERY_ROWS = 50;
const MAX_DISCOVERY_LOCATIONS = 3;
const MAX_ANNOTATION_CODE_UNITS = 4_000;
const MAX_FAILURE_MESSAGE_CODE_UNITS = 16_000;
const DEFAULT_SLACK_LIMIT = 3_500;
const MAX_SLACK_ITEM_CODE_UNITS = 1_200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeTableCell(value: string): string {
  return escapeHtml(value)
    .replace(/\|/g, "&#124;")
    .replace(/`/g, "&#96;")
    .replace(/[\r\n]+/g, "<br>");
}

function codeCell(value: string): string {
  return `<code>${escapeTableCell(value)}</code>`;
}

function modelLabel(finding: Finding): string {
  const label = `<code>${escapeTableCell(finding.id)}</code>`;
  return finding.url ? `[${label}](<${finding.url}>)` : label;
}

export function formatDays(days: number | null): string {
  if (days === null) return "Unknown";
  if (days < 0) return `${Math.abs(days)} day(s) ago`;
  if (days === 0) return "Today";
  return `${days} day(s)`;
}

function findingStatus(finding: Finding, isBreach: boolean): string {
  if (finding.status === "date-unknown") {
    return isBreach ? "❌ Reported undated deprecation" : "⚠️ Reported undated deprecation";
  }
  if ((finding.daysUntilShutdown ?? 0) < 0) {
    return isBreach
      ? "⛔ Reported shutdown date passed — failure threshold"
      : "⛔ Reported shutdown date passed";
  }
  if (isBreach) return "❌ Reported date inside failure threshold";
  return "⚠️ Reported EOL date approaching";
}

function modelDescription(model: InputModel): string {
  return model.provider ? `${model.id} (${model.provider})` : model.id;
}

function modelKey(model: InputModel): string {
  return `${model.id}\u0000${model.provider ?? "*"}`;
}

function compactContext(value: string, maxLength: number): string {
  return truncateCodeUnits(
    value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/gu, " ")
      .trim(),
    maxLength,
  );
}

export type SummaryInput = {
  findings: Finding[];
  breaching: Finding[];
  models: InputModel[];
  matchedModelCount: number;
  unmatchedModels: InputModel[];
  unmatchedBreaching: InputModel[];
  feedSize: number;
  windowDays: number;
  feedContentAgeDays: number | null;
  providerFreshness: ProviderFreshness[];
  includeUndated: boolean;
  feedSourceKind?: "url" | "file";
  feedSha256?: string;
  lifecycleFeedSha256?: string;
  inventorySha256?: string;
  notification?: {
    sent: boolean;
    reason: NotificationReason;
    error?: string;
  };
  discovery?: DiscoveryResult;
};

/** Render a bounded, escaped job summary with findings and feed-history diagnostics. */
export function renderSummary(input: SummaryInput): string {
  const breachKeys = new Set(input.breaching.map(findingKey));
  const unmatchedBreachKeys = new Set(input.unmatchedBreaching.map(modelKey));
  const totalBreaches = input.breaching.length + input.unmatchedBreaching.length;
  const untrackedDiscoveryCount =
    input.discovery?.models.filter((model) => !model.tracked).length ?? 0;
  const lines = ["## AI model end-of-life check", ""];
  if (input.findings.length === 0 && input.unmatchedBreaching.length === 0) {
    if (input.unmatchedModels.length > 0) {
      lines.push(
        `⚠️ **No lifecycle findings were reported, but ${input.unmatchedModels.length} declaration(s) have no exact feed history.** This is not a model-validity or support all-clear.`,
        "",
      );
    } else if (untrackedDiscoveryCount > 0) {
      lines.push(
        `⚠️ **No lifecycle findings were reported for the explicit inventory, but report-only discovery found ${untrackedDiscoveryCount} feed model ID(s) without a compatible declaration.** This is not an inventory all-clear.`,
        "",
      );
    } else {
      lines.push(
        input.includeUndated
          ? `All ${input.models.length} declaration(s) have feed history, and no matching deprecations are within ${input.windowDays} day(s) or lack a shutdown date. ✅`
          : `All ${input.models.length} declaration(s) have feed history, and no matching dated deprecations are within ${input.windowDays} day(s). Undated deprecations were excluded by configuration. ✅`,
        "",
      );
    }
  } else if (input.findings.length === 0) {
    lines.push(
      `❌ **${input.unmatchedBreaching.length} unmatched inventory declaration(s) breached the configured feed-history policy.** No lifecycle findings were reported.`,
      "",
    );
  } else {
    const undatedCount = input.findings.filter((finding) => finding.status === "date-unknown").length;
    lines.push(
      `${totalBreaches > 0 ? "❌" : "⚠️"} **${input.findings.length} lifecycle finding(s)** — ${input.breaching.length} lifecycle breach(es), ${input.unmatchedBreaching.length} feed-history breach(es), ${undatedCount} with no published shutdown date.`,
      "",
      "| Model | Serving platform | Status | Reported shutdown | Time | Replacement | Feed context |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const finding of input.findings.slice(0, MAX_SUMMARY_ROWS)) {
      const replacement =
        finding.replacementModels.length > 0
          ? `${finding.replacementModels
              .slice(0, MAX_SUMMARY_REPLACEMENTS)
              .map(codeCell)
              .join(", ")}${
              finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS
                ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more`
                : ""
            }`
          : "—";
      const context = finding.context
        ? codeCell(compactContext(finding.context, 240))
        : "—";
      lines.push(
        `| ${modelLabel(finding)} | ${codeCell(finding.provider)} | ${findingStatus(
          finding,
          breachKeys.has(findingKey(finding)),
        )} | ${escapeTableCell(finding.shutdownDate ?? "Not announced")} | ${formatDays(
          finding.daysUntilShutdown,
        )} | ${replacement} | ${context} |`,
      );
    }
    if (input.findings.length > MAX_SUMMARY_ROWS) {
      lines.push(
        "",
        `_Summary limited to ${MAX_SUMMARY_ROWS} rows; ${input.findings.length - MAX_SUMMARY_ROWS} additional finding(s) remain in the \`findings\` output._`,
      );
    }
    lines.push("");
  }

  if (input.unmatchedModels.length > 0) {
    lines.push(
      `<details><summary>${input.unmatchedModels.length} inventory entry/entries have no matching feed history${input.unmatchedBreaching.length > 0 ? `; ${input.unmatchedBreaching.length} breached feed-history policy` : ""}</summary>`,
      "",
      "This usually means the feed has no recorded deprecation for that exact model/platform pair; it is not proof that the model is active.",
      "",
      ...input.unmatchedModels
        .slice(0, 50)
        .map(
          (model) =>
            `- ${unmatchedBreachKeys.has(modelKey(model)) ? "❌ " : ""}<code>${escapeHtml(modelDescription(model))}</code>`,
        ),
    );
    if (input.unmatchedModels.length > 50) {
      lines.push(`- …and ${input.unmatchedModels.length - 50} more`);
    }
    lines.push("", "</details>", "");
  }

  if (input.discovery !== undefined) {
    lines.push(
      "### Report-only source discovery",
      "",
      `Found ${input.discovery.models.length} exact lifecycle-feed model ID(s) across ${input.discovery.scannedFileCount} scanned file(s) and ${input.discovery.matchCount} occurrence(s); ${untrackedDiscoveryCount} ID(s) have no compatible inventory declaration.`,
      "",
      "Discovery is lexical and case-sensitive. It cannot infer the serving platform, detect dynamically assembled IDs or aliases, or find active model IDs absent from the lifecycle feed. It does not change findings, policy breaches, alert fingerprints, or Slack delivery.",
      "",
    );
    if (input.discovery.models.length > 0) {
      lines.push(
        "| Feed model ID | Possible serving platform(s) | Inventory | First location(s) |",
        "| --- | --- | --- | --- |",
      );
      for (const model of input.discovery.models.slice(0, MAX_DISCOVERY_ROWS)) {
        const shownProviders = model.providers.slice(0, 5).map(codeCell).join(", ");
        const providers = `${model.ambiguous ? "Ambiguous: " : ""}${shownProviders}${model.providers.length > 5 ? `, … +${model.providers.length - 5} more` : ""}`;
        const locations = model.locations
          .slice(0, MAX_DISCOVERY_LOCATIONS)
          .map((location) => codeCell(`${location.path}:${location.line}:${location.column}`))
          .join("<br>");
        lines.push(
          `| ${codeCell(model.id)} | ${providers || "—"} | ${model.tracked ? "Compatible declaration present" : "⚠️ Not declared"} | ${locations || "—"}${model.locationsTruncated || model.locations.length > MAX_DISCOVERY_LOCATIONS ? "<br>…" : ""} |`,
        );
      }
      if (input.discovery.models.length > MAX_DISCOVERY_ROWS) {
        lines.push(
          "",
          `_Discovery table limited to ${MAX_DISCOVERY_ROWS} IDs; ${input.discovery.models.length - MAX_DISCOVERY_ROWS} additional ID(s) remain represented by the discovery count and bounded output._`,
        );
      }
      lines.push("");
    }
    lines.push(
      `Discovery examined ${input.discovery.examinedFileCount} file(s), read ${input.discovery.scannedByteCount} byte(s), skipped ${input.discovery.skippedFileCount} file(s) and ${input.discovery.skippedSymlinkCount} symlink(s), and considered ${input.discovery.candidateCount} feed ID candidate(s). Source snippets are never emitted.`,
      "",
    );
  }

  const age =
    input.feedContentAgeDays === null
      ? "no observation timestamp available"
      : `newest recorded feed content: ${input.feedContentAgeDays} day(s) old`;
  lines.push(
    `Checked ${input.models.length} unique model declaration(s) against ${input.feedSize} validated feed entries; ${input.matchedModelCount} declaration(s) had feed history; window: ${input.windowDays} day(s); ${age}.`,
  );
  if (input.providerFreshness.length > 0) {
    const omittedFreshness = input.providerFreshness.length - MAX_FRESHNESS_ITEMS;
    lines.push(
      `Configured-platform content ages: ${input.providerFreshness
        .slice(0, MAX_FRESHNESS_ITEMS)
        .map(
          (item) =>
            `<code>${escapeHtml(item.provider)}=${item.ageDays === null ? "unknown" : `${item.ageDays}d`}</code>`,
        )
        .join(", ")}${omittedFreshness > 0 ? `, … +${omittedFreshness} more` : ""}.`,
    );
  }
  lines.push(
    "",
    "Feed timestamps measure when lifecycle content was observed, not whether every upstream scraper ran successfully.",
    "Provider dates may be earliest, regional, tier-specific, redirected, or otherwise qualified; follow the linked source or provider documentation before migrating.",
  );
  if (
    input.feedSha256 !== undefined &&
    input.lifecycleFeedSha256 !== undefined &&
    input.inventorySha256 !== undefined
  ) {
    lines.push(
      `Audit identity: source=${input.feedSourceKind ?? "unknown"}; raw feed SHA-256 <code>${escapeHtml(input.feedSha256)}</code>; lifecycle SHA-256 <code>${escapeHtml(input.lifecycleFeedSha256)}</code>; inventory SHA-256 <code>${escapeHtml(input.inventorySha256)}</code>.`,
    );
  }
  if (input.notification?.error !== undefined) {
    lines.push(
      "",
      "### Notification delivery",
      "",
      `❌ Slack delivery failed: <code>${escapeHtml(compactContext(input.notification.error, 1_000))}</code>`,
    );
  } else if (input.notification?.reason === "unchanged") {
    lines.push("Slack delivery was skipped because the caller-provided alert fingerprint is unchanged.");
  } else if (input.notification?.sent) {
    lines.push(`Slack notification sent (${escapeHtml(input.notification.reason)}).`);
  }
  const markdown = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") <= MAX_SUMMARY_BYTES) return markdown;

  const fallback = [
    "## AI model end-of-life check",
    "",
    `${totalBreaches > 0 ? "❌" : "⚠️"} **${input.findings.length} lifecycle finding(s)** — ${totalBreaches} total policy breach(es).`,
    "",
    `The detailed table was omitted because it exceeded the safe ${MAX_SUMMARY_BYTES}-byte job-summary limit. Use the bounded \`findings\` output for machine-readable details.`,
    "",
    `Checked ${input.models.length} unique model declaration(s) against ${input.feedSize} validated feed entries; ${input.matchedModelCount} declaration(s) had feed history.`,
    "",
  ];
  if (
    input.feedSha256 !== undefined &&
    input.lifecycleFeedSha256 !== undefined &&
    input.inventorySha256 !== undefined
  ) {
    fallback.push(
      `Audit identity: raw feed SHA-256 <code>${escapeHtml(input.feedSha256)}</code>; lifecycle SHA-256 <code>${escapeHtml(input.lifecycleFeedSha256)}</code>; inventory SHA-256 <code>${escapeHtml(input.inventorySha256)}</code>.`,
      "",
    );
  }
  if (input.discovery !== undefined) {
    fallback.push(
      `Report-only discovery found ${input.discovery.models.length} feed model ID(s), including ${input.discovery.models.filter((model) => !model.tracked).length} without a compatible inventory declaration, across ${input.discovery.matchCount} occurrence(s).`,
      "",
    );
  }
  if (input.notification?.error !== undefined) {
    fallback.push(
      `❌ Slack delivery failed: <code>${escapeHtml(compactContext(input.notification.error, 1_000))}</code>`,
      "",
    );
  }
  return fallback.join("\n");
}

export function renderFailureSummary(message: string): string {
  const bounded = truncateCodeUnits(message, MAX_FAILURE_MESSAGE_CODE_UNITS);
  return `## AI model end-of-life check\n\n❌ **The action failed.**\n\n<pre>${escapeHtml(bounded)}</pre>\n`;
}

function escapeSlack(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*/g, "∗")
    .replace(/_/g, "＿")
    .replace(/~/g, "∼")
    .replace(/`/g, "ˋ");
}

function escapeSlackBounded(value: string, maxLength: number): string {
  let escaped = "";
  for (const character of value) {
    const next = escapeSlack(character);
    if (escaped.length + next.length > maxLength - 1) return `${escaped}…`;
    escaped += next;
  }
  return escaped;
}

function appendSlackExtra(line: string, extra: string): string {
  return line.length + extra.length <= MAX_SLACK_ITEM_CODE_UNITS ? `${line}${extra}` : line;
}

function slackLine(finding: Finding): string {
  const timing =
    finding.daysUntilShutdown === null
      ? `feed reports deprecation; shutdown date not announced${
          finding.deprecationDate ? ` (deprecated ${escapeSlack(finding.deprecationDate)})` : ""
        }`
      : `feed reports shutdown ${escapeSlack(finding.shutdownDate ?? "unknown")} (${formatDays(
          finding.daysUntilShutdown,
        )})`;
  const replacements =
    finding.replacementModels.length > 0
      ? ` → ${finding.replacementModels
          .slice(0, MAX_SUMMARY_REPLACEMENTS)
          .map((replacement) => escapeSlackBounded(replacement, 100))
          .join(", ")}${
          finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS
            ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more`
            : ""
        }`
      : "";
  const escapedUrl = finding.url
    ?.replace(/&/g, "&amp;")
    .replace(/\|/g, "%7C");
  const source = escapedUrl
    ? escapedUrl.length <= 360
      ? ` <${escapedUrl}|source>`
      : " (source URL in GitHub job summary)"
    : "";
  const context = finding.context
    ? ` — ${escapeSlackBounded(compactContext(finding.context, 180), 240)}`
    : "";
  let line = `*${escapeSlackBounded(finding.id, 400)}* (${escapeSlackBounded(
    finding.provider,
    160,
  )}) — ${timing}`;
  line = appendSlackExtra(line, context);
  line = appendSlackExtra(line, source);
  line = appendSlackExtra(line, replacements);
  return line;
}

export type SlackRenderOptions = {
  breaching?: Finding[];
  unmatchedBreaching?: InputModel[];
  maxLength?: number;
};

/** Slack mrkdwn text, escaped and capped below Slack's truncation threshold. */
export function renderSlackText(
  findings: Finding[],
  options: SlackRenderOptions = {},
): string {
  const breaching = options.breaching ?? [];
  const unmatchedBreaching = options.unmatchedBreaching ?? [];
  const maxLength = options.maxLength ?? DEFAULT_SLACK_LIMIT;
  const breachKeys = new Set(breaching.map(findingKey));
  const totalBreaches = breaching.length + unmatchedBreaching.length;
  const heading = `:rotating_light: *${findings.length} AI model lifecycle finding(s)* — ${totalBreaches} policy breach(es)${unmatchedBreaching.length > 0 ? `; ${unmatchedBreaching.length} unmatched inventory declaration(s)` : ""}`;
  const itemLines = [
    ...findings
      .filter((finding) => breachKeys.has(findingKey(finding)))
      .map((finding) => `• ❌ ${slackLine(finding)}`),
    ...unmatchedBreaching.map(
      (model) =>
        `• ❌ no exact feed history for *${escapeSlackBounded(model.id, 400)}*${model.provider ? ` (${escapeSlackBounded(model.provider, 160)})` : ""}`,
    ),
    ...findings
      .filter((finding) => !breachKeys.has(findingKey(finding)))
      .map((finding) => `• ⚠️ ${slackLine(finding)}`),
  ];
  const included: string[] = [];
  for (const line of itemLines) {
    const omitted = itemLines.length - included.length - 1;
    const suffix = omitted > 0 ? `\n…and ${omitted} more policy signal(s). See the GitHub job summary.` : "";
    const candidate = `${heading}\n${[...included, line].join("\n")}${suffix}`;
    if (candidate.length > maxLength) break;
    included.push(line);
  }
  const omitted = itemLines.length - included.length;
  const suffix = omitted > 0 ? `\n…and ${omitted} more policy signal(s). See the GitHub job summary.` : "";
  return `${heading}${included.length > 0 ? `\n${included.join("\n")}` : ""}${suffix}`;
}

export function renderResolvedSlackText(): string {
  return ":white_check_mark: *AI model lifecycle alert resolved* — the current notification set contains no lifecycle findings or feed-history policy breaches.";
}

export function renderFindingAnnotation(finding: Finding): string {
  const replacement =
    finding.replacementModels.length > 0
      ? `${finding.replacementModels.slice(0, MAX_SUMMARY_REPLACEMENTS).join(", ")}${
          finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS
            ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more`
            : ""
        }`
      : "none listed";
  const sourceGuidance = finding.url
    ? `Confirm the provider scope at the linked source. ${finding.url}`
    : "Confirm the provider scope in the provider's documentation.";
  const compactedContext = finding.context ? compactContext(finding.context, 500) : "";
  const contextSuffix = compactedContext
    ? ` Feed context: ${compactedContext}${/[.!?]$/.test(compactedContext) ? "" : "."}`
    : "";
  let annotation: string;
  if (finding.daysUntilShutdown === null) {
    annotation = `Deprecations feed reports ${finding.id} (${finding.provider}) as deprecated, but no shutdown date is published. Replacement: ${replacement}.${contextSuffix} ${sourceGuidance}`;
  } else {
    annotation = `Deprecations feed reports ${finding.id} (${finding.provider}) shutdown date ${finding.shutdownDate} — ${formatDays(
      finding.daysUntilShutdown,
    )}. Replacement: ${replacement}.${contextSuffix} ${sourceGuidance}`;
  }
  return truncateCodeUnits(annotation, MAX_ANNOTATION_CODE_UNITS);
}

export function renderUnmatchedAnnotation(model: InputModel): string {
  return truncateCodeUnits(
    `No exact deprecations-feed history was found for ${modelDescription(model)}; fail-on-unmatched is enabled. Confirm the model ID and serving platform, or disable the feed-history policy when unmatched active models are expected.`,
    MAX_ANNOTATION_CODE_UNITS,
  );
}

export function renderDiscoveryAnnotation(model: DiscoveredModel): string {
  const shownProviders = model.providers.slice(0, 5).join(", ");
  const providerSuffix = model.ambiguous
    ? ` The source token does not identify its serving platform; feed candidates include ${shownProviders}${model.providers.length > 5 ? `, and ${model.providers.length - 5} more` : ""}.`
    : shownProviders === ""
      ? ""
      : ` Feed serving platform: ${shownProviders}.`;
  return truncateCodeUnits(
    `Report-only discovery found exact lifecycle-feed model ID ${model.id}, but the explicit inventory has no compatible declaration.${providerSuffix} Confirm the reference and add the model to the inventory if it is a real dependency.`,
    MAX_ANNOTATION_CODE_UNITS,
  );
}

function truncateCodeUnits(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  let truncated = value.slice(0, maxLength - 1);
  if (/^[\uD800-\uDBFF]$/.test(truncated.at(-1) ?? "")) truncated = truncated.slice(0, -1);
  return `${truncated}…`;
}
