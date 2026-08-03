import {
  CANONICAL_PLATFORM_SLUGS,
  V3_FEED_LIMITS,
  type FeedDiagnostic,
  type FeedPairSetDiagnostic,
} from "../../src/lifecycle/feed.ts";
import { DEFAULT_V3_FEED_URL } from "../../src/lifecycle/feed-source.ts";
import {
  defaultRequestPolicy,
  fetchBoundedDocumentBytes,
} from "../../src/shared/http.ts";
import { loadTypedOrReviewedLegacyFeed } from "../../src/lifecycle/legacy-feed-adapter.ts";

const MAX_PAIR_PREVIEW = 10;

export type LiveFeedDiagnosticSummary = {
  lifecycleConflicts: number;
  pairSetChanges: number;
};

export class ReviewedPairSetDriftError extends Error {
  override readonly name = "ReviewedPairSetDriftError";
}

export function summarizeLiveFeedDiagnostics(
  diagnostics: readonly FeedDiagnostic[],
): LiveFeedDiagnosticSummary {
  return {
    lifecycleConflicts: diagnostics.filter((diagnostic) => diagnostic.kind === "feed-conflict")
      .length,
    pairSetChanges: diagnostics.filter((diagnostic) => diagnostic.kind === "feed-pair-set-change")
      .length,
  };
}

function pairPreview(
  pairs: FeedPairSetDiagnostic["addedPairs"],
  exactCount: number,
): string {
  if (exactCount === 0) return "none";
  const shown = pairs
    .slice(0, MAX_PAIR_PREVIEW)
    .map(([provider, identifier]) => `${provider}/${identifier}`);
  const omitted = Math.max(0, exactCount - shown.length);
  return `${shown.join(", ")}${omitted === 0 ? "" : `, ... (+${omitted} more)`}`;
}

export function reviewedPairSetDriftMessage(
  diagnostics: readonly FeedDiagnostic[],
): string | null {
  const changes = diagnostics.filter(
    (diagnostic): diagnostic is FeedPairSetDiagnostic =>
      diagnostic.kind === "feed-pair-set-change",
  );
  if (changes.length === 0) return null;

  const details = changes.flatMap((diagnostic) => [
    `- ${diagnostic.addedPairCount} unreviewed addition(s): ${pairPreview(
      diagnostic.addedPairs,
      diagnostic.addedPairCount,
    )}`,
    `- ${diagnostic.removedPairCount} reviewed removal(s): ${pairPreview(
      diagnostic.removedPairs,
      diagnostic.removedPairCount,
    )}`,
  ]);
  return [
    "Reviewed live-feed pair registry is stale:",
    ...details,
    "Review and classify the changed pairs, then update the pinned registry, count, and digest before releasing.",
  ].join("\n");
}

export function assertNoReviewedPairSetDrift(
  diagnostics: readonly FeedDiagnostic[],
): void {
  const message = reviewedPairSetDriftMessage(diagnostics);
  if (message !== null) throw new ReviewedPairSetDriftError(message);
}

async function validateLiveFeed(): Promise<{
  records: number;
  modelPairs: number;
  nonModels: number;
  lifecycleConflicts: number;
  pairSetChanges: number;
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
  const loaded = loadTypedOrReviewedLegacyFeed(bytes);
  const representedPlatforms = new Set(
    loaded.index.modelPairs.map((pair) => pair.servingPlatform),
  );
  const missingPlatforms = CANONICAL_PLATFORM_SLUGS.filter(
    (platform) => !representedPlatforms.has(platform),
  );
  if (missingPlatforms.length > 0) {
    throw new Error(
      `Reviewed live feed contains no model records for: ${missingPlatforms.join(", ")}.`,
    );
  }
  if (loaded.index.modelPairs.length === 0 || loaded.index.activeRecords.length === 0) {
    throw new Error("Reviewed live feed produced no active model lifecycle data.");
  }
  const diagnostics = summarizeLiveFeedDiagnostics(loaded.index.diagnostics);
  assertNoReviewedPairSetDrift(loaded.index.diagnostics);
  return {
    records: loaded.index.envelope.records.length,
    modelPairs: loaded.index.modelPairs.length,
    nonModels: loaded.index.activeNonModelRecords.length,
    ...diagnostics,
    activeRecordsSha256: loaded.digests.activeRecordsSha256,
  };
}

export async function runLiveFeedValidation(): Promise<void> {
  let result: Awaited<ReturnType<typeof validateLiveFeed>>;
  try {
    result = await validateLiveFeed();
  } catch (firstError) {
    // Registry drift is deterministic maintenance work, not a transient upstream blip.
    if (firstError instanceof ReviewedPairSetDriftError) throw firstError;
    // One transient upstream blip should not fail the scheduled smoke run.
    console.warn(
      `First live-feed contract check failed; retrying once: ${
        firstError instanceof Error ? firstError.message : String(firstError)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    result = await validateLiveFeed();
  }
  console.log(
    `Validated reviewed v3 feed adapter: ${result.records} records, ` +
      `${result.modelPairs} model pairs, ${result.nonModels} explicit non-models, ` +
      `${result.lifecycleConflicts} lifecycle conflicts, ` +
      `${result.pairSetChanges} reviewed pair-set changes, ` +
      `active digest ${result.activeRecordsSha256}.`,
  );
}

if (import.meta.main) await runLiveFeedValidation();
