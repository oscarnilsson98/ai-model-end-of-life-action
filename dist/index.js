// src/check.ts
var import_node_fs = require("node:fs");
var DEFAULT_FEED_URL = "https://deprecations.info/v1/deprecations.json";
var DEFAULT_WINDOW_DAYS = 90;
var DAY_MS = 24 * 60 * 60 * 1000;
function normalizeProvider(provider) {
  return provider.toLowerCase().trim().replace(/\s+/g, "-").replace(/-ai$/, "");
}
function parseModels(raw) {
  const trimmed = raw.trim();
  if (trimmed === "")
    throw new Error("`models` input is empty.");
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`\`models\` input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("`models` input must be a JSON array.");
  }
  return parsed.map((entry, index) => {
    if (typeof entry === "string")
      return { id: entry };
    if (entry !== null && typeof entry === "object" && typeof entry.id === "string") {
      const { id, provider } = entry;
      return provider === undefined ? { id } : { id, provider };
    }
    throw new Error(`\`models[${index}]\` must be a string or an object with an \`id\` string.`);
  });
}
function matchDeprecations(models, feed, windowDays, now) {
  const horizon = now + windowDays * DAY_MS;
  const findings = [];
  for (const model of models) {
    const wantProvider = model.provider ? normalizeProvider(model.provider) : null;
    for (const record of feed) {
      if (record.model_id !== model.id)
        continue;
      if (!record.shutdown_date)
        continue;
      if (wantProvider !== null && normalizeProvider(record.provider) !== wantProvider)
        continue;
      const shutdown = Date.parse(record.shutdown_date);
      if (Number.isNaN(shutdown) || shutdown > horizon)
        continue;
      findings.push({
        id: model.id,
        provider: record.provider,
        shutdownDate: record.shutdown_date,
        daysUntilShutdown: Math.round((shutdown - now) / DAY_MS),
        replacementModels: record.replacement_models ?? [],
        url: record.url,
        context: record.deprecation_context
      });
    }
  }
  return findings.sort((a, b) => a.daysUntilShutdown - b.daysUntilShutdown);
}
function renderSummary(findings, modelCount, feedSize, windowDays) {
  const heading = `## AI model end-of-life check

`;
  const footer = `
Checked ${modelCount} model(s) against ${feedSize} feed entries — window: ${windowDays} day(s).
`;
  if (findings.length === 0) {
    return `${heading}No models are within ${windowDays} day(s) of shutdown. ✅
${footer}`;
  }
  const rows = findings.map((f) => {
    const model = f.url ? `[\`${f.id}\`](${f.url})` : `\`${f.id}\``;
    const replacement = f.replacementModels.length > 0 ? f.replacementModels.join(", ") : "—";
    const days = f.daysUntilShutdown < 0 ? `${Math.abs(f.daysUntilShutdown)} days ago` : `${f.daysUntilShutdown}`;
    return `| ${model} | ${f.provider} | ${f.shutdownDate} | ${days} | ${replacement} |`;
  }).join(`
`);
  return `${heading}⚠️ **${findings.length} model(s) approaching end-of-life.**

` + `| Model | Provider | Shutdown | Days left | Replacement |
` + `| --- | --- | --- | --- | --- |
` + `${rows}
${footer}`;
}
function renderSlackText(findings) {
  const lines = findings.map((f) => `• *${f.id}* (${f.provider}) — shuts down ${f.shutdownDate} (${f.daysUntilShutdown}d)${f.replacementModels.length > 0 ? ` → ${f.replacementModels.join(", ")}` : ""}${f.url ? ` <${f.url}|docs>` : ""}`).join(`
`);
  return `:rotating_light: *${findings.length} AI model(s) approaching end-of-life*
${lines}`;
}
async function postSlack(webhook, findings) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: renderSlackText(findings) })
  });
  if (!response.ok) {
    throw new Error(`Slack post failed: ${response.status} ${response.statusText}`);
  }
}
function appendCommand(file, key, value) {
  if (!file)
    return;
  const delimiter = `ghadelimiter_${key}`;
  import_node_fs.appendFileSync(file, `${key}<<${delimiter}
${value}
${delimiter}
`);
}
function isTrue(value) {
  return value?.trim().toLowerCase() === "true";
}
function parseFailThreshold(raw) {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "")
    return null;
  const days = Number(trimmed);
  if (!Number.isFinite(days)) {
    throw new Error(`Invalid fail-within-days: ${raw}`);
  }
  return days;
}
function breachingFindings(findings, failWithinDays) {
  if (failWithinDays === null)
    return [];
  return findings.filter((f) => f.daysUntilShutdown <= failWithinDays);
}
async function run() {
  const models = parseModels(process.env.INPUT_MODELS ?? "");
  const windowDays = Number(process.env.INPUT_DAYS_BEFORE_SHUTDOWN || DEFAULT_WINDOW_DAYS);
  if (!Number.isFinite(windowDays)) {
    throw new Error(`Invalid days-before-shutdown: ${process.env.INPUT_DAYS_BEFORE_SHUTDOWN}`);
  }
  const failWithinDays = parseFailThreshold(process.env.INPUT_FAIL_WITHIN_DAYS);
  const feedUrl = process.env.INPUT_FEED_URL || DEFAULT_FEED_URL;
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Deprecations feed fetch failed: ${response.status} ${response.statusText}`);
  }
  const feed = await response.json();
  if (!Array.isArray(feed)) {
    throw new Error(`Deprecations feed at ${feedUrl} did not return a JSON array.`);
  }
  const findings = matchDeprecations(models, feed, windowDays, Date.now());
  const breaching = breachingFindings(findings, failWithinDays);
  for (const f of findings) {
    const level = breaching.includes(f) ? "error" : "warning";
    console.log(`::${level}::AI model ${f.id} (${f.provider}) shuts down ${f.shutdownDate} — ${f.daysUntilShutdown < 0 ? `${Math.abs(f.daysUntilShutdown)} day(s) ago` : `${f.daysUntilShutdown} day(s) left`}. Replacement: ${f.replacementModels.join(", ") || "none listed"}. ${f.url ?? ""}`);
  }
  console.log(`Checked ${models.length} model(s) against ${feed.length} feed entries — ${findings.length} within ${windowDays}d of shutdown.`);
  appendCommand(process.env.GITHUB_OUTPUT, "has-findings", String(findings.length > 0));
  appendCommand(process.env.GITHUB_OUTPUT, "findings", JSON.stringify(findings));
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile && isTrue(process.env.INPUT_JOB_SUMMARY ?? "true")) {
    import_node_fs.appendFileSync(summaryFile, renderSummary(findings, models.length, feed.length, windowDays));
  }
  const slackWebhook = process.env.INPUT_SLACK_WEBHOOK;
  if (findings.length > 0 && slackWebhook) {
    await postSlack(slackWebhook, findings);
  }
  if (breaching.length > 0) {
    throw new Error(`${breaching.length} model(s) within ${failWithinDays} day(s) of shutdown: ${breaching.map((f) => `${f.id} (${f.shutdownDate})`).join(", ")}.`);
  }
}

// src/main.ts
run().catch((error) => {
  console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
