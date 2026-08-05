import { createHash } from "node:crypto";

/** Runtime limits mirrored by the v3 feed schema. */
export const V3_FEED_LIMITS = Object.freeze({
  maxDocumentBytes: 32 * 1024 * 1024,
  maxRecords: 100_000,
  maxAdapterIdCodePoints: 128,
  maxAdapterVersionCodePoints: 64,
  maxRecordIdCodePoints: 256,
  maxIdentifierCodePoints: 2_048,
  maxDisplayNameCodePoints: 512,
  maxUrlCodePoints: 2_048,
  maxSupersededRecordsPerRecord: 1_000,
  maxReplacementModelsPerRecord: 100,
});

export const CANONICAL_PLATFORM_SLUGS = Object.freeze([
  "openai",
  "azure",
  "anthropic",
  "aws-bedrock",
  "google",
  "google-vertex",
  "cohere",
  "groq",
  "xai",
] as const);

export type CanonicalPlatformSlug = (typeof CANONICAL_PLATFORM_SLUGS)[number];
export type PlatformSlug = string;

export const CANONICAL_PLATFORM_REGISTRY: Readonly<
  Record<CanonicalPlatformSlug, { readonly displayName: string }>
> = Object.freeze({
  openai: Object.freeze({ displayName: "OpenAI API" }),
  azure: Object.freeze({ displayName: "Azure OpenAI / Azure AI Foundry" }),
  anthropic: Object.freeze({ displayName: "Anthropic API" }),
  "aws-bedrock": Object.freeze({ displayName: "Amazon Bedrock" }),
  google: Object.freeze({ displayName: "Google Gemini API / Google AI Studio" }),
  "google-vertex": Object.freeze({ displayName: "Google Vertex AI" }),
  cohere: Object.freeze({ displayName: "Cohere API" }),
  groq: Object.freeze({ displayName: "Groq API" }),
  xai: Object.freeze({ displayName: "xAI API" }),
});

/** Complete, case-sensitive mapping owned by the reviewed public-feed adapter. */
export const SOURCE_PROVIDER_PLATFORM_MAPPING: Readonly<
  Record<string, CanonicalPlatformSlug>
> = Object.freeze({
  OpenAI: "openai",
  Azure: "azure",
  Anthropic: "anthropic",
  "AWS Bedrock": "aws-bedrock",
  Google: "google",
  "Google Vertex": "google-vertex",
  Cohere: "cohere",
  Groq: "groq",
  xAI: "xai",
});

export type ProviderLifecycleAlias = {
  readonly servingPlatform: CanonicalPlatformSlug;
  readonly fromModelId: string;
  readonly toModelId: string;
  readonly providerProvenanceUrl: string;
};

/** V3.0 deliberately has no provider lifecycle aliases; every blocking join is exact. */
export const PROVIDER_LIFECYCLE_ALIAS_REGISTRY: {
  readonly version: "3.0.0";
  readonly aliases: readonly ProviderLifecycleAlias[];
} = Object.freeze({
  version: "3.0.0",
  aliases: Object.freeze([]),
});

const CANONICAL_PLATFORM_SET: ReadonlySet<string> = new Set(CANONICAL_PLATFORM_SLUGS);
const PLATFORM_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const RFC3339_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const NON_MODEL_RECORD_KINDS = [
  "api",
  "sdk",
  "feature",
  "tool",
  "product",
  "prompt",
  "agent",
  "other",
] as const;

const NON_MODEL_RECORD_KIND_SET: ReadonlySet<string> = new Set(NON_MODEL_RECORD_KINDS);

/** Stable bundled semantics used when consuming an already-typed v3 feed. */
export const V3_TYPED_FEED_RUNTIME_MANIFEST = Object.freeze({
  schemaVersion: 3,
  canonicalPlatforms: Object.freeze(
    CANONICAL_PLATFORM_SLUGS.map((slug) =>
      Object.freeze({ slug, displayName: CANONICAL_PLATFORM_REGISTRY[slug].displayName }),
    ),
  ),
  sourceProviderPlatformMapping: Object.freeze(
    Object.entries(SOURCE_PROVIDER_PLATFORM_MAPPING)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([provider, platform]) => Object.freeze([provider, platform] as const)),
  ),
  nonModelRecordKinds: Object.freeze([...NON_MODEL_RECORD_KINDS]),
  providerLifecycleAliasRegistry: PROVIDER_LIFECYCLE_ALIAS_REGISTRY,
});

export type NonModelRecordKind = (typeof NON_MODEL_RECORD_KINDS)[number];
export type ModelLifecycleStatus = "deprecated" | "shutdown-scheduled" | "retired";

export type FeedAdapter = {
  readonly id: string;
  readonly version: string;
  readonly sourceSha256: string;
};

export type RecordCommon = {
  readonly recordId: string;
  readonly servingPlatform: PlatformSlug;
  readonly primarySourceUrl: string;
  readonly supersedesRecordIds: readonly string[];
};

export type ReplacementModel = {
  readonly modelId: string;
  readonly servingPlatform?: PlatformSlug;
};

export type ModelLifecycleRecord = RecordCommon & {
  readonly recordKind: "model";
  readonly modelId: string;
  readonly literalScanEligible: boolean;
  readonly lifecycleStatus: ModelLifecycleStatus;
  readonly announcementDate?: string;
  readonly deprecationDate?: string;
  readonly shutdownDate?: string;
  readonly replacementModels: readonly ReplacementModel[];
};

export type NonModelLifecycleRecord = RecordCommon & {
  readonly recordKind: NonModelRecordKind;
  readonly resourceId: string;
  readonly displayName?: string;
  readonly literalScanEligible: false;
};

export type FeedRecord = ModelLifecycleRecord | NonModelLifecycleRecord;

export type FeedEnvelope = {
  readonly schemaVersion: 3;
  readonly adapter: FeedAdapter;
  readonly generatedAt: string;
  readonly records: readonly FeedRecord[];
};

export type ModelRecordProvenance = {
  readonly recordId: string;
  readonly primarySourceUrl: string;
  readonly replacementModels: readonly ReplacementModel[];
};

export type ActiveLifecycleSignature = {
  readonly signatureIdentity: string;
  readonly lifecycleStatus: ModelLifecycleStatus;
  readonly announcementDate: string | null;
  readonly deprecationDate: string | null;
  readonly shutdownDate: string | null;
  readonly literalScanEligible: boolean;
  readonly recordIds: readonly string[];
  readonly primarySourceUrls: readonly string[];
  readonly provenance: readonly ModelRecordProvenance[];
};

export type IndexedModelPair = {
  readonly pairIdentity: string;
  readonly servingPlatform: PlatformSlug;
  readonly modelId: string;
  readonly platformSupport: "canonical" | "unsupported";
  readonly allRecordIds: readonly string[];
  readonly activeRecordIds: readonly string[];
  readonly supersededRecordIds: readonly string[];
  readonly activeLifecycles: readonly ActiveLifecycleSignature[];
  readonly conflict: boolean;
  /** True only for an unconflicted active signature explicitly admitted to lexical matching. */
  readonly lexicalScanEligible: boolean;
  /** Feed-side prerequisite only; detector and policy requirements still apply separately. */
  readonly blockingJoinEligible: boolean;
};

export type FeedConflictDiagnostic = {
  readonly kind: "feed-conflict";
  readonly pairIdentity: string;
  readonly servingPlatform: PlatformSlug;
  readonly modelId: string;
  readonly activeRecordIds: readonly string[];
  readonly activeLifecycleSignatureIdentities: readonly string[];
};

/**
 * A source row whose provider yields no syntactically valid platform slug at all. An
 * unregistered provider is not this: it derives a slug and stays as unsupported,
 * nonblocking evidence. Only an unslugifiable provider costs coverage.
 */
export type FeedUnresolvedProviderDiagnostic = {
  readonly kind: "feed-unresolved-provider";
  readonly skippedRecordCount: number;
  readonly providerCount: number;
  /** Bounded, deterministically sorted preview; counts remain complete. */
  readonly providers: readonly string[];
};

/**
 * Rows the adapter could not turn into records. Quarantining the row rather than
 * rejecting the document is deliberate: a single upstream data-quality slip would
 * otherwise fail every consumer's run at once, which is a far worse outcome than
 * assessing the other several thousand rows and declaring coverage partial.
 */
export type FeedInvalidRecordDiagnostic = {
  readonly kind: "feed-invalid-record";
  readonly skippedRecordCount: number;
  /** Bounded, deterministically sorted preview; the count remains complete. */
  readonly reasons: readonly string[];
};

/**
 * The upstream feed could not be fetched or decoded at all. Carried as a diagnostic on an
 * empty index rather than raised as an error: an upstream outage must degrade this run's
 * declared coverage to partial, not fail every consumer's job outright. Enforcement still
 * fails closed on partial coverage through the usual policy path.
 */
export type FeedUnavailableDiagnostic = {
  readonly kind: "feed-unavailable";
  readonly reason: string;
};

export type FeedDiagnostic =
  | FeedConflictDiagnostic
  | FeedUnresolvedProviderDiagnostic
  | FeedInvalidRecordDiagnostic
  | FeedUnavailableDiagnostic;

export type V3FeedIndex = {
  readonly envelope: FeedEnvelope;
  readonly recordById: ReadonlyMap<string, FeedRecord>;
  /** Contains model records only. Explicit non-model records never enter this index. */
  readonly modelPairByIdentity: ReadonlyMap<string, IndexedModelPair>;
  readonly modelPairs: readonly IndexedModelPair[];
  readonly lexicalModelPairs: readonly IndexedModelPair[];
  readonly activeRecords: readonly FeedRecord[];
  readonly activeNonModelRecords: readonly NonModelLifecycleRecord[];
  readonly supersededRecordIds: readonly string[];
  readonly diagnostics: readonly FeedDiagnostic[];
};

export type V3FeedDigests = {
  readonly sourceFeedSha256: string;
  readonly normalizedFeedSha256: string;
  readonly activeRecordsSha256: string;
  readonly feedAdapterManifestSha256: string;
};

export type LoadedV3Feed = {
  readonly index: V3FeedIndex;
  readonly digests: V3FeedDigests;
};

export type ReviewedFeedAdapterManifest = {
  readonly id: string;
  readonly version: string;
  readonly [key: string]: unknown;
};

export type TypedV3FeedLoadOptions = {
  /** Optional producer pin for callers whose transport is not itself the trust boundary. */
  readonly expectedAdapter?: {
    readonly id: string;
    readonly version: string;
  };
  /** Stable reviewed producer manifest; per-download source bytes must not be included. */
  readonly adapterManifest?: ReviewedFeedAdapterManifest;
};

export class V3FeedValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "V3FeedValidationError";
    this.path = path;
  }
}

export function isPlatformSlug(value: string): value is PlatformSlug {
  return PLATFORM_SLUG_PATTERN.test(value);
}

export function isCanonicalPlatformSlug(value: string): value is CanonicalPlatformSlug {
  return CANONICAL_PLATFORM_SET.has(value);
}

/** Untyped source-provider names are intentionally mapped without normalization or guessing. */
export function platformForSourceProvider(
  sourceProvider: string,
): CanonicalPlatformSlug | null {
  return Object.prototype.hasOwnProperty.call(
    SOURCE_PROVIDER_PLATFORM_MAPPING,
    sourceProvider,
  )
    ? (SOURCE_PROVIDER_PLATFORM_MAPPING[sourceProvider] ?? null)
    : null;
}

/**
 * Resolve any source provider label to a serving-platform slug, so a provider the
 * upstream source adds is carried instead of rejected. The canonical mapping wins where
 * it applies; every other label derives its slug mechanically. A derived slug is not
 * canonical, so `indexValidatedFeed` marks its pairs unsupported and
 * `blockingJoinEligible` stays false: new providers arrive as nonblocking evidence,
 * exactly as an unregistered typed-feed slug already does. Promotion to blocking
 * authority remains a deliberate registry, display-name and detector change.
 *
 * Returns null only when no valid slug survives derivation, which is the sole case
 * that still costs a row.
 */
export function resolveSourcePlatformSlug(sourceProvider: string): PlatformSlug | null {
  const canonical = platformForSourceProvider(sourceProvider);
  if (canonical !== null) return canonical;
  const derived = sourceProvider
    .normalize("NFKD")
    // Strip combining marks so accented labels fold to their ASCII skeleton.
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return derived !== "" && isPlatformSlug(derived) ? derived : null;
}

/** Collision-free semantic identity for an exact serving-platform/model pair. */
export function modelPairIdentity(servingPlatform: PlatformSlug, modelId: string): string {
  return JSON.stringify(["model", servingPlatform, modelId]);
}

/** Collision-free semantic identity for an exact serving-platform/resource pair. */
export function nonModelPairIdentity(
  servingPlatform: PlatformSlug,
  resourceId: string,
): string {
  return JSON.stringify(["non-model", servingPlatform, resourceId]);
}

/** The exact lifecycle tuple defined by the v3 detector/feed contract. */
export function lifecycleSignatureIdentity(record: ModelLifecycleRecord): string {
  return JSON.stringify([
    record.servingPlatform,
    record.modelId,
    record.lifecycleStatus,
    record.announcementDate ?? null,
    record.deprecationDate ?? null,
    record.shutdownDate ?? null,
    record.literalScanEligible,
  ]);
}

function codePointLength(value: string): number {
  let length = 0;
  for (const _codePoint of value) length += 1;
  return length;
}

function diagnosticPreview(value: string, maxCodePoints = 120): string {
  const codePoints = [...value];
  const bounded =
    codePoints.length <= maxCodePoints
      ? value
      : `${codePoints.slice(0, maxCodePoints - 1).join("")}…`;
  return JSON.stringify(bounded);
}

function fail(path: string, message: string): never {
  throw new V3FeedValidationError(path, message);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!isJsonObject(value)) fail(path, "must be a JSON object");
  return value;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  path: string,
): void {
  const unknownFields = Object.keys(value)
    .filter((field) => !allowedFields.has(field))
    .sort();
  if (unknownFields.length > 0) {
    const shown = unknownFields.slice(0, 10).map((field) => diagnosticPreview(field, 80));
    const omitted = unknownFields.length - shown.length;
    fail(
      path,
      `contains unknown field(s): ${shown.join(", ")}${
        omitted === 0 ? "" : `, … +${omitted} more`
      }`,
    );
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function textAt(
  value: unknown,
  path: string,
  maxCodePoints: number,
): string {
  if (typeof value !== "string") fail(path, "must be a string");
  if (value.trim() === "") fail(path, "must not be empty or whitespace-only");
  if (value.trim() !== value) fail(path, "must not have surrounding whitespace");
  if (CONTROL_CHARACTER_PATTERN.test(value)) fail(path, "must not contain control characters");
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0xd800 && codePoint <= 0xdfff) {
      fail(path, "must contain only Unicode scalar values (no unpaired surrogates)");
    }
  }
  if (codePointLength(value) > maxCodePoints) {
    fail(path, `must contain at most ${maxCodePoints} Unicode code points`);
  }
  return value;
}

function requiredText(
  object: Record<string, unknown>,
  field: string,
  path: string,
  maxCodePoints: number,
): string {
  if (!hasOwn(object, field)) fail(`${path}.${field}`, "is required");
  return textAt(object[field], `${path}.${field}`, maxCodePoints);
}

function optionalText(
  object: Record<string, unknown>,
  field: string,
  path: string,
  maxCodePoints: number,
): string | undefined {
  if (!hasOwn(object, field)) return undefined;
  return textAt(object[field], `${path}.${field}`, maxCodePoints);
}

function requiredBoolean(
  object: Record<string, unknown>,
  field: string,
  path: string,
): boolean {
  if (!hasOwn(object, field)) fail(`${path}.${field}`, "is required");
  const value = object[field];
  if (typeof value !== "boolean") fail(`${path}.${field}`, "must be a boolean");
  return value;
}

function arrayAt(
  value: unknown,
  path: string,
  maxItems: number,
): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > maxItems) fail(path, `must contain at most ${maxItems} items`);
  return value;
}

export function isDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (daysInMonth[month - 1] ?? 0);
}

export function isRfc3339UtcInstant(value: string): boolean {
  const match = RFC3339_UTC_PATTERN.exec(value);
  if (match === null) return false;
  return isDateOnly(`${match[1]}-${match[2]}-${match[3]}`);
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Whole days between feed production and now. `generatedAt` is the one freshness
 * signal both feed paths carry: a typed producer states it directly, and the reviewed
 * legacy adapter derives it from the newest reviewed `scraped_at`. Clock skew that puts
 * the feed marginally ahead of the runner clamps to zero rather than reporting a
 * negative age; the adapter already rejects anything more than a day ahead.
 */
export function feedAgeInDays(generatedAt: string, nowMs: number): number {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) {
    throw new Error(`Cannot measure feed age from generatedAt ${JSON.stringify(generatedAt)}.`);
  }
  return Math.max(0, Math.floor((nowMs - generatedMs) / MILLISECONDS_PER_DAY));
}

function dateField(
  object: Record<string, unknown>,
  field: string,
  path: string,
): string | undefined {
  const value = optionalText(object, field, path, 10);
  if (value !== undefined && !isDateOnly(value)) {
    fail(`${path}.${field}`, "must be a real YYYY-MM-DD date");
  }
  return value;
}

function platformSlugAt(value: unknown, path: string): PlatformSlug {
  const slug = textAt(value, path, 63);
  if (!isPlatformSlug(slug)) {
    fail(path, "must match [a-z0-9](?:[a-z0-9-]{0,62})");
  }
  return slug;
}

function httpUrlAt(value: unknown, path: string): string {
  const url = textAt(value, path, V3_FEED_LIMITS.maxUrlCodePoints);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(path, "must be an absolute HTTP(S) URL");
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.hostname === "") {
    fail(path, "must be an absolute HTTP(S) URL");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    fail(path, "must not contain credentials");
  }
  return url;
}

const ENVELOPE_FIELDS = new Set(["schemaVersion", "adapter", "generatedAt", "records"]);
const ADAPTER_FIELDS = new Set(["id", "version", "sourceSha256"]);
const MODEL_FIELDS = new Set([
  "recordId",
  "servingPlatform",
  "primarySourceUrl",
  "supersedesRecordIds",
  "recordKind",
  "modelId",
  "literalScanEligible",
  "lifecycleStatus",
  "announcementDate",
  "deprecationDate",
  "shutdownDate",
  "replacementModels",
]);
const NON_MODEL_FIELDS = new Set([
  "recordId",
  "servingPlatform",
  "primarySourceUrl",
  "supersedesRecordIds",
  "recordKind",
  "resourceId",
  "displayName",
  "literalScanEligible",
]);
const REPLACEMENT_FIELDS = new Set(["modelId", "servingPlatform"]);

function parseAdapter(value: unknown): FeedAdapter {
  const path = "$.adapter";
  const object = objectAt(value, path);
  rejectUnknownFields(object, ADAPTER_FIELDS, path);
  const id = requiredText(
    object,
    "id",
    path,
    V3_FEED_LIMITS.maxAdapterIdCodePoints,
  );
  const version = requiredText(
    object,
    "version",
    path,
    V3_FEED_LIMITS.maxAdapterVersionCodePoints,
  );
  const sourceSha256 = requiredText(object, "sourceSha256", path, 64);
  if (!SHA256_PATTERN.test(sourceSha256)) {
    fail(`${path}.sourceSha256`, "must be a lower-case SHA-256 hex digest");
  }
  return { id, version, sourceSha256 };
}

function parseSupersedesRecordIds(
  object: Record<string, unknown>,
  path: string,
): readonly string[] {
  if (!hasOwn(object, "supersedesRecordIds")) {
    fail(`${path}.supersedesRecordIds`, "is required");
  }
  const items = arrayAt(
    object.supersedesRecordIds,
    `${path}.supersedesRecordIds`,
    V3_FEED_LIMITS.maxSupersededRecordsPerRecord,
  );
  const seen = new Set<string>();
  return items.map((item, index) => {
    const recordId = textAt(
      item,
      `${path}.supersedesRecordIds[${index}]`,
      V3_FEED_LIMITS.maxRecordIdCodePoints,
    );
    if (seen.has(recordId)) {
      fail(`${path}.supersedesRecordIds[${index}]`, `duplicates record ID ${JSON.stringify(recordId)}`);
    }
    seen.add(recordId);
    return recordId;
  });
}

function parseCommon(object: Record<string, unknown>, path: string): RecordCommon {
  const recordId = requiredText(
    object,
    "recordId",
    path,
    V3_FEED_LIMITS.maxRecordIdCodePoints,
  );
  if (!hasOwn(object, "servingPlatform")) fail(`${path}.servingPlatform`, "is required");
  const servingPlatform = platformSlugAt(object.servingPlatform, `${path}.servingPlatform`);
  if (!hasOwn(object, "primarySourceUrl")) fail(`${path}.primarySourceUrl`, "is required");
  const primarySourceUrl = httpUrlAt(object.primarySourceUrl, `${path}.primarySourceUrl`);
  const supersedesRecordIds = parseSupersedesRecordIds(object, path);
  return { recordId, servingPlatform, primarySourceUrl, supersedesRecordIds };
}

function parseReplacementModels(
  object: Record<string, unknown>,
  path: string,
): readonly ReplacementModel[] {
  if (!hasOwn(object, "replacementModels")) fail(`${path}.replacementModels`, "is required");
  const replacements = arrayAt(
    object.replacementModels,
    `${path}.replacementModels`,
    V3_FEED_LIMITS.maxReplacementModelsPerRecord,
  );
  return replacements.map((candidate, index): ReplacementModel => {
    const replacementPath = `${path}.replacementModels[${index}]`;
    const replacement = objectAt(candidate, replacementPath);
    rejectUnknownFields(replacement, REPLACEMENT_FIELDS, replacementPath);
    const modelId = requiredText(
      replacement,
      "modelId",
      replacementPath,
      V3_FEED_LIMITS.maxIdentifierCodePoints,
    );
    if (!hasOwn(replacement, "servingPlatform")) return { modelId };
    return {
      modelId,
      servingPlatform: platformSlugAt(
        replacement.servingPlatform,
        `${replacementPath}.servingPlatform`,
      ),
    };
  });
}

function assertDateOrdering(record: ModelLifecycleRecord, path: string): void {
  const orderedDates = [
    ["announcementDate", record.announcementDate],
    ["deprecationDate", record.deprecationDate],
    ["shutdownDate", record.shutdownDate],
  ] as const;
  let previous: (typeof orderedDates)[number] | undefined;
  for (const current of orderedDates) {
    if (current[1] === undefined) continue;
    if (previous !== undefined && previous[1] !== undefined && previous[1] > current[1]) {
      fail(
        `${path}.${current[0]}`,
        `must not precede ${previous[0]} (${previous[1]})`,
      );
    }
    previous = current;
  }
}

function parseModelRecord(
  object: Record<string, unknown>,
  path: string,
  generatedDate: string,
): ModelLifecycleRecord {
  rejectUnknownFields(object, MODEL_FIELDS, path);
  const common = parseCommon(object, path);
  const modelId = requiredText(
    object,
    "modelId",
    path,
    V3_FEED_LIMITS.maxIdentifierCodePoints,
  );
  const literalScanEligible = requiredBoolean(object, "literalScanEligible", path);
  const lifecycleStatus = requiredText(object, "lifecycleStatus", path, 32);
  if (
    lifecycleStatus !== "deprecated" &&
    lifecycleStatus !== "shutdown-scheduled" &&
    lifecycleStatus !== "retired"
  ) {
    fail(
      `${path}.lifecycleStatus`,
      "must be deprecated, shutdown-scheduled, or retired",
    );
  }
  const announcementDate = dateField(object, "announcementDate", path);
  const deprecationDate = dateField(object, "deprecationDate", path);
  const shutdownDate = dateField(object, "shutdownDate", path);
  const replacementModels = parseReplacementModels(object, path);
  const record: ModelLifecycleRecord = {
    ...common,
    recordKind: "model",
    modelId,
    literalScanEligible,
    lifecycleStatus,
    replacementModels,
    ...(announcementDate === undefined ? {} : { announcementDate }),
    ...(deprecationDate === undefined ? {} : { deprecationDate }),
    ...(shutdownDate === undefined ? {} : { shutdownDate }),
  };

  if (deprecationDate === undefined && shutdownDate === undefined) {
    fail(path, "a model record requires deprecationDate or shutdownDate");
  }
  assertDateOrdering(record, path);
  switch (lifecycleStatus) {
    case "deprecated":
      if (deprecationDate === undefined) {
        fail(`${path}.deprecationDate`, "is required when lifecycleStatus is deprecated");
      }
      if (shutdownDate !== undefined) {
        fail(`${path}.shutdownDate`, "must be absent when lifecycleStatus is deprecated");
      }
      break;
    case "shutdown-scheduled":
      if (shutdownDate === undefined) {
        fail(`${path}.shutdownDate`, "is required when lifecycleStatus is shutdown-scheduled");
      }
      if (shutdownDate <= generatedDate) {
        fail(
          `${path}.shutdownDate`,
          `must be after the generatedAt UTC date ${generatedDate}`,
        );
      }
      break;
    case "retired":
      if (shutdownDate === undefined) {
        fail(`${path}.shutdownDate`, "is required when lifecycleStatus is retired");
      }
      if (shutdownDate > generatedDate) {
        fail(
          `${path}.shutdownDate`,
          `must be on or before the generatedAt UTC date ${generatedDate}`,
        );
      }
      break;
  }
  return record;
}

function parseNonModelRecord(
  object: Record<string, unknown>,
  path: string,
  recordKind: NonModelRecordKind,
): NonModelLifecycleRecord {
  rejectUnknownFields(object, NON_MODEL_FIELDS, path);
  const common = parseCommon(object, path);
  const resourceId = requiredText(
    object,
    "resourceId",
    path,
    V3_FEED_LIMITS.maxIdentifierCodePoints,
  );
  const literalScanEligible = requiredBoolean(object, "literalScanEligible", path);
  if (literalScanEligible !== false) {
    fail(`${path}.literalScanEligible`, "must be false for a non-model record");
  }
  const displayName = optionalText(
    object,
    "displayName",
    path,
    V3_FEED_LIMITS.maxDisplayNameCodePoints,
  );
  return {
    ...common,
    recordKind,
    resourceId,
    literalScanEligible: false,
    ...(displayName === undefined ? {} : { displayName }),
  };
}

function parseRecord(value: unknown, index: number, generatedDate: string): FeedRecord {
  const path = `$.records[${index}]`;
  const object = objectAt(value, path);
  if (!hasOwn(object, "recordKind")) fail(`${path}.recordKind`, "is required");
  const recordKind = object.recordKind;
  if (recordKind === "model") return parseModelRecord(object, path, generatedDate);
  if (typeof recordKind === "string" && NON_MODEL_RECORD_KIND_SET.has(recordKind)) {
    return parseNonModelRecord(object, path, recordKind as NonModelRecordKind);
  }
  fail(
    `${path}.recordKind`,
    `must be model or one of ${NON_MODEL_RECORD_KINDS.join(", ")}`,
  );
}

function pairIdentityForRecord(record: FeedRecord): string {
  return record.recordKind === "model"
    ? modelPairIdentity(record.servingPlatform, record.modelId)
    : nonModelPairIdentity(record.servingPlatform, record.resourceId);
}

function assertSupersessionGraph(records: readonly FeedRecord[]): void {
  const byId = new Map(records.map((record) => [record.recordId, record]));
  const indegree = new Map(records.map((record) => [record.recordId, 0]));

  for (const [index, record] of records.entries()) {
    for (const [referenceIndex, supersededRecordId] of record.supersedesRecordIds.entries()) {
      const path = `$.records[${index}].supersedesRecordIds[${referenceIndex}]`;
      if (supersededRecordId === record.recordId) fail(path, "must not reference its own record");
      const supersededRecord = byId.get(supersededRecordId);
      if (supersededRecord === undefined) {
        fail(path, `references missing record ID ${JSON.stringify(supersededRecordId)}`);
      }
      if (pairIdentityForRecord(record) !== pairIdentityForRecord(supersededRecord)) {
        fail(path, "must reference the same exact platform/model or platform/resource pair");
      }
      indegree.set(supersededRecordId, (indegree.get(supersededRecordId) ?? 0) + 1);
    }
  }

  const queue = records
    .filter((record) => indegree.get(record.recordId) === 0)
    .map((record) => record.recordId)
    .sort(compareText);
  let queueIndex = 0;
  let visited = 0;
  while (queueIndex < queue.length) {
    const recordId = queue[queueIndex];
    queueIndex += 1;
    if (recordId === undefined) break;
    visited += 1;
    const record = byId.get(recordId);
    if (record === undefined) fail("$.records", "contains an inconsistent supersession graph");
    for (const supersededRecordId of record.supersedesRecordIds) {
      const nextIndegree = (indegree.get(supersededRecordId) ?? 0) - 1;
      indegree.set(supersededRecordId, nextIndegree);
      if (nextIndegree === 0) queue.push(supersededRecordId);
    }
  }
  if (visited !== records.length) fail("$.records", "supersession graph contains a cycle");
}

/** Strictly validate and copy one complete v3 typed feed envelope. */
export function validateV3Feed(payload: unknown): FeedEnvelope {
  const object = objectAt(payload, "$");
  rejectUnknownFields(object, ENVELOPE_FIELDS, "$");
  if (!hasOwn(object, "schemaVersion")) fail("$.schemaVersion", "is required");
  if (object.schemaVersion !== 3) fail("$.schemaVersion", "must equal 3");
  if (!hasOwn(object, "adapter")) fail("$.adapter", "is required");
  const adapter = parseAdapter(object.adapter);
  const generatedAt = requiredText(object, "generatedAt", "$", 64);
  if (!isRfc3339UtcInstant(generatedAt)) {
    fail("$.generatedAt", "must be an RFC 3339 UTC instant ending in Z");
  }
  if (!hasOwn(object, "records")) fail("$.records", "is required");
  const rawRecords = arrayAt(object.records, "$.records", V3_FEED_LIMITS.maxRecords);
  if (rawRecords.length === 0) fail("$.records", "must contain at least one record");
  const generatedDate = generatedAt.slice(0, 10);
  const records = rawRecords.map((record, index) => parseRecord(record, index, generatedDate));
  const recordIds = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (recordIds.has(record.recordId)) {
      fail(`$.records[${index}].recordId`, `duplicates record ID ${JSON.stringify(record.recordId)}`);
    }
    recordIds.add(record.recordId);
  }
  assertSupersessionGraph(records);
  return { schemaVersion: 3, adapter, generatedAt, records };
}

function rawFeedBytes(raw: string | Uint8Array): Uint8Array {
  const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  if (bytes.byteLength > V3_FEED_LIMITS.maxDocumentBytes) {
    fail(
      "$",
      `feed document exceeds ${V3_FEED_LIMITS.maxDocumentBytes} bytes`,
    );
  }
  return bytes;
}

function decodeFeedJson(raw: string | Uint8Array): { readonly bytes: Uint8Array; readonly value: unknown } {
  const bytes = rawFeedBytes(raw);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("$", "feed document must be valid UTF-8");
  }
  if (typeof raw === "string" && text !== raw) {
    fail("$", "feed document string must round-trip as exact UTF-8 bytes");
  }
  try {
    return { bytes, value: JSON.parse(text) as unknown };
  } catch (error) {
    fail(
      "$",
      `feed document must be valid JSON (${diagnosticPreview(
        error instanceof Error ? error.message : String(error),
        240,
      )})`,
    );
  }
}

/** Parse bounded UTF-8 JSON and validate the full feed contract. */
export function parseV3FeedJson(raw: string | Uint8Array): FeedEnvelope {
  return validateV3Feed(decodeFeedJson(raw).value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function indexValidatedFeed(envelope: FeedEnvelope): V3FeedIndex {
  const recordById = new Map(envelope.records.map((record) => [record.recordId, record]));
  const supersededRecordIdSet = new Set(
    envelope.records.flatMap((record) => [...record.supersedesRecordIds]),
  );
  const activeRecords = envelope.records
    .filter((record) => !supersededRecordIdSet.has(record.recordId))
    .sort((left, right) => compareText(left.recordId, right.recordId));

  type MutablePair = {
    servingPlatform: PlatformSlug;
    modelId: string;
    all: ModelLifecycleRecord[];
    active: ModelLifecycleRecord[];
  };
  const mutablePairs = new Map<string, MutablePair>();
  for (const record of envelope.records) {
    if (record.recordKind !== "model") continue;
    const pairIdentity = modelPairIdentity(record.servingPlatform, record.modelId);
    let pair = mutablePairs.get(pairIdentity);
    if (pair === undefined) {
      pair = {
        servingPlatform: record.servingPlatform,
        modelId: record.modelId,
        all: [],
        active: [],
      };
      mutablePairs.set(pairIdentity, pair);
    }
    pair.all.push(record);
    if (!supersededRecordIdSet.has(record.recordId)) pair.active.push(record);
  }

  const modelPairs: IndexedModelPair[] = [];
  const diagnostics: FeedConflictDiagnostic[] = [];
  for (const [pairIdentity, pair] of [...mutablePairs.entries()].sort(([left], [right]) =>
    compareText(left, right),
  )) {
    const bySignature = new Map<string, ModelLifecycleRecord[]>();
    for (const record of pair.active) {
      const signatureIdentity = lifecycleSignatureIdentity(record);
      const records = bySignature.get(signatureIdentity) ?? [];
      records.push(record);
      bySignature.set(signatureIdentity, records);
    }
    const activeLifecycles = [...bySignature.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([signatureIdentity, records]): ActiveLifecycleSignature => {
        const representative = records[0];
        if (representative === undefined) {
          fail("$.records", "contains an empty lifecycle-signature group");
        }
        const provenance = records
          .map((record): ModelRecordProvenance => ({
            recordId: record.recordId,
            primarySourceUrl: record.primarySourceUrl,
            replacementModels: record.replacementModels,
          }))
          .sort((left, right) => compareText(left.recordId, right.recordId));
        return {
          signatureIdentity,
          lifecycleStatus: representative.lifecycleStatus,
          announcementDate: representative.announcementDate ?? null,
          deprecationDate: representative.deprecationDate ?? null,
          shutdownDate: representative.shutdownDate ?? null,
          literalScanEligible: representative.literalScanEligible,
          recordIds: provenance.map((item) => item.recordId),
          primarySourceUrls: sortedUnique(provenance.map((item) => item.primarySourceUrl)),
          provenance,
        };
      });
    const activeRecordIds = pair.active.map((record) => record.recordId).sort(compareText);
    const conflict = activeLifecycles.length > 1;
    const onlyLifecycle = activeLifecycles[0];
    const platformSupport = isCanonicalPlatformSlug(pair.servingPlatform)
      ? "canonical"
      : "unsupported";
    const indexedPair: IndexedModelPair = {
      pairIdentity,
      servingPlatform: pair.servingPlatform,
      modelId: pair.modelId,
      platformSupport,
      allRecordIds: pair.all.map((record) => record.recordId).sort(compareText),
      activeRecordIds,
      supersededRecordIds: pair.all
        .filter((record) => supersededRecordIdSet.has(record.recordId))
        .map((record) => record.recordId)
        .sort(compareText),
      activeLifecycles,
      conflict,
      lexicalScanEligible:
        !conflict && onlyLifecycle !== undefined && onlyLifecycle.literalScanEligible,
      // No canonical-registry requirement. Gating blocking authority on a hand-maintained
      // platform registry meant a provider the upstream source added could never become
      // enforceable without an action release, which is the treadmill this source exists to
      // avoid. Authority is instead bounded by evidence strength and by whether the feed
      // resolves the model ID to a single platform, both decided in the policy layer.
      blockingJoinEligible: !conflict && onlyLifecycle !== undefined,
    };
    modelPairs.push(indexedPair);
    if (conflict) {
      diagnostics.push({
        kind: "feed-conflict",
        pairIdentity,
        servingPlatform: pair.servingPlatform,
        modelId: pair.modelId,
        activeRecordIds,
        activeLifecycleSignatureIdentities: activeLifecycles.map(
          (lifecycle) => lifecycle.signatureIdentity,
        ),
      });
    }
  }

  const modelPairByIdentity = new Map(
    modelPairs.map((pair) => [pair.pairIdentity, pair] as const),
  );
  return {
    envelope,
    recordById,
    modelPairByIdentity,
    modelPairs,
    lexicalModelPairs: modelPairs.filter((pair) => pair.lexicalScanEligible),
    activeRecords,
    activeNonModelRecords: activeRecords.filter(
      (record): record is NonModelLifecycleRecord => record.recordKind !== "model",
    ),
    supersededRecordIds: [...supersededRecordIdSet].sort(compareText),
    diagnostics,
  };
}

/** Validate a payload and construct deterministic active-model and provenance indexes. */
export function buildV3FeedIndex(payload: unknown): V3FeedIndex {
  return indexValidatedFeed(validateV3Feed(payload));
}

export function getV3ModelPair(
  index: V3FeedIndex,
  servingPlatform: PlatformSlug,
  modelId: string,
): IndexedModelPair | undefined {
  return index.modelPairByIdentity.get(modelPairIdentity(servingPlatform, modelId));
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("$.adapterManifest", "must contain only finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!isJsonObject(value)) {
    fail("$.adapterManifest", "must contain only JSON values");
  }
  const object = value;
  return `{${Object.keys(object)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function normalizedRecordForDigest(record: FeedRecord): Record<string, unknown> {
  const supersedesRecordIds = [...record.supersedesRecordIds].sort(compareText);
  if (record.recordKind !== "model") {
    return { ...record, supersedesRecordIds };
  }
  const replacementModels = [...record.replacementModels].sort((left, right) =>
    compareText(
      JSON.stringify([left.servingPlatform ?? null, left.modelId]),
      JSON.stringify([right.servingPlatform ?? null, right.modelId]),
    ),
  );
  return { ...record, supersedesRecordIds, replacementModels };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function computeV3FeedDigests(
  raw: string | Uint8Array,
  index: V3FeedIndex,
  adapterManifest: unknown,
): V3FeedDigests {
  const bytes = rawFeedBytes(raw);
  const { id, version } = index.envelope.adapter;
  const normalizedEnvelope = {
    ...index.envelope,
    adapter: { id, version },
    records: [...index.envelope.records]
      .sort((left, right) => compareText(left.recordId, right.recordId))
      .map(normalizedRecordForDigest),
  };
  const activeRecords = index.activeRecords.map(normalizedRecordForDigest);
  return {
    sourceFeedSha256: sha256(bytes),
    normalizedFeedSha256: sha256(canonicalJson(normalizedEnvelope)),
    activeRecordsSha256: sha256(canonicalJson(activeRecords)),
    feedAdapterManifestSha256: sha256(
      canonicalJson({ adapter: { id, version }, manifest: adapterManifest }),
    ),
  };
}

function assertManifestMatchesAdapter(
  manifest: ReviewedFeedAdapterManifest,
  adapter: FeedAdapter,
): void {
  if (manifest.id !== adapter.id || manifest.version !== adapter.version) {
    fail(
      "$.adapter",
      `does not match reviewed manifest ${JSON.stringify(`${manifest.id}@${manifest.version}`)}`,
    );
  }
}

/** Parse, validate, index, and digest one immutable byte snapshot of the feed. */
export function loadV3FeedJson(
  raw: string | Uint8Array,
  options: TypedV3FeedLoadOptions = {},
): LoadedV3Feed {
  const decoded = decodeFeedJson(raw);
  const envelope = validateV3Feed(decoded.value);
  const expectedAdapter = options.expectedAdapter;
  if (
    expectedAdapter !== undefined &&
    (envelope.adapter.id !== expectedAdapter.id ||
      envelope.adapter.version !== expectedAdapter.version)
  ) {
    fail(
      "$.adapter",
      `is not the approved producer ${JSON.stringify(
        `${expectedAdapter.id}@${expectedAdapter.version}`,
      )}`,
    );
  }
  if (options.adapterManifest !== undefined) {
    assertManifestMatchesAdapter(options.adapterManifest, envelope.adapter);
  }
  const index = indexValidatedFeed(envelope);
  return {
    index,
    digests: computeV3FeedDigests(
      decoded.bytes,
      index,
      options.adapterManifest ?? V3_TYPED_FEED_RUNTIME_MANIFEST,
    ),
  };
}

/**
 * Finalize a reviewed adapter result while binding its manifest, source bytes, and envelope.
 * The envelope's source digest must identify these exact source bytes.
 */
export function loadAdaptedV3Feed(
  sourceBytes: Uint8Array,
  envelopePayload: unknown,
  adapterManifest: ReviewedFeedAdapterManifest,
  additionalDiagnostics: readonly FeedDiagnostic[] = [],
): LoadedV3Feed {
  const bytes = rawFeedBytes(sourceBytes);
  const envelope = validateV3Feed(envelopePayload);
  assertManifestMatchesAdapter(adapterManifest, envelope.adapter);
  const sourceFeedSha256 = sha256(bytes);
  if (envelope.adapter.sourceSha256 !== sourceFeedSha256) {
    fail(
      "$.adapter.sourceSha256",
      "must identify the exact immutable source bytes supplied to the reviewed adapter",
    );
  }
  const indexed = indexValidatedFeed(envelope);
  const index: V3FeedIndex =
    additionalDiagnostics.length === 0
      ? indexed
      : {
          ...indexed,
          diagnostics: [...indexed.diagnostics, ...additionalDiagnostics],
        };
  return {
    index,
    digests: computeV3FeedDigests(bytes, index, adapterManifest),
  };
}
