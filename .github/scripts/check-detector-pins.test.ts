import { describe, expect, test } from "bun:test";
import {
  collectPinDrift,
  latestVersionFrom,
  majorOf,
  registryUrl,
} from "./check-detector-pins.ts";
import { DETECTOR_QUALIFICATION } from "../../src/detection/manifest.ts";

describe("detector qualification pin drift", () => {
  test("builds a registry URL for every qualified ecosystem", () => {
    for (const entry of DETECTOR_QUALIFICATION) {
      expect(registryUrl(entry)).not.toBeNull();
    }
    expect(registryUrl({ ecosystem: "npm", package: "@ai-sdk/openai" })).toBe(
      "https://registry.npmjs.org/%40ai-sdk/openai/latest",
    );
    expect(registryUrl({ ecosystem: "unknown", package: "x" })).toBeNull();
  });

  test("reads the latest version out of each registry's payload shape", () => {
    expect(latestVersionFrom("npm", { version: "1.2.3" })).toBe("1.2.3");
    expect(latestVersionFrom("pypi", { info: { version: "4.5.6" } })).toBe("4.5.6");
    expect(latestVersionFrom("terraform-provider", { version: "7.8.9" })).toBe("7.8.9");
    expect(latestVersionFrom("npm", { nope: true })).toBeNull();
    expect(latestVersionFrom("pypi", { info: null })).toBeNull();
  });

  test("reports only packages whose latest release differs from the pin", async () => {
    const drift = await collectPinDrift(async (url) => {
      // Echo the pinned version back for everything except the first npm entry.
      const entry = DETECTOR_QUALIFICATION.find(
        (candidate) => registryUrl(candidate) === url,
      );
      const version =
        entry?.package === "openai" && entry.ecosystem === "npm" ? "99.0.0" : entry?.version;
      const body =
        entry?.ecosystem === "pypi" ? { info: { version } } : { version };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    expect(drift).toEqual([
      {
        ecosystem: "npm",
        package: "openai",
        pinned: "6.49.0",
        latest: "99.0.0",
        majorChange: true,
      },
    ]);
  });

  test("separates a call-surface-breaking major bump from a within-major update", async () => {
    const drift = await collectPinDrift(async (url) => {
      const entry = DETECTOR_QUALIFICATION.find(
        (candidate) => registryUrl(candidate) === url,
      );
      let version = entry?.version;
      if (entry?.package === "openai" && entry.ecosystem === "npm") version = "7.0.0";
      if (entry?.package === "ai") version = "7.0.99";
      const body = entry?.ecosystem === "pypi" ? { info: { version } } : { version };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    expect(drift).toEqual([
      expect.objectContaining({ package: "openai", majorChange: true }),
      expect.objectContaining({ package: "ai", majorChange: false }),
    ]);
  });

  test("reads the major component, tolerating a bare version", () => {
    expect(majorOf("6.49.0")).toBe(6);
    expect(majorOf("5")).toBe(5);
    expect(majorOf("not-a-version")).toBeNull();
  });

  test("skips a package the registry cannot answer for instead of failing", async () => {
    const drift = await collectPinDrift(async () => new Response("nope", { status: 503 }));
    expect(drift).toEqual([]);
  });
});
