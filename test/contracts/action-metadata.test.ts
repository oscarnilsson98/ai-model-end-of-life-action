import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const metadata = readFileSync(resolve(import.meta.dir, "../../action.yml"), "utf8");

function sectionKeys(section: "inputs" | "outputs"): string[] {
  const lines = metadata.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) throw new Error(`Missing ${section} metadata section.`);
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z]/.test(line)) break;
    const match = /^  ([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (match?.[1]) keys.push(match[1]);
  }
  return keys;
}

function inputBlock(name: string): string {
  const match = new RegExp(`^  ${name}:\\n((?:    .*\\n)*)`, "m").exec(metadata);
  if (!match?.[1]) throw new Error(`Missing input metadata for ${name}.`);
  return match[1];
}

describe("action metadata contract", () => {
  test("keeps zero-input policy overrides genuinely omitted", () => {
    expect(inputBlock("warn-within-days")).not.toContain("default:");
    expect(inputBlock("fail-within-days")).not.toContain("default:");
    expect(inputBlock("allow-partial")).not.toContain("default:");
    expect(inputBlock("notification-failure-mode")).toContain('default: "fail"');
  });

  test("materializes the feed-staleness horizon so the guard is on by default", () => {
    // This one is deliberately not a zero-input policy override. An omitted input must
    // leave the guard armed, so the runner default is part of the contract.
    expect(inputBlock("max-feed-age-days")).toContain('default: "30"');
  });

  test("declares only the v3 plug-and-play surface", () => {
    expect(sectionKeys("inputs")).toEqual([
      "warn-within-days",
      "fail-within-days",
      "allow-partial",
      "max-feed-age-days",
      "slack-webhook",
      "notification-failure-mode",
    ]);
    expect(sectionKeys("outputs")).toEqual([
      "result",
      "baseline-result",
      "target-result",
      "scan-status",
      "baseline-scan-status",
      "target-scan-status",
      "comparison-status",
      "exit-reason",
      "target-kind",
      "evidence-health",
      "evidence-sources",
      "evidence-facts",
      "lifecycle-findings",
      "unresolved-references",
      "counts",
      "source-feed-sha256",
      "normalized-feed-sha256",
      "active-records-sha256",
      "feed-adapter-manifest-sha256",
      "feed-generated-at",
      "feed-age-days",
      "detector-manifest-sha256",
      "evidence-fingerprint",
      "finding-fingerprint",
      "scan-fingerprint",
      "alert-fingerprint",
      "output-truncated",
      "report-path",
      "notification-status",
      "notification-reason",
    ]);
    expect(metadata).not.toMatch(/models-file|model-inventory|feed-url|feed-file/);
    expect(metadata).toContain('using: "node24"');
    expect(metadata).toContain('main: "dist/index.js"');
  });
});
