import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rawBytesSha256 } from "./digest.ts";
import { loadFeedDocument, parseExpectedSha256 } from "./feed-source.ts";
import type { RequestPolicy } from "./http.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function policy(body: string): RequestPolicy {
  return {
    timeoutMs: 1_000,
    retries: 0,
    fetch: async () => new Response(body),
    sleep: async () => undefined,
    random: () => 0,
  };
}

describe("feed source loading", () => {
  test("validates optional SHA-256 input", () => {
    expect(parseExpectedSha256(undefined)).toBeNull();
    expect(parseExpectedSha256("A".repeat(64))).toBe("a".repeat(64));
    expect(() => parseExpectedSha256("abc")).toThrow("expected-feed-sha256");
  });

  test("loads the default URL and preserves exact-byte identity", async () => {
    const body = '[{"provider":"OpenAI"}]';
    const loaded = await loadFeedDocument({
      feedUrl: undefined,
      feedFile: undefined,
      expectedSha256: rawBytesSha256(new TextEncoder().encode(body)),
      defaultFeedUrl: "https://example.com/feed.json",
      workspace: process.cwd(),
      requestPolicy: policy(body),
    });
    expect(loaded.sourceKind).toBe("url");
    expect(loaded.url).toBe("https://example.com/feed.json");
    expect(loaded.value).toEqual([{ provider: "OpenAI" }]);
  });

  test("loads local snapshots and rejects simultaneous custom sources", async () => {
    const directory = mkdtempSync(join(tmpdir(), "model-eol-feed-source-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "feed.json"), "[]", "utf8");

    const loaded = await loadFeedDocument({
      feedUrl: undefined,
      feedFile: "feed.json",
      expectedSha256: null,
      defaultFeedUrl: "https://example.com/default.json",
      workspace: directory,
      requestPolicy: policy("[]"),
    });
    expect(loaded.sourceKind).toBe("file");
    expect(loaded.value).toEqual([]);

    await expect(
      loadFeedDocument({
        feedUrl: "https://example.com/custom.json",
        feedFile: "feed.json",
        expectedSha256: null,
        defaultFeedUrl: "https://example.com/default.json",
        workspace: directory,
        requestPolicy: policy("[]"),
      }),
    ).rejects.toThrow("only one of `feed-url` or `feed-file`");
  });

  test("rejects a checksum mismatch before attempting JSON decoding", async () => {
    await expect(
      loadFeedDocument({
        feedUrl: undefined,
        feedFile: undefined,
        expectedSha256: "0".repeat(64),
        defaultFeedUrl: "https://example.com/feed.json",
        workspace: process.cwd(),
        requestPolicy: policy("not JSON"),
      }),
    ).rejects.toThrow("SHA-256 mismatch");
  });
});
