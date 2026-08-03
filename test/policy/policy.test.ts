import { describe, expect, test } from "bun:test";
import {
  applyTrustedInputs,
  defaultPolicy,
  inspectPolicy,
  matchRepositoryPattern,
  monotonicPolicy,
  parsePolicyPayload,
} from "../../src/policy/policy.ts";

describe("v3 policy", () => {
  test("parses the minimal enforcement file", () => {
    const inspection = inspectPolicy(`schemaVersion: 1\npolicy:\n  failWithinDays: 30\n`);
    expect(inspection.valid).toBe(true);
    expect(inspection.policy).toMatchObject({
      warnWithinDays: 180,
      failWithinDays: 30,
      allowPartial: false,
    });
  });

  test("rejects unknown fields and duplicate keys", () => {
    expect(inspectPolicy("schemaVersion: 1\nmodels: []\n").valid).toBe(false);
    expect(
      inspectPolicy("schemaVersion: 1\npolicy:\n  failWithinDays: 30\n  failWithinDays: 1\n")
        .valid,
    ).toBe(false);
    expect(
      inspectPolicy(
        "schemaVersion: 1\nassertions:\n  - evidenceId: invalid-date\n    modelId: gpt-old\n    servingPlatform: openai\n    scope: application\n    environment: production\n    policyEligible: true\n    reason: test\n    provenance: test\n    assertedAt: 2026-02-30T00:00:00Z\n    reviewedAt: 2026-03-01T00:00:00Z\n    reviewAfter: 2026-04-01T00:00:00Z\n    expiresAt: 2026-05-01T00:00:00Z\n",
      ).valid,
    ).toBe(false);
    expect(
      inspectPolicy(
        "schemaVersion: 1\npolicy: &shared\n  warnWithinDays: 30\nextra: *shared\n",
      ).valid,
    ).toBe(false);
  });

  test("rejects repository-global suppression paths", () => {
    const policy = inspectPolicy(`schemaVersion: 1
suppressions:
  - suppressionId: global
    target:
      modelId: gpt-old
      servingPlatform: openai
      detectorRuleIds: [source.ts.openai.request-model@1]
      paths: ["**"]
    reason: Too broad
    createdAt: 2026-08-01T00:00:00Z
    expiresAt: 2026-09-01T00:00:00Z
`);
    expect(policy.valid).toBe(false);
  });

  test("accepts exact suppressions by an evidence ID copied from the report", () => {
    const policy = inspectPolicy(`schemaVersion: 1
suppressions:
  - suppressionId: exact-reviewed-fact
    target:
      evidenceId: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
    reason: Reviewed exception for this exact evidence fact
    createdAt: 2026-08-01T00:00:00Z
    expiresAt: 2026-09-01T00:00:00Z
`);
    expect(policy.valid).toBe(true);
    expect(policy.policy.suppressions[0]?.target).toEqual({
      evidenceId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    expect(
      inspectPolicy(`schemaVersion: 1
suppressions:
  - suppressionId: obsolete-selector
    target:
      evidenceFingerprint: sha256:${"a".repeat(64)}
    reason: This selector is not authorable from evidence facts
    createdAt: 2026-08-01T00:00:00Z
    expiresAt: 2026-09-01T00:00:00Z
`).valid,
    ).toBe(false);
  });

  test("uses canonical strings and Unicode code points for published bounds", () => {
    const assertion = {
      evidenceId: "remote-prod",
      modelId: "model-1",
      servingPlatform: "openai",
      scope: "application",
      environment: "production",
      policyEligible: true,
      reason: "😀".repeat(4_096),
      provenance: "reviewed control-plane export",
      assertedAt: "2026-08-01T00:00:00Z",
      reviewedAt: "2026-08-01T00:00:00Z",
      reviewAfter: "2026-09-01T00:00:00Z",
      expiresAt: "2026-10-01T00:00:00Z",
    };
    expect(() =>
      parsePolicyPayload({ schemaVersion: 1, assertions: [assertion] }),
    ).not.toThrow();
    expect(() =>
      parsePolicyPayload({
        schemaVersion: 1,
        assertions: [{ ...assertion, provenance: " padded " }],
      }),
    ).toThrow("leading or trailing whitespace");
  });

  test("keeps omitted runtime inputs from overriding file policy", () => {
    const configured = { ...defaultPolicy(), warnWithinDays: 365, allowPartial: true };
    expect(
      applyTrustedInputs(configured, {
        warnWithinDays: null,
        failWithinDays: null,
        allowPartial: null,
        notificationFailureMode: "fail",
      }),
    ).toMatchObject({ warnWithinDays: 365, allowPartial: true });
  });

  test("joins PR policy in the severity-preserving direction", () => {
    const base = { ...defaultPolicy(), failWithinDays: 30, allowPartial: false };
    const proposed = { ...defaultPolicy(), warnWithinDays: 1, allowPartial: true };
    expect(monotonicPolicy(base, proposed)).toMatchObject({
      warnWithinDays: 180,
      failWithinDays: 30,
      allowPartial: false,
    });
  });

  test("accepts a declared serving-platform set and rejects unregistered slugs", () => {
    const declared = inspectPolicy(
      "schemaVersion: 1\nservingPlatforms:\n  - openai\n  - google\n",
    );
    expect(declared.valid).toBe(true);
    expect(declared.policy.servingPlatforms).toEqual(["google", "openai"]);
    expect(defaultPolicy().servingPlatforms).toEqual([]);
    expect(
      inspectPolicy("schemaVersion: 1\nservingPlatforms:\n  - openai\n  - openai\n").valid,
    ).toBe(false);
    expect(inspectPolicy("schemaVersion: 1\nservingPlatforms:\n  - Azure\n").valid).toBe(false);
    expect(inspectPolicy("schemaVersion: 1\nservingPlatforms: []\n").valid).toBe(false);
  });

  test("keeps a head serving-platform declaration from narrowing base matching", () => {
    const undeclared = defaultPolicy();
    const openai = { ...defaultPolicy(), servingPlatforms: ["openai"] };
    const azure = { ...defaultPolicy(), servingPlatforms: ["azure"] };
    expect(monotonicPolicy(undeclared, openai).servingPlatforms).toEqual([]);
    expect(monotonicPolicy(openai, undeclared).servingPlatforms).toEqual([]);
    expect(monotonicPolicy(openai, azure).servingPlatforms).toEqual(["azure", "openai"]);
  });

  test("matches only the documented path grammar", () => {
    expect(matchRepositoryPattern("services/**/src/*.ts", "services/api/src/main.ts")).toBe(
      true,
    );
    expect(matchRepositoryPattern("services/**/src/*.ts", "docs/main.ts")).toBe(false);
  });
});
