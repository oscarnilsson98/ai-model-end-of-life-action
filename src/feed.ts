import { stableFindingId } from "./digest.ts";
import { normalizeProvider, parseHttpUrl, unicodeCodePointLength } from "./input.ts";
import type {
  DeprecationRecord,
  Finding,
  InputModel,
  MatchResult,
  ProviderFreshness,
} from "./types.ts";

export const DAY_MS = 24 * 60 * 60 * 1_000;
export const MAX_FEED_RECORDS = 100_000;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  field: string,
  index: number,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Feed record ${index} has no non-empty \`${field}\` string.`);
  }
  const normalized = value.trim();
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`Feed record ${index} \`${field}\` exceeds ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER.test(normalized)) {
    throw new Error(`Feed record ${index} \`${field}\` contains control characters.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  index: number,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`Feed record ${index} \`${field}\` must be a string when supplied.`);
  }
  const normalized = value.trim();
  if (normalized === "") return undefined;
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`Feed record ${index} \`${field}\` exceeds ${maxLength} characters.`);
  }
  return normalized;
}

/** Parse a real YYYY-MM-DD date without JavaScript's rollover behavior. */
export function parseDateOnly(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function lifecycleDate(value: unknown, field: string, index: number): string | undefined {
  const normalized = optionalText(value, field, index, 64);
  if (normalized === undefined) return undefined;
  if (parseDateOnly(normalized) === null) {
    throw new Error(`Feed record ${index} \`${field}\` must be a real YYYY-MM-DD date.`);
  }
  return normalized;
}

function observationDate(value: unknown, field: string, index: number): string | undefined {
  const normalized = optionalText(value, field, index, 64);
  if (normalized === undefined) return undefined;
  const isDateOnly = parseDateOnly(normalized) !== null;
  const timestampMatch = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
    normalized,
  );
  const isTimestamp =
    timestampMatch !== null &&
    parseDateOnly(timestampMatch[1] as string) !== null &&
    !Number.isNaN(Date.parse(normalized));
  if (!isDateOnly && !isTimestamp) {
    throw new Error(`Feed record ${index} \`${field}\` must be an ISO date or timestamp.`);
  }
  return normalized;
}

function observationTimestamps(record: DeprecationRecord): number[] {
  return [record.last_observed, record.scraped_at]
    .filter((value): value is string => value !== undefined)
    .map((value) => Date.parse(value));
}

function contentAgeDays(timestamp: number, now: number): number {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function replacements(value: unknown, index: number): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(`Feed record ${index} \`replacement_models\` must be an array or null.`);
  }
  if (value.length > 100) {
    throw new Error(`Feed record ${index} has more than 100 replacement models.`);
  }
  return value.map((replacement, replacementIndex) => {
    if (typeof replacement !== "string" || replacement.trim() === "") {
      throw new Error(
        `Feed record ${index} \`replacement_models[${replacementIndex}]\` must be a non-empty string.`,
      );
    }
    const normalized = replacement.trim();
    if (unicodeCodePointLength(normalized) > 256 || CONTROL_CHARACTER.test(normalized)) {
      throw new Error(
        `Feed record ${index} \`replacement_models[${replacementIndex}]\` is invalid or too long.`,
      );
    }
    return normalized;
  });
}

function sourceUrl(value: unknown, index: number): string | undefined {
  const normalized = optionalText(value, "url", index, 2_048);
  if (normalized === undefined) return undefined;
  const parsed = parseHttpUrl(normalized, `feed record ${index} url`);
  if (parsed.length > 2_048) {
    throw new Error(`Feed record ${index} normalized \`url\` exceeds 2048 characters.`);
  }
  return parsed;
}

function normalizeRecord(value: unknown, index: number): DeprecationRecord {
  if (!isObject(value)) throw new Error(`Feed record ${index} must be an object.`);
  const provider = requiredText(value.provider, "provider", index, 100);
  if (normalizeProvider(provider) === "") {
    throw new Error(
      `Feed record ${index} \`provider\` must contain at least one Unicode letter or number.`,
    );
  }
  const normalized: DeprecationRecord = {
    provider,
    model_id: requiredText(value.model_id, "model_id", index, 256),
  };
  const shutdownDate = lifecycleDate(value.shutdown_date, "shutdown_date", index);
  const deprecationDate = lifecycleDate(value.deprecation_date, "deprecation_date", index);
  const announcementDate = lifecycleDate(value.announcement_date, "announcement_date", index);
  const replacementModels = replacements(value.replacement_models, index);
  const context = optionalText(
    value.deprecation_context,
    "deprecation_context",
    index,
    100_000,
  );
  const url = sourceUrl(value.url, index);
  const firstObserved = observationDate(value.first_observed, "first_observed", index);
  const lastObserved = observationDate(value.last_observed, "last_observed", index);
  const scrapedAt = observationDate(value.scraped_at, "scraped_at", index);
  if (shutdownDate !== undefined) normalized.shutdown_date = shutdownDate;
  if (deprecationDate !== undefined) normalized.deprecation_date = deprecationDate;
  if (announcementDate !== undefined) normalized.announcement_date = announcementDate;
  if (replacementModels !== undefined) normalized.replacement_models = replacementModels;
  if (context !== undefined) normalized.deprecation_context = context;
  if (url !== undefined) normalized.url = url;
  if (firstObserved !== undefined) normalized.first_observed = firstObserved;
  if (lastObserved !== undefined) normalized.last_observed = lastObserved;
  if (scrapedAt !== undefined) normalized.scraped_at = scrapedAt;
  if (
    normalized.shutdown_date === undefined &&
    normalized.deprecation_date === undefined &&
    normalized.announcement_date === undefined
  ) {
    throw new Error(
      `Feed record ${index} has no shutdown_date, deprecation_date, or announcement_date.`,
    );
  }
  return normalized;
}

function normalizeJsonFeedItem(value: unknown, index: number): DeprecationRecord {
  if (!isObject(value)) throw new Error(`JSON Feed item ${index} must be an object.`);
  if (!isObject(value._deprecation)) {
    throw new Error(`JSON Feed item ${index} has no \`_deprecation\` object.`);
  }
  const metadata = value._deprecation;
  return normalizeRecord(
    {
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
      scraped_at: value.date_published,
    },
    index,
  );
}

/** Validate either the raw deprecations array or the documented JSON Feed envelope. */
export function validateFeed(payload: unknown): DeprecationRecord[] {
  let records: unknown[];
  let normalizer: (value: unknown, index: number) => DeprecationRecord;
  if (Array.isArray(payload)) {
    records = payload;
    normalizer = normalizeRecord;
  } else if (isObject(payload) && Array.isArray(payload.items)) {
    records = payload.items;
    normalizer = normalizeJsonFeedItem;
  } else {
    throw new Error("Deprecations feed must be a raw JSON array or a JSON Feed object with an `items` array.");
  }
  if (records.length === 0) throw new Error("Deprecations feed contains no records.");
  if (records.length > MAX_FEED_RECORDS) {
    throw new Error(`Deprecations feed has ${records.length} records; the limit is ${MAX_FEED_RECORDS}.`);
  }
  const normalized = records.map(normalizer);
  const unique: DeprecationRecord[] = [];
  const identities = new Map<string, string>();
  for (const record of normalized) {
    const identity = `${normalizeProvider(record.provider)}\u0000${record.model_id}\u0000${record.shutdown_date ?? "unknown"}`;
    const serialized = JSON.stringify(record);
    const previous = identities.get(identity);
    if (previous === serialized) continue;
    if (previous !== undefined) {
      throw new Error(
        `Deprecations feed has conflicting duplicate records for ${record.provider}/${record.model_id}/${record.shutdown_date ?? "date-unknown"}.`,
      );
    }
    identities.set(identity, serialized);
    unique.push(record);
  }
  return unique;
}

function utcEpochDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS;
}

/** Calendar days until a date-only provider deadline; the shutdown day is zero. */
export function calendarDaysUntil(date: string, now: number): number {
  const target = parseDateOnly(date);
  if (target === null) throw new Error(`Invalid shutdown date: ${date}`);
  return target / DAY_MS - utcEpochDay(now);
}

/** Age in whole elapsed days of the freshest observed feed content. */
export function feedContentAgeDays(feed: DeprecationRecord[], now: number): number | null {
  let newestTimestamp: number | null = null;
  for (const record of feed) {
    for (const timestamp of observationTimestamps(record)) {
      newestTimestamp = Math.max(timestamp, newestTimestamp ?? -Infinity);
    }
  }
  return newestTimestamp === null ? null : contentAgeDays(newestTimestamp, now);
}

export function assertNoFutureObservations(
  feed: DeprecationRecord[],
  now: number,
  allowedClockSkewMs = DAY_MS,
): void {
  for (const record of feed) {
    for (const [field, value] of [
      ["first_observed", record.first_observed],
      ["last_observed", record.last_observed],
      ["scraped_at", record.scraped_at],
    ] as const) {
      if (value !== undefined && Date.parse(value) > now + allowedClockSkewMs) {
        throw new Error(
          `Feed record ${record.provider}/${record.model_id} has a future ${field} timestamp: ${value}.`,
        );
      }
    }
  }
}

export function relevantProviderFreshness(
  models: InputModel[],
  feed: DeprecationRecord[],
  now: number,
): ProviderFreshness[] {
  const requested = new Map<string, string>();
  for (const model of models) {
    if (model.provider) requested.set(normalizeProvider(model.provider), model.provider);
  }
  const newestByProvider = new Map<string, number>();
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
      newestTimestamp,
    };
  });
}

export function assertRequestedProvidersExist(
  models: InputModel[],
  feed: DeprecationRecord[],
): void {
  const available = new Map<string, string>();
  for (const record of feed) available.set(normalizeProvider(record.provider), record.provider);
  const missing = [
    ...new Set(
      models
        .filter((model): model is InputModel & { provider: string } => model.provider !== undefined)
        .filter((model) => !available.has(normalizeProvider(model.provider)))
        .map((model) => model.provider),
    ),
  ];
  if (missing.length > 0) {
    const availableProviders = [...new Set(available.values())].sort(compareText);
    const shownMissing = missing.slice(0, 20);
    const shownAvailable = availableProviders.slice(0, 20);
    throw new Error(
      `Provider(s) not present in the feed: ${shownMissing.join(", ")}${missing.length > shownMissing.length ? `, … +${missing.length - shownMissing.length} more` : ""}. Available serving platforms: ${shownAvailable.join(", ")}${availableProviders.length > shownAvailable.length ? `, … +${availableProviders.length - shownAvailable.length} more` : ""}.`,
    );
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function findingKey(finding: Finding): string {
  return finding.findingId;
}

/** Match exact model IDs and canonical serving-platform aliases, with unique deterministic findings. */
export function matchDeprecations(
  models: InputModel[],
  feed: DeprecationRecord[],
  windowDays: number,
  now: number,
  includeUndated = true,
): MatchResult {
  const byModel = new Map<
    string,
    { all: DeprecationRecord[]; byProvider: Map<string, DeprecationRecord[]> }
  >();
  for (const record of feed) {
    let indexed = byModel.get(record.model_id);
    if (!indexed) {
      indexed = { all: [], byProvider: new Map() };
      byModel.set(record.model_id, indexed);
    }
    indexed.all.push(record);
    const provider = normalizeProvider(record.provider);
    const providerRecords = indexed.byProvider.get(provider);
    if (providerRecords) providerRecords.push(record);
    else indexed.byProvider.set(provider, [record]);
  }

  const findings = new Map<string, Finding>();
  const unmatchedModels: InputModel[] = [];
  let matchedModelCount = 0;
  for (const model of models) {
    const wantedProvider = model.provider ? normalizeProvider(model.provider) : null;
    const indexed = byModel.get(model.id);
    const candidates =
      wantedProvider === null
        ? (indexed?.all ?? [])
        : (indexed?.byProvider.get(wantedProvider) ?? []);
    if (candidates.length === 0) {
      unmatchedModels.push(model);
      continue;
    }
    matchedModelCount += 1;

    for (const record of candidates) {
      const daysUntilShutdown = record.shutdown_date
        ? calendarDaysUntil(record.shutdown_date, now)
        : null;
      if (daysUntilShutdown === null && !includeUndated) continue;
      if (daysUntilShutdown !== null && daysUntilShutdown > windowDays) continue;
      const identity = {
        id: model.id,
        provider: record.provider,
        shutdownDate: record.shutdown_date ?? null,
      };
      const finding: Finding = {
        findingId: stableFindingId(identity),
        ...identity,
        status:
          daysUntilShutdown === null
            ? "date-unknown"
            : daysUntilShutdown < 0
              ? "shutdown-passed"
              : "scheduled",
        daysUntilShutdown,
        replacementModels: record.replacement_models ?? [],
      };
      if (record.deprecation_date !== undefined) {
        finding.deprecationDate = record.deprecation_date;
      }
      if (record.announcement_date !== undefined) {
        finding.announcementDate = record.announcement_date;
      }
      if (record.url !== undefined) finding.url = record.url;
      if (record.deprecation_context !== undefined) finding.context = record.deprecation_context;
      findings.set(findingKey(finding), finding);
    }
  }

  const sorted = [...findings.values()].sort((left, right) => {
    if (left.daysUntilShutdown === null && right.daysUntilShutdown !== null) return 1;
    if (left.daysUntilShutdown !== null && right.daysUntilShutdown === null) return -1;
    const byDays = (left.daysUntilShutdown ?? 0) - (right.daysUntilShutdown ?? 0);
    if (byDays !== 0) return byDays;
    const byProvider = compareText(left.provider, right.provider);
    return byProvider !== 0 ? byProvider : compareText(left.id, right.id);
  });
  return { findings: sorted, matchedModelCount, unmatchedModels };
}

export function breachingFindings(
  findings: Finding[],
  failWithinDays: number | null,
  failOnUndated = false,
): Finding[] {
  return findings.filter((finding) => {
    if (finding.daysUntilShutdown === null) return failOnUndated;
    return failWithinDays !== null && finding.daysUntilShutdown <= failWithinDays;
  });
}
