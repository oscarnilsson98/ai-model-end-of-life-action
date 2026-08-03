import { describe, expect, test } from "bun:test";
import {
  alertFingerprint,
  chooseExitReason,
  combineEvidenceHealth,
  combineScanStatus,
  findingFingerprint,
  strongerOutcome,
  strongerResult,
} from "../../src/shared/status.ts";
import type { LifecycleFinding } from "../../src/shared/types.ts";

describe("v3 status precedence", () => {
  test("keeps lifecycle, scan, health, and exit axes independent", () => {
    expect(strongerResult("advisory", "blocking")).toBe("blocking");
    expect(strongerOutcome("notice", "warning")).toBe("warning");
    expect(combineScanStatus("complete", "partial")).toBe("partial");
    expect(combineEvidenceHealth("stale", "expired")).toBe("expired");
    expect(chooseExitReason("notification-failed", "policy-breach")).toBe(
      "policy-breach",
    );
    expect(chooseExitReason("partial-disallowed", "assessment-failed")).toBe(
      "assessment-failed",
    );
  });
});

function lifecycleFinding(overrides: Partial<LifecycleFinding> = {}): LifecycleFinding {
  return {
    findingId: "finding-openai-gpt-old",
    semanticKey: "openai/gpt-old/application/production",
    evidenceIds: ["repo-chat"],
    modelId: "gpt-old",
    servingPlatform: "openai",
    servingPlatforms: ["openai"],
    lifecycleMatch: "exact",
    lifecycleStatus: "shutdown-scheduled",
    shutdownDate: "2026-08-20",
    daysUntilShutdown: 18,
    replacementModels: [],
    sourceUrls: ["https://example.com"],
    feedConflict: false,
    outcome: "breach",
    reasons: ["The model shuts down within the failure window."],
    scope: "application",
    environment: "production",
    confidence: "high",
    selectorKind: "model-id",
    locations: [{ path: "src/chat.ts", line: 1, column: 1 }],
    ...overrides,
  };
}

describe("finding fingerprints", () => {
  test("ignore volatile finding fields so alert fingerprints stay stable across days", () => {
    const today = lifecycleFinding();
    const tomorrow = lifecycleFinding({
      daysUntilShutdown: 17,
      reasons: ["The model shuts down in 17 days."],
      evidenceIds: ["different-evidence"],
      replacementModels: [{ modelId: "new-replacement" }],
      sourceUrls: ["https://different.example/source"],
      locations: [{ path: "moved/chat.ts", line: 90, column: 4 }],
      delta: "unchanged",
    });
    expect(findingFingerprint(tomorrow)).toBe(findingFingerprint(today));
    expect(alertFingerprint([tomorrow])).toBe(alertFingerprint([today]));
  });

  test("changes with every alert identity field", () => {
    const base = lifecycleFinding();
    const changes: Partial<LifecycleFinding>[] = [
      { modelId: "gpt-new" },
      { servingPlatform: "azure" },
      { lifecycleStatus: "retired" },
      { shutdownDate: "2026-09-01" },
      { outcome: "warning" },
    ];
    for (const change of changes) {
      expect(findingFingerprint(lifecycleFinding(change))).not.toBe(findingFingerprint(base));
    }
  });

  test("treats the actionable alert collection as an order-independent set", () => {
    const first = lifecycleFinding();
    const second = lifecycleFinding({ modelId: "gpt-other", findingId: "other" });
    const notice = lifecycleFinding({ modelId: "notice-only", outcome: "notice" });
    expect(alertFingerprint([first, second])).toBe(
      alertFingerprint([notice, second, first, first]),
    );
  });
});
