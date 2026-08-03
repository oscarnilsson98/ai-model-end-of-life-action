import { describe, expect, test } from "bun:test";
import {
  DETECTOR_MANIFEST_SHA256,
  DETECTOR_MANIFEST_VERSION,
  DETECTOR_QUALIFICATION,
  DETECTOR_RULES,
} from "../../src/detection/manifest.ts";

describe("v3 detector manifest", () => {
  test("publishes a unique, versioned rule and SDK qualification contract", () => {
    expect(DETECTOR_MANIFEST_VERSION).toMatch(/^3\.0\.0-[1-9][0-9]*$/);
    expect(new Set(DETECTOR_RULES.map((rule) => rule.ruleId)).size).toBe(
      DETECTOR_RULES.length,
    );
    expect(
      new Set(
        DETECTOR_QUALIFICATION.map((entry) =>
          JSON.stringify([entry.ecosystem, entry.package]),
        ),
      ).size,
    ).toBe(DETECTOR_QUALIFICATION.length);
    expect(DETECTOR_QUALIFICATION).toHaveLength(16);
    for (const entry of DETECTOR_QUALIFICATION) {
      expect(entry.version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
      expect(new URL(entry.sourceUrl).protocol).toBe("https:");
    }
    expect(DETECTOR_MANIFEST_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});
