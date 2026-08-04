import {
  CANONICAL_PLATFORM_SLUGS,
  V3_FEED_LIMITS,
  type FeedDiagnostic,
} from "../../src/lifecycle/feed.ts";
import { DEFAULT_V3_FEED_URL } from "../../src/lifecycle/feed-source.ts";
import {
  defaultRequestPolicy,
  fetchBoundedDocumentBytes,
} from "../../src/shared/http.ts";
import { loadTypedOrAdaptedLegacyFeed } from "../../src/lifecycle/legacy-feed-adapter.ts";

export type LiveFeedDiagnosticSummary = {
  lifecycleConflicts: number;
  skippedRecords: number;
};

export function summarizeLiveFeedDiagnostics(
  diagnostics: readonly FeedDiagnostic[],
): LiveFeedDiagnosticSummary {
  return {
    lifecycleConflicts: diagnostics.filter((diagnostic) => diagnostic.kind === "feed-conflict")
      .length,
    skippedRecords: diagnostics
      .filter((diagnostic) => diagnostic.kind === "feed-unresolved-provider")
      .reduce((total, diagnostic) => total + diagnostic.skippedRecordCount, 0),
  };
}

async function validateLiveFeed(): Promise<{
  records: number;
  modelPairs: number;
  nonModels: number;
  unregisteredPlatformPairs: number;
  lifecycleConflicts: number;
  skippedRecords: number;
  activeRecordsSha256: string;
}> {
  const policy = defaultRequestPolicy();
  policy.timeoutMs = 20_000;
  policy.retries = 2;
  const bytes = await fetchBoundedDocumentBytes(
    DEFAULT_V3_FEED_URL,
    policy,
    V3_FEED_LIMITS.maxDocumentBytes,
  );
  const loaded = loadTypedOrAdaptedLegacyFeed(bytes);
  const representedPlatforms = new Set(
    loaded.index.modelPairs.map((pair) => pair.servingPlatform),
  );
  const missingPlatforms = CANONICAL_PLATFORM_SLUGS.filter(
    (platform) => !representedPlatforms.has(platform),
  );
  if (missingPlatforms.length > 0) {
    throw new Error(
      `Live feed contains no model records for: ${missingPlatforms.join(", ")}.`,
    );
  }
  if (loaded.index.modelPairs.length === 0 || loaded.index.activeRecords.length === 0) {
    throw new Error("Live feed produced no active model lifecycle data.");
  }
  const diagnostics = summarizeLiveFeedDiagnostics(loaded.index.diagnostics);
  return {
    records: loaded.index.envelope.records.length,
    modelPairs: loaded.index.modelPairs.length,
    nonModels: loaded.index.activeNonModelRecords.length,
    // Pairs on a provider with no canonical slug yet. Reported, never fatal: they are real
    // upstream coverage arriving as nonblocking evidence, and a rising count is the signal
    // to consider registering that platform for blocking authority.
    unregisteredPlatformPairs: loaded.index.modelPairs.filter(
      (pair) => pair.platformSupport === "unsupported",
    ).length,
    ...diagnostics,
    activeRecordsSha256: loaded.digests.activeRecordsSha256,
  };
}

export async function runLiveFeedValidation(): Promise<void> {
  let result: Awaited<ReturnType<typeof validateLiveFeed>>;
  try {
    result = await validateLiveFeed();
  } catch (firstError) {
    // One transient upstream blip should not fail the scheduled smoke run. This check no
    // longer asserts anything that maintenance must clear, so every failure is retryable.
    console.warn(
      `First live-feed contract check failed; retrying once: ${
        firstError instanceof Error ? firstError.message : String(firstError)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    result = await validateLiveFeed();
  }
  console.log(
    `Validated live v3 feed adapter: ${result.records} records, ` +
      `${result.modelPairs} model pairs, ${result.nonModels} explicit non-models, ` +
      `${result.unregisteredPlatformPairs} pair(s) on unregistered platforms, ` +
      `${result.lifecycleConflicts} lifecycle conflicts, ` +
      `${result.skippedRecords} record(s) skipped for an unusable provider label, ` +
      `active digest ${result.activeRecordsSha256}.`,
  );
}

if (import.meta.main) await runLiveFeedValidation();
