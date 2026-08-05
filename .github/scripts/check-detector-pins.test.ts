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

  // Derived from the manifest rather than hardcoded, so re-qualifying a pin does not break
  // these tests. Hardcoding the pin made the drift check itself an obstacle to acting on
  // what it reported.
  const subject = (ecosystem: string, name: string) => {
    const entry = DETECTOR_QUALIFICATION.find(
      (candidate) => candidate.ecosystem === ecosystem && candidate.package === name,
    );
    if (entry === undefined) throw new Error(`${ecosystem}:${name} is no longer qualified`);
    return entry;
  };

  /** Serve each qualified package its own pinned version, with named overrides. */
  const registryStub = (overrides: ReadonlyMap<string, string>) => async (url: string) => {
    const entry = DETECTOR_QUALIFICATION.find(
      (candidate) => registryUrl(candidate) === url,
    );
    const key = `${entry?.ecosystem}:${entry?.package}`;
    const version = overrides.get(key) ?? entry?.version;
    const body = entry?.ecosystem === "pypi" ? { info: { version } } : { version };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  test("reports only packages whose latest release differs from the pin", async () => {
    const pinned = subject("npm", "openai");
    const drift = await collectPinDrift(
      registryStub(new Map([["npm:openai", "99.0.0"]])),
    );
    expect(drift).toEqual([
      {
        ecosystem: "npm",
        package: "openai",
        pinned: pinned.version,
        latest: "99.0.0",
        majorChange: true,
      },
    ]);
  });

  test("separates a call-surface-breaking major bump from a within-major update", async () => {
    const npmOpenai = subject("npm", "openai");
    const aiSdk = subject("npm", "ai");
    const nextMajor = `${(majorOf(npmOpenai.version) ?? 0) + 1}.0.0`;
    const withinMajor = `${majorOf(aiSdk.version) ?? 0}.999.999`;
    const drift = await collectPinDrift(
      registryStub(
        new Map([
          ["npm:openai", nextMajor],
          ["npm:ai", withinMajor],
        ]),
      ),
    );
    expect(drift).toEqual([
      expect.objectContaining({ package: "openai", latest: nextMajor, majorChange: true }),
      expect.objectContaining({ package: "ai", latest: withinMajor, majorChange: false }),
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
