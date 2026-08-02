import { readFileSync } from "node:fs";

const EXACT_BUN_PACKAGE_MANAGER =
  /^bun@(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

export function requiredBunVersion(manifest: unknown): string {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new Error("package.json must contain a JSON object.");
  }

  const packageManager = (manifest as Record<string, unknown>).packageManager;
  if (typeof packageManager !== "string") {
    throw new Error('package.json must declare an exact "packageManager": "bun@x.y.z".');
  }

  const version = EXACT_BUN_PACKAGE_MANAGER.exec(packageManager)?.[1];
  if (version === undefined) {
    throw new Error(
      `package.json packageManager must pin an exact Bun version; received ${JSON.stringify(packageManager)}.`,
    );
  }
  return version;
}

export function assertBunVersion(manifest: unknown, actualVersion: string): void {
  const expectedVersion = requiredBunVersion(manifest);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `Bun ${expectedVersion} is required by package.json, but this process is using Bun ${actualVersion}.`,
    );
  }
}

export function readPackageManifest(path = "package.json"): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

if (import.meta.main) {
  const manifestPath = Bun.argv[2] ?? "package.json";
  assertBunVersion(readPackageManifest(manifestPath), Bun.version);
}
