import { describe, expect, test } from "bun:test";
import type { FeedDiagnostic, FeedPairSetDiagnostic } from "../../src/lifecycle/feed.ts";
import {
  ReviewedPairSetDriftError,
  assertNoReviewedPairSetDrift,
  reviewedPairSetDriftMessage,
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

function drift(additions = 12, removals = 2): FeedPairSetDiagnostic {
  return {
    kind: "feed-pair-set-change",
    addedPairCount: additions,
    removedPairCount: removals,
    addedPairs: Array.from(
      { length: additions },
      (_, index) => ["OpenAI", `new-model-${index.toString().padStart(2, "0")}`] as const,
    ),
    removedPairs: Array.from(
      { length: removals },
      (_, index) => ["Azure", `removed-model-${index.toString().padStart(2, "0")}`] as const,
    ),
  };
}

describe("reviewed live-feed maintenance validation", () => {
  test("distinguishes lifecycle conflicts from reviewed pair-set drift", () => {
    expect(summarizeLiveFeedDiagnostics([conflict, drift()])).toEqual({
      lifecycleConflicts: 1,
      pairSetChanges: 1,
    });
    expect(summarizeLiveFeedDiagnostics([conflict])).toEqual({
      lifecycleConflicts: 1,
      pairSetChanges: 0,
    });
  });

  test("allows lifecycle conflicts but fails maintenance validation on pair drift", () => {
    expect(() => assertNoReviewedPairSetDrift([conflict])).not.toThrow();
    expect(() => assertNoReviewedPairSetDrift([conflict, drift()])).toThrow(
      ReviewedPairSetDriftError,
    );
  });

  test("renders exact counts with bounded deterministic pair previews", () => {
    const message = reviewedPairSetDriftMessage([drift()]);

    expect(message).toContain("12 unreviewed addition(s)");
    expect(message).toContain("2 reviewed removal(s)");
    expect(message).toContain("OpenAI/new-model-00");
    expect(message).toContain("OpenAI/new-model-09");
    expect(message).not.toContain("OpenAI/new-model-10");
    expect(message).toContain("... (+2 more)");
    expect(message).toContain("Azure/removed-model-01");
  });
});
