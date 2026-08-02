import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadModels,
  normalizeProvider,
  parseBoolean,
  parseHttpUrl,
  parseHttpsUrl,
  parseModels,
  parseOptionalInteger,
  parseRequiredInteger,
} from "./input.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("model inventory", () => {
  test("accepts object and bare-id entries, trims them, and deduplicates aliases", () => {
    expect(
      parseModels(
        '[{"id":" gpt-5.2 ","provider":"Open AI"},{"id":"gpt-5.2","provider":"openai"},"claude"]',
      ),
    ).toEqual([
      { id: "gpt-5.2", provider: "Open AI" },
      { id: "claude" },
    ]);
    expect(parseModels(JSON.stringify(["😀".repeat(256)]))[0]?.id).toHaveLength(512);
    expect(() => parseModels(JSON.stringify(["😀".repeat(257)]))).toThrow(/at most 256/);
  });

  test("rejects empty inventories, blank ids, control characters, and invalid providers", () => {
    expect(() => parseModels("[]")).toThrow(/at least one model/);
    expect(() => parseModels('[""]')).toThrow(/must not be empty/);
    expect(() => parseModels('["safe\\n::error::forged"]')).toThrow(/control characters/);
    expect(() => parseModels('[{"id":"x","provider":null}]')).toThrow(/provider.*string/);
    expect(() => parseModels('[{"id":"x","provider":" "}]')).toThrow(/must not be empty/);
    expect(() => parseModels('[{"id":"x","providre":"OpenAI"}]')).toThrow(
      /unsupported field\(s\): "providre"/,
    );
    expect(() => parseModels('[{"id":"x","provider":"🤖"}]')).toThrow(
      /at least one Unicode letter or number/,
    );
  });

  test("applies model length limits in Unicode code points", () => {
    expect(parseModels(JSON.stringify(["😀".repeat(256)]))).toEqual([
      { id: "😀".repeat(256) },
    ]);
    expect(() => parseModels(JSON.stringify(["😀".repeat(257)]))).toThrow(
      "at most 256 characters",
    );
  });

  test("merges inline and file inventories", () => {
    const directory = mkdtempSync(join(tmpdir(), "model-eol-input-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "models.json"), '["from-file",{"id":"inline","provider":"openai"}]');
    expect(
      loadModels(
        '[{"id":"inline","provider":"OpenAI"}]',
        "models.json",
        directory,
      ),
    ).toEqual([
      { id: "inline", provider: "OpenAI" },
      { id: "from-file" },
    ]);
  });

  test("rejects oversized and non-regular inventory files before reading them", () => {
    const directory = mkdtempSync(join(tmpdir(), "model-eol-input-size-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "large.json"), "x".repeat(1_000_001));
    expect(() => loadModels(undefined, "large.json", directory)).toThrow(
      /1000001 bytes; the limit is 1000000/,
    );
    expect(() => loadModels(undefined, ".", directory)).toThrow(/not a regular file/);
    expect(() => loadModels(undefined, "bad\npath", directory)).toThrow(/safe path/);
    writeFileSync(join(directory, "invalid.json"), Buffer.from([0xff]));
    expect(() => loadModels(undefined, "invalid.json", directory)).toThrow(/not valid UTF-8/);
  });

  test("requires at least one inventory source", () => {
    expect(() => loadModels(undefined, undefined, process.cwd())).toThrow(/Provide at least one/);
  });
});

describe("provider aliases", () => {
  test("folds serving-platform aliases without conflating distinct platforms", () => {
    expect(normalizeProvider("Open AI")).toBe("openai");
    expect(normalizeProvider("Bedrock")).toBe("aws-bedrock");
    expect(normalizeProvider("Vertex AI")).toBe("google-vertex");
    expect(normalizeProvider("x.AI")).toBe("xai");
    expect(normalizeProvider("Azure OpenAI")).toBe("azure");
    expect(normalizeProvider("Google AI")).toBe("google");
    expect(normalizeProvider("Google Vertex")).not.toBe(normalizeProvider("Google"));
    expect(normalizeProvider("日本")).not.toBe(normalizeProvider("中国"));
  });
});

describe("scalar inputs", () => {
  test("accepts only canonical bounded base-10 integers", () => {
    expect(parseOptionalInteger("30", "days", { max: 90 })).toBe(30);
    expect(parseOptionalInteger("", "days")).toBeNull();
    for (const invalid of ["-1", "1.5", "0x10", "1e3", "+1", "01", "Infinity"]) {
      expect(() => parseOptionalInteger(invalid, "days", { max: 90 })).toThrow(/Invalid days/);
    }
    expect(() => parseOptionalInteger("91", "days", { max: 90 })).toThrow(/0 to 90/);
    expect(parseRequiredInteger(undefined, "days", 7)).toBe(7);
  });

  test("accepts only explicit booleans", () => {
    expect(parseBoolean(undefined, "summary", true)).toBe(true);
    expect(parseBoolean("FALSE", "summary", true)).toBe(false);
    expect(() => parseBoolean("ture", "summary", true)).toThrow(/true.*false/);
  });

  test("accepts only credential-free HTTP URLs", () => {
    expect(parseHttpUrl("https://example.com/feed.json", "feed-url")).toBe(
      "https://example.com/feed.json",
    );
    expect(() => parseHttpUrl("file:///tmp/feed.json", "feed-url")).toThrow(/HTTP/);
    expect(() => parseHttpUrl("https://user:secret@example.com", "feed-url")).toThrow(
      /credentials/,
    );
    expect(parseHttpsUrl("https://hooks.slack.test/a", "slack-webhook")).toBe(
      "https://hooks.slack.test/a",
    );
    expect(() => parseHttpsUrl("http://hooks.slack.test/a", "slack-webhook")).toThrow(
      /HTTPS is required/,
    );
  });
});
