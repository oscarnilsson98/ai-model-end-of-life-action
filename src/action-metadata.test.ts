import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const metadata = readFileSync(resolve(import.meta.dir, "../action.yml"), "utf8");

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
  test("keeps local feed snapshots usable through the published action", () => {
    expect(inputBlock("feed-url")).toContain('default: ""');
    expect(inputBlock("feed-file")).toContain('default: ""');
    expect(inputBlock("expected-feed-sha256")).toContain('default: ""');
  });

  test("declares every v2 input and machine-readable output", () => {
    expect(sectionKeys("inputs")).toEqual([
      "models",
      "models-file",
      "days-before-shutdown",
      "fail-within-days",
      "include-undated",
      "fail-on-undated",
      "fail-on-unmatched",
      "discover-models",
      "discovery-paths",
      "feed-url",
      "feed-file",
      "expected-feed-sha256",
      "max-feed-age-days",
      "request-timeout-seconds",
      "retries",
      "slack-webhook",
      "notification-failure-mode",
      "notification-mode",
      "previous-alert-fingerprint",
      "job-summary",
    ]);
    expect(sectionKeys("outputs")).toEqual([
      "findings",
      "has-findings",
      "finding-count",
      "has-breaches",
      "breach-count",
      "checked-model-count",
      "matched-model-count",
      "unmatched-model-count",
      "unmatched-models",
      "feed-content-age-days",
      "feed-record-count",
      "feed-sha256",
      "lifecycle-feed-sha256",
      "inventory-sha256",
      "alert-fingerprint",
      "next-alert-fingerprint",
      "audit-record",
      "notification-sent",
      "notification-reason",
      "discovered-models",
      "discovered-model-count",
      "untracked-discovered-model-count",
      "discovery-match-count",
      "discovery-output-truncated",
    ]);
    expect(metadata).toContain('using: "node24"');
    expect(metadata).toContain('main: "dist/index.js"');
  });
});
