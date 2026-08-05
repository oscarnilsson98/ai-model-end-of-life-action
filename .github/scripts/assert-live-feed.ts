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
  quarantinedRecords: number;
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
    quarantinedRecords: diagnostics
      .filter((diagnostic) => diagnostic.kind === "feed-invalid-record")
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
  quarantinedRecords: number;
  missingPlatforms: readonly string[];
  sourceFieldNames: readonly string[];
  sourceProviders: readonly string[];
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
  // Reported, never fatal. Upstream legitimately withdrawing the last row for one platform
  // is not a defect in this repository, and failing on it trains maintainers to ignore a
  // red scheduled job — the opposite of what a drift check is for.
  const missingPlatforms = CANONICAL_PLATFORM_SLUGS.filter(
    (platform) => !representedPlatforms.has(platform),
  );
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
    missingPlatforms,
    sourceFieldNames: sourceFieldNames(bytes),
    sourceProviders: [...new Set(loaded.index.modelPairs.map((pair) => pair.servingPlatform))]
      .sort(),
    activeRecordsSha256: loaded.digests.activeRecordsSha256,
  };
}

/**
 * Every distinct key the untyped source publishes. The adapter now ignores keys it does not
 * read, so an additive column no longer breaks consumers — which makes this the only place
 * the maintainer learns the source's shape changed and something may be worth reading.
 */
export function sourceFieldNames(bytes: Uint8Array): string[] {
  const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(payload)) return [];
  const names = new Set<string>();
  for (const row of payload) {
    if (typeof row !== "object" || row === null) continue;
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names].sort();
}

export type UpstreamContractBaseline = {
  reviewedFields: readonly string[];
  reviewedPlatforms: readonly string[];
};

/**
 * Drift between the reviewed baseline and what upstream publishes today. Withdrawals matter
 * as much as additions: a field or platform that disappeared is how a source quietly stops
 * covering something this action claims to watch.
 */
export function summarizeContractDrift(
  observed: { sourceFieldNames: readonly string[]; sourceProviders: readonly string[] },
  baseline: UpstreamContractBaseline,
): string[] {
  const drift: string[] = [];
  const diff = (
    label: string,
    seen: readonly string[],
    reviewed: readonly string[],
  ): void => {
    const added = seen.filter((value) => !reviewed.includes(value));
    const removed = reviewed.filter((value) => !seen.includes(value));
    if (added.length > 0) drift.push(`New ${label}: ${added.sort().join(", ")}.`);
    if (removed.length > 0) {
      drift.push(`${label} no longer published: ${removed.sort().join(", ")}.`);
    }
  };
  diff("upstream field(s)", observed.sourceFieldNames, baseline.reviewedFields);
  diff("serving platform(s)", observed.sourceProviders, baseline.reviewedPlatforms);
  return drift;
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
      `${result.quarantinedRecords} row(s) quarantined as malformed, ` +
      `active digest ${result.activeRecordsSha256}.`,
  );
  if (result.missingPlatforms.length > 0) {
    console.log(
      `Registered platform(s) with no live model records: ${result.missingPlatforms.join(", ")}.`,
    );
  }

  const baseline = (await Bun.file(
    new URL("../upstream-contract-baseline.json", import.meta.url),
  ).json()) as UpstreamContractBaseline;
  const drift = summarizeContractDrift(result, baseline);
  if (drift.length === 0) {
    console.log("Upstream contract matches the reviewed baseline.");
    return;
  }
  // Written to the step output so the scheduled workflow can open one issue for a human to
  // review. Never fatal: the adapter already tolerates this drift at runtime.
  console.log(`Upstream contract drift detected:\n${drift.map((line) => `- ${line}`).join("\n")}`);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined && outputPath !== "") {
    await Bun.write(
      outputPath,
      `${await Bun.file(outputPath).text().catch(() => "")}drift<<__DRIFT__\n${drift.join("\n")}\n__DRIFT__\n`,
    );
  }
}

if (import.meta.main) await runLiveFeedValidation();
