import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCommand,
  appendSummary,
  emitAnnotation,
  emitCommand,
  escapeCommandData,
  escapeCommandProperty,
  getInput,
  inputEnvName,
  maskSecret,
} from "../../src/action/github.ts";

const temporaryDirectories: string[] = [];

function temporaryFile(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "model-eol-github-test-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("GitHub input and workflow-command safety", () => {
  test("preserves hyphens in input environment names and trims values", () => {
    expect(inputEnvName("warn-within-days")).toBe("INPUT_WARN-WITHIN-DAYS");
    expect(inputEnvName("notification failure mode")).toBe("INPUT_NOTIFICATION_FAILURE_MODE");
    expect(
      getInput("warn-within-days", {
        "INPUT_WARN-WITHIN-DAYS": " 30 \n",
        INPUT_WARN_WITHIN_DAYS: "wrong variable",
      }),
    ).toBe("30");
  });

  test("escapes command delimiters so untrusted newlines cannot forge commands", () => {
    const payload = "100%\r\n::error::forged";
    expect(escapeCommandData(payload)).toBe("100%25%0D%0A::error::forged");

    const lines: string[] = [];
    emitCommand("warning", payload, (line) => lines.push(line));
    maskSecret("token%\n::notice::leak", (line) => lines.push(line));
    maskSecret("", (line) => lines.push(line));

    expect(lines).toEqual([
      "::warning::100%25%0D%0A::error::forged",
      "::add-mask::token%25%0A::notice::leak",
    ]);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  });

  test("escapes source-annotation properties and validates coordinates", () => {
    expect(escapeCommandProperty("src/a,b:c%\n.ts")).toBe(
      "src/a%2Cb%3Ac%25%0A.ts",
    );
    const lines: string[] = [];
    emitAnnotation(
      "warning",
      "model\nmessage",
      { title: "Model, discovery", file: "src/a:b.ts", line: 2, col: 7 },
      (line) => lines.push(line),
    );
    expect(lines).toEqual([
      "::warning title=Model%2C discovery,file=src/a%3Ab.ts,line=2,col=7::model%0Amessage",
    ]);
    expect(() => emitAnnotation("notice", "bad", { line: 0 })).toThrow(
      /Invalid GitHub annotation line/,
    );
  });
});

describe("GitHub file commands", () => {
  test("uses a multiline delimiter that cannot collide with a value line", () => {
    const file = temporaryFile("output.txt");
    const uuids = ["collision", "safe"];
    appendCommand(
      file,
      "findings",
      "first\nghadelimiter_collision\nlast",
      () => uuids.shift() ?? "unexpected",
    );

    expect(readFileSync(file, "utf8")).toBe(
      "findings<<ghadelimiter_safe\nfirst\nghadelimiter_collision\nlast\nghadelimiter_safe\n",
    );
  });

  test("rejects invalid output names before creating a file", () => {
    const file = temporaryFile("output.txt");
    expect(() => appendCommand(file, "safe\nFORGED", "value")).toThrow(
      /Invalid GitHub output name/,
    );
    expect(existsSync(file)).toBe(false);
  });

  test("is a no-op without a file and appends summaries with a trailing newline", () => {
    expect(() => appendCommand(undefined, "safe", "value")).not.toThrow();
    const file = temporaryFile("summary.md");
    appendSummary(file, "first");
    appendSummary(file, "second\n");
    appendSummary(undefined, "ignored");
    expect(readFileSync(file, "utf8")).toBe("first\nsecond\n");
  });
});
