import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverModels,
  isDiscoverableModelId,
  parseDiscoveryPaths,
  publishDiscoveredModels,
} from "./discovery.ts";
import type { DeprecationRecord } from "./types.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function workspace(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), `${name}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function record(modelId: string, provider = "OpenAI"): DeprecationRecord {
  return {
    provider,
    model_id: modelId,
    shutdown_date: "2026-09-01",
  };
}

describe("discovery matching", () => {
  test("matches exact case-sensitive identifier boundaries and reports code-point locations", () => {
    const root = workspace("model-eol-discovery-boundaries");
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "app.ts"),
      [
        "gpt-4",
        "(gpt-4)",
        "gpt-4o",
        "prefix_gpt-4",
        "GPT-4",
        "égpt-4",
        "gpt-4模型",
        "😀 gpt-4",
      ].join("\n"),
    );

    const result = discoverModels([record("gpt-4")], root, "src,\nsrc");

    expect(result.models).toEqual([
      {
        id: "gpt-4",
        providers: ["OpenAI"],
        ambiguous: false,
        occurrenceCount: 3,
        locations: [
          { path: "src/app.ts", line: 1, column: 1 },
          { path: "src/app.ts", line: 2, column: 2 },
          { path: "src/app.ts", line: 8, column: 3 },
        ],
        locationsTruncated: false,
        tracked: false,
      },
    ]);
    expect(result.matchCount).toBe(3);
  });

  test("deduplicates providers, exposes platform ambiguity, and checks explicit inventory", () => {
    const root = workspace("model-eol-discovery-ambiguity");
    writeFileSync(join(root, "models.py"), "shared-old shared-old\nclaude-old\n");

    const result = discoverModels(
      [
        record("shared-old", "OpenAI"),
        record("shared-old", "Azure"),
        record("shared-old", "Azure OpenAI"),
        record("claude-old", "Anthropic"),
      ],
      root,
      ".",
      { inventory: [{ id: "shared-old", provider: "azure-openai" }] },
    );

    expect(result.models).toHaveLength(2);
    expect(result.models[0]).toMatchObject({
      id: "claude-old",
      providers: ["Anthropic"],
      ambiguous: false,
      occurrenceCount: 1,
      tracked: false,
    });
    expect(result.models[1]).toMatchObject({
      id: "shared-old",
      providers: ["Azure", "OpenAI"],
      ambiguous: true,
      occurrenceCount: 2,
      tracked: true,
    });
  });

  test("filters prose-like feed values and never returns surrounding source", () => {
    const root = workspace("model-eol-discovery-candidates");
    writeFileSync(join(root, "config.txt"), "private-token=do-not-return; model=o1\nplainword");

    const result = discoverModels(
      [record("o1"), record("plainword"), record("not valid model")],
      root,
      undefined,
    );

    expect(isDiscoverableModelId("o1")).toBe(true);
    expect(isDiscoverableModelId("command-r")).toBe(true);
    expect(isDiscoverableModelId("plainword")).toBe(false);
    expect(isDiscoverableModelId("not valid model")).toBe(false);
    expect(isDiscoverableModelId("2026")).toBe(false);
    expect(isDiscoverableModelId("https://example.com/model-1")).toBe(false);
    expect(result.candidateCount).toBe(1);
    expect(result.models.map((model) => model.id)).toEqual(["o1"]);
    expect(JSON.stringify(result)).not.toContain("do-not-return");
  });
});

describe("discovery filesystem safety", () => {
  test("rejects paths outside the workspace and deduplicates literal path inputs", () => {
    const parent = workspace("model-eol-discovery-paths");
    const root = join(parent, "workspace");
    const outside = join(parent, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, "outside.txt"), "gpt-4");

    expect(parseDiscoveryPaths("src,\nconfig,src")).toEqual(["src", "config"]);
    writeFileSync(join(root, "inside.txt"), "gpt-4");
    expect(discoverModels([record("gpt-4")], root, join(root, "inside.txt")).matchCount).toBe(1);
    expect(() => discoverModels([record("gpt-4")], root, "../outside")).toThrow(
      /escapes the workspace/,
    );
    expect(() => discoverModels([record("gpt-4")], root, outside)).toThrow(
      /escapes the workspace/,
    );
  });

  test("skips symlinks, generated/vendor trees, lockfiles, binaries, invalid UTF-8, and oversized files", () => {
    const parent = workspace("model-eol-discovery-skips");
    const root = join(parent, "workspace");
    const outside = join(parent, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "src", "app.ts"), "const model = 'gpt-4';\n");
    writeFileSync(join(root, "node_modules", "dependency.js"), "gpt-4");
    writeFileSync(join(root, "package-lock.json"), "gpt-4");
    writeFileSync(join(root, "binary.unknown"), Buffer.from([0x67, 0x70, 0x74, 0x00, 0x34]));
    writeFileSync(join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    writeFileSync(join(root, "oversized.txt"), `${"x".repeat(80)}gpt-4`);
    writeFileSync(join(outside, "external.txt"), "gpt-4");
    symlinkSync(outside, join(root, "external-link"), process.platform === "win32" ? "junction" : "dir");

    const result = discoverModels([record("gpt-4")], root, ".", {
      limits: { maxFileBytes: 64 },
    });

    expect(result.models[0]).toMatchObject({ occurrenceCount: 1 });
    expect(result.models[0]?.locations).toEqual([
      { path: "src/app.ts", line: 1, column: 16 },
    ]);
    expect(result.skippedSymlinkCount).toBe(1);
    expect(result.skippedFileCount).toBeGreaterThanOrEqual(4);
  });

  test("excludes configured inventory and feed snapshots from root scans", () => {
    const root = workspace("model-eol-discovery-owned-inputs");
    writeFileSync(join(root, "feed.json"), '[{"model_id":"gpt-4"}]');
    writeFileSync(join(root, "models.json"), '[{"id":"gpt-4"}]');
    writeFileSync(join(root, "app.ts"), 'const model = "gpt-4";');

    const result = discoverModels([record("gpt-4")], root, ".", {
      excludedPaths: [join(root, "feed.json"), "models.json"],
    });

    expect(result.matchCount).toBe(1);
    expect(result.models[0]?.locations).toEqual([
      { path: "app.ts", line: 1, column: 16 },
    ]);
    expect(result.skippedFileCount).toBe(2);
  });
});

describe("discovery resource bounds", () => {
  test("caps candidates, files, aggregate bytes, and matches", () => {
    const root = workspace("model-eol-discovery-limits");
    writeFileSync(join(root, "one.txt"), "gpt-4 gpt-4 gpt-4");
    writeFileSync(join(root, "two.txt"), "claude-2");

    expect(() =>
      discoverModels([record("gpt-4"), record("claude-2")], root, ".", {
        limits: { maxCandidates: 1 },
      }),
    ).toThrow(/more than 1 eligible/);
    expect(() =>
      discoverModels([record("gpt-4")], root, ".", {
        limits: { maxCandidateCodeUnits: 4 },
      }),
    ).toThrow(/4-code-unit candidate limit/);
    expect(() =>
      discoverModels([record("gpt-4")], root, ".", {
        limits: { maxAutomatonNodes: 2 },
      }),
    ).toThrow(/more than 2 automaton nodes/);
    expect(() =>
      discoverModels([record("gpt-4")], root, ".", {
        limits: { maxEntries: 1 },
      }),
    ).toThrow(/more than 1 filesystem entries/);
    expect(() =>
      discoverModels([record("gpt-4")], root, ".", {
        limits: { maxFiles: 1 },
      }),
    ).toThrow(/more than 1 files/);
    expect(() =>
      discoverModels([record("gpt-4")], root, "one.txt", {
        limits: { maxFileBytes: 100, maxTotalBytes: 5 },
      }),
    ).toThrow(/5-byte aggregate limit/);
    expect(() =>
      discoverModels([record("gpt-4")], root, "one.txt", {
        limits: { maxMatches: 2 },
      }),
    ).toThrow(/more than 2 model occurrences/);
  });

  test("matches nested candidates without propagating impossible suffix outputs", () => {
    const root = workspace("model-eol-discovery-suffix-links");
    const nestedIds = Array.from(
      { length: 120 },
      (_, index) => "a1".repeat(index + 1),
    );
    const longestId = nestedIds.at(-1) as string;
    writeFileSync(join(root, "model.txt"), `${longestId}\n`);

    const result = discoverModels(nestedIds.map((id) => record(id)), root, ".");

    expect(result.candidateCount).toBe(120);
    expect(result.matchCount).toBe(1);
    expect(result.models.map((model) => model.id)).toEqual([longestId]);
  });

  test("bounds stored locations while retaining the full occurrence count", () => {
    const root = workspace("model-eol-discovery-location-limit");
    writeFileSync(join(root, "models.txt"), "gpt-4\ngpt-4\ngpt-4\n");

    const result = discoverModels([record("gpt-4")], root, "models.txt", {
      limits: { maxLocationsPerModel: 2 },
    });

    expect(result.models[0]).toMatchObject({
      occurrenceCount: 3,
      locationsTruncated: true,
    });
    expect(result.models[0]?.locations).toEqual([
      { path: "models.txt", line: 1, column: 1 },
      { path: "models.txt", line: 2, column: 1 },
    ]);
  });

  test("publishes deterministic bounded results with explicit truncation", () => {
    const model = {
      id: "gpt-4",
      providers: Array.from({ length: 30 }, (_, index) => `Provider ${index}`),
      ambiguous: true,
      occurrenceCount: 10,
      locations: Array.from({ length: 10 }, (_, index) => ({
        path: `src/file-${index}.ts`,
        line: index + 1,
        column: 1,
      })),
      locationsTruncated: false,
      tracked: false,
    };

    const full = publishDiscoveredModels([model]);
    const parsed = JSON.parse(full.json);
    expect(full.truncated).toBe(true);
    expect(parsed[0].providers).toHaveLength(20);
    expect(parsed[0].providersTruncated).toBe(true);
    expect(parsed[0].locations).toHaveLength(5);
    expect(parsed[0].locationsTruncated).toBe(true);

    const bounded = publishDiscoveredModels([model, { ...model, id: "gpt-5" }], 400);
    expect(bounded.json.length).toBeLessThanOrEqual(400);
    expect(bounded.truncated).toBe(true);
    expect(() => publishDiscoveredModels([], 1)).toThrow(/Invalid discovery output budget/);
  });
});
