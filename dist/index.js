// src/digest.ts
var import_node_crypto = require("node:crypto");

// src/document.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
var MAX_PATH_LENGTH = 4096;
function withinWorkspace(workspace, candidate) {
  const pathFromWorkspace = import_node_path.relative(workspace, candidate);
  return pathFromWorkspace === "" || !import_node_path.isAbsolute(pathFromWorkspace) && pathFromWorkspace !== ".." && !pathFromWorkspace.startsWith(`..${import_node_path.sep}`);
}
function readBoundedFileBytes(requestedPath, workspace, maxBytes, label) {
  const trimmed = requestedPath.trim();
  if (trimmed === "" || trimmed.length > MAX_PATH_LENGTH || CONTROL_CHARACTER.test(trimmed)) {
    throw new Error(`${label} must be a safe path of at most ${MAX_PATH_LENGTH} characters.`);
  }
  let workspacePath;
  const lexicalWorkspace = import_node_path.resolve(workspace);
  try {
    workspacePath = import_node_fs.realpathSync(lexicalWorkspace);
  } catch (error) {
    throw new Error(`Could not access the GitHub workspace at ${workspace}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const lexicalPath = import_node_path.isAbsolute(trimmed) ? import_node_path.resolve(trimmed) : import_node_path.resolve(lexicalWorkspace, trimmed);
  if (!withinWorkspace(lexicalWorkspace, lexicalPath)) {
    throw new Error(`${label} must resolve within the GitHub workspace.`);
  }
  let filePath;
  try {
    filePath = import_node_fs.realpathSync(lexicalPath);
  } catch (error) {
    throw new Error(`Could not access ${label} at ${lexicalPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!withinWorkspace(workspacePath, filePath)) {
    throw new Error(`${label} must resolve within the GitHub workspace.`);
  }
  let size;
  try {
    const stats = import_node_fs.statSync(filePath);
    if (!stats.isFile())
      throw new Error("path is not a regular file");
    size = stats.size;
  } catch (error) {
    throw new Error(`Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (size > maxBytes) {
    throw new Error(`${label} is ${size} bytes; the limit is ${maxBytes} bytes.`);
  }
  let bytes;
  try {
    bytes = import_node_fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${label} is ${bytes.byteLength} bytes; the limit is ${maxBytes} bytes.`);
  }
  return bytes;
}
function decodeJsonDocument(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} was not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { value: JSON.parse(text), bytes };
  } catch (error) {
    throw new Error(`${label} did not contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// src/input.ts
var MAX_MODELS = 1000;
var MAX_MODEL_ID_LENGTH = 256;
var MAX_MODELS_INPUT_BYTES = 1e6;
var CONTROL_CHARACTER2 = /[\u0000-\u001f\u007f]/;
var MAX_PATH_LENGTH2 = 4096;
var MAX_URL_LENGTH = 8192;
function unicodeCodePointLength(value) {
  let length = 0;
  for (const _character of value)
    length += 1;
  return length;
}
function preview(value, maxLength = 160) {
  if (value === undefined)
    return "undefined";
  const shortened = value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  return JSON.stringify(shortened);
}
var PROVIDER_ALIASES = {
  openai: "openai",
  "open-ai": "openai",
  anthropic: "anthropic",
  "anthropic-ai": "anthropic",
  google: "google",
  "google-ai": "google",
  gemini: "google",
  "google-gemini": "google",
  "google-vertex": "google-vertex",
  "google-vertex-ai": "google-vertex",
  "google-cloud-vertex": "google-vertex",
  "google-cloud-vertex-ai": "google-vertex",
  vertex: "google-vertex",
  vertexai: "google-vertex",
  "vertex-ai": "google-vertex",
  gcp: "google-vertex",
  "gcp-vertex": "google-vertex",
  "gcp-vertex-ai": "google-vertex",
  "aws-bedrock": "aws-bedrock",
  "amazon-bedrock": "aws-bedrock",
  "amazon-web-services-bedrock": "aws-bedrock",
  bedrock: "aws-bedrock",
  aws: "aws-bedrock",
  azure: "azure",
  "azure-ai": "azure",
  "azure-openai": "azure",
  "azure-foundry": "azure",
  "azure-ai-foundry": "azure",
  "microsoft-azure": "azure",
  "microsoft-azure-ai": "azure",
  cohere: "cohere",
  groq: "groq",
  xai: "xai",
  "x-ai": "xai"
};
function providerKey(provider) {
  return provider.normalize("NFKC").trim().toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
function normalizeProvider(provider) {
  const key = providerKey(provider);
  return PROVIDER_ALIASES[key] ?? key;
}
function validateText(value, field, index, maxLength) {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`\`models[${index}].${field}\` must not be empty.`);
  }
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`\`models[${index}].${field}\` must be at most ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER2.test(normalized)) {
    throw new Error(`\`models[${index}].${field}\` must not contain control characters.`);
  }
  return normalized;
}
function parseModels(raw, inputName = "models") {
  const trimmed = raw.trim();
  if (trimmed === "")
    throw new Error(`\`${inputName}\` input is empty.`);
  if (Buffer.byteLength(trimmed, "utf8") > MAX_MODELS_INPUT_BYTES) {
    throw new Error(`\`${inputName}\` is larger than ${MAX_MODELS_INPUT_BYTES} bytes.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`\`${inputName}\` is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`\`${inputName}\` must be a JSON array.`);
  }
  if (parsed.length === 0) {
    throw new Error(`\`${inputName}\` must contain at least one model.`);
  }
  if (parsed.length > MAX_MODELS) {
    throw new Error(`\`${inputName}\` contains ${parsed.length} models; the limit is ${MAX_MODELS}.`);
  }
  const models = parsed.map((entry, index) => {
    if (typeof entry === "string") {
      return { id: validateText(entry, "id", index, MAX_MODEL_ID_LENGTH) };
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`\`models[${index}]\` must be a string or an object with an \`id\` string.`);
    }
    const candidate = entry;
    const unsupportedKeys = Object.keys(candidate).filter((key) => key !== "id" && key !== "provider");
    if (unsupportedKeys.length > 0) {
      const shown = unsupportedKeys.slice(0, 10).map((key) => preview(key, 80));
      const omitted = unsupportedKeys.length - shown.length;
      throw new Error(`\`models[${index}]\` has unsupported field(s): ${shown.join(", ")}${omitted > 0 ? `, … +${omitted} more` : ""}. Expected only \`id\` and optional \`provider\`.`);
    }
    if (typeof candidate.id !== "string") {
      throw new Error(`\`models[${index}].id\` must be a string.`);
    }
    const id = validateText(candidate.id, "id", index, MAX_MODEL_ID_LENGTH);
    if (candidate.provider === undefined)
      return { id };
    if (typeof candidate.provider !== "string") {
      throw new Error(`\`models[${index}].provider\` must be a string when supplied.`);
    }
    const provider = validateText(candidate.provider, "provider", index, 100);
    if (normalizeProvider(provider) === "") {
      throw new Error(`\`models[${index}].provider\` must contain at least one Unicode letter or number.`);
    }
    return { id, provider };
  });
  return deduplicateModels(models);
}
function deduplicateModels(models) {
  const seen = new Set;
  return models.filter((model) => {
    const key = `${model.id}\x00${model.provider ? normalizeProvider(model.provider) : "*"}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function loadModels(rawModels, modelsFile, workspace) {
  const inventories = [];
  if (rawModels !== undefined && rawModels.trim() !== "") {
    inventories.push(parseModels(rawModels, "models"));
  }
  if (modelsFile !== undefined && modelsFile.trim() !== "") {
    const requestedPath = modelsFile.trim();
    if (requestedPath.length > MAX_PATH_LENGTH2 || CONTROL_CHARACTER2.test(requestedPath)) {
      throw new Error(`\`models-file\` must be a safe path of at most ${MAX_PATH_LENGTH2} characters.`);
    }
    const bytes = readBoundedFileBytes(requestedPath, workspace, MAX_MODELS_INPUT_BYTES, "`models-file`");
    let contents;
    try {
      contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new Error(`\`models-file\` was not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
    }
    inventories.push(parseModels(contents, "models-file"));
  }
  if (inventories.length === 0) {
    throw new Error("Provide at least one of `models` or `models-file`.");
  }
  const models = deduplicateModels(inventories.flat());
  if (models.length > MAX_MODELS) {
    throw new Error(`The merged inventory contains ${models.length} models; the limit is ${MAX_MODELS}.`);
  }
  return models;
}
function parseOptionalInteger(raw, inputName, options = {}) {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "")
    return null;
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    throw new Error(`Invalid ${inputName}: expected a non-negative base-10 integer, got ${preview(raw)}.`);
  }
  const value = Number(trimmed);
  const min = options.min ?? 0;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${inputName}: expected an integer from ${min} to ${max}, got ${preview(raw)}.`);
  }
  return value;
}
function parseRequiredInteger(raw, inputName, fallback, options = {}) {
  return parseOptionalInteger(raw === undefined || raw.trim() === "" ? String(fallback) : raw, inputName, options);
}
function parseBoolean(raw, inputName, fallback) {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed === undefined || trimmed === "")
    return fallback;
  if (trimmed === "true")
    return true;
  if (trimmed === "false")
    return false;
  throw new Error(`Invalid ${inputName}: expected \`true\` or \`false\`, got ${preview(raw)}.`);
}
function parseHttpUrl(raw, inputName) {
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`Invalid ${inputName}: URL exceeds ${MAX_URL_LENGTH} characters.`);
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid ${inputName}: expected an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid ${inputName}: only HTTP(S) URLs are supported.`);
  }
  if (url.username || url.password) {
    throw new Error(`Invalid ${inputName}: URL credentials are not supported.`);
  }
  return url.toString();
}
function parseHttpsUrl(raw, inputName) {
  const parsed = parseHttpUrl(raw, inputName);
  if (new URL(parsed).protocol !== "https:") {
    throw new Error(`Invalid ${inputName}: HTTPS is required.`);
  }
  return parsed;
}

// src/digest.ts
var INVENTORY_DOMAIN = "ai-model-eol/inventory/v1";
var LIFECYCLE_FEED_DOMAIN = "ai-model-eol/lifecycle-feed/v1";
var FINDING_ID_DOMAIN = "ai-model-eol/finding-id/v1";
var ALERT_DOMAIN = "ai-model-eol/alert/v1";
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalSet(values) {
  const serialized = new Map;
  for (const value of values)
    serialized.set(JSON.stringify(value), value);
  return [...serialized].sort(([left], [right]) => compareText(left, right)).map(([, value]) => value);
}
function digestCanonical(domain, value) {
  return import_node_crypto.createHash("sha256").update(JSON.stringify([domain, value]), "utf8").digest("hex");
}
function inventoryEntries(models) {
  return canonicalSet(models.map((model) => [
    model.id,
    model.provider === undefined ? null : normalizeProvider(model.provider)
  ]));
}
function lifecycleFeedEntries(feed) {
  return canonicalSet(feed.map((record) => [
    normalizeProvider(record.provider),
    record.model_id,
    record.shutdown_date ?? null,
    record.deprecation_date ?? null,
    record.announcement_date ?? null,
    [...record.replacement_models ?? []],
    record.url ?? null
  ]));
}
function findingIdentity(finding) {
  return [normalizeProvider(finding.provider), finding.id, finding.shutdownDate];
}
function rawBytesSha256(bytes) {
  return import_node_crypto.createHash("sha256").update(bytes).digest("hex");
}
function canonicalInventorySha256(models) {
  return digestCanonical(INVENTORY_DOMAIN, inventoryEntries(models));
}
function canonicalLifecycleFeedSha256(feed) {
  return digestCanonical(LIFECYCLE_FEED_DOMAIN, lifecycleFeedEntries(feed));
}
function stableFindingId(finding) {
  return digestCanonical(FINDING_ID_DOMAIN, findingIdentity(finding));
}
function stableAlertFingerprint(input) {
  const breachingIds = new Set(input.breaching.map(stableFindingId));
  const findings = canonicalSet(input.findings.map((finding) => [
    stableFindingId(finding),
    finding.status,
    finding.deprecationDate ?? null,
    finding.announcementDate ?? null,
    [...finding.replacementModels],
    finding.url ?? null,
    finding.context ?? null,
    breachingIds.has(stableFindingId(finding))
  ]));
  return digestCanonical(ALERT_DOMAIN, [findings, inventoryEntries(input.unmatchedBreaching)]);
}
function buildAuditRecord(input) {
  const record = {
    schemaVersion: 1,
    inventorySha256: canonicalInventorySha256(input.inventory),
    lifecycleFeedSha256: canonicalLifecycleFeedSha256(input.feed),
    alertFingerprint: stableAlertFingerprint(input),
    checkedModelCount: input.inventory.length,
    feedRecordCount: input.feed.length,
    findingCount: input.findings.length,
    breachCount: input.breaching.length + input.unmatchedBreaching.length,
    unmatchedBreachCount: input.unmatchedBreaching.length
  };
  if (input.rawFeedBytes !== undefined) {
    record.rawFeedSha256 = rawBytesSha256(input.rawFeedBytes);
  }
  return record;
}

// src/feed.ts
var DAY_MS = 24 * 60 * 60 * 1000;
var MAX_FEED_RECORDS = 1e5;
var CONTROL_CHARACTER3 = /[\u0000-\u001f\u007f]/;
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function requiredText(value, field, index, maxLength) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Feed record ${index} has no non-empty \`${field}\` string.`);
  }
  const normalized = value.trim();
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`Feed record ${index} \`${field}\` exceeds ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER3.test(normalized)) {
    throw new Error(`Feed record ${index} \`${field}\` contains control characters.`);
  }
  return normalized;
}
function optionalText(value, field, index, maxLength) {
  if (value === undefined || value === null || value === "")
    return;
  if (typeof value !== "string") {
    throw new Error(`Feed record ${index} \`${field}\` must be a string when supplied.`);
  }
  const normalized = value.trim();
  if (normalized === "")
    return;
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`Feed record ${index} \`${field}\` exceeds ${maxLength} characters.`);
  }
  return normalized;
}
function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match)
    return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return timestamp;
}
function lifecycleDate(value, field, index) {
  const normalized = optionalText(value, field, index, 64);
  if (normalized === undefined)
    return;
  if (parseDateOnly(normalized) === null) {
    throw new Error(`Feed record ${index} \`${field}\` must be a real YYYY-MM-DD date.`);
  }
  return normalized;
}
function observationDate(value, field, index) {
  const normalized = optionalText(value, field, index, 64);
  if (normalized === undefined)
    return;
  const isDateOnly = parseDateOnly(normalized) !== null;
  const timestampMatch = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(normalized);
  const isTimestamp = timestampMatch !== null && parseDateOnly(timestampMatch[1]) !== null && !Number.isNaN(Date.parse(normalized));
  if (!isDateOnly && !isTimestamp) {
    throw new Error(`Feed record ${index} \`${field}\` must be an ISO date or timestamp.`);
  }
  return normalized;
}
function observationTimestamps(record) {
  return [record.last_observed, record.scraped_at].filter((value) => value !== undefined).map((value) => Date.parse(value));
}
function contentAgeDays(timestamp, now) {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}
function replacements(value, index) {
  if (value === undefined)
    return;
  if (value === null)
    return null;
  if (!Array.isArray(value)) {
    throw new Error(`Feed record ${index} \`replacement_models\` must be an array or null.`);
  }
  if (value.length > 100) {
    throw new Error(`Feed record ${index} has more than 100 replacement models.`);
  }
  return value.map((replacement, replacementIndex) => {
    if (typeof replacement !== "string" || replacement.trim() === "") {
      throw new Error(`Feed record ${index} \`replacement_models[${replacementIndex}]\` must be a non-empty string.`);
    }
    const normalized = replacement.trim();
    if (unicodeCodePointLength(normalized) > 256 || CONTROL_CHARACTER3.test(normalized)) {
      throw new Error(`Feed record ${index} \`replacement_models[${replacementIndex}]\` is invalid or too long.`);
    }
    return normalized;
  });
}
function sourceUrl(value, index) {
  const normalized = optionalText(value, "url", index, 2048);
  if (normalized === undefined)
    return;
  const parsed = parseHttpUrl(normalized, `feed record ${index} url`);
  if (parsed.length > 2048) {
    throw new Error(`Feed record ${index} normalized \`url\` exceeds 2048 characters.`);
  }
  return parsed;
}
function normalizeRecord(value, index) {
  if (!isObject(value))
    throw new Error(`Feed record ${index} must be an object.`);
  const provider = requiredText(value.provider, "provider", index, 100);
  if (normalizeProvider(provider) === "") {
    throw new Error(`Feed record ${index} \`provider\` must contain at least one Unicode letter or number.`);
  }
  const normalized = {
    provider,
    model_id: requiredText(value.model_id, "model_id", index, 256)
  };
  const shutdownDate = lifecycleDate(value.shutdown_date, "shutdown_date", index);
  const deprecationDate = lifecycleDate(value.deprecation_date, "deprecation_date", index);
  const announcementDate = lifecycleDate(value.announcement_date, "announcement_date", index);
  const replacementModels = replacements(value.replacement_models, index);
  const context = optionalText(value.deprecation_context, "deprecation_context", index, 1e5);
  const url = sourceUrl(value.url, index);
  const firstObserved = observationDate(value.first_observed, "first_observed", index);
  const lastObserved = observationDate(value.last_observed, "last_observed", index);
  const scrapedAt = observationDate(value.scraped_at, "scraped_at", index);
  if (shutdownDate !== undefined)
    normalized.shutdown_date = shutdownDate;
  if (deprecationDate !== undefined)
    normalized.deprecation_date = deprecationDate;
  if (announcementDate !== undefined)
    normalized.announcement_date = announcementDate;
  if (replacementModels !== undefined)
    normalized.replacement_models = replacementModels;
  if (context !== undefined)
    normalized.deprecation_context = context;
  if (url !== undefined)
    normalized.url = url;
  if (firstObserved !== undefined)
    normalized.first_observed = firstObserved;
  if (lastObserved !== undefined)
    normalized.last_observed = lastObserved;
  if (scrapedAt !== undefined)
    normalized.scraped_at = scrapedAt;
  if (normalized.shutdown_date === undefined && normalized.deprecation_date === undefined && normalized.announcement_date === undefined) {
    throw new Error(`Feed record ${index} has no shutdown_date, deprecation_date, or announcement_date.`);
  }
  return normalized;
}
function normalizeJsonFeedItem(value, index) {
  if (!isObject(value))
    throw new Error(`JSON Feed item ${index} must be an object.`);
  if (!isObject(value._deprecation)) {
    throw new Error(`JSON Feed item ${index} has no \`_deprecation\` object.`);
  }
  const metadata = value._deprecation;
  return normalizeRecord({
    provider: metadata.provider,
    model_id: metadata.model_id,
    shutdown_date: metadata.shutdown_date,
    deprecation_date: metadata.deprecation_date,
    announcement_date: metadata.announcement_date,
    replacement_models: metadata.replacement_models,
    deprecation_context: metadata.summary ?? value.content_text,
    url: value.url,
    first_observed: metadata.first_observed,
    last_observed: metadata.last_observed,
    scraped_at: value.date_published
  }, index);
}
function validateFeed(payload) {
  let records;
  let normalizer;
  if (Array.isArray(payload)) {
    records = payload;
    normalizer = normalizeRecord;
  } else if (isObject(payload) && Array.isArray(payload.items)) {
    records = payload.items;
    normalizer = normalizeJsonFeedItem;
  } else {
    throw new Error("Deprecations feed must be a raw JSON array or a JSON Feed object with an `items` array.");
  }
  if (records.length === 0)
    throw new Error("Deprecations feed contains no records.");
  if (records.length > MAX_FEED_RECORDS) {
    throw new Error(`Deprecations feed has ${records.length} records; the limit is ${MAX_FEED_RECORDS}.`);
  }
  const normalized = records.map(normalizer);
  const unique = [];
  const identities = new Map;
  for (const record of normalized) {
    const identity = `${normalizeProvider(record.provider)}\x00${record.model_id}\x00${record.shutdown_date ?? "unknown"}`;
    const serialized = JSON.stringify(record);
    const previous = identities.get(identity);
    if (previous === serialized)
      continue;
    if (previous !== undefined) {
      throw new Error(`Deprecations feed has conflicting duplicate records for ${record.provider}/${record.model_id}/${record.shutdown_date ?? "date-unknown"}.`);
    }
    identities.set(identity, serialized);
    unique.push(record);
  }
  return unique;
}
function utcEpochDay(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS;
}
function calendarDaysUntil(date, now) {
  const target = parseDateOnly(date);
  if (target === null)
    throw new Error(`Invalid shutdown date: ${date}`);
  return target / DAY_MS - utcEpochDay(now);
}
function feedContentAgeDays(feed, now) {
  let newestTimestamp = null;
  for (const record of feed) {
    for (const timestamp of observationTimestamps(record)) {
      newestTimestamp = Math.max(timestamp, newestTimestamp ?? -Infinity);
    }
  }
  return newestTimestamp === null ? null : contentAgeDays(newestTimestamp, now);
}
function assertNoFutureObservations(feed, now, allowedClockSkewMs = DAY_MS) {
  for (const record of feed) {
    for (const [field, value] of [
      ["first_observed", record.first_observed],
      ["last_observed", record.last_observed],
      ["scraped_at", record.scraped_at]
    ]) {
      if (value !== undefined && Date.parse(value) > now + allowedClockSkewMs) {
        throw new Error(`Feed record ${record.provider}/${record.model_id} has a future ${field} timestamp: ${value}.`);
      }
    }
  }
}
function relevantProviderFreshness(models, feed, now) {
  const requested = new Map;
  for (const model of models) {
    if (model.provider)
      requested.set(normalizeProvider(model.provider), model.provider);
  }
  const newestByProvider = new Map;
  for (const record of feed) {
    const provider = normalizeProvider(record.provider);
    for (const timestamp of observationTimestamps(record)) {
      newestByProvider.set(provider, Math.max(timestamp, newestByProvider.get(provider) ?? -Infinity));
    }
  }
  return [...requested].map(([provider, displayProvider]) => {
    const newestTimestamp = newestByProvider.get(provider) ?? null;
    return {
      provider: displayProvider,
      ageDays: newestTimestamp === null ? null : contentAgeDays(newestTimestamp, now),
      newestTimestamp
    };
  });
}
function assertRequestedProvidersExist(models, feed) {
  const available = new Map;
  for (const record of feed)
    available.set(normalizeProvider(record.provider), record.provider);
  const missing = [
    ...new Set(models.filter((model) => model.provider !== undefined).filter((model) => !available.has(normalizeProvider(model.provider))).map((model) => model.provider))
  ];
  if (missing.length > 0) {
    const availableProviders = [...new Set(available.values())].sort(compareText2);
    const shownMissing = missing.slice(0, 20);
    const shownAvailable = availableProviders.slice(0, 20);
    throw new Error(`Provider(s) not present in the feed: ${shownMissing.join(", ")}${missing.length > shownMissing.length ? `, … +${missing.length - shownMissing.length} more` : ""}. Available serving platforms: ${shownAvailable.join(", ")}${availableProviders.length > shownAvailable.length ? `, … +${availableProviders.length - shownAvailable.length} more` : ""}.`);
  }
}
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function findingKey(finding) {
  return finding.findingId;
}
function matchDeprecations(models, feed, windowDays, now, includeUndated = true) {
  const byModel = new Map;
  for (const record of feed) {
    let indexed = byModel.get(record.model_id);
    if (!indexed) {
      indexed = { all: [], byProvider: new Map };
      byModel.set(record.model_id, indexed);
    }
    indexed.all.push(record);
    const provider = normalizeProvider(record.provider);
    const providerRecords = indexed.byProvider.get(provider);
    if (providerRecords)
      providerRecords.push(record);
    else
      indexed.byProvider.set(provider, [record]);
  }
  const findings = new Map;
  const unmatchedModels = [];
  let matchedModelCount = 0;
  for (const model of models) {
    const wantedProvider = model.provider ? normalizeProvider(model.provider) : null;
    const indexed = byModel.get(model.id);
    const candidates = wantedProvider === null ? indexed?.all ?? [] : indexed?.byProvider.get(wantedProvider) ?? [];
    if (candidates.length === 0) {
      unmatchedModels.push(model);
      continue;
    }
    matchedModelCount += 1;
    for (const record of candidates) {
      const daysUntilShutdown = record.shutdown_date ? calendarDaysUntil(record.shutdown_date, now) : null;
      if (daysUntilShutdown === null && !includeUndated)
        continue;
      if (daysUntilShutdown !== null && daysUntilShutdown > windowDays)
        continue;
      const identity = {
        id: model.id,
        provider: record.provider,
        shutdownDate: record.shutdown_date ?? null
      };
      const finding = {
        findingId: stableFindingId(identity),
        ...identity,
        status: daysUntilShutdown === null ? "date-unknown" : daysUntilShutdown < 0 ? "shutdown-passed" : "scheduled",
        daysUntilShutdown,
        replacementModels: record.replacement_models ?? []
      };
      if (record.deprecation_date !== undefined) {
        finding.deprecationDate = record.deprecation_date;
      }
      if (record.announcement_date !== undefined) {
        finding.announcementDate = record.announcement_date;
      }
      if (record.url !== undefined)
        finding.url = record.url;
      if (record.deprecation_context !== undefined)
        finding.context = record.deprecation_context;
      findings.set(findingKey(finding), finding);
    }
  }
  const sorted = [...findings.values()].sort((left, right) => {
    if (left.daysUntilShutdown === null && right.daysUntilShutdown !== null)
      return 1;
    if (left.daysUntilShutdown !== null && right.daysUntilShutdown === null)
      return -1;
    const byDays = (left.daysUntilShutdown ?? 0) - (right.daysUntilShutdown ?? 0);
    if (byDays !== 0)
      return byDays;
    const byProvider = compareText2(left.provider, right.provider);
    return byProvider !== 0 ? byProvider : compareText2(left.id, right.id);
  });
  return { findings: sorted, matchedModelCount, unmatchedModels };
}
function breachingFindings(findings, failWithinDays, failOnUndated = false) {
  return findings.filter((finding) => {
    if (finding.daysUntilShutdown === null)
      return failOnUndated;
    return failWithinDays !== null && finding.daysUntilShutdown <= failWithinDays;
  });
}

// src/discovery.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
var DEFAULT_DISCOVERY_LIMITS = Object.freeze({
  maxPaths: 100,
  maxCandidates: 20000,
  maxCandidateCodeUnits: 250000,
  maxAutomatonNodes: 250000,
  maxEntries: 50000,
  maxFiles: 25000,
  maxDirectories: 25000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxMatches: 1e5,
  maxLocationsPerModel: 50
});
var DISCOVERY_SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".tox",
  ".turbo",
  ".venv",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "env",
  "generated",
  "node_modules",
  "out",
  "target",
  "vendor",
  "vendors",
  "venv"
]);
var DISCOVERY_LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "flake.lock",
  "gemfile.lock",
  "go.sum",
  "gradle.lockfile",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "packages.lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock"
]);
var BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".arrow",
  ".avif",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".dat",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".ogg",
  ".onnx",
  ".otf",
  ".parquet",
  ".pb",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".safetensors",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".tiff",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
  ".zst"
]);
var CONTROL_CHARACTER4 = /[\u0000-\u001f\u007f]/;
var MACHINE_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$/;
var IDENTIFIER_CHARACTER = /^[\p{L}\p{N}\p{M}._:/-]$/u;
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
var MAX_PATH_LENGTH3 = 4096;
var MAX_PUBLISHED_PROVIDERS = 20;
var MAX_PUBLISHED_LOCATIONS = 5;
function compareText3(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function resolvedLimits(overrides) {
  const result = { ...DEFAULT_DISCOVERY_LIMITS };
  if (overrides === undefined)
    return result;
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_DISCOVERY_LIMITS)) {
      throw new Error(`Unknown discovery limit: ${key}.`);
    }
    const value = overrides[key];
    if (value === undefined || !Number.isSafeInteger(value) || value < 1 || value > DEFAULT_DISCOVERY_LIMITS[key]) {
      throw new Error(`Invalid discovery limit ${key}: expected an integer from 1 to ${DEFAULT_DISCOVERY_LIMITS[key]}.`);
    }
    result[key] = value;
  }
  return result;
}
function parseDiscoveryPaths(rawPaths, maxPaths = DEFAULT_DISCOVERY_LIMITS.maxPaths) {
  if (!Number.isSafeInteger(maxPaths) || maxPaths < 1 || maxPaths > DEFAULT_DISCOVERY_LIMITS.maxPaths) {
    throw new Error(`Invalid discovery path limit: expected an integer from 1 to ${DEFAULT_DISCOVERY_LIMITS.maxPaths}.`);
  }
  const paths = (rawPaths?.trim() === "" || rawPaths === undefined ? "." : rawPaths).split(/[,\r\n]+/).map((path) => path.trim()).filter((path) => path !== "");
  const unique = [];
  const seen = new Set;
  for (const path of paths) {
    if (path.length > MAX_PATH_LENGTH3 || CONTROL_CHARACTER4.test(path)) {
      throw new Error(`Discovery path must not contain control characters and must be at most ${MAX_PATH_LENGTH3} characters.`);
    }
    if (!seen.has(path)) {
      seen.add(path);
      unique.push(path);
    }
  }
  if (unique.length > maxPaths) {
    throw new Error(`Discovery requested ${unique.length} paths; the limit is ${maxPaths}.`);
  }
  return unique;
}
function isDiscoverableModelId(id) {
  return id.length >= 2 && id.length <= 256 && MACHINE_IDENTIFIER.test(id) && /[A-Za-z]/.test(id) && !id.includes("://") && (/[0-9]/.test(id) || /[._:/-]/.test(id));
}
function buildCandidates(feed, maxCandidates, maxCandidateCodeUnits) {
  const providersById = new Map;
  let candidateCodeUnits = 0;
  for (const record of feed) {
    if (!isDiscoverableModelId(record.model_id))
      continue;
    let providerMap = providersById.get(record.model_id);
    if (providerMap === undefined) {
      if (providersById.size >= maxCandidates) {
        throw new Error(`Discovery feed contains more than ${maxCandidates} eligible model identifiers.`);
      }
      candidateCodeUnits += record.model_id.length;
      if (candidateCodeUnits > maxCandidateCodeUnits) {
        throw new Error(`Discovery feed model identifiers exceed the ${maxCandidateCodeUnits}-code-unit candidate limit.`);
      }
      providerMap = new Map;
      providersById.set(record.model_id, providerMap);
    }
    const providerKey2 = normalizeProvider(record.provider);
    let displays = providerMap.get(providerKey2);
    if (displays === undefined) {
      displays = new Set;
      providerMap.set(providerKey2, displays);
    }
    displays.add(record.provider);
  }
  return [...providersById.entries()].sort(([left], [right]) => compareText3(left, right)).map(([id, providerMap]) => {
    const providerKeys = new Set([...providerMap.keys()].sort(compareText3));
    const providers = [...providerMap.values()].map((displays) => [...displays].sort(compareText3)[0]).sort(compareText3);
    return { id, providers, providerKeys };
  });
}
function buildAutomaton(candidates, maxAutomatonNodes) {
  const nodes = [
    { transitions: new Map, failure: 0, outputs: [] }
  ];
  for (let candidateIndex = 0;candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    let state = 0;
    for (const character of candidate.id) {
      const existing = nodes[state]?.transitions.get(character);
      if (existing !== undefined) {
        state = existing;
        continue;
      }
      const next = nodes.length;
      if (next >= maxAutomatonNodes) {
        throw new Error(`Discovery matcher requires more than ${maxAutomatonNodes} automaton nodes.`);
      }
      nodes.push({ transitions: new Map, failure: 0, outputs: [] });
      nodes[state]?.transitions.set(character, next);
      state = next;
    }
    nodes[state]?.outputs.push(candidateIndex);
  }
  const queue = [];
  for (const state of nodes[0]?.transitions.values() ?? []) {
    queue.push(state);
  }
  for (let queueIndex = 0;queueIndex < queue.length; queueIndex += 1) {
    const state = queue[queueIndex];
    const node = nodes[state];
    for (const [character, next] of node.transitions) {
      queue.push(next);
      let fallback = node.failure;
      while (fallback !== 0 && !nodes[fallback]?.transitions.has(character)) {
        fallback = nodes[fallback].failure;
      }
      const fallbackTransition = nodes[fallback]?.transitions.get(character);
      const failure = fallbackTransition === undefined || fallbackTransition === next ? 0 : fallbackTransition;
      const nextNode = nodes[next];
      nextNode.failure = failure;
    }
  }
  return nodes;
}
function isIdentifierCharacter(value) {
  return value !== undefined && IDENTIFIER_CHARACTER.test(value);
}
function characterBefore(value, offset) {
  if (offset <= 0)
    return;
  const lastCodeUnit = value.charCodeAt(offset - 1);
  const start = lastCodeUnit >= 56320 && lastCodeUnit <= 57343 && offset >= 2 ? offset - 2 : offset - 1;
  return String.fromCodePoint(value.codePointAt(start));
}
function characterAt(value, offset) {
  const codePoint = value.codePointAt(offset);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}
function withinWorkspace2(workspace, candidate) {
  const pathFromWorkspace = import_node_path2.relative(workspace, candidate);
  return pathFromWorkspace === "" || !import_node_path2.isAbsolute(pathFromWorkspace) && pathFromWorkspace !== ".." && !pathFromWorkspace.startsWith(`..${import_node_path2.sep}`);
}
function displayPath(workspace, filePath) {
  return import_node_path2.relative(workspace, filePath).split(import_node_path2.sep).join("/");
}
function isSkippedFile(filePath) {
  const fileName = filePath.slice(filePath.lastIndexOf(import_node_path2.sep) + 1).toLowerCase();
  return DISCOVERY_LOCKFILES.has(fileName) || fileName.endsWith(".lock") || BINARY_EXTENSIONS.has(import_node_path2.extname(fileName).toLowerCase());
}
function collectFiles(workspace, lexicalWorkspace, paths, excludedFiles, limits, stats) {
  const files = new Set;
  const examinedFiles = new Set;
  const queuedDirectories = new Set;
  const directoryStack = [];
  const addFile = (filePath) => {
    if (examinedFiles.has(filePath))
      return;
    examinedFiles.add(filePath);
    stats.examinedFileCount += 1;
    if (stats.examinedFileCount > limits.maxFiles) {
      throw new Error(`Discovery examined more than ${limits.maxFiles} files.`);
    }
    if (excludedFiles.has(filePath)) {
      stats.skippedFileCount += 1;
      return;
    }
    if (isSkippedFile(filePath)) {
      stats.skippedFileCount += 1;
      return;
    }
    files.add(filePath);
  };
  const addDirectory = (directory) => {
    if (queuedDirectories.has(directory))
      return;
    queuedDirectories.add(directory);
    stats.directoryCount += 1;
    if (stats.directoryCount > limits.maxDirectories) {
      throw new Error(`Discovery entered more than ${limits.maxDirectories} directories.`);
    }
    directoryStack.push(directory);
  };
  for (const requestedPath of paths) {
    const absoluteRequest = import_node_path2.isAbsolute(requestedPath);
    const lexicalPath = absoluteRequest ? import_node_path2.resolve(requestedPath) : import_node_path2.resolve(workspace, requestedPath);
    const containmentRoot = absoluteRequest ? lexicalWorkspace : workspace;
    if (!withinWorkspace2(containmentRoot, lexicalPath)) {
      throw new Error(`Discovery path escapes the workspace: ${requestedPath}`);
    }
    let pathStats;
    try {
      pathStats = import_node_fs2.lstatSync(lexicalPath);
    } catch (error) {
      throw new Error(`Could not access discovery path ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (pathStats.isSymbolicLink()) {
      stats.skippedSymlinkCount += 1;
      continue;
    }
    const canonicalPath = import_node_fs2.realpathSync(lexicalPath);
    if (!withinWorkspace2(workspace, canonicalPath)) {
      throw new Error(`Discovery path resolves outside the workspace: ${requestedPath}`);
    }
    if (pathStats.isFile())
      addFile(canonicalPath);
    else if (pathStats.isDirectory()) {
      const baseName = canonicalPath.slice(canonicalPath.lastIndexOf(import_node_path2.sep) + 1).toLowerCase();
      if (canonicalPath === workspace || !DISCOVERY_SKIPPED_DIRECTORIES.has(baseName)) {
        addDirectory(canonicalPath);
      }
    } else {
      stats.skippedFileCount += 1;
    }
  }
  while (directoryStack.length > 0) {
    const directory = directoryStack.pop();
    let directoryHandle;
    try {
      directoryHandle = import_node_fs2.opendirSync(directory, { encoding: "utf8" });
    } catch (error) {
      throw new Error(`Could not read discovery directory ${displayPath(workspace, directory)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      while (true) {
        let entry;
        try {
          entry = directoryHandle.readSync();
        } catch (error) {
          throw new Error(`Could not read discovery directory ${displayPath(workspace, directory)}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (entry === null)
          break;
        stats.examinedEntryCount += 1;
        if (stats.examinedEntryCount > limits.maxEntries) {
          throw new Error(`Discovery examined more than ${limits.maxEntries} filesystem entries.`);
        }
        const childPath = import_node_path2.resolve(directory, entry.name);
        let childStats;
        try {
          childStats = import_node_fs2.lstatSync(childPath);
        } catch {
          stats.skippedFileCount += 1;
          continue;
        }
        if (childStats.isSymbolicLink()) {
          stats.skippedSymlinkCount += 1;
          continue;
        }
        if (childStats.isDirectory()) {
          if (!DISCOVERY_SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) {
            addDirectory(childPath);
          }
        } else if (childStats.isFile()) {
          addFile(childPath);
        } else {
          stats.skippedFileCount += 1;
        }
      }
    } finally {
      try {
        directoryHandle.closeSync();
      } catch {}
    }
  }
  return [...files].sort(compareText3);
}
function resolveExcludedFiles(workspace, lexicalWorkspace, requestedPaths) {
  const excluded = new Set;
  for (const requestedPath of requestedPaths) {
    const trimmed = requestedPath.trim();
    if (trimmed === "" || trimmed.length > MAX_PATH_LENGTH3 || CONTROL_CHARACTER4.test(trimmed)) {
      continue;
    }
    const absoluteRequest = import_node_path2.isAbsolute(trimmed);
    const lexicalPath = absoluteRequest ? import_node_path2.resolve(trimmed) : import_node_path2.resolve(workspace, trimmed);
    const containmentRoot = absoluteRequest ? lexicalWorkspace : workspace;
    if (!withinWorkspace2(containmentRoot, lexicalPath))
      continue;
    try {
      const canonicalPath = import_node_fs2.realpathSync(lexicalPath);
      if (withinWorkspace2(workspace, canonicalPath) && import_node_fs2.statSync(canonicalPath).isFile()) {
        excluded.add(canonicalPath);
      }
    } catch {}
  }
  return excluded;
}
function readText(filePath, limits, stats) {
  let size;
  try {
    size = import_node_fs2.statSync(filePath).size;
  } catch {
    stats.skippedFileCount += 1;
    return null;
  }
  if (size === 0)
    return null;
  if (size > limits.maxFileBytes) {
    stats.skippedFileCount += 1;
    return null;
  }
  if (stats.scannedByteCount + size > limits.maxTotalBytes) {
    throw new Error(`Discovery input exceeds the ${limits.maxTotalBytes}-byte aggregate limit.`);
  }
  let bytes;
  try {
    bytes = import_node_fs2.readFileSync(filePath);
  } catch {
    stats.skippedFileCount += 1;
    return null;
  }
  if (bytes.length > limits.maxFileBytes) {
    stats.skippedFileCount += 1;
    return null;
  }
  if (stats.scannedByteCount + bytes.length > limits.maxTotalBytes) {
    throw new Error(`Discovery input exceeds the ${limits.maxTotalBytes}-byte aggregate limit.`);
  }
  stats.scannedByteCount += bytes.length;
  if (bytes.includes(0)) {
    stats.skippedFileCount += 1;
    return null;
  }
  try {
    const text = UTF8_DECODER.decode(bytes);
    stats.scannedFileCount += 1;
    return text;
  } catch {
    stats.skippedFileCount += 1;
    return null;
  }
}
function trackedByInventory(candidate, inventory) {
  return inventory.some((model) => model.id === candidate.id && (model.provider === undefined || candidate.providerKeys.has(normalizeProvider(model.provider))));
}
function discoverModels(feed, workspacePath, rawPaths, options = {}) {
  const limits = resolvedLimits(options.limits);
  const lexicalWorkspace = import_node_path2.resolve(workspacePath);
  const workspace = import_node_fs2.realpathSync(lexicalWorkspace);
  if (!import_node_fs2.statSync(workspace).isDirectory()) {
    throw new Error(`Discovery workspace is not a directory: ${workspacePath}`);
  }
  const paths = parseDiscoveryPaths(rawPaths, limits.maxPaths);
  const candidates = buildCandidates(feed, limits.maxCandidates, limits.maxCandidateCodeUnits);
  const automaton = buildAutomaton(candidates, limits.maxAutomatonNodes);
  const inventory = options.inventory ?? [];
  const stats = {
    examinedFileCount: 0,
    scannedFileCount: 0,
    scannedByteCount: 0,
    skippedFileCount: 0,
    skippedSymlinkCount: 0,
    directoryCount: 0,
    examinedEntryCount: 0
  };
  const excludedFiles = resolveExcludedFiles(workspace, lexicalWorkspace, options.excludedPaths ?? []);
  const files = collectFiles(workspace, lexicalWorkspace, paths, excludedFiles, limits, stats);
  const matches = new Map;
  let matchCount = 0;
  for (const filePath of files) {
    const text = readText(filePath, limits, stats);
    if (text === null || candidates.length === 0)
      continue;
    let state = 0;
    let line = 1;
    let column = 1;
    let codeUnitOffset = 0;
    let previousWasCarriageReturn = false;
    for (const character of text) {
      while (state !== 0 && !automaton[state]?.transitions.has(character)) {
        state = automaton[state].failure;
      }
      state = automaton[state]?.transitions.get(character) ?? 0;
      const node = automaton[state];
      for (const candidateIndex of node.outputs) {
        const candidate = candidates[candidateIndex];
        const endOffset = codeUnitOffset + character.length;
        const startOffset = endOffset - candidate.id.length;
        if (isIdentifierCharacter(characterBefore(text, startOffset)) || isIdentifierCharacter(characterAt(text, endOffset))) {
          continue;
        }
        matchCount += 1;
        if (matchCount > limits.maxMatches) {
          throw new Error(`Discovery found more than ${limits.maxMatches} model occurrences.`);
        }
        let found = matches.get(candidateIndex);
        if (found === undefined) {
          found = { occurrenceCount: 0, locations: [] };
          matches.set(candidateIndex, found);
        }
        found.occurrenceCount += 1;
        if (found.locations.length < limits.maxLocationsPerModel) {
          found.locations.push({
            path: displayPath(workspace, filePath),
            line,
            column: column - candidate.id.length + 1
          });
        }
      }
      codeUnitOffset += character.length;
      if (character === "\r") {
        line += 1;
        column = 1;
        previousWasCarriageReturn = true;
      } else if (character === `
`) {
        if (!previousWasCarriageReturn)
          line += 1;
        column = 1;
        previousWasCarriageReturn = false;
      } else {
        column += 1;
        previousWasCarriageReturn = false;
      }
    }
  }
  const models = [...matches.entries()].sort(([left], [right]) => compareText3(candidates[left].id, candidates[right].id)).map(([candidateIndex, found]) => {
    const candidate = candidates[candidateIndex];
    return {
      id: candidate.id,
      providers: candidate.providers,
      ambiguous: candidate.providerKeys.size > 1,
      occurrenceCount: found.occurrenceCount,
      locations: found.locations,
      locationsTruncated: found.locations.length < found.occurrenceCount,
      tracked: trackedByInventory(candidate, inventory)
    };
  });
  return {
    models,
    candidateCount: candidates.length,
    examinedFileCount: stats.examinedFileCount,
    scannedFileCount: stats.scannedFileCount,
    scannedByteCount: stats.scannedByteCount,
    skippedFileCount: stats.skippedFileCount,
    skippedSymlinkCount: stats.skippedSymlinkCount,
    matchCount
  };
}
function publishDiscoveredModels(models, maxCodeUnits = 1e5) {
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 2 || maxCodeUnits > 400000) {
    throw new Error("Invalid discovery output budget: expected an integer from 2 to 400000.");
  }
  const entries = [];
  let usedCodeUnits = 2;
  let truncated = false;
  for (const model of models) {
    const providers = model.providers.slice(0, MAX_PUBLISHED_PROVIDERS);
    const locations = model.locations.slice(0, MAX_PUBLISHED_LOCATIONS);
    const published = {
      id: model.id,
      providers,
      providersTruncated: providers.length < model.providers.length,
      ambiguous: model.ambiguous,
      occurrenceCount: model.occurrenceCount,
      locations,
      locationsTruncated: model.locationsTruncated || locations.length < model.locations.length,
      tracked: model.tracked
    };
    let serialized = JSON.stringify(published);
    const separatorSize = entries.length === 0 ? 0 : 1;
    if (usedCodeUnits + separatorSize + serialized.length > maxCodeUnits) {
      const compact = {
        ...published,
        providers: providers.slice(0, 1),
        providersTruncated: providers.length > 1 || published.providersTruncated,
        locations: locations.slice(0, 1),
        locationsTruncated: locations.length > 1 || published.locationsTruncated
      };
      serialized = JSON.stringify(compact);
      if (usedCodeUnits + separatorSize + serialized.length > maxCodeUnits) {
        truncated = true;
        break;
      }
      truncated = true;
    }
    if (published.providersTruncated || published.locationsTruncated)
      truncated = true;
    entries.push(serialized);
    usedCodeUnits += separatorSize + serialized.length;
  }
  if (entries.length < models.length)
    truncated = true;
  return { json: `[${entries.join(",")}]`, truncated };
}

// src/http.ts
var DEFAULT_REQUEST_TIMEOUT_MS = 15000;
var DEFAULT_RETRIES = 2;
var MAX_FEED_BYTES = 5 * 1024 * 1024;

class InvalidResponseError extends Error {
}
var defaultSleep = (milliseconds) => new Promise((resolve3) => setTimeout(resolve3, milliseconds));
function defaultRequestPolicy(fetchImplementation = fetch) {
  return {
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    fetch: fetchImplementation,
    sleep: defaultSleep,
    random: Math.random
  };
}
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}
function retryDelay(response, attempt, random) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, 1e4);
    const timestamp = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp))
      return Math.max(0, Math.min(timestamp - Date.now(), 1e4));
  }
  return Math.min(500 * 2 ** attempt + Math.floor(random() * 250), 1e4);
}
function errorDetail(error) {
  if (error instanceof DOMException && error.name === "AbortError")
    return "request timed out";
  if (error instanceof Error)
    return error.message;
  return String(error);
}
async function consumeWithRetry(url, init, label, policy, consume) {
  let lastError;
  let attempts = 0;
  for (let attempt = 0;attempt <= policy.retries; attempt += 1) {
    attempts = attempt + 1;
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    let response = null;
    try {
      response = await policy.fetch(url, { ...init, signal: controller.signal });
      if (response.ok)
        return await consume(response);
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const shouldRetry = isRetryableStatus(response.status) && attempt < policy.retries;
      await response.body?.cancel().catch(() => {
        return;
      });
      if (!shouldRetry)
        break;
    } catch (error) {
      await response?.body?.cancel().catch(() => {
        return;
      });
      if (error instanceof InvalidResponseError)
        throw error;
      lastError = error;
      if (attempt === policy.retries)
        break;
    } finally {
      clearTimeout(timeout);
    }
    await policy.sleep(retryDelay(response, attempt, policy.random));
  }
  throw new Error(`${label} failed after ${attempts} attempt(s): ${errorDetail(lastError).replace(/\.$/, "")}.`);
}
async function readBoundedBody(response, maxBytes) {
  if (!response.body)
    return new Uint8Array;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {
          return;
        });
        throw new InvalidResponseError(`Deprecations feed exceeded the ${maxBytes}-byte response limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function fetchBoundedDocumentBytes(url, policy, maxBytes = MAX_FEED_BYTES) {
  return consumeWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json, application/feed+json;q=0.9",
      "User-Agent": "ai-model-end-of-life-action"
    }
  }, "Deprecations feed request", policy, async (response) => {
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new InvalidResponseError(`Deprecations feed is ${contentLength} bytes; the limit is ${maxBytes}.`);
    }
    return readBoundedBody(response, maxBytes);
  });
}
async function postSlack(webhook, text, policy) {
  await consumeWithRetry(webhook, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  }, "Slack notification", { ...policy, retries: 0 }, async (response) => {
    await response.body?.cancel().catch(() => {
      return;
    });
  });
}

// src/feed-source.ts
function parseExpectedSha256(raw) {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized === "")
    return null;
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid expected-feed-sha256: expected an empty value or 64 hexadecimal characters.");
  }
  return normalized;
}
async function loadFeedDocument(input) {
  const requestedUrl = input.feedUrl?.trim() ?? "";
  const requestedFile = input.feedFile?.trim() ?? "";
  if (requestedUrl !== "" && requestedFile !== "") {
    throw new Error("Provide only one of `feed-url` or `feed-file`, not both.");
  }
  let bytes;
  let sourceKind;
  let url;
  let label;
  if (requestedFile !== "") {
    sourceKind = "file";
    label = "`feed-file`";
    bytes = readBoundedFileBytes(requestedFile, input.workspace, MAX_FEED_BYTES, label);
  } else {
    sourceKind = "url";
    label = "Deprecations feed";
    url = parseHttpUrl(requestedUrl || input.defaultFeedUrl, "feed-url");
    bytes = await fetchBoundedDocumentBytes(url, input.requestPolicy);
  }
  const rawSha256 = rawBytesSha256(bytes);
  if (input.expectedSha256 !== null && rawSha256 !== input.expectedSha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${input.expectedSha256}, received ${rawSha256}.`);
  }
  const document = decodeJsonDocument(bytes, label);
  const loaded = {
    value: document.value,
    bytes,
    rawSha256,
    sourceKind
  };
  if (url !== undefined)
    loaded.url = url;
  return loaded;
}

// src/github.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
function inputEnvName(name) {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}
function getInput(name, environment) {
  const value = environment[inputEnvName(name)];
  return value === undefined ? undefined : value.trim();
}
function escapeCommandData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeCommandProperty(value) {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function emitCommand(level, message, log = console.log) {
  log(`::${level}::${escapeCommandData(message)}`);
}
function emitAnnotation(level, message, properties, log = console.log) {
  const serialized = [];
  if (properties.title !== undefined) {
    serialized.push(`title=${escapeCommandProperty(properties.title)}`);
  }
  if (properties.file !== undefined) {
    serialized.push(`file=${escapeCommandProperty(properties.file)}`);
  }
  for (const [name, value] of [
    ["line", properties.line],
    ["col", properties.col]
  ]) {
    if (value === undefined)
      continue;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid GitHub annotation ${name}: ${value}.`);
    }
    serialized.push(`${name}=${value}`);
  }
  const prefix = serialized.length > 0 ? ` ${serialized.join(",")}` : "";
  log(`::${level}${prefix}::${escapeCommandData(message)}`);
}
function maskSecret(secret, log = console.log) {
  if (secret !== "")
    log(`::add-mask::${escapeCommandData(secret)}`);
}
function appendCommand(file, key, value, uuid = import_node_crypto2.randomUUID) {
  if (!file)
    return;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
    throw new Error(`Invalid GitHub output name: ${key}`);
  }
  let delimiter = `ghadelimiter_${uuid()}`;
  const lines = new Set(value.split(/\r?\n/));
  while (lines.has(delimiter))
    delimiter = `ghadelimiter_${uuid()}`;
  import_node_fs3.appendFileSync(file, `${key}<<${delimiter}${import_node_os.EOL}${value}${import_node_os.EOL}${delimiter}${import_node_os.EOL}`, "utf8");
}
function appendSummary(file, markdown) {
  if (file)
    import_node_fs3.appendFileSync(file, markdown.endsWith(import_node_os.EOL) ? markdown : `${markdown}${import_node_os.EOL}`, "utf8");
}

// src/notification.ts
function parseNotificationMode(raw) {
  const normalized = raw?.trim().toLowerCase() || "always";
  if (normalized === "always" || normalized === "on-change")
    return normalized;
  throw new Error("Invalid notification-mode: expected `always` or `on-change`.");
}
function parsePreviousAlertFingerprint(raw) {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized === "")
    return null;
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid previous-alert-fingerprint: expected an empty value or 64 hexadecimal characters.");
  }
  return normalized;
}
function decideNotification(input) {
  if (input.mode === "always") {
    return input.alertCount > 0 ? { shouldNotify: true, reason: "always" } : { shouldNotify: false, reason: "no-alerts" };
  }
  if (input.alertCount === 0) {
    return input.previousFingerprint !== null && input.previousFingerprint !== input.currentFingerprint ? { shouldNotify: true, reason: "resolved" } : { shouldNotify: false, reason: "no-alerts" };
  }
  if (input.previousFingerprint === input.currentFingerprint) {
    return { shouldNotify: false, reason: "unchanged" };
  }
  return {
    shouldNotify: true,
    reason: input.previousFingerprint === null ? "initial" : "changed"
  };
}

// src/render.ts
var MAX_SUMMARY_ROWS = 100;
var MAX_SUMMARY_BYTES = 900000;
var MAX_SUMMARY_REPLACEMENTS = 3;
var MAX_FRESHNESS_ITEMS = 20;
var MAX_DISCOVERY_ROWS = 50;
var MAX_DISCOVERY_LOCATIONS = 3;
var MAX_ANNOTATION_CODE_UNITS = 4000;
var MAX_FAILURE_MESSAGE_CODE_UNITS = 16000;
var DEFAULT_SLACK_LIMIT = 3500;
var MAX_SLACK_ITEM_CODE_UNITS = 1200;
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeTableCell(value) {
  return escapeHtml(value).replace(/\|/g, "&#124;").replace(/`/g, "&#96;").replace(/[\r\n]+/g, "<br>");
}
function codeCell(value) {
  return `<code>${escapeTableCell(value)}</code>`;
}
function modelLabel(finding) {
  const label = `<code>${escapeTableCell(finding.id)}</code>`;
  return finding.url ? `[${label}](<${finding.url}>)` : label;
}
function formatDays(days) {
  if (days === null)
    return "Unknown";
  if (days < 0)
    return `${Math.abs(days)} day(s) ago`;
  if (days === 0)
    return "Today";
  return `${days} day(s)`;
}
function findingStatus(finding, isBreach) {
  if (finding.status === "date-unknown") {
    return isBreach ? "❌ Reported undated deprecation" : "⚠️ Reported undated deprecation";
  }
  if ((finding.daysUntilShutdown ?? 0) < 0) {
    return isBreach ? "⛔ Reported shutdown date passed — failure threshold" : "⛔ Reported shutdown date passed";
  }
  if (isBreach)
    return "❌ Reported date inside failure threshold";
  return "⚠️ Reported EOL date approaching";
}
function modelDescription(model) {
  return model.provider ? `${model.id} (${model.provider})` : model.id;
}
function modelKey(model) {
  return `${model.id}\x00${model.provider ?? "*"}`;
}
function compactContext(value, maxLength) {
  return truncateCodeUnits(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ").replace(/\s+/gu, " ").trim(), maxLength);
}
function renderSummary(input) {
  const breachKeys = new Set(input.breaching.map(findingKey));
  const unmatchedBreachKeys = new Set(input.unmatchedBreaching.map(modelKey));
  const totalBreaches = input.breaching.length + input.unmatchedBreaching.length;
  const untrackedDiscoveryCount = input.discovery?.models.filter((model) => !model.tracked).length ?? 0;
  const lines = ["## AI model end-of-life check", ""];
  if (input.findings.length === 0 && input.unmatchedBreaching.length === 0) {
    if (input.unmatchedModels.length > 0) {
      lines.push(`⚠️ **No lifecycle findings were reported, but ${input.unmatchedModels.length} declaration(s) have no exact feed history.** This is not a model-validity or support all-clear.`, "");
    } else if (untrackedDiscoveryCount > 0) {
      lines.push(`⚠️ **No lifecycle findings were reported for the explicit inventory, but report-only discovery found ${untrackedDiscoveryCount} feed model ID(s) without a compatible declaration.** This is not an inventory all-clear.`, "");
    } else {
      lines.push(input.includeUndated ? `All ${input.models.length} declaration(s) have feed history, and no matching deprecations are within ${input.windowDays} day(s) or lack a shutdown date. ✅` : `All ${input.models.length} declaration(s) have feed history, and no matching dated deprecations are within ${input.windowDays} day(s). Undated deprecations were excluded by configuration. ✅`, "");
    }
  } else if (input.findings.length === 0) {
    lines.push(`❌ **${input.unmatchedBreaching.length} unmatched inventory declaration(s) breached the configured feed-history policy.** No lifecycle findings were reported.`, "");
  } else {
    const undatedCount = input.findings.filter((finding) => finding.status === "date-unknown").length;
    lines.push(`${totalBreaches > 0 ? "❌" : "⚠️"} **${input.findings.length} lifecycle finding(s)** — ${input.breaching.length} lifecycle breach(es), ${input.unmatchedBreaching.length} feed-history breach(es), ${undatedCount} with no published shutdown date.`, "", "| Model | Serving platform | Status | Reported shutdown | Time | Replacement | Feed context |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const finding of input.findings.slice(0, MAX_SUMMARY_ROWS)) {
      const replacement = finding.replacementModels.length > 0 ? `${finding.replacementModels.slice(0, MAX_SUMMARY_REPLACEMENTS).map(codeCell).join(", ")}${finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more` : ""}` : "—";
      const context = finding.context ? codeCell(compactContext(finding.context, 240)) : "—";
      lines.push(`| ${modelLabel(finding)} | ${codeCell(finding.provider)} | ${findingStatus(finding, breachKeys.has(findingKey(finding)))} | ${escapeTableCell(finding.shutdownDate ?? "Not announced")} | ${formatDays(finding.daysUntilShutdown)} | ${replacement} | ${context} |`);
    }
    if (input.findings.length > MAX_SUMMARY_ROWS) {
      lines.push("", `_Summary limited to ${MAX_SUMMARY_ROWS} rows; ${input.findings.length - MAX_SUMMARY_ROWS} additional finding(s) remain in the \`findings\` output._`);
    }
    lines.push("");
  }
  if (input.unmatchedModels.length > 0) {
    lines.push(`<details><summary>${input.unmatchedModels.length} inventory entry/entries have no matching feed history${input.unmatchedBreaching.length > 0 ? `; ${input.unmatchedBreaching.length} breached feed-history policy` : ""}</summary>`, "", "This usually means the feed has no recorded deprecation for that exact model/platform pair; it is not proof that the model is active.", "", ...input.unmatchedModels.slice(0, 50).map((model) => `- ${unmatchedBreachKeys.has(modelKey(model)) ? "❌ " : ""}<code>${escapeHtml(modelDescription(model))}</code>`));
    if (input.unmatchedModels.length > 50) {
      lines.push(`- …and ${input.unmatchedModels.length - 50} more`);
    }
    lines.push("", "</details>", "");
  }
  if (input.discovery !== undefined) {
    lines.push("### Report-only source discovery", "", `Found ${input.discovery.models.length} exact lifecycle-feed model ID(s) across ${input.discovery.scannedFileCount} scanned file(s) and ${input.discovery.matchCount} occurrence(s); ${untrackedDiscoveryCount} ID(s) have no compatible inventory declaration.`, "", "Discovery is lexical and case-sensitive. It cannot infer the serving platform, detect dynamically assembled IDs or aliases, or find active model IDs absent from the lifecycle feed. It does not change findings, policy breaches, alert fingerprints, or Slack delivery.", "");
    if (input.discovery.models.length > 0) {
      lines.push("| Feed model ID | Possible serving platform(s) | Inventory | First location(s) |", "| --- | --- | --- | --- |");
      for (const model of input.discovery.models.slice(0, MAX_DISCOVERY_ROWS)) {
        const shownProviders = model.providers.slice(0, 5).map(codeCell).join(", ");
        const providers = `${model.ambiguous ? "Ambiguous: " : ""}${shownProviders}${model.providers.length > 5 ? `, … +${model.providers.length - 5} more` : ""}`;
        const locations = model.locations.slice(0, MAX_DISCOVERY_LOCATIONS).map((location) => codeCell(`${location.path}:${location.line}:${location.column}`)).join("<br>");
        lines.push(`| ${codeCell(model.id)} | ${providers || "—"} | ${model.tracked ? "Compatible declaration present" : "⚠️ Not declared"} | ${locations || "—"}${model.locationsTruncated || model.locations.length > MAX_DISCOVERY_LOCATIONS ? "<br>…" : ""} |`);
      }
      if (input.discovery.models.length > MAX_DISCOVERY_ROWS) {
        lines.push("", `_Discovery table limited to ${MAX_DISCOVERY_ROWS} IDs; ${input.discovery.models.length - MAX_DISCOVERY_ROWS} additional ID(s) remain represented by the discovery count and bounded output._`);
      }
      lines.push("");
    }
    lines.push(`Discovery examined ${input.discovery.examinedFileCount} file(s), read ${input.discovery.scannedByteCount} byte(s), skipped ${input.discovery.skippedFileCount} file(s) and ${input.discovery.skippedSymlinkCount} symlink(s), and considered ${input.discovery.candidateCount} feed ID candidate(s). Source snippets are never emitted.`, "");
  }
  const age = input.feedContentAgeDays === null ? "no observation timestamp available" : `newest recorded feed content: ${input.feedContentAgeDays} day(s) old`;
  lines.push(`Checked ${input.models.length} unique model declaration(s) against ${input.feedSize} validated feed entries; ${input.matchedModelCount} declaration(s) had feed history; window: ${input.windowDays} day(s); ${age}.`);
  if (input.providerFreshness.length > 0) {
    const omittedFreshness = input.providerFreshness.length - MAX_FRESHNESS_ITEMS;
    lines.push(`Configured-platform content ages: ${input.providerFreshness.slice(0, MAX_FRESHNESS_ITEMS).map((item) => `<code>${escapeHtml(item.provider)}=${item.ageDays === null ? "unknown" : `${item.ageDays}d`}</code>`).join(", ")}${omittedFreshness > 0 ? `, … +${omittedFreshness} more` : ""}.`);
  }
  lines.push("", "Feed timestamps measure when lifecycle content was observed, not whether every upstream scraper ran successfully.", "Provider dates may be earliest, regional, tier-specific, redirected, or otherwise qualified; follow the linked source or provider documentation before migrating.");
  if (input.feedSha256 !== undefined && input.lifecycleFeedSha256 !== undefined && input.inventorySha256 !== undefined) {
    lines.push(`Audit identity: source=${input.feedSourceKind ?? "unknown"}; raw feed SHA-256 <code>${escapeHtml(input.feedSha256)}</code>; lifecycle SHA-256 <code>${escapeHtml(input.lifecycleFeedSha256)}</code>; inventory SHA-256 <code>${escapeHtml(input.inventorySha256)}</code>.`);
  }
  if (input.notification?.error !== undefined) {
    lines.push("", "### Notification delivery", "", `❌ Slack delivery failed: <code>${escapeHtml(compactContext(input.notification.error, 1000))}</code>`);
  } else if (input.notification?.reason === "unchanged") {
    lines.push("Slack delivery was skipped because the caller-provided alert fingerprint is unchanged.");
  } else if (input.notification?.sent) {
    lines.push(`Slack notification sent (${escapeHtml(input.notification.reason)}).`);
  }
  const markdown = `${lines.join(`
`)}
`;
  if (Buffer.byteLength(markdown, "utf8") <= MAX_SUMMARY_BYTES)
    return markdown;
  const fallback = [
    "## AI model end-of-life check",
    "",
    `${totalBreaches > 0 ? "❌" : "⚠️"} **${input.findings.length} lifecycle finding(s)** — ${totalBreaches} total policy breach(es).`,
    "",
    `The detailed table was omitted because it exceeded the safe ${MAX_SUMMARY_BYTES}-byte job-summary limit. Use the bounded \`findings\` output for machine-readable details.`,
    "",
    `Checked ${input.models.length} unique model declaration(s) against ${input.feedSize} validated feed entries; ${input.matchedModelCount} declaration(s) had feed history.`,
    ""
  ];
  if (input.feedSha256 !== undefined && input.lifecycleFeedSha256 !== undefined && input.inventorySha256 !== undefined) {
    fallback.push(`Audit identity: raw feed SHA-256 <code>${escapeHtml(input.feedSha256)}</code>; lifecycle SHA-256 <code>${escapeHtml(input.lifecycleFeedSha256)}</code>; inventory SHA-256 <code>${escapeHtml(input.inventorySha256)}</code>.`, "");
  }
  if (input.discovery !== undefined) {
    fallback.push(`Report-only discovery found ${input.discovery.models.length} feed model ID(s), including ${input.discovery.models.filter((model) => !model.tracked).length} without a compatible inventory declaration, across ${input.discovery.matchCount} occurrence(s).`, "");
  }
  if (input.notification?.error !== undefined) {
    fallback.push(`❌ Slack delivery failed: <code>${escapeHtml(compactContext(input.notification.error, 1000))}</code>`, "");
  }
  return fallback.join(`
`);
}
function renderFailureSummary(message) {
  const bounded = truncateCodeUnits(message, MAX_FAILURE_MESSAGE_CODE_UNITS);
  return `## AI model end-of-life check

❌ **The action failed.**

<pre>${escapeHtml(bounded)}</pre>
`;
}
function escapeSlack(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*/g, "∗").replace(/_/g, "＿").replace(/~/g, "∼").replace(/`/g, "ˋ");
}
function escapeSlackBounded(value, maxLength) {
  let escaped = "";
  for (const character of value) {
    const next = escapeSlack(character);
    if (escaped.length + next.length > maxLength - 1)
      return `${escaped}…`;
    escaped += next;
  }
  return escaped;
}
function appendSlackExtra(line, extra) {
  return line.length + extra.length <= MAX_SLACK_ITEM_CODE_UNITS ? `${line}${extra}` : line;
}
function slackLine(finding) {
  const timing = finding.daysUntilShutdown === null ? `feed reports deprecation; shutdown date not announced${finding.deprecationDate ? ` (deprecated ${escapeSlack(finding.deprecationDate)})` : ""}` : `feed reports shutdown ${escapeSlack(finding.shutdownDate ?? "unknown")} (${formatDays(finding.daysUntilShutdown)})`;
  const replacements2 = finding.replacementModels.length > 0 ? ` → ${finding.replacementModels.slice(0, MAX_SUMMARY_REPLACEMENTS).map((replacement) => escapeSlackBounded(replacement, 100)).join(", ")}${finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more` : ""}` : "";
  const escapedUrl = finding.url?.replace(/&/g, "&amp;").replace(/\|/g, "%7C");
  const source = escapedUrl ? escapedUrl.length <= 360 ? ` <${escapedUrl}|source>` : " (source URL in GitHub job summary)" : "";
  const context = finding.context ? ` — ${escapeSlackBounded(compactContext(finding.context, 180), 240)}` : "";
  let line = `*${escapeSlackBounded(finding.id, 400)}* (${escapeSlackBounded(finding.provider, 160)}) — ${timing}`;
  line = appendSlackExtra(line, context);
  line = appendSlackExtra(line, source);
  line = appendSlackExtra(line, replacements2);
  return line;
}
function renderSlackText(findings, options = {}) {
  const breaching = options.breaching ?? [];
  const unmatchedBreaching = options.unmatchedBreaching ?? [];
  const maxLength = options.maxLength ?? DEFAULT_SLACK_LIMIT;
  const breachKeys = new Set(breaching.map(findingKey));
  const totalBreaches = breaching.length + unmatchedBreaching.length;
  const heading = `:rotating_light: *${findings.length} AI model lifecycle finding(s)* — ${totalBreaches} policy breach(es)${unmatchedBreaching.length > 0 ? `; ${unmatchedBreaching.length} unmatched inventory declaration(s)` : ""}`;
  const itemLines = [
    ...findings.filter((finding) => breachKeys.has(findingKey(finding))).map((finding) => `• ❌ ${slackLine(finding)}`),
    ...unmatchedBreaching.map((model) => `• ❌ no exact feed history for *${escapeSlackBounded(model.id, 400)}*${model.provider ? ` (${escapeSlackBounded(model.provider, 160)})` : ""}`),
    ...findings.filter((finding) => !breachKeys.has(findingKey(finding))).map((finding) => `• ⚠️ ${slackLine(finding)}`)
  ];
  const included = [];
  for (const line of itemLines) {
    const omitted2 = itemLines.length - included.length - 1;
    const suffix2 = omitted2 > 0 ? `
…and ${omitted2} more policy signal(s). See the GitHub job summary.` : "";
    const candidate = `${heading}
${[...included, line].join(`
`)}${suffix2}`;
    if (candidate.length > maxLength)
      break;
    included.push(line);
  }
  const omitted = itemLines.length - included.length;
  const suffix = omitted > 0 ? `
…and ${omitted} more policy signal(s). See the GitHub job summary.` : "";
  return `${heading}${included.length > 0 ? `
${included.join(`
`)}` : ""}${suffix}`;
}
function renderResolvedSlackText() {
  return ":white_check_mark: *AI model lifecycle alert resolved* — the current notification set contains no lifecycle findings or feed-history policy breaches.";
}
function renderFindingAnnotation(finding) {
  const replacement = finding.replacementModels.length > 0 ? `${finding.replacementModels.slice(0, MAX_SUMMARY_REPLACEMENTS).join(", ")}${finding.replacementModels.length > MAX_SUMMARY_REPLACEMENTS ? `, … +${finding.replacementModels.length - MAX_SUMMARY_REPLACEMENTS} more` : ""}` : "none listed";
  const sourceGuidance = finding.url ? `Confirm the provider scope at the linked source. ${finding.url}` : "Confirm the provider scope in the provider's documentation.";
  const compactedContext = finding.context ? compactContext(finding.context, 500) : "";
  const contextSuffix = compactedContext ? ` Feed context: ${compactedContext}${/[.!?]$/.test(compactedContext) ? "" : "."}` : "";
  let annotation;
  if (finding.daysUntilShutdown === null) {
    annotation = `Deprecations feed reports ${finding.id} (${finding.provider}) as deprecated, but no shutdown date is published. Replacement: ${replacement}.${contextSuffix} ${sourceGuidance}`;
  } else {
    annotation = `Deprecations feed reports ${finding.id} (${finding.provider}) shutdown date ${finding.shutdownDate} — ${formatDays(finding.daysUntilShutdown)}. Replacement: ${replacement}.${contextSuffix} ${sourceGuidance}`;
  }
  return truncateCodeUnits(annotation, MAX_ANNOTATION_CODE_UNITS);
}
function renderUnmatchedAnnotation(model) {
  return truncateCodeUnits(`No exact deprecations-feed history was found for ${modelDescription(model)}; fail-on-unmatched is enabled. Confirm the model ID and serving platform, or disable the feed-history policy when unmatched active models are expected.`, MAX_ANNOTATION_CODE_UNITS);
}
function renderDiscoveryAnnotation(model) {
  const shownProviders = model.providers.slice(0, 5).join(", ");
  const providerSuffix = model.ambiguous ? ` The source token does not identify its serving platform; feed candidates include ${shownProviders}${model.providers.length > 5 ? `, and ${model.providers.length - 5} more` : ""}.` : shownProviders === "" ? "" : ` Feed serving platform: ${shownProviders}.`;
  return truncateCodeUnits(`Report-only discovery found exact lifecycle-feed model ID ${model.id}, but the explicit inventory has no compatible declaration.${providerSuffix} Confirm the reference and add the model to the inventory if it is a real dependency.`, MAX_ANNOTATION_CODE_UNITS);
}
function truncateCodeUnits(value, maxLength) {
  if (value.length <= maxLength)
    return value;
  let truncated = value.slice(0, maxLength - 1);
  if (/^[\uD800-\uDBFF]$/.test(truncated.at(-1) ?? ""))
    truncated = truncated.slice(0, -1);
  return `${truncated}…`;
}

// src/check.ts
var DEFAULT_FEED_URL = "https://deprecations.info/v1/deprecations.json";
var DEFAULT_WINDOW_DAYS = 90;
var MAX_DAYS = 36500;
var MAX_TOTAL_OUTPUT_CODE_UNITS = 400000;
var MAX_WARNING_ANNOTATIONS = 10;
var MAX_ERROR_POLICY_ANNOTATIONS = 9;

class ReportedActionError extends Error {
}

class PolicyBreachError extends ReportedActionError {
}

class NotificationDeliveryError extends ReportedActionError {
}
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
function notificationMode(raw) {
  const normalized = raw?.trim().toLowerCase() || "error";
  if (normalized !== "warn" && normalized !== "error") {
    throw new Error("Invalid notification-failure-mode: expected `warn` or `error`.");
  }
  return normalized;
}
function outputCodeUnits(outputs) {
  return Object.entries(outputs).reduce((total, [key, value]) => total + key.length + value.length + 100, 0);
}
function validateFreshness(maxAgeDays, globalAgeDays, providerFreshness) {
  if (maxAgeDays === null)
    return;
  if (globalAgeDays === null) {
    throw new Error("Feed content-age checking is enabled, but the feed carries no last_observed/scraped_at timestamps.");
  }
  if (globalAgeDays > maxAgeDays) {
    throw new Error(`Newest recorded feed content is ${globalAgeDays} day(s) old (max ${maxAgeDays}). This signal measures content observation, not scraper execution.`);
  }
  for (const freshness of providerFreshness) {
    if (freshness.ageDays === null) {
      throw new Error(`Feed content-age checking is enabled, but serving platform ${freshness.provider} has no observation timestamps.`);
    }
    if (freshness.ageDays > maxAgeDays) {
      throw new Error(`Newest recorded ${freshness.provider} feed content is ${freshness.ageDays} day(s) old (max ${maxAgeDays}). This may mean a quiet source or a stale provider scraper.`);
    }
  }
}
async function run(dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const log = dependencies.log ?? console.log;
  const now = (dependencies.now ?? Date.now)();
  const workspace = environment.GITHUB_WORKSPACE ?? process.cwd();
  const modelsInput = getInput("models", environment);
  const modelsFileInput = getInput("models-file", environment);
  const models = loadModels(modelsInput, modelsFileInput, workspace);
  const windowDays = parseRequiredInteger(getInput("days-before-shutdown", environment), "days-before-shutdown", DEFAULT_WINDOW_DAYS, { max: MAX_DAYS });
  const failWithinDays = parseOptionalInteger(getInput("fail-within-days", environment), "fail-within-days", { max: MAX_DAYS });
  if (failWithinDays !== null && failWithinDays > windowDays) {
    throw new Error(`fail-within-days (${failWithinDays}) must not exceed days-before-shutdown (${windowDays}); otherwise failures can be hidden outside the reporting window.`);
  }
  const includeUndated = parseBoolean(getInput("include-undated", environment), "include-undated", true);
  const failOnUndated = parseBoolean(getInput("fail-on-undated", environment), "fail-on-undated", false);
  if (failOnUndated && !includeUndated) {
    throw new Error("`fail-on-undated` cannot be true when `include-undated` is false; the failure policy must not hide the findings it evaluates.");
  }
  const failOnUnmatched = parseBoolean(getInput("fail-on-unmatched", environment), "fail-on-unmatched", false);
  const discoveryEnabled = parseBoolean(getInput("discover-models", environment), "discover-models", false);
  const discoveryPaths = getInput("discovery-paths", environment);
  const maxFeedAgeDays = parseOptionalInteger(getInput("max-feed-age-days", environment), "max-feed-age-days", { max: MAX_DAYS });
  const jobSummary = parseBoolean(getInput("job-summary", environment), "job-summary", true);
  const timeoutSeconds = parseRequiredInteger(getInput("request-timeout-seconds", environment), "request-timeout-seconds", DEFAULT_REQUEST_TIMEOUT_MS / 1000, { min: 1, max: 300 });
  const retries = parseRequiredInteger(getInput("retries", environment), "retries", DEFAULT_RETRIES, { max: 5 });
  const failureMode = notificationMode(getInput("notification-failure-mode", environment));
  const notificationModeValue = parseNotificationMode(getInput("notification-mode", environment));
  const previousAlertFingerprint = parsePreviousAlertFingerprint(getInput("previous-alert-fingerprint", environment));
  const feedUrlInput = getInput("feed-url", environment);
  const feedFileInput = getInput("feed-file", environment);
  const expectedFeedSha256 = parseExpectedSha256(getInput("expected-feed-sha256", environment));
  if (feedUrlInput) {
    const parsedFeedUrl = parseHttpUrl(feedUrlInput, "feed-url");
    if (new URL(parsedFeedUrl).search !== "")
      maskSecret(parsedFeedUrl, log);
  }
  const slackWebhookInput = getInput("slack-webhook", environment);
  if (slackWebhookInput)
    maskSecret(slackWebhookInput, log);
  const slackWebhook = slackWebhookInput ? parseHttpsUrl(slackWebhookInput, "slack-webhook") : undefined;
  const requestPolicy = defaultRequestPolicy(dependencies.fetch ?? fetch);
  requestPolicy.timeoutMs = timeoutSeconds * 1000;
  requestPolicy.retries = retries;
  if (dependencies.sleep)
    requestPolicy.sleep = dependencies.sleep;
  if (dependencies.random)
    requestPolicy.random = dependencies.random;
  const feedDocument = await loadFeedDocument({
    feedUrl: feedUrlInput,
    feedFile: feedFileInput,
    expectedSha256: expectedFeedSha256,
    defaultFeedUrl: DEFAULT_FEED_URL,
    workspace,
    requestPolicy
  });
  const feed = validateFeed(feedDocument.value);
  assertNoFutureObservations(feed, now);
  assertRequestedProvidersExist(models, feed);
  const contentAge = feedContentAgeDays(feed, now);
  const providerFreshness = relevantProviderFreshness(models, feed, now);
  validateFreshness(maxFeedAgeDays, contentAge, providerFreshness);
  const discovery = discoveryEnabled ? discoverModels(feed, workspace, discoveryPaths, {
    inventory: models,
    excludedPaths: [feedFileInput ?? "", modelsFileInput ?? ""]
  }) : null;
  const matched = matchDeprecations(models, feed, windowDays, now, includeUndated);
  const breaching = breachingFindings(matched.findings, failWithinDays, failOnUndated);
  const unmatchedBreaching = failOnUnmatched ? matched.unmatchedModels : [];
  const breachCount = breaching.length + unmatchedBreaching.length;
  const inventorySha256 = canonicalInventorySha256(models);
  const lifecycleFeedSha256 = canonicalLifecycleFeedSha256(feed);
  const alertFingerprint = stableAlertFingerprint({
    findings: matched.findings,
    breaching,
    unmatchedBreaching
  });
  const auditRecord = buildAuditRecord({
    inventory: models,
    feed,
    rawFeedBytes: feedDocument.bytes,
    findings: matched.findings,
    breaching,
    unmatchedBreaching
  });
  const alertCount = matched.findings.length + unmatchedBreaching.length;
  const notificationDecision = slackWebhook ? decideNotification({
    mode: notificationModeValue,
    previousFingerprint: previousAlertFingerprint,
    currentFingerprint: alertFingerprint,
    alertCount
  }) : { shouldNotify: false, reason: "disabled" };
  let notificationSent = false;
  let notificationReason = notificationDecision.reason;
  let nextAlertFingerprint = notificationDecision.reason === "disabled" ? previousAlertFingerprint ?? "" : alertFingerprint;
  let notificationError = null;
  let notificationFailureMessage = null;
  const discoveryPublication = publishDiscoveredModels(discovery?.models ?? []);
  const untrackedDiscoveredModels = discovery?.models.filter((model) => !model.tracked) ?? [];
  const outputs = {
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
    "discovery-output-truncated": String(discoveryPublication.truncated)
  };
  if (outputCodeUnits(outputs) > MAX_TOTAL_OUTPUT_CODE_UNITS && outputs["discovered-models"] !== "[]") {
    outputs["discovered-models"] = "[]";
    outputs["discovery-output-truncated"] = "true";
    emitCommand("notice", "The combined GitHub outputs exceeded the safe size budget, so detailed discovery results were omitted. Discovery counts remain available in outputs and the job summary.", log);
  }
  if (outputCodeUnits(outputs) > MAX_TOTAL_OUTPUT_CODE_UNITS && matched.findings.some((finding) => finding.context !== undefined)) {
    outputs.findings = JSON.stringify(matched.findings.map(({ context: _context, ...finding }) => finding));
    emitCommand("notice", "The combined GitHub outputs exceeded the safe size budget, so verbose finding context was omitted. Source URLs remain available.", log);
  }
  const totalOutputSize = outputCodeUnits(outputs);
  if (totalOutputSize > MAX_TOTAL_OUTPUT_CODE_UNITS) {
    throw new Error(`The combined outputs are too large for GitHub Actions (${totalOutputSize} UTF-16 code units after omitting optional context where available; safe limit ${MAX_TOTAL_OUTPUT_CODE_UNITS}). Reduce the model inventory.`);
  }
  const breachKeys = new Set(breaching.map(findingKey));
  const maxWarningAnnotations = notificationDecision.shouldNotify && failureMode === "warn" ? MAX_WARNING_ANNOTATIONS - 1 : MAX_WARNING_ANNOTATIONS;
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
    emitCommand(isBreach ? "error" : "warning", renderFindingAnnotation(finding), log);
    if (isBreach)
      errorAnnotations += 1;
    else
      warningAnnotations += 1;
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
    if (location === undefined)
      continue;
    emitAnnotation("warning", renderDiscoveryAnnotation(model), {
      title: "Report-only AI model discovery",
      file: location.path,
      line: location.line,
      col: location.column
    }, log);
    warningAnnotations += 1;
  }
  if (suppressedAnnotations > 0) {
    emitCommand("notice", `${suppressedAnnotations} action annotation(s) were suppressed to stay within GitHub's per-step annotation limits; see the job summary and machine-readable outputs.`, log);
  }
  log(`Checked ${models.length} model declaration(s) against ${feed.length} validated feed entries — ${matched.findings.length} lifecycle finding(s), ${breachCount} policy breach(es).`);
  if (notificationDecision.shouldNotify && slackWebhook) {
    try {
      await postSlack(slackWebhook, notificationDecision.reason === "resolved" ? renderResolvedSlackText() : renderSlackText(matched.findings, { breaching, unmatchedBreaching }), requestPolicy);
      notificationSent = true;
    } catch (error) {
      const message = formatError(error);
      notificationReason = "error";
      nextAlertFingerprint = previousAlertFingerprint ?? "";
      notificationFailureMessage = message;
      if (failureMode === "warn")
        emitCommand("warning", message, log);
      else
        notificationError = new Error(message);
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
      ...discovery === null ? {} : { discovery },
      notification: {
        sent: notificationSent,
        reason: notificationReason,
        ...notificationFailureMessage === null ? {} : { error: notificationFailureMessage }
      }
    };
    appendSummary(environment.GITHUB_STEP_SUMMARY, renderSummary(summaryInput));
  }
  if (breachCount > 0) {
    const dated = breaching.filter((finding) => finding.daysUntilShutdown !== null).length;
    const undated = breaching.length - dated;
    const notificationSuffix = notificationError ? ` Slack notification also failed: ${notificationError.message}` : "";
    throw new PolicyBreachError(`${breachCount} item(s) breached the configured policy (${dated} dated lifecycle, ${undated} undated lifecycle, ${unmatchedBreaching.length} unmatched feed history).${notificationSuffix}`);
  }
  if (notificationError)
    throw new NotificationDeliveryError(notificationError.message);
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
    discovery
  };
}

// src/main.ts
run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  emitCommand("error", message);
  if (!(error instanceof ReportedActionError) && getInput("job-summary", process.env)?.toLowerCase() !== "false") {
    appendSummary(process.env.GITHUB_STEP_SUMMARY, renderFailureSummary(message));
  }
  process.exitCode = 1;
});
