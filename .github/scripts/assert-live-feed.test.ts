import { describe, expect, test } from "bun:test";
import type { FeedDiagnostic, FeedUnresolvedProviderDiagnostic } from "../../src/lifecycle/feed.ts";
import { summarizeLiveFeedDiagnostics } from "./assert-live-feed.ts";

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
    });
    expect(summarizeLiveFeedDiagnostics([conflict])).toEqual({
      lifecycleConflicts: 1,
      skippedRecords: 0,
    });
  });

  test("totals skipped records across every unresolved-provider diagnostic", () => {
    expect(
      summarizeLiveFeedDiagnostics([unresolved(2, ["***"]), unresolved(5, ["///", "!!!"])]),
    ).toEqual({ lifecycleConflicts: 0, skippedRecords: 7 });
  });

  test("reports no diagnostics for a clean feed", () => {
    expect(summarizeLiveFeedDiagnostics([])).toEqual({
      lifecycleConflicts: 0,
      skippedRecords: 0,
    });
  });
});
