/**
 * Compare the SDK versions the detector rules were qualified against with what each registry
 * publishes today.
 *
 * These pins are not dependencies of this package, so Dependabot cannot see them. Without
 * this check a provider reshaping its call surface degrades semantic detection to the lexical
 * fallback silently: findings keep appearing with lower confidence, coverage still reports
 * `complete`, and nothing says the rules stopped matching. Reported, never fatal — a new
 * upstream release is not a defect in this repository, only a prompt to re-qualify.
 */
import { DETECTOR_QUALIFICATION } from "../../src/detection/manifest.ts";

export type PinDrift = {
  ecosystem: string;
  package: string;
  pinned: string;
  latest: string;
  /** True when the major component moved, which is when call surfaces actually break. */
  majorChange: boolean;
};

/** Leading numeric component, or null when the version does not start with one. */
export function majorOf(version: string): number | null {
  const major = /^(\d+)\./.exec(version)?.[1] ?? /^(\d+)$/.exec(version)?.[1];
  return major === undefined ? null : Number(major);
}

type Fetcher = (url: string) => Promise<Response>;

export function registryUrl(entry: {
  ecosystem: string;
  package: string;
}): string | null {
  if (entry.ecosystem === "npm") {
    return `https://registry.npmjs.org/${entry.package.split("/").map(encodeURIComponent).join("/")}/latest`;
  }
  if (entry.ecosystem === "pypi") {
    return `https://pypi.org/pypi/${encodeURIComponent(entry.package)}/json`;
  }
  if (entry.ecosystem === "terraform-provider") {
    const [namespace, name] = entry.package.split("/");
    if (namespace === undefined || name === undefined) return null;
    return `https://registry.terraform.io/v1/providers/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  }
  return null;
}

export function latestVersionFrom(ecosystem: string, payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (ecosystem === "npm") {
    return typeof record.version === "string" ? record.version : null;
  }
  if (ecosystem === "pypi") {
    const info = record.info;
    if (typeof info !== "object" || info === null) return null;
    const version = (info as Record<string, unknown>).version;
    return typeof version === "string" ? version : null;
  }
  if (ecosystem === "terraform-provider") {
    return typeof record.version === "string" ? record.version : null;
  }
  return null;
}

export async function collectPinDrift(fetcher: Fetcher = fetch): Promise<PinDrift[]> {
  const drift: PinDrift[] = [];
  for (const entry of DETECTOR_QUALIFICATION) {
    const url = registryUrl(entry);
    if (url === null) continue;
    let latest: string | null;
    try {
      const response = await fetcher(url);
      if (!response.ok) {
        console.warn(`${entry.package}: registry returned HTTP ${response.status}; skipped.`);
        continue;
      }
      latest = latestVersionFrom(entry.ecosystem, await response.json());
    } catch (error) {
      console.warn(
        `${entry.package}: registry lookup failed; skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (latest === null || latest === entry.version) continue;
    const pinnedMajor = majorOf(entry.version);
    const latestMajor = majorOf(latest);
    drift.push({
      ecosystem: entry.ecosystem,
      package: entry.package,
      pinned: entry.version,
      latest,
      majorChange:
        pinnedMajor !== null && latestMajor !== null && pinnedMajor !== latestMajor,
    });
  }
  return drift;
}

function describe(entry: PinDrift): string {
  return `${entry.package} (${entry.ecosystem}): qualified ${entry.pinned}, latest ${entry.latest}`;
}

export async function runDetectorPinCheck(): Promise<void> {
  const drift = await collectPinDrift();
  if (drift.length === 0) {
    console.log(
      `All ${DETECTOR_QUALIFICATION.length} detector qualification pin(s) match the latest published release.`,
    );
    return;
  }
  // Only a major bump reliably reshapes a call surface, and only that is worth interrupting
  // a maintainer for. Reporting every patch release daily would train them to ignore this.
  const major = drift.filter((entry) => entry.majorChange);
  const minor = drift.filter((entry) => !entry.majorChange);
  for (const entry of minor) console.log(`Within-major drift (not reported): ${describe(entry)}`);
  if (major.length === 0) {
    console.log(
      `No detector qualification pin changed major version; ${minor.length} within-major update(s) available.`,
    );
    return;
  }
  const lines = major.map(describe);
  console.log(
    `Detector qualification major drift:\n${lines.map((line) => `- ${line}`).join("\n")}`,
  );
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath !== undefined && outputPath !== "") {
    const existing = await Bun.file(outputPath).text().catch(() => "");
    await Bun.write(outputPath, `${existing}drift<<__DRIFT__\n${lines.join("\n")}\n__DRIFT__\n`);
  }
}

if (import.meta.main) await runDetectorPinCheck();
