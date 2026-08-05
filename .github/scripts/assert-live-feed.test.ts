import { describe, expect, test } from "bun:test";
import type { FeedDiagnostic, FeedUnresolvedProviderDiagnostic } from "../../src/lifecycle/feed.ts";
import {
  sourceFieldNames,
  summarizeContractDrift,
  summarizeLiveFeedDiagnostics,
} from "./assert-live-feed.ts";

const conflict: FeedDiagnostic = {
  kind: "feed-conflict",
  pairIdentity: '["openai","gpt-old"]',
  servingPlatform: "openai",
  modelId: "gpt-old",
  activeRecordIds: ["first", "second"],
  activeLifecycleSignatureIdentities: ["first", "second"],
};

function unresolved(skipped = 3, providers = ["***", "///"]): FeedUnresolvedProviderDiagnostic {
  return {
    kind: "feed-unresolved-provider",
    skippedRecordCount: skipped,
    providerCount: providers.length,
    providers,
  };
}

describe("live-feed contract validation", () => {
  test("distinguishes lifecycle conflicts from unresolved providers", () => {
    expect(summarizeLiveFeedDiagnostics([conflict, unresolved()])).toEqual({
      lifecycleConflicts: 1,
      skippedRecords: 3,
      quarantinedRecords: 0,
    });
    expect(summarizeLiveFeedDiagnostics([conflict])).toEqual({
      lifecycleConflicts: 1,
      skippedRecords: 0,
      quarantinedRecords: 0,
    });
  });

  test("totals skipped records across every unresolved-provider diagnostic", () => {
    expect(
      summarizeLiveFeedDiagnostics([unresolved(2, ["***"]), unresolved(5, ["///", "!!!"])]),
    ).toEqual({ lifecycleConflicts: 0, skippedRecords: 7, quarantinedRecords: 0 });
  });

  test("collects every distinct key the source publishes across rows", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify([
        { provider: "OpenAI", model_id: "a" },
        { provider: "OpenAI", model_id: "b", modality: "text" },
        "not an object",
      ]),
    );
    expect(sourceFieldNames(bytes)).toEqual(["modality", "model_id", "provider"]);
  });

  test("reports additive and withdrawn upstream drift in both directions", () => {
    const baseline = {
      reviewedFields: ["model_id", "provider"],
      reviewedPlatforms: ["openai"],
    };
    expect(
      summarizeContractDrift(
        { sourceFieldNames: ["model_id", "provider"], sourceProviders: ["openai"] },
        baseline,
      ),
    ).toEqual([]);
    expect(
      summarizeContractDrift(
        { sourceFieldNames: ["modality", "provider"], sourceProviders: ["openai", "mistral"] },
        baseline,
      ),
    ).toEqual([
      "New upstream field(s): modality.",
      "upstream field(s) no longer published: model_id.",
      "New serving platform(s): mistral.",
    ]);
  });

  test("reports no diagnostics for a clean feed", () => {
    expect(summarizeLiveFeedDiagnostics([])).toEqual({
      lifecycleConflicts: 0,
      skippedRecords: 0,
      quarantinedRecords: 0,
    });
  });
});
