import { describe, expect, test } from "bun:test";
import { assertBunVersion, requiredBunVersion } from "./check-toolchain.ts";

describe("exact Bun toolchain policy", () => {
  test("accepts the exact stable version declared by packageManager", () => {
    const manifest = { packageManager: "bun@1.3.14" };

    expect(requiredBunVersion(manifest)).toBe("1.3.14");
    expect(() => assertBunVersion(manifest, "1.3.14")).not.toThrow();
  });

  test("accepts exact prerelease versions", () => {
    const manifest = { packageManager: "bun@1.4.0-canary.12" };

    expect(requiredBunVersion(manifest)).toBe("1.4.0-canary.12");
    expect(() => assertBunVersion(manifest, "1.4.0-canary.12")).not.toThrow();
  });

  test("rejects a running Bun version that differs from packageManager", () => {
    expect(() =>
      assertBunVersion({ packageManager: "bun@1.3.14" }, "1.3.13"),
    ).toThrow(/Bun 1\.3\.14 is required.*Bun 1\.3\.13/);
  });

  test.each([
    [{}, "missing packageManager"],
    [{ packageManager: "npm@11.0.0" }, "another package manager"],
    [{ packageManager: "bun@^1.3.14" }, "a version range"],
    [{ packageManager: "bun@1.3" }, "an incomplete version"],
    [null, "a non-object manifest"],
  ] as const)("rejects %s (%s)", (manifest) => {
    expect(() => requiredBunVersion(manifest)).toThrow();
  });
});
