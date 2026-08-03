import { describe, expect, test } from "bun:test";
import { compact, resultIcon } from "../../src/shared/text.ts";

describe("bounded untrusted text", () => {
  test("removes direction controls and collapses escaped C0/C1 controls and whitespace", () => {
    expect(compact("  left\u0000\u0007\n\u0085\u202eright\t  ", 100)).toBe(
      "left right",
    );
  });

  test("truncates by Unicode code point without splitting surrogate pairs", () => {
    expect(compact("a🙂bc", 3)).toBe("a🙂…");
    expect(compact("🙂", 1)).toBe("🙂");
    expect(() => compact("value", 0)).toThrow(/positive safe integer/);
  });
});

describe("shared result icon", () => {
  test("keeps lifecycle outcome and partial coverage visible", () => {
    expect(resultIcon("no-actionable-risk", "complete")).toBe("✅");
    expect(resultIcon("no-actionable-risk", "partial")).toBe("⚠️");
    expect(resultIcon("unknown", "failed")).toBe("❌");
  });
});
