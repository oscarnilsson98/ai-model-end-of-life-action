import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventSelectionError,
  resolveEventSelection,
  type GitCommitProbe,
} from "../../src/repository/event.ts";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const MERGE = "c".repeat(40);
const OTHER = "d".repeat(40);
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function probe(
  available: readonly string[],
  overrides: Partial<GitCommitProbe> = {},
): GitCommitProbe {
  const commits = new Set(available);
  return {
    resolveCommit: (revision) => (commits.has(revision) ? revision : null),
    parents: () => [BASE, HEAD],
    isAncestor: () => true,
    ...overrides,
  };
}

function repository(name: string): string {
  const path = mkdtempSync(join(tmpdir(), `${name}-`));
  temporaryDirectories.push(path);
  git(path, "init", "--quiet", "--initial-branch=main");
  git(path, "config", "user.name", "Event Test");
  git(path, "config", "user.email", "event@example.invalid");
  return path;
}

function git(repositoryPath: string, ...arguments_: string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryPath,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    },
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.error?.message ?? result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function commit(repositoryPath: string, file: string, content: string, message: string): string {
  writeFileSync(join(repositoryPath, file), content);
  git(repositoryPath, "add", file);
  git(repositoryPath, "commit", "--quiet", "--message", message);
  return git(repositoryPath, "rev-parse", "HEAD");
}

function pullRequestPayload(base = BASE, head = HEAD): unknown {
  return { pull_request: { base: { sha: base }, head: { sha: head } } };
}

function mergeGroupPayload(base = BASE, head = HEAD): unknown {
  return { merge_group: { base_sha: base, head_sha: head } };
}

describe("v3 pull-request event selection", () => {
  test("uses the validated synthetic merge and exact event commits", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
      eventPayload: pullRequestPayload(),
      probe: probe([BASE, HEAD, MERGE], { parents: () => [HEAD, BASE] }),
    });

    expect(result).toEqual({
      selection: {
        eventName: "pull_request",
        targetOid: MERGE,
        targetKind: "synthetic-merge",
        baseOid: BASE,
        submittedHeadOid: HEAD,
        comparisonRequested: true,
      },
      comparisonStatus: "available",
      diagnostics: [],
      targetParentOids: [HEAD, BASE],
    });
  });

  test("verifies a real synthetic merge and its trees through Git objects", () => {
    const path = repository("model-eol-event-pr");
    commit(path, "shared.txt", "root\n", "root");
    git(path, "switch", "--quiet", "--create", "feature");
    const submittedHead = commit(path, "feature.txt", "feature\n", "feature");
    git(path, "switch", "--quiet", "main");
    const base = commit(path, "base.txt", "base\n", "base");
    git(path, "merge", "--quiet", "--no-ff", "feature", "--message", "merge");
    const merge = git(path, "rev-parse", "HEAD");

    const result = resolveEventSelection({
      repositoryPath: path,
      environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: merge },
      eventPayload: pullRequestPayload(base, submittedHead),
    });

    expect(result.selection).toMatchObject({
      targetOid: merge,
      targetKind: "synthetic-merge",
      baseOid: base,
      submittedHeadOid: submittedHead,
    });
    expect(result.comparisonStatus).toBe("available");
    expect(result.targetParentOids).toEqual([base, submittedHead]);
  });

  test("rejects a merge whose parent multiset is not exactly base and head", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
        eventPayload: pullRequestPayload(),
        probe: probe([BASE, HEAD, MERGE], { parents: () => [BASE, OTHER] }),
      }),
    ).toThrow(/not the validated synthetic merge/);
  });

  test("does not accept duplicate parents when base and head happen to match", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
        eventPayload: pullRequestPayload(BASE, BASE),
        probe: probe([BASE, MERGE], { parents: () => [BASE, OTHER] }),
      }),
    ).toThrow(/not the validated synthetic merge/);
  });

  test("keeps a readable synthetic merge as an uncomparable diagnostic target", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
      eventPayload: pullRequestPayload(),
      probe: probe([MERGE]),
    });

    expect(result.comparisonStatus).toBe("unavailable");
    expect(result.selection).toMatchObject({
      targetOid: MERGE,
      targetKind: "synthetic-merge-uncompared",
      baseOid: BASE,
      submittedHeadOid: HEAD,
    });
    expect(result.diagnostics[0]?.severity).toBe("partial");
    expect(result.targetParentOids).toEqual([BASE, HEAD]);
  });

  test("falls back explicitly when only the exact raw head exists", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
      eventPayload: pullRequestPayload(),
      probe: probe([HEAD]),
    });

    expect(result.comparisonStatus).toBe("unavailable");
    expect(result.selection).toMatchObject({
      targetOid: HEAD,
      targetKind: "raw-head-fallback",
      baseOid: BASE,
      submittedHeadOid: HEAD,
    });
  });

  test("fails when neither the synthetic merge nor submitted head tree is available", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
        eventPayload: pullRequestPayload(),
        probe: probe([BASE]),
      }),
    ).toThrow(/Neither the validated pull-request merge commit nor the exact submitted head/);
  });

  test("fails if a full event OID resolves through a different object", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: MERGE },
        eventPayload: pullRequestPayload(),
        probe: probe([BASE, HEAD], {
          resolveCommit: (revision) => (revision === MERGE ? OTHER : revision),
        }),
      }),
    ).toThrow(/did not resolve to the exact event commit/);
  });
});

describe("v3 merge-group event selection", () => {
  test("uses the exact combined head only after proving base ancestry", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "merge_group", GITHUB_SHA: OTHER },
      eventPayload: mergeGroupPayload(),
      probe: probe([BASE, HEAD]),
    });

    expect(result).toEqual({
      selection: {
        eventName: "merge_group",
        targetOid: HEAD,
        targetKind: "merge-group",
        baseOid: BASE,
        submittedHeadOid: HEAD,
        comparisonRequested: true,
      },
      comparisonStatus: "available",
      diagnostics: [],
    });
  });

  test("keeps the exact head as diagnostic target when its base is unavailable", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "merge_group" },
      eventPayload: mergeGroupPayload(),
      probe: probe([HEAD]),
    });

    expect(result.comparisonStatus).toBe("unavailable");
    expect(result.selection.targetOid).toBe(HEAD);
    expect(result.diagnostics[0]?.code).toBe("trusted-base-unavailable");
  });

  test("fails when the exact combined head is unavailable", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "merge_group" },
        eventPayload: mergeGroupPayload(),
        probe: probe([BASE]),
      }),
    ).toThrow(/exact merge-group head commit is unavailable/);
  });

  test("fails a definite base-ancestry violation", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "merge_group" },
        eventPayload: mergeGroupPayload(),
        probe: probe([BASE, HEAD], { isAncestor: () => false }),
      }),
    ).toThrow(/base is not an ancestor/);
  });

  test("reports unavailable comparison when local history cannot prove ancestry", () => {
    const result = resolveEventSelection({
      repositoryPath: ".",
      environment: { GITHUB_EVENT_NAME: "merge_group" },
      eventPayload: mergeGroupPayload(),
      probe: probe([BASE, HEAD], { isAncestor: () => null }),
    });

    expect(result.comparisonStatus).toBe("unavailable");
    expect(result.selection.targetOid).toBe(HEAD);
    expect(result.diagnostics[0]?.message).toContain("ancestry cannot be proven");
  });
});

describe("v3 non-comparison event selection", () => {
  test("resolves local HEAD to a verified full commit object ID", () => {
    const path = repository("model-eol-event-local");
    const head = commit(path, "tracked.txt", "tracked\n", "tracked");

    const result = resolveEventSelection({ repositoryPath: path, environment: {} });

    expect(result.selection).toEqual({
      eventName: "local",
      targetOid: head,
      targetKind: "commit",
      comparisonRequested: false,
    });
    expect(result.selection.targetOid).toMatch(OID);
    expect(result.selection.targetOid).not.toBe("HEAD");
    expect(result.comparisonStatus).toBe("not-applicable");
  });

  test("also requires a local commit's tree to be available", () => {
    const path = repository("model-eol-event-missing-tree");
    commit(path, "tracked.txt", "tracked\n", "tracked");
    const tree = git(path, "rev-parse", "HEAD^{tree}");
    rmSync(join(path, ".git", "objects", tree.slice(0, 2), tree.slice(2)));

    expect(() => resolveEventSelection({ repositoryPath: path, environment: {} })).toThrow(
      /commit HEAD and its tree are unavailable/,
    );
  });

  test("uses an exact GITHUB_SHA for local and supported GitHub events", () => {
    for (const eventName of ["local", "schedule", "workflow_dispatch", "push", "release"]) {
      const result = resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: eventName, GITHUB_SHA: HEAD },
        probe: probe([HEAD]),
      });
      expect(result.selection.targetOid).toBe(HEAD);
      expect(result.selection.targetOid).toMatch(OID);
      expect(result.comparisonStatus).toBe("not-applicable");
    }
  });

  test("fails missing GitHub SHAs, malformed resolutions, and unsupported events", () => {
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "schedule" },
        probe: probe([]),
      }),
    ).toThrow(/GITHUB_SHA must be a full lowercase Git object ID/);
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: {},
        probe: probe([], { resolveCommit: () => "HEAD" }),
      }),
    ).toThrow(/malformed Git commit object ID/);
    expect(() =>
      resolveEventSelection({
        repositoryPath: ".",
        environment: { GITHUB_EVENT_NAME: "pull_request_target", GITHUB_SHA: HEAD },
        probe: probe([HEAD]),
      }),
    ).toThrow(/Unsupported GitHub event/);
  });

  test("classifies target unavailability as failed", () => {
    try {
      resolveEventSelection({
        repositoryPath: ".",
        environment: {},
        probe: probe([]),
      });
      throw new Error("expected local target resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EventSelectionError);
      expect(error).toMatchObject({ scanStatus: "failed" });
    }
  });
});
