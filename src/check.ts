import {
  assertNoFutureObservations,
  assertRequestedProvidersExist,
  breachingFindings,
  feedContentAgeDays,
  findingKey,
  matchDeprecations,
  relevantProviderFreshness,
  validateFeed,
} from "./feed.ts";
import {
  buildAuditRecord,
  canonicalInventorySha256,
  canonicalLifecycleFeedSha256,
  stableAlertFingerprint,
  type AuditRecord,
} from "./digest.ts";
import {
  discoverModels,
  publishDiscoveredModels,
  type DiscoveryResult,
} from "./discovery.ts";
import { loadFeedDocument, parseExpectedSha256 } from "./feed-source.ts";
import {
  appendCommand,
  appendSummary,
  emitAnnotation,
  emitCommand,
  getInput,
  maskSecret,
  type Environment,
  type Log,
} from "./github.ts";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RETRIES,
  defaultRequestPolicy,
  postSlack,
  type FetchLike,
} from "./http.ts";
import {
  loadModels,
  parseBoolean,
  parseHttpUrl,
  parseHttpsUrl,
  parseOptionalInteger,
  parseRequiredInteger,
} from "./input.ts";
import {
  decideNotification,
  parseNotificationMode,
  parsePreviousAlertFingerprint,
  type NotificationReason,
} from "./notification.ts";
import {
  renderDiscoveryAnnotation,
  renderFindingAnnotation,
  renderSlackText,
  renderResolvedSlackText,
  renderSummary,
  renderUnmatchedAnnotation,
} from "./render.ts";
import type { Finding, InputModel, MatchResult, ProviderFreshness } from "./types.ts";

export const DEFAULT_FEED_URL = "https://deprecations.info/v1/deprecations.json";
export const DEFAULT_WINDOW_DAYS = 90;
export const MAX_DAYS = 36_500;

const MAX_TOTAL_OUTPUT_CODE_UNITS = 400_000;
const MAX_WARNING_ANNOTATIONS = 10;
const MAX_ERROR_POLICY_ANNOTATIONS = 9;

export class ReportedActionError extends Error {}
export class PolicyBreachError extends ReportedActionError {}
export class NotificationDeliveryError extends ReportedActionError {}

export type RunDependencies = {
  environment?: Environment;
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  log?: Log;
};

export type RunResult = MatchResult & {
  breaching: Finding[];
  unmatchedBreaching: InputModel[];
  breachCount: number;
  feedSize: number;
  feedContentAgeDays: number | null;
  providerFreshness: ProviderFreshness[];
  feedSha256: string;
  lifecycleFeedSha256: string;
  inventorySha256: string;
  alertFingerprint: string;
  nextAlertFingerprint: string;
  auditRecord: AuditRecord;
  notificationSent: boolean;
  notificationReason: NotificationReason;
  discovery: DiscoveryResult | null;
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notificationMode(raw: string | undefined): "warn" | "error" {
  const normalized = raw?.trim().toLowerCase() || "error";
  if (normalized !== "warn" && normalized !== "error") {
    throw new Error(
      "Invalid notification-failure-mode: expected `warn` or `error`.",
    );
  }
  return normalized;
}

function outputCodeUnits(outputs: Readonly<Record<string, string>>): number {
  // GitHub approximates the 1 MiB job-output limit using UTF-16 encoding.
  return Object.entries(outputs).reduce(
    (total, [key, value]) => total + key.length + value.length + 100,
    0,
  );
}

function validateFreshness(
  maxAgeDays: number | null,
  globalAgeDays: number | null,
  providerFreshness: ProviderFreshness[],
): void {
  if (maxAgeDays === null) return;
  if (globalAgeDays === null) {
    throw new Error(
      "Feed content-age checking is enabled, but the feed carries no last_observed/scraped_at timestamps.",
    );
  }
  if (globalAgeDays > maxAgeDays) {
    throw new Error(
      `Newest recorded feed content is ${globalAgeDays} day(s) old (max ${maxAgeDays}). This signal measures content observation, not scraper execution.`,
    );
  }
  for (const freshness of providerFreshness) {
    if (freshness.ageDays === null) {
      throw new Error(
        `Feed content-age checking is enabled, but serving platform ${freshness.provider} has no observation timestamps.`,
      );
    }
    if (freshness.ageDays > maxAgeDays) {
      throw new Error(
        `Newest recorded ${freshness.provider} feed content is ${freshness.ageDays} day(s) old (max ${maxAgeDays}). This may mean a quiet source or a stale provider scraper.`,
      );
    }
  }
}

export async function run(dependencies: RunDependencies = {}): Promise<RunResult> {
  const environment = dependencies.environment ?? process.env;
  const log = dependencies.log ?? console.log;
  const now = (dependencies.now ?? Date.now)();
  const workspace = environment.GITHUB_WORKSPACE ?? process.cwd();

  const modelsInput = getInput("models", environment);
  const modelsFileInput = getInput("models-file", environment);
  const models = loadModels(modelsInput, modelsFileInput, workspace);
  const windowDays = parseRequiredInteger(
    getInput("days-before-shutdown", environment),
    "days-before-shutdown",
    DEFAULT_WINDOW_DAYS,
    { max: MAX_DAYS },
  );
  const failWithinDays = parseOptionalInteger(
    getInput("fail-within-days", environment),
    "fail-within-days",
    { max: MAX_DAYS },
  );
  if (failWithinDays !== null && failWithinDays > windowDays) {
    throw new Error(
      `fail-within-days (${failWithinDays}) must not exceed days-before-shutdown (${windowDays}); otherwise failures can be hidden outside the reporting window.`,
    );
  }
  const includeUndated = parseBoolean(
    getInput("include-undated", environment),
    "include-undated",
    true,
  );
  const failOnUndated = parseBoolean(
    getInput("fail-on-undated", environment),
    "fail-on-undated",
    false,
  );
  if (failOnUndated && !includeUndated) {
    throw new Error(
      "`fail-on-undated` cannot be true when `include-undated` is false; the failure policy must not hide the findings it evaluates.",
    );
  }
  const failOnUnmatched = parseBoolean(
    getInput("fail-on-unmatched", environment),
    "fail-on-unmatched",
    false,
  );
  const discoveryEnabled = parseBoolean(
    getInput("discover-models", environment),
    "discover-models",
    false,
  );
  const discoveryPaths = getInput("discovery-paths", environment);
  const maxFeedAgeDays = parseOptionalInteger(
    getInput("max-feed-age-days", environment),
    "max-feed-age-days",
    { max: MAX_DAYS },
  );
  const jobSummary = parseBoolean(getInput("job-summary", environment), "job-summary", true);
  const timeoutSeconds = parseRequiredInteger(
    getInput("request-timeout-seconds", environment),
    "request-timeout-seconds",
    DEFAULT_REQUEST_TIMEOUT_MS / 1_000,
    { min: 1, max: 300 },
  );
  const retries = parseRequiredInteger(
    getInput("retries", environment),
    "retries",
    DEFAULT_RETRIES,
    { max: 5 },
  );
  const failureMode = notificationMode(getInput("notification-failure-mode", environment));
  const notificationModeValue = parseNotificationMode(
    getInput("notification-mode", environment),
  );
  const previousAlertFingerprint = parsePreviousAlertFingerprint(
    getInput("previous-alert-fingerprint", environment),
  );
  const feedUrlInput = getInput("feed-url", environment);
  const feedFileInput = getInput("feed-file", environment);
  const expectedFeedSha256 = parseExpectedSha256(
    getInput("expected-feed-sha256", environment),
  );
  if (feedUrlInput) {
    const parsedFeedUrl = parseHttpUrl(feedUrlInput, "feed-url");
    if (new URL(parsedFeedUrl).search !== "") maskSecret(parsedFeedUrl, log);
  }
  const slackWebhookInput = getInput("slack-webhook", environment);
  if (slackWebhookInput) maskSecret(slackWebhookInput, log);
  const slackWebhook = slackWebhookInput
    ? parseHttpsUrl(slackWebhookInput, "slack-webhook")
    : undefined;

  const requestPolicy = defaultRequestPolicy(dependencies.fetch ?? fetch);
  requestPolicy.timeoutMs = timeoutSeconds * 1_000;
  requestPolicy.retries = retries;
  if (dependencies.sleep) requestPolicy.sleep = dependencies.sleep;
  if (dependencies.random) requestPolicy.random = dependencies.random;

  const feedDocument = await loadFeedDocument({
    feedUrl: feedUrlInput,
    feedFile: feedFileInput,
    expectedSha256: expectedFeedSha256,
    defaultFeedUrl: DEFAULT_FEED_URL,
    workspace,
    requestPolicy,
  });
  const feed = validateFeed(feedDocument.value);
  assertNoFutureObservations(feed, now);
  assertRequestedProvidersExist(models, feed);
  const contentAge = feedContentAgeDays(feed, now);
  const providerFreshness = relevantProviderFreshness(models, feed, now);
  validateFreshness(maxFeedAgeDays, contentAge, providerFreshness);

  const discovery = discoveryEnabled
    ? discoverModels(feed, workspace, discoveryPaths, {
        inventory: models,
        excludedPaths: [feedFileInput ?? "", modelsFileInput ?? ""],
      })
    : null;

  const matched = matchDeprecations(models, feed, windowDays, now, includeUndated);
  const breaching = breachingFindings(matched.findings, failWithinDays, failOnUndated);
  const unmatchedBreaching = failOnUnmatched ? matched.unmatchedModels : [];
  const breachCount = breaching.length + unmatchedBreaching.length;
  const inventorySha256 = canonicalInventorySha256(models);
  const lifecycleFeedSha256 = canonicalLifecycleFeedSha256(feed);
  const alertFingerprint = stableAlertFingerprint({
    findings: matched.findings,
    breaching,
    unmatchedBreaching,
  });
  const auditRecord = buildAuditRecord({
    inventory: models,
    feed,
    rawFeedBytes: feedDocument.bytes,
    findings: matched.findings,
    breaching,
    unmatchedBreaching,
  });
  const alertCount = matched.findings.length + unmatchedBreaching.length;
  const notificationDecision = slackWebhook
    ? decideNotification({
        mode: notificationModeValue,
        previousFingerprint: previousAlertFingerprint,
        currentFingerprint: alertFingerprint,
        alertCount,
      })
    : { shouldNotify: false, reason: "disabled" as const };
  let notificationSent = false;
  let notificationReason: NotificationReason = notificationDecision.reason;
  let nextAlertFingerprint =
    notificationDecision.reason === "disabled"
      ? (previousAlertFingerprint ?? "")
      : alertFingerprint;
  let notificationError: Error | null = null;
  let notificationFailureMessage: string | null = null;
  const discoveryPublication = publishDiscoveredModels(discovery?.models ?? []);
  const untrackedDiscoveredModels =
    discovery?.models.filter((model) => !model.tracked) ?? [];
  const outputs: Record<string, string> = {
    "has-findings": String(matched.findings.length > 0),
    findings: JSON.stringify(matched.findings),
    "finding-count": String(matched.findings.length),
    "has-breaches": String(breachCount > 0),
    "breach-count": String(breachCount),
    "checked-model-count": String(models.length),
    "matched-model-count": String(matched.matchedModelCount),
    "unmatched-model-count": String(matched.unmatchedModels.length),
    "feed-content-age-days": contentAge === null ? "" : String(contentAge),
    "feed-record-count": String(feed.length),
    "feed-sha256": feedDocument.rawSha256,
    "lifecycle-feed-sha256": lifecycleFeedSha256,
    "inventory-sha256": inventorySha256,
    "alert-fingerprint": alertFingerprint,
    "next-alert-fingerprint": nextAlertFingerprint,
    "audit-record": JSON.stringify(auditRecord),
    "notification-sent": "false",
    "notification-reason": notificationReason,
    "unmatched-models": JSON.stringify(matched.unmatchedModels),
    "discovered-models": discoveryPublication.json,
    "discovered-model-count": String(discovery?.models.length ?? 0),
    "untracked-discovered-model-count": String(untrackedDiscoveredModels.length),
    "discovery-match-count": String(discovery?.matchCount ?? 0),
    "discovery-output-truncated": String(discoveryPublication.truncated),
  };
  if (
    outputCodeUnits(outputs) > MAX_TOTAL_OUTPUT_CODE_UNITS &&
    outputs["discovered-models"] !== "[]"
  ) {
    outputs["discovered-models"] = "[]";
    outputs["discovery-output-truncated"] = "true";
    emitCommand(
      "notice",
      "The combined GitHub outputs exceeded the safe size budget, so detailed discovery results were omitted. Discovery counts remain available in outputs and the job summary.",
      log,
    );
  }
  if (
    outputCodeUnits(outputs) > MAX_TOTAL_OUTPUT_CODE_UNITS &&
    matched.findings.some((finding) => finding.context !== undefined)
  ) {
    outputs.findings = JSON.stringify(
      matched.findings.map(({ context: _context, ...finding }) => finding),
    );
    emitCommand(
      "notice",
      "The combined GitHub outputs exceeded the safe size budget, so verbose finding context was omitted. Source URLs remain available.",
      log,
    );
  }
  const totalOutputSize = outputCodeUnits(outputs);
  if (totalOutputSize > MAX_TOTAL_OUTPUT_CODE_UNITS) {
    throw new Error(
      `The combined outputs are too large for GitHub Actions (${totalOutputSize} UTF-16 code units after omitting optional context where available; safe limit ${MAX_TOTAL_OUTPUT_CODE_UNITS}). Reduce the model inventory.`,
    );
  }
  const breachKeys = new Set(breaching.map(findingKey));
  const maxWarningAnnotations =
    notificationDecision.shouldNotify && failureMode === "warn"
      ? MAX_WARNING_ANNOTATIONS - 1
      : MAX_WARNING_ANNOTATIONS;
  let warningAnnotations = 0;
  let errorAnnotations = 0;
  let suppressedAnnotations = 0;
  for (const finding of matched.findings) {
    const isBreach = breachKeys.has(findingKey(finding));
    if (isBreach && errorAnnotations >= MAX_ERROR_POLICY_ANNOTATIONS) {
      suppressedAnnotations += 1;
      continue;
    }
    if (!isBreach && warningAnnotations >= maxWarningAnnotations) {
      suppressedAnnotations += 1;
      continue;
    }
    emitCommand(
      isBreach ? "error" : "warning",
      renderFindingAnnotation(finding),
      log,
    );
    if (isBreach) errorAnnotations += 1;
    else warningAnnotations += 1;
  }
  for (const model of unmatchedBreaching) {
    if (errorAnnotations >= MAX_ERROR_POLICY_ANNOTATIONS) {
      suppressedAnnotations += 1;
      continue;
    }
    emitCommand("error", renderUnmatchedAnnotation(model), log);
    errorAnnotations += 1;
  }
  for (const model of untrackedDiscoveredModels) {
    if (warningAnnotations >= maxWarningAnnotations) {
      suppressedAnnotations += 1;
      continue;
    }
    const location = model.locations[0];
    if (location === undefined) continue;
    emitAnnotation(
      "warning",
      renderDiscoveryAnnotation(model),
      {
        title: "Report-only AI model discovery",
        file: location.path,
        line: location.line,
        col: location.column,
      },
      log,
    );
    warningAnnotations += 1;
  }
  if (suppressedAnnotations > 0) {
    emitCommand(
      "notice",
      `${suppressedAnnotations} action annotation(s) were suppressed to stay within GitHub's per-step annotation limits; see the job summary and machine-readable outputs.`,
      log,
    );
  }
  log(
    `Checked ${models.length} model declaration(s) against ${feed.length} validated feed entries — ${matched.findings.length} lifecycle finding(s), ${breachCount} policy breach(es).`,
  );

  if (notificationDecision.shouldNotify && slackWebhook) {
    try {
      await postSlack(
        slackWebhook,
        notificationDecision.reason === "resolved"
          ? renderResolvedSlackText()
          : renderSlackText(matched.findings, { breaching, unmatchedBreaching }),
        requestPolicy,
      );
      notificationSent = true;
    } catch (error) {
      const message = formatError(error);
      notificationReason = "error";
      nextAlertFingerprint = previousAlertFingerprint ?? "";
      notificationFailureMessage = message;
      if (failureMode === "warn") emitCommand("warning", message, log);
      else notificationError = new Error(message);
    }
  }

  outputs["notification-sent"] = String(notificationSent);
  outputs["notification-reason"] = notificationReason;
  outputs["next-alert-fingerprint"] = nextAlertFingerprint;
  for (const [name, value] of Object.entries(outputs)) {
    appendCommand(environment.GITHUB_OUTPUT, name, value);
  }

  if (jobSummary) {
    const summaryInput = {
      ...matched,
      breaching,
      unmatchedBreaching,
      models,
      feedSize: feed.length,
      windowDays,
      feedContentAgeDays: contentAge,
      providerFreshness,
      includeUndated,
      feedSourceKind: feedDocument.sourceKind,
      feedSha256: feedDocument.rawSha256,
      lifecycleFeedSha256,
      inventorySha256,
      ...(discovery === null ? {} : { discovery }),
      notification: {
        sent: notificationSent,
        reason: notificationReason,
        ...(notificationFailureMessage === null
          ? {}
          : { error: notificationFailureMessage }),
      },
    };
    appendSummary(environment.GITHUB_STEP_SUMMARY, renderSummary(summaryInput));
  }

  if (breachCount > 0) {
    const dated = breaching.filter((finding) => finding.daysUntilShutdown !== null).length;
    const undated = breaching.length - dated;
    const notificationSuffix = notificationError
      ? ` Slack notification also failed: ${notificationError.message}`
      : "";
    throw new PolicyBreachError(
      `${breachCount} item(s) breached the configured policy (${dated} dated lifecycle, ${undated} undated lifecycle, ${unmatchedBreaching.length} unmatched feed history).${notificationSuffix}`,
    );
  }
  if (notificationError) throw new NotificationDeliveryError(notificationError.message);

  return {
    ...matched,
    breaching,
    unmatchedBreaching,
    breachCount,
    feedSize: feed.length,
    feedContentAgeDays: contentAge,
    providerFreshness,
    feedSha256: feedDocument.rawSha256,
    lifecycleFeedSha256,
    inventorySha256,
    alertFingerprint,
    nextAlertFingerprint,
    auditRecord,
    notificationSent,
    notificationReason,
    discovery,
  };
}
