import { appendFileSync } from "node:fs";

export type InputModel = { id: string; provider?: string };

/** A deprecations.info record (https://deprecations.info/v1/deprecations.json). */
export type DeprecationRecord = {
  provider: string;
  model_id: string;
  shutdown_date?: string;
  replacement_models?: string[] | null;
  deprecation_context?: string;
  url?: string;
  last_observed?: string;
  scraped_at?: string;
};

export type Finding = {
  id: string;
  provider: string;
  shutdownDate: string;
  daysUntilShutdown: number;
  replacementModels: string[];
  url?: string;
  context?: string;
};

export const DEFAULT_FEED_URL = "https://deprecations.info/v1/deprecations.json";
export const DEFAULT_WINDOW_DAYS = 90;
export const DEFAULT_MAX_FEED_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Age in days of the freshest record in the feed, or null when no record carries a timestamp.
 * A feed that stopped updating reports a permanent all-clear, so age is the only signal that the monitor still works.
 */
export function feedAgeDays(feed: DeprecationRecord[], now: number): number | null {
  const observed = feed
    .map((record) => Date.parse(record.last_observed ?? record.scraped_at ?? ""))
    .filter((time) => !Number.isNaN(time));
  if (observed.length === 0) return null;
  return Math.floor((now - Math.max(...observed)) / DAY_MS);
}

/** Normalize provider labels so "OpenAI"/"openai" match while "Azure" and "Google Vertex" stay distinct from "google"/"openai". */
export function normalizeProvider(provider: string): string {
  return provider.toLowerCase().trim().replace(/\s+/g, "-").replace(/-ai$/, "");
}

/** Parse the `models` input, accepting a JSON array of objects or of bare id strings. */
export function parseModels(raw: string): InputModel[] {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error("`models` input is empty.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `\`models\` input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("`models` input must be a JSON array.");
  }

  return parsed.map((entry, index) => {
    if (typeof entry === "string") return { id: entry };
    if (entry !== null && typeof entry === "object" && typeof (entry as InputModel).id === "string") {
      const { id, provider } = entry as InputModel;
      return provider === undefined ? { id } : { id, provider };
    }
    throw new Error(`\`models[${index}]\` must be a string or an object with an \`id\` string.`);
  });
}

/** Match models against the feed, returning those whose shutdown_date is within `windowDays` of `now` (or already passed). */
export function matchDeprecations(
  models: InputModel[],
  feed: DeprecationRecord[],
  windowDays: number,
  now: number,
): Finding[] {
  const horizon = now + windowDays * DAY_MS;
  const findings: Finding[] = [];
  for (const model of models) {
    const wantProvider = model.provider ? normalizeProvider(model.provider) : null;
    for (const record of feed) {
      if (record.model_id !== model.id) continue;
      if (!record.shutdown_date) continue;
      if (wantProvider !== null && normalizeProvider(record.provider) !== wantProvider) continue;
      const shutdown = Date.parse(record.shutdown_date);
      if (Number.isNaN(shutdown) || shutdown > horizon) continue;
      findings.push({
        id: model.id,
        provider: record.provider,
        shutdownDate: record.shutdown_date,
        daysUntilShutdown: Math.round((shutdown - now) / DAY_MS),
        replacementModels: record.replacement_models ?? [],
        url: record.url,
        context: record.deprecation_context,
      });
    }
  }
  return findings.sort((a, b) => a.daysUntilShutdown - b.daysUntilShutdown);
}

/** Markdown job-summary body: a findings table, or a one-line all-clear. */
export function renderSummary(
  findings: Finding[],
  modelCount: number,
  feedSize: number,
  windowDays: number,
): string {
  const heading = "## AI model end-of-life check\n\n";
  const footer = `\nChecked ${modelCount} model(s) against ${feedSize} feed entries — window: ${windowDays} day(s).\n`;
  if (findings.length === 0) {
    return `${heading}No models are within ${windowDays} day(s) of shutdown. ✅\n${footer}`;
  }
  const rows = findings
    .map((f) => {
      const model = f.url ? `[\`${f.id}\`](${f.url})` : `\`${f.id}\``;
      const replacement = f.replacementModels.length > 0 ? f.replacementModels.join(", ") : "—";
      const days = f.daysUntilShutdown < 0 ? `${Math.abs(f.daysUntilShutdown)} days ago` : `${f.daysUntilShutdown}`;
      return `| ${model} | ${f.provider} | ${f.shutdownDate} | ${days} | ${replacement} |`;
    })
    .join("\n");
  return (
    `${heading}⚠️ **${findings.length} model(s) approaching end-of-life.**\n\n` +
    "| Model | Provider | Shutdown | Days left | Replacement |\n" +
    "| --- | --- | --- | --- | --- |\n" +
    `${rows}\n${footer}`
  );
}

/** Slack incoming-webhook message body for a non-empty finding set. */
export function renderSlackText(findings: Finding[]): string {
  const lines = findings
    .map(
      (f) =>
        `• *${f.id}* (${f.provider}) — shuts down ${f.shutdownDate} (${f.daysUntilShutdown}d)${
          f.replacementModels.length > 0 ? ` → ${f.replacementModels.join(", ")}` : ""
        }${f.url ? ` <${f.url}|docs>` : ""}`,
    )
    .join("\n");
  return `:rotating_light: *${findings.length} AI model(s) approaching end-of-life*\n${lines}`;
}

async function postSlack(webhook: string, findings: Finding[]): Promise<void> {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: renderSlackText(findings) }),
  });
  if (!response.ok) {
    throw new Error(`Slack post failed: ${response.status} ${response.statusText}`);
  }
}

/** Append a key/value to a GitHub Actions file command, using the heredoc form so values with newlines survive. */
function appendCommand(file: string | undefined, key: string, value: string): void {
  if (!file) return;
  const delimiter = `ghadelimiter_${key}`;
  appendFileSync(file, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** The runner upper-cases an input name and turns spaces into underscores, but leaves hyphens alone: `feed-url` -> `INPUT_FEED-URL`. */
export function inputEnvName(name: string): string {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

function getInput(name: string): string | undefined {
  return process.env[inputEnvName(name)]?.trim();
}

/** Parse an optional day-count input; unset or blank disables whatever it gates. */
export function parseOptionalDays(raw: string | undefined, inputName: string): number | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return null;
  const days = Number(trimmed);
  if (!Number.isFinite(days)) {
    throw new Error(`Invalid ${inputName}: ${raw}`);
  }
  return days;
}

/** Findings urgent enough to fail the step — those at or inside the threshold, including already-passed shutdowns. */
export function breachingFindings(findings: Finding[], failWithinDays: number | null): Finding[] {
  if (failWithinDays === null) return [];
  return findings.filter((f) => f.daysUntilShutdown <= failWithinDays);
}

export async function run(): Promise<void> {
  const models = parseModels(getInput("models") ?? "");
  const windowDays = Number(getInput("days-before-shutdown") || DEFAULT_WINDOW_DAYS);
  if (!Number.isFinite(windowDays)) {
    throw new Error(`Invalid days-before-shutdown: ${getInput("days-before-shutdown")}`);
  }
  const failWithinDays = parseOptionalDays(getInput("fail-within-days"), "fail-within-days");
  const maxFeedAgeDays = parseOptionalDays(
    getInput("max-feed-age-days") ?? String(DEFAULT_MAX_FEED_AGE_DAYS),
    "max-feed-age-days",
  );
  const feedUrl = getInput("feed-url") || DEFAULT_FEED_URL;

  // A monitor that can't reach its feed should fail loudly, not silently report "nothing to worry about".
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Deprecations feed fetch failed: ${response.status} ${response.statusText}`);
  }
  const feed = (await response.json()) as DeprecationRecord[];
  if (!Array.isArray(feed) || feed.length === 0) {
    throw new Error(`Deprecations feed at ${feedUrl} did not return a non-empty JSON array.`);
  }

  const now = Date.now();
  const feedAge = feedAgeDays(feed, now);
  if (feedAge === null) {
    console.log(
      `::warning::Feed at ${feedUrl} carries no last_observed/scraped_at timestamps — staleness can't be checked.`,
    );
  } else if (maxFeedAgeDays !== null && feedAge > maxFeedAgeDays) {
    throw new Error(
      `Deprecations feed at ${feedUrl} looks stale: newest entry was observed ${feedAge} day(s) ago (max ${maxFeedAgeDays}). A feed that stopped updating reports a permanent all-clear.`,
    );
  }

  const findings = matchDeprecations(models, feed, windowDays, now);

  const breaching = breachingFindings(findings, failWithinDays);

  for (const f of findings) {
    const level = breaching.includes(f) ? "error" : "warning";
    console.log(
      `::${level}::AI model ${f.id} (${f.provider}) shuts down ${f.shutdownDate} — ${
        f.daysUntilShutdown < 0
          ? `${Math.abs(f.daysUntilShutdown)} day(s) ago`
          : `${f.daysUntilShutdown} day(s) left`
      }. Replacement: ${
        f.replacementModels.join(", ") || "none listed"
      }. ${f.url ?? ""}`,
    );
  }
  console.log(
    `Checked ${models.length} model(s) against ${feed.length} feed entries — ${findings.length} within ${windowDays}d of shutdown.`,
  );

  appendCommand(process.env.GITHUB_OUTPUT, "has-findings", String(findings.length > 0));
  appendCommand(process.env.GITHUB_OUTPUT, "findings", JSON.stringify(findings));

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && isTrue(getInput("job-summary") ?? "true")) {
    appendFileSync(summaryFile, renderSummary(findings, models.length, feed.length, windowDays));
  }

  const slackWebhook = getInput("slack-webhook");
  if (findings.length > 0 && slackWebhook) {
    await postSlack(slackWebhook, findings);
  }

  if (breaching.length > 0) {
    throw new Error(
      `${breaching.length} model(s) within ${failWithinDays} day(s) of shutdown: ${breaching
        .map((f) => `${f.id} (${f.shutdownDate})`)
        .join(", ")}.`,
    );
  }
}
