import { describe, expect, test } from "bun:test";
import { inspectSnapshotClaims } from "../../src/evidence/snapshot-claims.ts";
import type { GitTreeSnapshot, GitTreeSnapshotEntry } from "../../src/repository/git.ts";

function entry(path: string, contents: string): GitTreeSnapshotEntry {
  return {
    pathBytes: Buffer.from(path),
    displayPath: path,
    mode: "100644",
    kind: "regular",
    objectId: path.padEnd(40, "a").slice(0, 40).replace(/[^a-f0-9]/g, "a"),
    declaredObjectType: "blob",
    objectSize: Buffer.byteLength(contents),
    content: { state: "available", bytes: Buffer.from(contents) },
  };
}

function snapshot(entries: GitTreeSnapshotEntry[]): GitTreeSnapshot {
  return {
    treeObjectId: "a".repeat(40),
    scanStatus: "complete",
    entries,
    diagnostics: [],
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length,
      uniqueObjectCount: entries.length,
      uniqueBlobObjectCount: entries.length,
      availableBlobEntryCount: entries.length,
      oversizedBlobEntryCount: 0,
      unavailableBlobEntryCount: 0,
      symlinkEntryCount: 0,
      gitlinkEntryCount: 0,
      lfsPointerEntryCount: 0,
      assessedBlobBytes: 1,
      readObjectBytes: 1,
      readObjectCount: entries.length,
      metadataBytes: 1,
    },
    limits: {
      maxEntries: 100,
      maxUniqueObjects: 100,
      maxMetadataBytes: 1_000,
      maxBlobBytes: 1_000,
      maxTotalBlobBytes: 1_000,
    },
  };
}

describe("snapshot claim inspection", () => {
  test("discovers checked-in evidence without treating it as an inventory", () => {
    const policy = `schemaVersion: 1\nassertions:\n  - evidenceId: manual/model\n    modelId: gpt-old\n    servingPlatform: openai\n    scope: application\n    environment: production\n    reason: remote routing configuration\n    provenance: reviewed by platform team\n    assertedAt: 2026-08-01T00:00:00Z\n    reviewedAt: 2026-08-01T00:00:00Z\n    reviewAfter: 2026-09-01T00:00:00Z\n    expiresAt: 2026-10-01T00:00:00Z\n`;
    const result = inspectSnapshotClaims({
      snapshot: snapshot([entry(".github/ai-model-lifecycle.yml", policy)]),
      now: Date.parse("2026-08-02T00:00:00Z"),
    });
    expect(result.invalid).toBe(false);
    expect(result.facts.map((fact) => fact.evidenceId)).toEqual(["manual/model"]);
  });
});
