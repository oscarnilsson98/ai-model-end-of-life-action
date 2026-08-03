import { createHash } from "node:crypto";
import { decodeJsonDocument } from "../shared/document.ts";
import { REVIEWED_LEGACY_SOURCE_PAIRS } from "./legacy-feed-pairs.ts";
import {
  V3_FEED_LIMITS,
  isDateOnly,
  isRfc3339UtcInstant,
  loadAdaptedV3Feed,
  loadV3FeedJson,
  platformForSourceProvider,
  type FeedEnvelope,
  type FeedPairSetDiagnostic,
  type FeedRecord,
  type LoadedV3Feed,
  type NonModelRecordKind,
} from "./feed.ts";

const MAX_LEGACY_RECORDS = 100_000;
const MAX_PAIR_DIAGNOSTIC_PREVIEWS = 50;
const MAX_DEPRECATION_CONTEXT_CODE_POINTS = 16_384;
const MAX_CONTENT_HASH_CODE_POINTS = 256;
/** RFC 3339-style instant that carries a mandatory explicit "Z" or numeric UTC offset. */
const EXPLICIT_OFFSET_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?(Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;
/** Reject scraped_at values further ahead of the runtime clock than this skew allowance. */
const MAX_FUTURE_SCRAPED_AT_SKEW_MS = 24 * 60 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const NON_MODEL_RECORD_KINDS: ReadonlySet<NonModelRecordKind> = new Set([
  "api",
  "sdk",
  "feature",
  "tool",
  "product",
  "prompt",
  "agent",
  "other",
]);
const LEGACY_FIELDS = new Set([
  "provider",
  "model_id",
  "shutdown_date",
  "deprecation_date",
  "announcement_date",
  "replacement_models",
  "deprecation_context",
  "url",
  "content_hash",
  "scraped_at",
  "first_observed",
  "last_observed",
]);

export type LegacyNonModelClassification = {
  provider: string;
  resourceId: string;
  recordKind: NonModelRecordKind;
};

export type LegacyFeedAdapterManifest = {
  id: string;
  version: string;
  reviewedPairs: readonly (readonly [provider: string, identifier: string])[];
  reviewedPairCount: number;
  reviewedPairsSha256: string;
  nonModels: readonly LegacyNonModelClassification[];
  lexicalIneligiblePairs: readonly (readonly [provider: string, modelId: string])[];
  dateCorrections: {
    announcementAfterLifecycle: "reject" | "omit-source-observation-date";
    deprecationAfterShutdown: "reject" | "omit-inverted-source-date";
  };
};

/**
 * Reviewed against the complete deprecations.info source-pair set observed on 2026-07-31.
 * The exact registry lets the adapter distinguish additions from removals. Either
 * change is quarantined as partial coverage; unreviewed rows never become records.
 */
export const DEFAULT_LEGACY_ADAPTER_MANIFEST: LegacyFeedAdapterManifest = Object.freeze({
  id: "deprecations-info-v1-reviewed-adapter",
  version: "2026-08-02.1+6317cee249b2",
  reviewedPairs: REVIEWED_LEGACY_SOURCE_PAIRS,
  reviewedPairCount: 416,
  reviewedPairsSha256: "6317cee249b2bf90918c816c842ecf7c1212eaddf9f05842b11babb2d60ac695",
  nonModels: Object.freeze([
    Object.freeze({ provider: "OpenAI", resourceId: "Reusable prompts", recordKind: "prompt" }),
    Object.freeze({ provider: "OpenAI", resourceId: "Evals platform", recordKind: "product" }),
    Object.freeze({ provider: "OpenAI", resourceId: "Agent Builder", recordKind: "agent" }),
  ]),
  lexicalIneligiblePairs: Object.freeze([
    Object.freeze(["OpenAI", "ada"] as const),
    Object.freeze(["OpenAI", "babbage"] as const),
    Object.freeze(["OpenAI", "curie"] as const),
    Object.freeze(["OpenAI", "davinci"] as const),
    Object.freeze(["OpenAI", "o1"] as const),
    Object.freeze(["Azure", "o1"] as const),
    Object.freeze(["Azure", "o3"] as const),
    Object.freeze(["Azure", "tts"] as const),
    Object.freeze(["Azure", "whisper"] as const),
    Object.freeze(["Cohere", "command"] as const),
  ]),
  dateCorrections: Object.freeze({
    // The legacy source uses announcement_date as a scraper observation date for many records.
    announcementAfterLifecycle: "omit-source-observation-date",
    // A bounded set of legacy source rows reports retrospective deprecation after shutdown.
    deprecationAfterShutdown: "omit-inverted-source-date",
  }),
});

type LegacyRecord = {
  provider: string;
  modelId: string;
  shutdownDate?: string;
  deprecationDate?: string;
  announcementDate?: string;
  replacements: string[];
  url: string;
  scrapedAt?: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pairIdentity(provider: string, identifier: string): string {
  return JSON.stringify([provider, identifier]);
}

export function legacyPairSetSha256(
  pairs: readonly (readonly [provider: string, identifier: string])[],
): string {
  return sha256(
    JSON.stringify(
      [...pairs].sort((left, right) =>
        compareText(JSON.stringify(left), JSON.stringify(right)),
      ),
    ),
  );
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 100_000): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is too long or contains control characters.`);
  }
  return value;
}

function deprecationContext(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  if ([...value].length > MAX_DEPRECATION_CONTEXT_CODE_POINTS) {
    throw new Error(
      `${label} must contain at most ${MAX_DEPRECATION_CONTEXT_CODE_POINTS} Unicode code points.`,
    );
  }
  // The live source contains multi-line prose. Preserve that shape while rejecting
  // controls that cannot be meaningful context text.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return value;
}

function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = text(value, label, 10);
  if (!isDateOnly(result)) throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  return result;
}

function optionalStrictDate(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  const result = text(value, label, 10);
  if (!isDateOnly(result)) throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  return result;
}

function parseExplicitOffsetTimestamp(value: unknown, label: string): {
  epochMs: number;
  utc: string;
} {
  const candidate = text(value, label, 128);
  const match = EXPLICIT_OFFSET_TIMESTAMP_PATTERN.exec(candidate);
  if (match === null || !isDateOnly(`${match[1]}-${match[2]}-${match[3]}`)) {
    throw new Error(
      `${label} must be a real RFC 3339 timestamp with an explicit "Z" or numeric UTC offset.`,
    );
  }
  const zone = match[8] as string;
  const offsetSign = match[9];
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  if (zone === "-00:00") {
    throw new Error(`${label} must identify a known UTC offset; -00:00 is not accepted.`);
  }

  const local = new Date(0);
  local.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  local.setUTCHours(
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number((match[7] ?? "").slice(0, 3).padEnd(3, "0")),
  );
  const signedOffsetMinutes =
    zone === "Z"
      ? 0
      : (offsetSign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  const epochMs = local.getTime() - signedOffsetMinutes * 60_000;
  const utc = new Date(epochMs).toISOString();
  if (!isRfc3339UtcInstant(utc)) {
    throw new Error(`${label} normalizes outside the supported four-digit UTC year range.`);
  }
  return { epochMs, utc };
}

function validateManifestClassifications(
  manifest: LegacyFeedAdapterManifest,
): {
  reviewedPairs: readonly (readonly [provider: string, identifier: string])[];
  reviewedPairIdentities: ReadonlySet<string>;
  nonModels: ReadonlyMap<string, LegacyNonModelClassification>;
  lexicalIneligible: ReadonlySet<string>;
} {
  text(manifest.id, "Legacy adapter manifest id", V3_FEED_LIMITS.maxAdapterIdCodePoints);
  text(
    manifest.version,
    "Legacy adapter manifest version",
    V3_FEED_LIMITS.maxAdapterVersionCodePoints,
  );
  if (
    !Number.isSafeInteger(manifest.reviewedPairCount) ||
    manifest.reviewedPairCount < 1 ||
    manifest.reviewedPairCount > MAX_LEGACY_RECORDS
  ) {
    throw new Error(
      `Legacy adapter manifest reviewedPairCount must be an integer from 1 to ${MAX_LEGACY_RECORDS}.`,
    );
  }
  if (!SHA256_PATTERN.test(manifest.reviewedPairsSha256)) {
    throw new Error("Legacy adapter manifest reviewedPairsSha256 must be lower-case SHA-256 hex.");
  }
  if (
    manifest.dateCorrections?.announcementAfterLifecycle !== "reject" &&
    manifest.dateCorrections?.announcementAfterLifecycle !== "omit-source-observation-date"
  ) {
    throw new Error("Legacy adapter manifest has an invalid announcement-date correction policy.");
  }
  if (
    manifest.dateCorrections?.deprecationAfterShutdown !== "reject" &&
    manifest.dateCorrections?.deprecationAfterShutdown !== "omit-inverted-source-date"
  ) {
    throw new Error("Legacy adapter manifest has an invalid deprecation-date correction policy.");
  }
  if (
    !Array.isArray(manifest.reviewedPairs) ||
    !Array.isArray(manifest.nonModels) ||
    !Array.isArray(manifest.lexicalIneligiblePairs)
  ) {
    throw new Error("Legacy adapter manifest classifications must be arrays.");
  }

  const reviewedPairs = manifest.reviewedPairs.map((rawPair, index) => {
    if (!Array.isArray(rawPair) || rawPair.length !== 2) {
      throw new Error(
        `Legacy adapter manifest reviewedPairs[${index}] must be a provider/identifier pair.`,
      );
    }
    const provider = text(
      rawPair[0],
      `Legacy adapter manifest reviewedPairs[${index}][0]`,
      100,
    );
    if (platformForSourceProvider(provider) === null) {
      throw new Error(
        `Legacy adapter manifest reviewedPairs[${index}] uses an unregistered source provider.`,
      );
    }
    const identifier = text(
      rawPair[1],
      `Legacy adapter manifest reviewedPairs[${index}][1]`,
      V3_FEED_LIMITS.maxIdentifierCodePoints,
    );
    return [provider, identifier] as const;
  });
  const reviewedPairIdentities = new Set(
    reviewedPairs.map(([provider, identifier]) => pairIdentity(provider, identifier)),
  );
  if (reviewedPairIdentities.size !== reviewedPairs.length) {
    throw new Error("Legacy adapter manifest reviewedPairs contains duplicates.");
  }
  if (
    reviewedPairs.length !== manifest.reviewedPairCount ||
    legacyPairSetSha256(reviewedPairs) !== manifest.reviewedPairsSha256
  ) {
    throw new Error(
      "Legacy adapter manifest reviewedPairs does not match its pinned count and digest.",
    );
  }

  const nonModels = new Map<string, LegacyNonModelClassification>();
  for (const [index, rawEntry] of manifest.nonModels.entries()) {
    const entry = object(rawEntry, `Legacy adapter manifest nonModels[${index}]`);
    const provider = text(
      entry.provider,
      `Legacy adapter manifest nonModels[${index}].provider`,
      100,
    );
    const resourceId = text(
      entry.resourceId,
      `Legacy adapter manifest nonModels[${index}].resourceId`,
      V3_FEED_LIMITS.maxIdentifierCodePoints,
    );
    const recordKind = entry.recordKind;
    if (typeof recordKind !== "string" || !NON_MODEL_RECORD_KINDS.has(recordKind as NonModelRecordKind)) {
      throw new Error(
        `Legacy adapter manifest nonModels[${index}].recordKind must be a supported non-model kind.`,
      );
    }
    const identity = pairIdentity(provider, resourceId);
    if (!reviewedPairIdentities.has(identity)) {
      throw new Error(
        `Legacy adapter manifest classifies absent source pair ${provider}/${resourceId}.`,
      );
    }
    if (nonModels.has(identity)) {
      throw new Error(
        `Legacy adapter manifest duplicates non-model source pair ${provider}/${resourceId}.`,
      );
    }
    nonModels.set(identity, { provider, resourceId, recordKind: recordKind as NonModelRecordKind });
  }

  const lexicalIneligible = new Set<string>();
  for (const [index, rawPair] of manifest.lexicalIneligiblePairs.entries()) {
    if (!Array.isArray(rawPair) || rawPair.length !== 2) {
      throw new Error(
        `Legacy adapter manifest lexicalIneligiblePairs[${index}] must be a provider/model pair.`,
      );
    }
    const provider = text(
      rawPair[0],
      `Legacy adapter manifest lexicalIneligiblePairs[${index}][0]`,
      100,
    );
    const modelId = text(
      rawPair[1],
      `Legacy adapter manifest lexicalIneligiblePairs[${index}][1]`,
      V3_FEED_LIMITS.maxIdentifierCodePoints,
    );
    const identity = pairIdentity(provider, modelId);
    if (!reviewedPairIdentities.has(identity)) {
      throw new Error(
        `Legacy adapter manifest marks absent source pair ${provider}/${modelId} as lexical-ineligible.`,
      );
    }
    if (nonModels.has(identity)) {
      throw new Error(
        `Legacy adapter manifest redundantly marks non-model source pair ${provider}/${modelId} as lexical-ineligible.`,
      );
    }
    if (lexicalIneligible.has(identity)) {
      throw new Error(
        `Legacy adapter manifest duplicates lexical-ineligible source pair ${provider}/${modelId}.`,
      );
    }
    lexicalIneligible.add(identity);
  }

  return { reviewedPairs, reviewedPairIdentities, nonModels, lexicalIneligible };
}

function parseLegacyRecord(value: unknown, index: number, now: number): LegacyRecord {
  const label = `Legacy feed record ${index}`;
  const source = object(value, label);
  const unknown = Object.keys(source).filter((key) => !LEGACY_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unreviewed field(s): ${unknown.sort().join(", ")}.`);
  }
  const provider = text(source.provider, `${label}.provider`, 100);
  if (platformForSourceProvider(provider) === null) {
    throw new Error(`${label}.provider is not present in the reviewed platform mapping.`);
  }
  const modelId = text(source.model_id, `${label}.model_id`, 2_048);
  const shutdownDate = optionalDate(source.shutdown_date, `${label}.shutdown_date`);
  const deprecationDate = optionalDate(source.deprecation_date, `${label}.deprecation_date`);
  const announcementDate = optionalDate(source.announcement_date, `${label}.announcement_date`);
  if (shutdownDate === undefined && deprecationDate === undefined) {
    throw new Error(`${label} has neither a shutdown nor deprecation date.`);
  }
  let replacements: string[] = [];
  if (source.replacement_models !== undefined && source.replacement_models !== null) {
    if (!Array.isArray(source.replacement_models) || source.replacement_models.length > 100) {
      throw new Error(`${label}.replacement_models must be an array of at most 100 strings.`);
    }
    replacements = source.replacement_models.map((entry, replacementIndex) =>
      text(entry, `${label}.replacement_models[${replacementIndex}]`, 2_048),
    );
  }
  if (source.deprecation_context !== undefined) {
    deprecationContext(source.deprecation_context, `${label}.deprecation_context`);
  }
  if (source.content_hash !== undefined) {
    text(source.content_hash, `${label}.content_hash`, MAX_CONTENT_HASH_CODE_POINTS);
  }
  const firstObserved = optionalStrictDate(
    source.first_observed,
    `${label}.first_observed`,
  );
  const lastObserved = optionalStrictDate(
    source.last_observed,
    `${label}.last_observed`,
  );
  if (
    firstObserved !== undefined &&
    lastObserved !== undefined &&
    firstObserved > lastObserved
  ) {
    throw new Error(`${label}.first_observed must be on or before ${label}.last_observed.`);
  }
  const url = text(source.url, `${label}.url`, 2_048);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${label}.url must be an absolute HTTP(S) URL.`);
  }
  if (
    (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") ||
    parsedUrl.hostname === ""
  ) {
    throw new Error(`${label}.url must be an absolute HTTP(S) URL.`);
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new Error(`${label}.url must not contain credentials.`);
  }
  let scrapedAt: string | undefined;
  if (source.scraped_at !== undefined && source.scraped_at !== null && source.scraped_at !== "") {
    const parsed = parseExplicitOffsetTimestamp(source.scraped_at, `${label}.scraped_at`);
    if (parsed.epochMs > now + MAX_FUTURE_SCRAPED_AT_SKEW_MS) {
      throw new Error(`${label}.scraped_at is further ahead of the runtime clock than one day.`);
    }
    scrapedAt = parsed.utc;
  }
  return {
    provider,
    modelId,
    replacements,
    url,
    ...(shutdownDate === undefined ? {} : { shutdownDate }),
    ...(deprecationDate === undefined ? {} : { deprecationDate }),
    ...(announcementDate === undefined ? {} : { announcementDate }),
    ...(scrapedAt === undefined ? {} : { scrapedAt }),
  };
}

function normalizeDates(
  record: LegacyRecord,
  manifest: LegacyFeedAdapterManifest,
): {
  announcementDate?: string;
  deprecationDate?: string;
  shutdownDate?: string;
} {
  const shutdownDate = record.shutdownDate;
  let deprecationDate = record.deprecationDate;
  if (
    deprecationDate !== undefined &&
    shutdownDate !== undefined &&
    deprecationDate > shutdownDate
  ) {
    if (manifest.dateCorrections.deprecationAfterShutdown === "reject") {
      throw new Error(
        `Legacy feed record ${record.provider}/${record.modelId} has deprecation_date after shutdown_date.`,
      );
    }
    deprecationDate = undefined;
  }
  const firstLifecycleDate = deprecationDate ?? shutdownDate;
  let announcementDate = record.announcementDate;
  if (
    announcementDate !== undefined &&
    firstLifecycleDate !== undefined &&
    announcementDate > firstLifecycleDate
  ) {
    if (manifest.dateCorrections.announcementAfterLifecycle === "reject") {
      throw new Error(
        `Legacy feed record ${record.provider}/${record.modelId} has announcement_date after its lifecycle date.`,
      );
    }
    announcementDate = undefined;
  }
  return {
    ...(announcementDate === undefined ? {} : { announcementDate }),
    ...(deprecationDate === undefined ? {} : { deprecationDate }),
    ...(shutdownDate === undefined ? {} : { shutdownDate }),
  };
}

function legacyRecordId(record: LegacyRecord): string {
  return `legacy-${sha256(
    JSON.stringify([
      record.provider,
      record.modelId,
      record.url,
      record.announcementDate ?? null,
      record.deprecationDate ?? null,
      record.shutdownDate ?? null,
    ]),
  )}`;
}

function adaptDecodedLegacyFeed(
  payload: unknown,
  sourceBytes: Uint8Array,
  manifest: LegacyFeedAdapterManifest = DEFAULT_LEGACY_ADAPTER_MANIFEST,
  now: number = Date.now(),
): { envelope: FeedEnvelope; diagnostics: readonly FeedPairSetDiagnostic[] } {
  if (!Number.isFinite(now)) throw new Error("Legacy feed evaluation time must be finite.");
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > MAX_LEGACY_RECORDS) {
    throw new Error(`Legacy feed must be a non-empty array of at most ${MAX_LEGACY_RECORDS} records.`);
  }
  const records = payload.map((value, index) => parseLegacyRecord(value, index, now));
  const pairs = records.map((record) => [record.provider, record.modelId] as const);
  const receivedPairIdentities = new Set(
    pairs.map(([provider, identifier]) => pairIdentity(provider, identifier)),
  );
  if (receivedPairIdentities.size !== records.length) {
    throw new Error("Legacy feed contains duplicate source provider/identifier pairs.");
  }
  const classifications = validateManifestClassifications(manifest);
  const addedPairs = pairs
    .filter(
      ([provider, identifier]) =>
        !classifications.reviewedPairIdentities.has(pairIdentity(provider, identifier)),
    )
    .sort((left, right) => compareText(pairIdentity(...left), pairIdentity(...right)));
  const removedPairs = classifications.reviewedPairs
    .filter(
      ([provider, identifier]) =>
        !receivedPairIdentities.has(pairIdentity(provider, identifier)),
    )
    .sort((left, right) => compareText(pairIdentity(...left), pairIdentity(...right)));
  const diagnostics: FeedPairSetDiagnostic[] =
    addedPairs.length === 0 && removedPairs.length === 0
      ? []
      : [
          {
            kind: "feed-pair-set-change",
            addedPairCount: addedPairs.length,
            removedPairCount: removedPairs.length,
            addedPairs: addedPairs.slice(0, MAX_PAIR_DIAGNOSTIC_PREVIEWS),
            removedPairs: removedPairs.slice(0, MAX_PAIR_DIAGNOSTIC_PREVIEWS),
          },
        ];
  // Quarantined rows still pass every record-level semantic check. Pair-set drift
  // changes authority, not the requirement that the source document be well formed.
  for (const record of records) normalizeDates(record, manifest);
  const reviewedRecords = records.filter((record) =>
    classifications.reviewedPairIdentities.has(
      pairIdentity(record.provider, record.modelId),
    ),
  );
  if (reviewedRecords.length === 0) {
    throw new Error("Legacy feed contains no reviewed records after pair-set quarantine.");
  }
  const generatedAt = reviewedRecords
    .map((record) => record.scrapedAt)
    .filter((value): value is string => value !== undefined)
    .sort(compareText)
    .at(-1);
  if (generatedAt === undefined) {
    throw new Error("Legacy feed has no reviewed scraped_at timestamp for generatedAt.");
  }
  const generatedDate = generatedAt.slice(0, 10);
  const adaptedRecords: FeedRecord[] = reviewedRecords.map((record): FeedRecord => {
    const servingPlatform = platformForSourceProvider(record.provider);
    if (servingPlatform === null) {
      throw new Error(`Unmapped source provider ${record.provider}.`);
    }
    const common = {
      recordId: legacyRecordId(record),
      servingPlatform,
      primarySourceUrl: record.url,
      supersedesRecordIds: [],
    } as const;
    const nonModel = classifications.nonModels.get(
      pairIdentity(record.provider, record.modelId),
    );
    if (nonModel !== undefined) {
      return {
        ...common,
        recordKind: nonModel.recordKind,
        resourceId: record.modelId,
        displayName: record.modelId,
        literalScanEligible: false,
      };
    }
    const dates = normalizeDates(record, manifest);
    const lifecycleStatus =
      dates.shutdownDate === undefined
        ? "deprecated"
        : dates.shutdownDate > generatedDate
          ? "shutdown-scheduled"
          : "retired";
    return {
      ...common,
      recordKind: "model",
      modelId: record.modelId,
      literalScanEligible: !classifications.lexicalIneligible.has(
        pairIdentity(record.provider, record.modelId),
      ),
      lifecycleStatus,
      ...dates,
      replacementModels: record.replacements.map((modelId) => ({
        modelId,
        servingPlatform,
      })),
    };
  });
  return {
    envelope: {
      schemaVersion: 3,
      adapter: {
        id: manifest.id,
        version: manifest.version,
        sourceSha256: sha256(sourceBytes),
      },
      generatedAt,
      records: adaptedRecords,
    },
    diagnostics,
  };
}

/**
 * Adapt one exact legacy source document. Parsing and source hashing intentionally
 * share the same byte array so callers cannot stamp an envelope with unrelated bytes.
 */
export function adaptLegacyFeed(
  sourceBytes: Uint8Array,
  manifest: LegacyFeedAdapterManifest = DEFAULT_LEGACY_ADAPTER_MANIFEST,
  now: number = Date.now(),
): { envelope: FeedEnvelope; diagnostics: readonly FeedPairSetDiagnostic[] } {
  if (sourceBytes.byteLength > V3_FEED_LIMITS.maxDocumentBytes) {
    throw new Error(
      `Legacy feed document exceeds ${V3_FEED_LIMITS.maxDocumentBytes} bytes.`,
    );
  }
  const payload = decodeJsonDocument(sourceBytes, "Lifecycle feed").value;
  return adaptDecodedLegacyFeed(payload, sourceBytes, manifest, now);
}

export function loadTypedOrReviewedLegacyFeed(
  sourceBytes: Uint8Array,
  now: number = Date.now(),
): LoadedV3Feed {
  if (sourceBytes.byteLength > V3_FEED_LIMITS.maxDocumentBytes) {
    throw new Error(
      `Lifecycle feed document exceeds ${V3_FEED_LIMITS.maxDocumentBytes} bytes.`,
    );
  }
  const payload = decodeJsonDocument(sourceBytes, "Lifecycle feed").value;
  if (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { schemaVersion?: unknown }).schemaVersion === 3
  ) {
    return loadV3FeedJson(sourceBytes, {
      expectedAdapter: { id: "deprecations-info-v3", version: "1" },
    });
  }
  const adaptation = adaptDecodedLegacyFeed(
    payload,
    sourceBytes,
    DEFAULT_LEGACY_ADAPTER_MANIFEST,
    now,
  );
  return loadAdaptedV3Feed(
    sourceBytes,
    adaptation.envelope,
    DEFAULT_LEGACY_ADAPTER_MANIFEST,
    adaptation.diagnostics,
  );
}
