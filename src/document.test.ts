import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeJsonDocument,
  readBoundedRegularFileBytes,
  readJsonDocumentFile,
} from "./document.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("bounded JSON documents", () => {
  test("decodes strict UTF-8 JSON while preserving the exact bytes", () => {
    const bytes = new TextEncoder().encode('{"ok":"✓"}');
    const document = decodeJsonDocument(bytes, "Feed");
    expect(document.value).toEqual({ ok: "✓" });
    expect(document.bytes).toEqual(bytes);
  });

  test("rejects malformed UTF-8 and malformed JSON", () => {
    expect(() => decodeJsonDocument(Uint8Array.from([0xff]), "Feed")).toThrow(
      "Feed was not valid UTF-8",
    );
    expect(() => decodeJsonDocument(new TextEncoder().encode("{"), "Feed")).toThrow(
      "Feed did not contain valid JSON",
    );
  });

  test("reads relative regular files and enforces the byte cap", () => {
    const directory = mkdtempSync(join(tmpdir(), "model-eol-document-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "feed.json"), "[]", "utf8");

    expect(readJsonDocumentFile("feed.json", directory, 2, "`feed-file`").value).toEqual([]);
    expect(() => readJsonDocumentFile("feed.json", directory, 1, "`feed-file`")).toThrow(
      "limit is 1 bytes",
    );
    expect(() => readJsonDocumentFile(directory, directory, 10, "`feed-file`")).toThrow(
      "not a regular file",
    );
  });

  test("reads multi-chunk files through one bounded descriptor", () => {
    const directory = mkdtempSync(join(tmpdir(), "model-eol-descriptor-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "large.txt");
    const expected = Buffer.from("x".repeat(70_000));
    writeFileSync(filePath, expected);

    expect(
      Buffer.from(readBoundedRegularFileBytes(filePath, expected.length, "test file")),
    ).toEqual(expected);
    expect(() =>
      readBoundedRegularFileBytes(filePath, expected.length - 1, "test file"),
    ).toThrow(/limit is 69999 bytes/);
  });

  test("rejects local-document paths outside the workspace", () => {
    const workspace = mkdtempSync(join(tmpdir(), "model-eol-workspace-"));
    const outside = mkdtempSync(join(tmpdir(), "model-eol-outside-"));
    temporaryDirectories.push(workspace, outside);
    const outsideFile = join(outside, "feed.json");
    writeFileSync(outsideFile, "[]", "utf8");

    expect(() => readJsonDocumentFile(outsideFile, workspace, 10, "`feed-file`")).toThrow(
      /within the GitHub workspace/,
    );
    expect(() => readJsonDocumentFile("../outside.json", workspace, 10, "`feed-file`")).toThrow(
      /within the GitHub workspace/,
    );
  });
});
