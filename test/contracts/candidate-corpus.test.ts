import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { detectSnapshot } from "../../src/detection/detectors.ts";
import { loadV3FeedJson } from "../../src/lifecycle/feed.ts";
import {
  DEFAULT_GIT_TREE_SNAPSHOT_LIMITS,
  type GitTreeSnapshot,
  type GitTreeSnapshotDiagnostic,
  type GitTreeSnapshotEntry,
} from "../../src/repository/git.ts";

const REPOSITORY = fileURLToPath(new URL("../../", import.meta.url));
const MAX_GIT_PATH_OUTPUT_BYTES = 32 * 1024 * 1024;
const NOT_A_SYMLINK_ERROR_CODES = new Set(["EINVAL", "UNKNOWN"]);

function candidatePaths(repository: string): string[] {
  // In CI this is the exact checked-out candidate tree. Locally, overlay tracked
  // paths with non-ignored additions so a pre-commit run scans the code being built,
  // rather than the stale HEAD tree. Source-repository Git exclusions remain in force.
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repository,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        LC_ALL: "C",
        LANG: "C",
      },
      maxBuffer: MAX_GIT_PATH_OUTPUT_BYTES,
      windowsHide: true,
    },
  );
  if (result.error !== undefined || result.status !== 0 || result.stdout === null) {
    const detail = Buffer.from(result.stderr ?? []).toString("utf8").trim();
    throw new Error(
      `Could not enumerate the candidate repository corpus${detail === "" ? "." : `: ${detail}`}`,
      { cause: result.error },
    );
  }
  if (result.stdout.byteLength > MAX_GIT_PATH_OUTPUT_BYTES) {
    throw new Error("Candidate repository path listing exceeded its bounded output budget.");
  }
  return Buffer.from(result.stdout)
    .toString("utf8")
    .split("\0")
    .filter((path) => path !== "")
    .sort();
}

function gitBlobObjectId(bytes: Uint8Array): string {
  return createHash("sha1")
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}

function candidateSnapshot(repository: string): GitTreeSnapshot {
  const diagnostics: GitTreeSnapshotDiagnostic[] = [];
  const entries: GitTreeSnapshotEntry[] = [];
  let assessedBlobBytes = 0;

  for (const path of candidatePaths(repository)) {
    if (path.startsWith("/") || path.split("/").some((part) => part === "..")) {
      throw new Error(`Git returned an unsafe candidate path: ${JSON.stringify(path)}.`);
    }
    const absolutePath = resolve(repository, path);
    let linkBytes: Buffer | null = null;
    try {
      linkBytes = readlinkSync(absolutePath, { encoding: "buffer" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; // tracked deletion
      if (!NOT_A_SYMLINK_ERROR_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
        throw error;
      }
    }

    let bytes: Uint8Array;
    let kind: "regular" | "executable" | "symlink";
    if (linkBytes !== null) {
      bytes = Uint8Array.from(linkBytes);
      kind = "symlink";
    } else {
      const descriptor = openSync(absolutePath, "r");
      try {
        const openedStat = fstatSync(descriptor);
        // A tracked submodule worktree is an intentional repository boundary. It
        // is not source content and must never be traversed by this corpus gate.
        if (openedStat.isDirectory()) continue;
        if (!openedStat.isFile()) {
          throw new Error(`Candidate path is not a regular file or symlink: ${path}.`);
        }
        const pathStat = lstatSync(absolutePath);
        if (
          !pathStat.isFile() ||
          openedStat.dev !== pathStat.dev ||
          openedStat.ino !== pathStat.ino
        ) {
          throw new Error(`Candidate path changed while it was being opened: ${path}.`);
        }
        bytes = Uint8Array.from(readFileSync(descriptor));
        kind = (openedStat.mode & 0o111) === 0 ? "regular" : "executable";
      } finally {
        closeSync(descriptor);
      }
    }
    const objectId = gitBlobObjectId(bytes);
    const mode = kind === "symlink" ? "120000" as const
      : kind === "executable" ? "100755" as const
      : "100644" as const;

    assessedBlobBytes += bytes.byteLength;
    if (assessedBlobBytes > DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxTotalBlobBytes) {
      throw new Error("Candidate repository corpus exceeds the production total-blob budget.");
    }
    if (bytes.byteLength > DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxBlobBytes) {
      diagnostics.push({
        code: "blob-too-large",
        coverageImpact: "partial",
        displayPath: path,
        objectId,
        objectSize: bytes.byteLength,
        limitBytes: DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxBlobBytes,
      });
      entries.push({
        pathBytes: Buffer.from(path),
        displayPath: path,
        mode,
        kind,
        objectId,
        declaredObjectType: "blob",
        objectSize: bytes.byteLength,
        content: {
          state: "too-large",
          objectSize: bytes.byteLength,
          limitBytes: DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxBlobBytes,
        },
      });
      continue;
    }
    if (kind === "symlink") {
      diagnostics.push({
        code: "symlink-link-text",
        coverageImpact: "none",
        displayPath: path,
        objectId,
      });
    }
    entries.push({
      pathBytes: Buffer.from(path),
      displayPath: path,
      mode,
      kind,
      objectId,
      declaredObjectType: "blob",
      objectSize: bytes.byteLength,
      content: { state: "available", bytes },
    });
  }

  if (entries.length > DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxEntries) {
    throw new Error("Candidate repository corpus exceeds the production entry budget.");
  }
  const uniqueObjects = new Map<string, number>();
  for (const entry of entries) {
    if (entry.objectSize !== null) uniqueObjects.set(entry.objectId, entry.objectSize);
  }
  if (uniqueObjects.size > DEFAULT_GIT_TREE_SNAPSHOT_LIMITS.maxUniqueObjects) {
    throw new Error("Candidate repository corpus exceeds the production object budget.");
  }
  const partial = diagnostics.some((diagnostic) => diagnostic.coverageImpact === "partial");
  const treeObjectId = createHash("sha1")
    .update(entries.map((entry) => `${entry.mode} ${entry.displayPath}\0${entry.objectId}`).join(""))
    .digest("hex");
  return {
    treeObjectId,
    scanStatus: partial ? "partial" : "complete",
    entries,
    diagnostics,
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length,
      uniqueObjectCount: uniqueObjects.size,
      uniqueBlobObjectCount: uniqueObjects.size,
      availableBlobEntryCount: entries.filter((entry) => entry.content.state === "available").length,
      oversizedBlobEntryCount: diagnostics.filter((entry) => entry.code === "blob-too-large").length,
      unavailableBlobEntryCount: 0,
      symlinkEntryCount: entries.filter((entry) => entry.kind === "symlink").length,
      gitlinkEntryCount: 0,
      lfsPointerEntryCount: 0,
      assessedBlobBytes,
      readObjectBytes: [...uniqueObjects.values()].reduce((total, size) => total + size, 0),
      readObjectCount: uniqueObjects.size,
      metadataBytes: entries.reduce(
        (total, entry) => total + entry.pathBytes.byteLength + entry.objectId.length + 16,
        0,
      ),
    },
    limits: { ...DEFAULT_GIT_TREE_SNAPSHOT_LIMITS },
  };
}

test("the actual candidate repository detector corpus has complete coverage", () => {
  const snapshot = candidateSnapshot(REPOSITORY);
  const feed = loadV3FeedJson(
    readFileSync(resolve(REPOSITORY, ".github/fixtures/hermetic-lifecycle-feed.json")),
  ).index;
  const result = detectSnapshot(snapshot, feed);
  const incomplete = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "partial" || diagnostic.severity === "failed",
  );

  expect(
    result.scanStatus,
    `Candidate corpus coverage diagnostics:\n${JSON.stringify(incomplete, null, 2)}`,
  ).toBe("complete");
});
