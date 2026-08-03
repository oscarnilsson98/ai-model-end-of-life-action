import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
  DEFAULT_GIT_TREE_SNAPSHOT_LIMITS,
  GitTreeSnapshotBudgetError,
  GitTreeSnapshotError,
  displayGitPath,
  readGitTreeSnapshot,
} from "../../src/repository/git.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryRepository(name: string): string {
  const repository = mkdtempSync(join(tmpdir(), `${name}-`));
  temporaryDirectories.push(repository);
  git(repository, "init", "--quiet");
  git(repository, "config", "user.name", "Snapshot Test");
  git(repository, "config", "user.email", "snapshot@example.invalid");
  return repository;
}

function git(repository: string, ...arguments_: string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: repository,
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

function commitAll(repository: string): void {
  git(repository, "add", "--all");
  git(repository, "commit", "--quiet", "--message", "snapshot");
}

function text(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

describe("immutable Git tree snapshots", () => {
  test("reads committed blobs without consulting modified or untracked workspace files", () => {
    const repository = temporaryRepository("model-eol-git-tree");
    mkdirSync(join(repository, "src"));
    writeFileSync(join(repository, "src", "model.ts"), "export const model = 'gpt-old';\n");
    writeFileSync(join(repository, "script.sh"), "#!/bin/sh\necho committed\n");
    writeFileSync(
      join(repository, "asset.bin"),
      [
        "version https://git-lfs.github.com/spec/v1",
        "ext-0-review retained extension metadata",
        `oid sha256:${"a".repeat(64)}`,
        "size 987654",
        "",
      ].join("\n"),
    );
    symlinkSync("src/model.ts", join(repository, "model-link"));
    writeFileSync(join(repository, "strange\tline\nname.txt"), "odd path\n");
    git(repository, "add", "--all");
    git(repository, "update-index", "--chmod=+x", "script.sh");
    git(
      repository,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${"1".repeat(40)},dependencies/example`,
    );
    git(repository, "commit", "--quiet", "--message", "snapshot");

    writeFileSync(join(repository, "src", "model.ts"), "workspace-only change\n");
    writeFileSync(join(repository, "untracked.txt"), "must not appear\n");

    const snapshot = readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD" });
    const model = snapshot.entries.find((entry) => entry.displayPath === "src/model.ts");
    const executable = snapshot.entries.find((entry) => entry.displayPath === "script.sh");
    const symlink = snapshot.entries.find((entry) => entry.displayPath === "model-link");
    const lfs = snapshot.entries.find((entry) => entry.displayPath === "asset.bin");
    const gitlink = snapshot.entries.find(
      (entry) => entry.displayPath === "dependencies/example",
    );
    const oddPath = snapshot.entries.find(
      (entry) => entry.displayPath === "strange\\tline\\nname.txt",
    );

    expect(snapshot.scanStatus).toBe("complete");
    expect(snapshot.entries.some((entry) => entry.displayPath === "untracked.txt")).toBe(false);
    expect(model?.content.state).toBe("available");
    if (model?.content.state === "available") {
      expect(text(model.content.bytes)).toBe("export const model = 'gpt-old';\n");
    }
    expect(executable).toMatchObject({ mode: "100755", kind: "executable" });
    expect(symlink).toMatchObject({ mode: "120000", kind: "symlink" });
    if (symlink?.content.state === "available") {
      expect(text(symlink.content.bytes)).toBe("src/model.ts");
    } else {
      throw new Error("expected committed symlink link-text");
    }
    expect(lfs?.content).toMatchObject({
      state: "lfs-pointer",
      oid: `sha256:${"a".repeat(64)}`,
      declaredSize: 987654,
    });
    expect(gitlink).toMatchObject({
      mode: "160000",
      kind: "gitlink",
      objectSize: null,
      content: { state: "gitlink-boundary" },
    });
    expect(oddPath?.pathBytes).toEqual(Buffer.from("strange\tline\nname.txt"));
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "git-lfs-boundary",
      "gitlink-boundary",
      "symlink-link-text",
    ]);
    expect(snapshot.stats).toMatchObject({
      entryCount: 6,
      blobEntryCount: 5,
      uniqueObjectCount: 6,
      uniqueBlobObjectCount: 5,
      availableBlobEntryCount: 4,
      unavailableBlobEntryCount: 0,
      oversizedBlobEntryCount: 0,
      symlinkEntryCount: 1,
      gitlinkEntryCount: 1,
      lfsPointerEntryCount: 1,
      readObjectCount: 5,
    });
  });

  test("produces deterministic entry, diagnostic, and byte results", () => {
    const repository = temporaryRepository("model-eol-git-deterministic");
    writeFileSync(join(repository, "b.txt"), "same\n");
    writeFileSync(join(repository, "a.txt"), "same\n");
    commitAll(repository);

    const first = readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD" });
    const second = readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD" });

    expect(second).toEqual(first);
    expect(first.entries.map((entry) => entry.displayPath)).toEqual(["a.txt", "b.txt"]);
    expect(first.stats.uniqueBlobObjectCount).toBe(1);
    expect(first.stats.readObjectCount).toBe(1);
    expect(first.stats.assessedBlobBytes).toBe(10);
    expect(first.stats.readObjectBytes).toBe(5);
  });

  test("marks a per-blob limit as an identified partial blind spot", () => {
    const repository = temporaryRepository("model-eol-git-blob-limit");
    writeFileSync(join(repository, "large.txt"), "12345");
    writeFileSync(join(repository, "small.txt"), "12");
    commitAll(repository);

    const snapshot = readGitTreeSnapshot({
      repositoryPath: repository,
      treeish: "HEAD",
      limits: { maxBlobBytes: 4 },
    });

    expect(snapshot.scanStatus).toBe("partial");
    expect(snapshot.entries.find((entry) => entry.displayPath === "large.txt")?.content).toEqual({
      state: "too-large",
      objectSize: 5,
      limitBytes: 4,
    });
    expect(snapshot.diagnostics).toContainEqual({
      code: "blob-too-large",
      coverageImpact: "partial",
      displayPath: "large.txt",
      objectId: expect.any(String),
      objectSize: 5,
      limitBytes: 4,
    });
    expect(snapshot.stats).toMatchObject({
      assessedBlobBytes: 2,
      availableBlobEntryCount: 1,
      oversizedBlobEntryCount: 1,
      readObjectBytes: 2,
      readObjectCount: 1,
    });
  });

  test("fails closed when the aggregate assessed-byte budget is exhausted", () => {
    const repository = temporaryRepository("model-eol-git-total-limit");
    writeFileSync(join(repository, "one.txt"), "same");
    writeFileSync(join(repository, "two.txt"), "same");
    commitAll(repository);

    expect(() =>
      readGitTreeSnapshot({
        repositoryPath: repository,
        treeish: "HEAD",
        limits: { maxBlobBytes: 4, maxTotalBlobBytes: 7 },
      }),
    ).toThrow(GitTreeSnapshotBudgetError);
    try {
      readGitTreeSnapshot({
        repositoryPath: repository,
        treeish: "HEAD",
        limits: { maxBlobBytes: 4, maxTotalBlobBytes: 7 },
      });
      throw new Error("expected the aggregate snapshot budget to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "aggregate-budget-exhausted",
        budget: "total-blob-bytes",
        observed: 8,
        limit: 7,
        observedExactly: true,
      });
    }
  });

  test("fails closed on entry, object, and metadata aggregate budgets", () => {
    const repository = temporaryRepository("model-eol-git-aggregate-limits");
    writeFileSync(join(repository, "tracked.txt"), "tracked\n");
    commitAll(repository);

    for (const [limits, budget] of [
      [{ maxEntries: 0 }, "entries"],
      [{ maxUniqueObjects: 0 }, "unique-objects"],
      [{ maxMetadataBytes: 0 }, "metadata-bytes"],
    ] as const) {
      try {
        readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD", limits });
        throw new Error(`expected ${budget} to fail`);
      } catch (error) {
        expect(error).toMatchObject({
          code: "aggregate-budget-exhausted",
          budget,
        });
      }
    }
  });

  test("fails a tree whose declared gitlink resolves to the wrong object type", () => {
    const repository = temporaryRepository("model-eol-git-type-mismatch");
    writeFileSync(join(repository, "source.txt"), "blob content\n");
    git(repository, "add", "source.txt");
    const blobObjectId = git(repository, "hash-object", "source.txt");
    git(
      repository,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${blobObjectId},invalid-gitlink`,
    );
    git(repository, "commit", "--quiet", "--message", "malformed type");

    try {
      readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD" });
      throw new Error("expected an object type mismatch");
    } catch (error) {
      expect(error).toMatchObject({ code: "object-type-mismatch" });
    }
  });

  test("reports a referenced missing blob without attempting a lazy fetch", () => {
    const repository = temporaryRepository("model-eol-git-missing");
    writeFileSync(join(repository, "lost.txt"), "not available\n");
    commitAll(repository);
    const blobObjectId = git(repository, "rev-parse", "HEAD:lost.txt");
    rmSync(
      join(repository, ".git", "objects", blobObjectId.slice(0, 2), blobObjectId.slice(2)),
    );

    const snapshot = readGitTreeSnapshot({ repositoryPath: repository, treeish: "HEAD" });

    expect(snapshot.scanStatus).toBe("partial");
    expect(snapshot.entries[0]).toMatchObject({
      displayPath: "lost.txt",
      objectId: blobObjectId,
      objectSize: null,
      content: { state: "unavailable" },
    });
    expect(snapshot.diagnostics).toEqual([
      {
        code: "blob-unavailable",
        coverageImpact: "partial",
        displayPath: "lost.txt",
        objectId: blobObjectId,
      },
    ]);
  });

  test("rejects invalid revisions and attempts to raise hard resource limits", () => {
    const repository = temporaryRepository("model-eol-git-invalid");
    writeFileSync(join(repository, "tracked.txt"), "tracked\n");
    commitAll(repository);

    expect(() =>
      readGitTreeSnapshot({ repositoryPath: repository, treeish: "-invalid-option" }),
    ).toThrow(/safe, non-option revision/);
    expect(() =>
      readGitTreeSnapshot({ repositoryPath: repository, treeish: "missing-ref" }),
    ).toThrow(GitTreeSnapshotError);
    expect(() =>
      readGitTreeSnapshot({
        repositoryPath: repository,
        treeish: "HEAD",
        limits: {
          maxEntries: DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxEntries + 1,
        },
      }),
    ).toThrow(/maxEntries/);
  });
});

describe("Git path rendering", () => {
  test("preserves safe Unicode and escapes controls, backslashes, and invalid UTF-8", () => {
    expect(displayGitPath(Buffer.from("src/模型\\name\tfile\n.ts"))).toBe(
      "src/模型\\\\name\\tfile\\n.ts",
    );
    expect(displayGitPath(Uint8Array.from([0x61, 0xff, 0x0a, 0x5c]))).toBe(
      "a\\xff\\x0a\\\\",
    );
    expect(displayGitPath(Buffer.from("safe\u202efile"))).toBe("safe\\u{202e}file");
  });
});
