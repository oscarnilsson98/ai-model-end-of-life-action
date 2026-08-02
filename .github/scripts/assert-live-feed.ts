import {
  normalizeProvider,
} from "../../src/input.ts";
import {
  assertNoFutureObservations,
  validateFeed,
} from "../../src/feed.ts";
import { canonicalLifecycleFeedSha256 } from "../../src/digest.ts";
import {
  defaultRequestPolicy,
  fetchJsonDocument,
} from "../../src/http.ts";
import type { DeprecationRecord } from "../../src/types.ts";

const RAW_FEED_URL = "https://deprecations.info/v1/deprecations.json";
const JSON_FEED_URL = "https://deprecations.info/v1/feed.json";
const REQUIRED_PROVIDER_KEYS = [
  "anthropic",
  "aws-bedrock",
  "azure",
  "cohere",
  "google",
  "google-vertex",
  "groq",
  "openai",
  "xai",
] as const;

function identity(record: DeprecationRecord): string {
  return `${normalizeProvider(record.provider)}\u0000${record.model_id}\u0000${record.shutdown_date ?? "date-unknown"}`;
}

// JSON Feed intentionally omits the raw feed's verbose deprecation_context.
// Compare every lifecycle field shared by both public contracts.
function lifecycleFields(record: DeprecationRecord): string {
  return JSON.stringify({
    provider: record.provider,
    modelId: record.model_id,
    shutdownDate: record.shutdown_date ?? null,
    deprecationDate: record.deprecation_date ?? null,
    announcementDate: record.announcement_date ?? null,
    replacementModels: record.replacement_models ?? null,
    url: record.url ?? null,
    firstObserved: record.first_observed ?? null,
    lastObserved: record.last_observed ?? null,
    scrapedAt: record.scraped_at ?? null,
  });
}

function index(records: DeprecationRecord[]): Map<string, string> {
  return new Map(records.map((record) => [identity(record), lifecycleFields(record)]));
}

async function validateLiveFeeds(): Promise<{ records: number; providers: number }> {
  const policy = defaultRequestPolicy();
  policy.timeoutMs = 20_000;
  policy.retries = 2;
  const [rawPayload, jsonFeedPayload] = await Promise.all([
    fetchJsonDocument(RAW_FEED_URL, policy),
    fetchJsonDocument(JSON_FEED_URL, policy),
  ]);
  const raw = validateFeed(rawPayload);
  const jsonFeed = validateFeed(jsonFeedPayload);
  const now = Date.now();
  assertNoFutureObservations(raw, now);
  assertNoFutureObservations(jsonFeed, now);
  const rawIndex = index(raw);
  const jsonFeedIndex = index(jsonFeed);

  if (raw.length !== jsonFeed.length || rawIndex.size !== jsonFeedIndex.size) {
    throw new Error(
      `Live feed forms diverged in size: raw=${raw.length}, JSON Feed=${jsonFeed.length}.`,
    );
  }
  for (const [key, rawFields] of rawIndex) {
    const jsonFeedFields = jsonFeedIndex.get(key);
    if (jsonFeedFields === undefined) {
      throw new Error(`JSON Feed is missing lifecycle record ${JSON.stringify(key)}.`);
    }
    if (jsonFeedFields !== rawFields) {
      throw new Error(`Live feed forms disagree on lifecycle record ${JSON.stringify(key)}.`);
    }
  }
  const rawLifecycleSha256 = canonicalLifecycleFeedSha256(raw);
  const jsonFeedLifecycleSha256 = canonicalLifecycleFeedSha256(jsonFeed);
  if (rawLifecycleSha256 !== jsonFeedLifecycleSha256) {
    throw new Error(
      `Live feed forms have different semantic lifecycle digests: raw=${rawLifecycleSha256}, JSON Feed=${jsonFeedLifecycleSha256}.`,
    );
  }
  const providerKeys = new Set(raw.map((record) => normalizeProvider(record.provider)));
  const missingProviders = REQUIRED_PROVIDER_KEYS.filter(
    (provider) => !providerKeys.has(provider),
  );
  if (missingProviders.length > 0) {
    throw new Error(
      `Live feed no longer contains required serving platform(s): ${missingProviders.join(", ")}.`,
    );
  }
  return {
    records: raw.length,
    providers: providerKeys.size,
  };
}

let result: { records: number; providers: number };
try {
  result = await validateLiveFeeds();
} catch (firstError) {
  console.warn(
    `First live-feed contract check failed; retrying both forms once: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
  result = await validateLiveFeeds();
}
console.log(
  `Validated ${result.records} equivalent lifecycle records across the live raw and JSON Feed forms (${result.providers} serving platforms).`,
);
