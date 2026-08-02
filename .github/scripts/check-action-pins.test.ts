import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertImmutableActionReferences,
  findMutableActionReferences,
} from "./check-action-pins.ts";

const temporaryDirectories: string[] = [];

function workflows(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "action-pin-check-"));
  temporaryDirectories.push(directory);
  const nested = join(directory, "nested");
  mkdirSync(nested);
  writeFileSync(join(nested, "workflow.yml"), contents, "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("immutable action reference policy", () => {
  test("accepts full commit SHAs, subpath actions, quoted values, and local actions", () => {
    const directory = workflows(`
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: "github/codeql-action/init@f205ea1c3313d32999d8d6a48b4f6530d4437b38" # v4
      - uses: owner/repository/subpath@0123456789abcdef0123456789abcdef01234567
      - uses: ./
      - uses: ./.github/actions/local
  reusable:
    uses: owner/repository/.github/workflows/check.yml@0123456789abcdef0123456789abcdef01234567
`);

    expect(findMutableActionReferences(directory)).toEqual([]);
    expect(() => assertImmutableActionReferences(directory)).not.toThrow();
  });

  test("reports mutable, dynamic, Docker, empty, and malformed references with line numbers", () => {
    const directory = workflows(`
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: \${{ matrix.action }}
      - uses: docker://alpine:3.22
      - uses:
      - uses: owner/repository@0123456789abcdef
`);

    expect(findMutableActionReferences(directory).map(({ line, reference }) => ({ line, reference })))
      .toEqual([
        { line: 6, reference: "actions/checkout@v7" },
        { line: 7, reference: "${{ matrix.action }}" },
        { line: 8, reference: "docker://alpine:3.22" },
        { line: 9, reference: "" },
        { line: 10, reference: "owner/repository@0123456789abcdef" },
      ]);
    expect(() => assertImmutableActionReferences(directory)).toThrow(
      /actions\/checkout@v7/,
    );
  });

  test("validates action references inside YAML flow mappings", () => {
    const pinned = workflows(`
jobs:
  inline: { runs-on: ubuntu-latest, steps: [{ uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 }, { "uses": "./" }] }
  sequence:
    runs-on: ubuntu-latest
    steps:
      - { uses: owner/repository/subpath@0123456789abcdef0123456789abcdef01234567 }
`);
    const mutable = workflows(`
jobs:
  inline:
    runs-on: ubuntu-latest
    steps: [{ uses: actions/checkout@v7 }]
  sequence:
    runs-on: ubuntu-latest
    steps:
      - { uses: actions/setup-node@v4 }
`);

    expect(findMutableActionReferences(pinned)).toEqual([]);
    expect(findMutableActionReferences(mutable).map(({ reference }) => reference)).toEqual([
      "actions/checkout@v7",
      "actions/setup-node@v4",
    ]);
  });

  test("ignores uses-like text in comments and quoted scalar values", () => {
    const directory = workflows(`
# steps: [{ uses: actions/checkout@v7 }]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: 'echo "uses: actions/checkout@v7"'
      - run: "echo '{ uses: owner/repository@main }'"
`);

    expect(findMutableActionReferences(directory)).toEqual([]);
  });

  test("fails closed when a workflow cannot be parsed structurally", () => {
    const directory = workflows("jobs: [");

    expect(() => assertImmutableActionReferences(directory)).toThrow(/not valid YAML/);
  });

  test("fails closed when the workflow directory cannot be read", () => {
    expect(() => assertImmutableActionReferences("/definitely/missing/workflows")).toThrow();
  });
});
