import { spawnSync } from "node:child_process";

const ASCII_HEADER = /^[\x20-\x7e]+$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const CONTROL_OR_FORMAT_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const MAX_TREEISH_BYTES = 1_024;
const MAX_ERROR_BYTES = 512;

export type GitTreeSnapshotLimits = {
  maxEntries: number;
  maxUniqueObjects: number;
  maxMetadataBytes: number;
  maxBlobBytes: number;
  maxTotalBlobBytes: number;
};

/**
 * Hard v3 snapshot ceilings. Callers may lower, but not raise, these limits.
 * Aggregate limits fail closed; maxBlobBytes creates an identified blind spot.
 */
export const DEFAULT_GIT_TREE_SNAPSHOT_LIMITS: Readonly<GitTreeSnapshotLimits> =
  Object.freeze({
    maxEntries: 100_000,
    maxUniqueObjects: 100_000,
    maxMetadataBytes: 32 * 1024 * 1024,
    maxBlobBytes: 2 * 1024 * 1024,
    maxTotalBlobBytes: 100 * 1024 * 1024,
  });

export type GitTreeEntryMode = "100644" | "100755" | "120000" | "160000";
export type GitTreeEntryKind = "regular" | "executable" | "symlink" | "gitlink";

export type GitBlobContent =
  | { state: "available"; bytes: Uint8Array }
  | {
      state: "lfs-pointer";
      bytes: Uint8Array;
      oid: `sha256:${string}`;
      declaredSize: number;
    }
  | { state: "too-large"; objectSize: number; limitBytes: number }
  | { state: "unavailable" }
  | { state: "gitlink-boundary" };

export type GitTreeSnapshotEntry = {
  /** Raw Git path bytes. They are never passed through a shell or filesystem lookup. */
  pathBytes: Uint8Array;
  /** A deterministic, single-line rendering suitable for diagnostics. */
  displayPath: string;
  mode: GitTreeEntryMode;
  kind: GitTreeEntryKind;
  objectId: string;
  declaredObjectType: "blob" | "commit";
  objectSize: number | null;
  content: GitBlobContent;
};

export type GitTreeSnapshotDiagnostic =
  | {
      code: "symlink-link-text";
      coverageImpact: "none";
      displayPath: string;
      objectId: string;
    }
  | {
      code: "gitlink-boundary";
      coverageImpact: "none";
      displayPath: string;
      objectId: string;
    }
  | {
      code: "git-lfs-boundary";
      coverageImpact: "none";
      displayPath: string;
      objectId: string;
      lfsObjectId: `sha256:${string}`;
      declaredSize: number;
    }
  | {
      code: "blob-too-large";
      coverageImpact: "partial";
      displayPath: string;
      objectId: string;
      objectSize: number;
      limitBytes: number;
    }
  | {
      code: "blob-unavailable";
      coverageImpact: "partial";
      displayPath: string;
      objectId: string;
    };

export type GitTreeSnapshotStats = {
  entryCount: number;
  blobEntryCount: number;
  uniqueObjectCount: number;
  uniqueBlobObjectCount: number;
  availableBlobEntryCount: number;
  oversizedBlobEntryCount: number;
  unavailableBlobEntryCount: number;
  symlinkEntryCount: number;
  gitlinkEntryCount: number;
  lfsPointerEntryCount: number;
  /** Bytes charged per eligible path, including duplicate paths to the same blob. */
  assessedBlobBytes: number;
  /** Bytes actually read from unique Git blob objects. */
  readObjectBytes: number;
  readObjectCount: number;
  metadataBytes: number;
};

export type GitTreeSnapshot = {
  treeObjectId: string;
  scanStatus: "complete" | "partial";
  entries: GitTreeSnapshotEntry[];
  diagnostics: GitTreeSnapshotDiagnostic[];
  stats: GitTreeSnapshotStats;
  limits: GitTreeSnapshotLimits;
};

export type ReadGitTreeSnapshotOptions = {
  repositoryPath: string;
  treeish: string;
  limits?: Partial<GitTreeSnapshotLimits>;
};

export type GitTreeSnapshotFailureCode =
  | "invalid-options"
  | "git-command-failed"
  | "tree-unavailable"
  | "malformed-tree"
  | "unknown-tree-mode"
  | "malformed-object-metadata"
  | "object-type-mismatch"
  | "malformed-object-content"
  | "aggregate-budget-exhausted";

export class GitTreeSnapshotError extends Error {
  constructor(
    readonly code: GitTreeSnapshotFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "GitTreeSnapshotError";
  }
}

export type GitTreeSnapshotBudget =
  | "entries"
  | "unique-objects"
  | "metadata-bytes"
  | "total-blob-bytes";

export class GitTreeSnapshotBudgetError extends GitTreeSnapshotError {
  constructor(
    readonly budget: GitTreeSnapshotBudget,
    readonly observed: number,
    readonly limit: number,
    readonly observedExactly: boolean,
  ) {
    super(
      "aggregate-budget-exhausted",
      `${budget} budget exhausted: observed ${
        observedExactly ? observed : `at least ${observed}`
      }; limit ${limit}.`,
    );
    this.name = "GitTreeSnapshotBudgetError";
  }
}

type RawTreeEntry = {
  pathBytes: Uint8Array;
  displayPath: string;
  mode: GitTreeEntryMode;
  kind: GitTreeEntryKind;
  objectId: string;
  declaredObjectType: "blob" | "commit";
};

type ObjectMetadata =
  | { state: "available"; type: "blob" | "commit"; size: number }
  | { state: "missing" };

type LfsPointer = {
  oid: `sha256:${string}`;
  declaredSize: number;
};

function validateLimits(
  requested: Partial<GitTreeSnapshotLimits> | undefined,
): GitTreeSnapshotLimits {
  const limits: GitTreeSnapshotLimits = {
    ...DEFAULT_GIT_TREE_SNAPSHOT_LIMITS,
    ...requested,
  };
  for (const key of Object.keys(limits) as (keyof GitTreeSnapshotLimits)[]) {
    const value = limits[key];
    const hardLimit = DEFAULT_GIT_TREE_SNAPSHOT_LIMITS[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > hardLimit) {
      throw new GitTreeSnapshotError(
        "invalid-options",
        `${key} must be a non-negative safe integer no greater than ${hardLimit}.`,
      );
    }
  }
  return limits;
}

/** Hardened, locale-pinned environment for every spawned git subprocess. */
export function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_COMMON_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  ]) {
    delete environment[key];
  }
  environment.GIT_NO_LAZY_FETCH = "1";
  environment.GIT_NO_REPLACE_OBJECTS = "1";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.LC_ALL = "C";
  environment.LANG = "C";
  return environment;
}

function boundedError(stderr: Uint8Array | null): string {
  if (stderr === null || stderr.byteLength === 0) return "";
  const bounded = stderr.subarray(0, MAX_ERROR_BYTES);
  const rendered = Buffer.from(bounded)
    .toString("utf8")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "?")
    .trim();
  return rendered === "" ? "" : `: ${rendered}`;
}

function runGit(
  repositoryPath: string,
  arguments_: readonly string[],
  input: Uint8Array | undefined,
  maxOutputBytes: number,
  failureCode: GitTreeSnapshotFailureCode,
  operation: string,
  outputBudget?: {
    budget: GitTreeSnapshotBudget;
    alreadyObserved: number;
    totalLimit: number;
  },
): Uint8Array {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryPath,
    env: gitEnvironment(),
    input,
    maxBuffer: maxOutputBytes + 1,
    windowsHide: true,
  });

  const stdout = result.stdout;
  if (result.error !== undefined) {
    const errorCode = (result.error as NodeJS.ErrnoException).code;
    if (errorCode === "ENOBUFS" || stdout?.byteLength > maxOutputBytes) {
      if (outputBudget !== undefined) {
        throw new GitTreeSnapshotBudgetError(
          outputBudget.budget,
          outputBudget.alreadyObserved + maxOutputBytes + 1,
          outputBudget.totalLimit,
          false,
        );
      }
      throw new GitTreeSnapshotError(
        failureCode,
        `Git exceeded its checked output length while attempting to ${operation}.`,
      );
    }
    throw new GitTreeSnapshotError(
      "git-command-failed",
      `Could not ${operation}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new GitTreeSnapshotError(
      failureCode,
      `Could not ${operation} (Git exited ${
        result.status ?? "without a status"
      })${boundedError(result.stderr)}.`,
    );
  }
  if (stdout === null) {
    throw new GitTreeSnapshotError(
      failureCode,
      `Git returned no output while attempting to ${operation}.`,
    );
  }
  if (stdout.byteLength > maxOutputBytes) {
    if (outputBudget !== undefined) {
      throw new GitTreeSnapshotBudgetError(
        outputBudget.budget,
        outputBudget.alreadyObserved + stdout.byteLength,
        outputBudget.totalLimit,
        true,
      );
    }
    throw new GitTreeSnapshotError(
      failureCode,
      `Git exceeded its checked output length while attempting to ${operation}.`,
    );
  }
  return Uint8Array.from(stdout);
}

function resolveTreeObjectId(repositoryPath: string, treeish: string): string {
  const treeishBytes = Buffer.byteLength(treeish);
  if (
    treeishBytes === 0 ||
    treeishBytes > MAX_TREEISH_BYTES ||
    treeish.startsWith("-") ||
    /[\u0000-\u001f\u007f]/.test(treeish)
  ) {
    throw new GitTreeSnapshotError(
      "invalid-options",
      `treeish must be a safe, non-option revision of at most ${MAX_TREEISH_BYTES} bytes.`,
    );
  }

  const output = runGit(
    repositoryPath,
    ["rev-parse", "--verify", "--end-of-options", `${treeish}^{tree}`],
    undefined,
    256,
    "tree-unavailable",
    "resolve the target Git tree",
  );
  const rendered = Buffer.from(output).toString("ascii");
  const match = /^(?<objectId>[0-9a-f]{40}|[0-9a-f]{64})\r?\n?$/.exec(rendered);
  const objectId = match?.groups?.objectId;
  if (objectId === undefined) {
    throw new GitTreeSnapshotError(
      "tree-unavailable",
      "Git returned a malformed target tree object ID.",
    );
  }
  return objectId;
}

function ascii(bytes: Uint8Array, label: string): string {
  const value = Buffer.from(bytes).toString("ascii");
  if (!ASCII_HEADER.test(value)) {
    throw new GitTreeSnapshotError("malformed-tree", `${label} was not printable ASCII.`);
  }
  return value;
}

/** Render arbitrary Git path bytes without introducing control characters. */
export function displayGitPath(pathBytes: Uint8Array): string {
  let decoded: string;
  try {
    decoded = UTF8_DECODER.decode(pathBytes);
  } catch {
    let escaped = "";
    for (const byte of pathBytes) {
      if (byte === 0x5c) escaped += "\\\\";
      else if (byte >= 0x20 && byte <= 0x7e) escaped += String.fromCharCode(byte);
      else escaped += `\\x${byte.toString(16).padStart(2, "0")}`;
    }
    return escaped;
  }

  let escaped = "";
  for (const character of decoded) {
    switch (character) {
      case "\\":
        escaped += "\\\\";
        break;
      case "\n":
        escaped += "\\n";
        break;
      case "\r":
        escaped += "\\r";
        break;
      case "\t":
        escaped += "\\t";
        break;
      default:
        if (CONTROL_OR_FORMAT_CHARACTER.test(character)) {
          const codePoint = character.codePointAt(0);
          if (codePoint === undefined) {
            throw new GitTreeSnapshotError("malformed-tree", "Git path decoding failed.");
          }
          escaped += `\\u{${codePoint.toString(16)}}`;
        } else {
          escaped += character;
        }
    }
  }
  return escaped;
}

function classifyEntryMode(mode: string, objectType: string): {
  mode: GitTreeEntryMode;
  kind: GitTreeEntryKind;
  declaredObjectType: "blob" | "commit";
} {
  switch (mode) {
    case "100644":
      if (objectType !== "blob") break;
      return { mode, kind: "regular", declaredObjectType: "blob" };
    case "100755":
      if (objectType !== "blob") break;
      return { mode, kind: "executable", declaredObjectType: "blob" };
    case "120000":
      if (objectType !== "blob") break;
      return { mode, kind: "symlink", declaredObjectType: "blob" };
    case "160000":
      if (objectType !== "commit") break;
      return { mode, kind: "gitlink", declaredObjectType: "commit" };
    default:
      throw new GitTreeSnapshotError(
        "unknown-tree-mode",
        `Target tree contains unsupported entry mode ${JSON.stringify(mode)}.`,
      );
  }
  throw new GitTreeSnapshotError(
    "object-type-mismatch",
    `Target tree mode ${mode} declared inconsistent object type ${JSON.stringify(objectType)}.`,
  );
}

function parseTreeEntries(output: Uint8Array, maxEntries: number): RawTreeEntry[] {
  const entries: RawTreeEntry[] = [];
  const seenPaths = new Set<string>();
  let offset = 0;

  while (offset < output.byteLength) {
    const nul = Buffer.from(output.buffer, output.byteOffset, output.byteLength).indexOf(0, offset);
    if (nul < 0) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree listing was not NUL terminated.");
    }
    if (entries.length >= maxEntries) {
      throw new GitTreeSnapshotBudgetError(
        "entries",
        entries.length + 1,
        maxEntries,
        false,
      );
    }

    const record = output.subarray(offset, nul);
    const tab = record.indexOf(0x09);
    if (tab <= 0 || tab === record.byteLength - 1) {
      throw new GitTreeSnapshotError(
        "malformed-tree",
        "Git tree entry had a malformed path record.",
      );
    }
    const header = ascii(record.subarray(0, tab), "Git tree entry header");
    const headerMatch = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) (?<objectId>[0-9a-f]+)$/.exec(
      header,
    );
    if (headerMatch?.groups === undefined) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree entry header was malformed.");
    }
    const { mode, type, objectId } = headerMatch.groups;
    if (
      mode === undefined ||
      type === undefined ||
      objectId === undefined ||
      !OBJECT_ID.test(objectId)
    ) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree entry metadata was malformed.");
    }
    const classification = classifyEntryMode(mode, type);
    const pathBytes = Uint8Array.from(record.subarray(tab + 1));
    const pathKey = Buffer.from(pathBytes).toString("hex");
    if (seenPaths.has(pathKey)) {
      throw new GitTreeSnapshotError("malformed-tree", "Target tree contained a duplicate path.");
    }
    seenPaths.add(pathKey);
    entries.push({
      ...classification,
      objectId,
      pathBytes,
      displayPath: displayGitPath(pathBytes),
    });
    offset = nul + 1;
  }

  return entries;
}

function newlineTerminatedLines(
  output: Uint8Array,
  expectedCount: number,
  failureCode: "malformed-object-metadata" | "malformed-object-content",
): Uint8Array[] {
  if (expectedCount === 0) {
    if (output.byteLength !== 0) {
      throw new GitTreeSnapshotError(failureCode, "Git returned unexpected batch output.");
    }
    return [];
  }
  if (output.at(-1) !== 0x0a) {
    throw new GitTreeSnapshotError(failureCode, "Git batch output was not newline terminated.");
  }
  const lines: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < output.byteLength; index += 1) {
    if (output[index] !== 0x0a) continue;
    lines.push(output.subarray(offset, index));
    offset = index + 1;
  }
  if (lines.length !== expectedCount) {
    throw new GitTreeSnapshotError(
      failureCode,
      "Git batch output count did not match its request.",
    );
  }
  return lines;
}

function inspectObjectMetadata(
  repositoryPath: string,
  objectIds: readonly string[],
  expectedTypes: ReadonlyMap<string, "blob" | "commit">,
  metadataBytesAlreadyObserved: number,
  metadataLimit: number,
): { metadata: Map<string, ObjectMetadata>; outputBytes: number } {
  if (objectIds.length === 0) return { metadata: new Map(), outputBytes: 0 };
  const metadataBudgetRemaining = metadataLimit - metadataBytesAlreadyObserved;
  const minimumOutputBytes = objectIds.reduce((total, objectId) => total + objectId.length + 8, 0);
  if (minimumOutputBytes > metadataBudgetRemaining) {
    throw new GitTreeSnapshotBudgetError(
      "metadata-bytes",
      metadataBytesAlreadyObserved + minimumOutputBytes,
      metadataLimit,
      false,
    );
  }
  const input = Buffer.from(`${objectIds.join("\n")}\n`, "ascii");
  const output = runGit(
    repositoryPath,
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    input,
    metadataBudgetRemaining,
    "malformed-object-metadata",
    "inspect target Git blob metadata",
    {
      budget: "metadata-bytes",
      alreadyObserved: metadataBytesAlreadyObserved,
      totalLimit: metadataLimit,
    },
  );
  const lines = newlineTerminatedLines(output, objectIds.length, "malformed-object-metadata");
  const metadata = new Map<string, ObjectMetadata>();

  for (let index = 0; index < objectIds.length; index += 1) {
    const expectedObjectId = objectIds[index];
    const line = lines[index];
    if (expectedObjectId === undefined || line === undefined) {
      throw new GitTreeSnapshotError(
        "malformed-object-metadata",
        "Git batch metadata response lost request ordering.",
      );
    }
    const rendered = ascii(line, "Git object metadata");
    const expectedType = expectedTypes.get(expectedObjectId);
    if (expectedType === undefined) {
      throw new GitTreeSnapshotError(
        "malformed-object-metadata",
        "Git object metadata had no declared tree type.",
      );
    }
    if (rendered === `${expectedObjectId} missing`) {
      metadata.set(expectedObjectId, { state: "missing" });
      continue;
    }
    const match = /^(?<objectId>[0-9a-f]+) (?<type>[a-z]+) (?<size>[0-9]+)$/.exec(rendered);
    if (match?.groups === undefined) {
      throw new GitTreeSnapshotError(
        "malformed-object-metadata",
        "Git returned malformed object metadata.",
      );
    }
    const objectId = match.groups.objectId;
    const objectType = match.groups.type;
    const sizeText = match.groups.size;
    if (
      objectId !== expectedObjectId ||
      objectType === undefined ||
      sizeText === undefined ||
      !DECIMAL_INTEGER.test(sizeText)
    ) {
      throw new GitTreeSnapshotError(
        "malformed-object-metadata",
        "Git object metadata did not match its request.",
      );
    }
    if (objectType !== expectedType) {
      throw new GitTreeSnapshotError(
        "object-type-mismatch",
        `Tree entry ${expectedObjectId} resolved to ${objectType}, not ${expectedType}.`,
      );
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) {
      throw new GitTreeSnapshotError(
        "malformed-object-metadata",
        "Git object size exceeded the supported integer range.",
      );
    }
    metadata.set(expectedObjectId, { state: "available", type: expectedType, size });
  }
  return { metadata, outputBytes: output.byteLength };
}

function readBlobObjects(
  repositoryPath: string,
  objectIds: readonly string[],
  metadata: ReadonlyMap<string, ObjectMetadata>,
): { objects: Map<string, Uint8Array>; outputBytes: number } {
  if (objectIds.length === 0) return { objects: new Map(), outputBytes: 0 };
  let expectedOutputBytes = 0;
  for (const objectId of objectIds) {
    const objectMetadata = metadata.get(objectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Attempted to read a Git blob without available metadata.",
      );
    }
    expectedOutputBytes +=
      Buffer.byteLength(`${objectId} blob ${objectMetadata.size}\n`, "ascii") +
      objectMetadata.size +
      1;
    if (!Number.isSafeInteger(expectedOutputBytes)) {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Git batch response size exceeded the supported integer range.",
      );
    }
  }

  const input = Buffer.from(`${objectIds.join("\n")}\n`, "ascii");
  const output = runGit(
    repositoryPath,
    ["cat-file", "--batch"],
    input,
    expectedOutputBytes,
    "malformed-object-content",
    "read target Git blobs",
  );
  const objects = new Map<string, Uint8Array>();
  let offset = 0;

  for (const expectedObjectId of objectIds) {
    const newline = Buffer.from(output.buffer, output.byteOffset, output.byteLength).indexOf(
      0x0a,
      offset,
    );
    if (newline < 0) {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Git blob response header was not newline terminated.",
      );
    }
    const header = ascii(output.subarray(offset, newline), "Git blob response header");
    const objectMetadata = metadata.get(expectedObjectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Git blob metadata became unavailable during its batch read.",
      );
    }
    if (header !== `${expectedObjectId} blob ${objectMetadata.size}`) {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Git blob response did not match its checked metadata.",
      );
    }
    const bodyStart = newline + 1;
    const bodyEnd = bodyStart + objectMetadata.size;
    if (bodyEnd >= output.byteLength || output[bodyEnd] !== 0x0a) {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Git blob response length did not match its checked metadata.",
      );
    }
    objects.set(expectedObjectId, output.subarray(bodyStart, bodyEnd));
    offset = bodyEnd + 1;
  }
  if (offset !== output.byteLength) {
    throw new GitTreeSnapshotError(
      "malformed-object-content",
      "Git returned trailing data after its requested blobs.",
    );
  }
  return { objects, outputBytes: output.byteLength };
}

function parseLfsPointer(bytes: Uint8Array): LfsPointer | null {
  // The Git LFS v1 grammar requires a canonical UTF-8 pointer below 1024 bytes.
  if (bytes.byteLength >= 1_024) return null;
  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    return null;
  }
  if (!text.endsWith("\n") || text.includes("\r")) return null;
  const lines = text.slice(0, -1).split("\n");
  const version = lines.shift();
  if (
    version !== "version https://git-lfs.github.com/spec/v1" &&
    version !== "version https://hawser.github.com/spec/v1"
  ) {
    return null;
  }

  const values = new Map<string, string>();
  let previousKey = "";
  for (const line of lines) {
    const separator = line.indexOf(" ");
    if (separator <= 0 || separator === line.length - 1) return null;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      !/^[a-z0-9.-]+$/.test(key) ||
      key === "version" ||
      key <= previousKey ||
      value.startsWith(" ")
    ) {
      return null;
    }
    previousKey = key;
    values.set(key, value);
  }

  const oid = values.get("oid");
  const sizeText = values.get("size");
  if (oid === undefined || sizeText === undefined) return null;
  if (!/^sha256:[0-9a-f]{64}$/.test(oid) || !DECIMAL_INTEGER.test(sizeText)) return null;
  const declaredSize = Number(sizeText);
  if (!Number.isSafeInteger(declaredSize)) return null;
  return { oid: oid as `sha256:${string}`, declaredSize };
}

/**
 * Read one immutable committed Git tree. No workspace file content is opened and
 * Git is forbidden from lazily fetching missing objects.
 */
export function readGitTreeSnapshot(options: ReadGitTreeSnapshotOptions): GitTreeSnapshot {
  const limits = validateLimits(options.limits);
  const treeObjectId = resolveTreeObjectId(options.repositoryPath, options.treeish);
  const treeOutput = runGit(
    options.repositoryPath,
    ["ls-tree", "-r", "-z", "--full-tree", treeObjectId],
    undefined,
    limits.maxMetadataBytes,
    "tree-unavailable",
    "enumerate the target Git tree",
    {
      budget: "metadata-bytes",
      alreadyObserved: 0,
      totalLimit: limits.maxMetadataBytes,
    },
  );
  const rawEntries = parseTreeEntries(treeOutput, limits.maxEntries);
  const expectedObjectTypes = new Map<string, "blob" | "commit">();
  for (const entry of rawEntries) {
    const previousType = expectedObjectTypes.get(entry.objectId);
    if (previousType !== undefined && previousType !== entry.declaredObjectType) {
      throw new GitTreeSnapshotError(
        "object-type-mismatch",
        `Target tree declares object ${entry.objectId} as both ${previousType} and ${
          entry.declaredObjectType
        }.`,
      );
    }
    expectedObjectTypes.set(entry.objectId, entry.declaredObjectType);
  }
  const uniqueObjectIds = [...expectedObjectTypes.keys()].sort();
  const uniqueBlobObjectIds = uniqueObjectIds.filter(
    (objectId) => expectedObjectTypes.get(objectId) === "blob",
  );
  if (uniqueObjectIds.length > limits.maxUniqueObjects) {
    throw new GitTreeSnapshotBudgetError(
      "unique-objects",
      uniqueObjectIds.length,
      limits.maxUniqueObjects,
      true,
    );
  }

  const metadataResult = inspectObjectMetadata(
    options.repositoryPath,
    uniqueObjectIds,
    expectedObjectTypes,
    treeOutput.byteLength,
    limits.maxMetadataBytes,
  );
  const metadataBytes = treeOutput.byteLength + metadataResult.outputBytes;
  let assessedBlobBytes = 0;
  for (const entry of rawEntries) {
    if (entry.kind === "gitlink") continue;
    const objectMetadata = metadataResult.metadata.get(entry.objectId);
    if (
      objectMetadata?.state !== "available" ||
      objectMetadata.type !== "blob" ||
      objectMetadata.size > limits.maxBlobBytes
    ) {
      continue;
    }
    assessedBlobBytes += objectMetadata.size;
    if (assessedBlobBytes > limits.maxTotalBlobBytes) {
      throw new GitTreeSnapshotBudgetError(
        "total-blob-bytes",
        assessedBlobBytes,
        limits.maxTotalBlobBytes,
        true,
      );
    }
  }

  const readableObjectIds = uniqueBlobObjectIds.filter((objectId) => {
    const objectMetadata = metadataResult.metadata.get(objectId);
    return (
      objectMetadata?.state === "available" &&
      objectMetadata.type === "blob" &&
      objectMetadata.size <= limits.maxBlobBytes
    );
  });
  const blobResult = readBlobObjects(
    options.repositoryPath,
    readableObjectIds,
    metadataResult.metadata,
  );

  const diagnostics: GitTreeSnapshotDiagnostic[] = [];
  const entries: GitTreeSnapshotEntry[] = [];
  let availableBlobEntryCount = 0;
  let oversizedBlobEntryCount = 0;
  let unavailableBlobEntryCount = 0;
  let symlinkEntryCount = 0;
  let gitlinkEntryCount = 0;
  let lfsPointerEntryCount = 0;

  for (const entry of rawEntries) {
    if (entry.kind === "gitlink") {
      gitlinkEntryCount += 1;
      diagnostics.push({
        code: "gitlink-boundary",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
      });
      entries.push({
        ...entry,
        objectSize: null,
        content: { state: "gitlink-boundary" },
      });
      continue;
    }
    if (entry.kind === "symlink") {
      symlinkEntryCount += 1;
      diagnostics.push({
        code: "symlink-link-text",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
      });
    }

    const objectMetadata = metadataResult.metadata.get(entry.objectId);
    if (objectMetadata === undefined || objectMetadata.state === "missing") {
      unavailableBlobEntryCount += 1;
      diagnostics.push({
        code: "blob-unavailable",
        coverageImpact: "partial",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
      });
      entries.push({
        ...entry,
        objectSize: null,
        content: { state: "unavailable" },
      });
      continue;
    }
    if (objectMetadata.size > limits.maxBlobBytes) {
      oversizedBlobEntryCount += 1;
      diagnostics.push({
        code: "blob-too-large",
        coverageImpact: "partial",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
        objectSize: objectMetadata.size,
        limitBytes: limits.maxBlobBytes,
      });
      entries.push({
        ...entry,
        objectSize: objectMetadata.size,
        content: {
          state: "too-large",
          objectSize: objectMetadata.size,
          limitBytes: limits.maxBlobBytes,
        },
      });
      continue;
    }

    const bytes = blobResult.objects.get(entry.objectId);
    if (bytes === undefined) {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "A checked Git blob was absent from the batch response.",
      );
    }
    const lfsPointer = entry.kind === "symlink" ? null : parseLfsPointer(bytes);
    if (lfsPointer !== null) {
      lfsPointerEntryCount += 1;
      diagnostics.push({
        code: "git-lfs-boundary",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
        lfsObjectId: lfsPointer.oid,
        declaredSize: lfsPointer.declaredSize,
      });
      entries.push({
        ...entry,
        objectSize: objectMetadata.size,
        content: {
          state: "lfs-pointer",
          bytes,
          oid: lfsPointer.oid,
          declaredSize: lfsPointer.declaredSize,
        },
      });
      continue;
    }

    availableBlobEntryCount += 1;
    entries.push({
      ...entry,
      objectSize: objectMetadata.size,
      content: { state: "available", bytes },
    });
  }

  const partial = diagnostics.some((diagnostic) => diagnostic.coverageImpact === "partial");
  const readObjectBytes = readableObjectIds.reduce((total, objectId) => {
    const objectMetadata = metadataResult.metadata.get(objectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError(
        "malformed-object-content",
        "Readable Git object metadata was lost while computing statistics.",
      );
    }
    return total + objectMetadata.size;
  }, 0);

  return {
    treeObjectId,
    scanStatus: partial ? "partial" : "complete",
    entries,
    diagnostics,
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length - gitlinkEntryCount,
      uniqueObjectCount: uniqueObjectIds.length,
      uniqueBlobObjectCount: uniqueBlobObjectIds.length,
      availableBlobEntryCount,
      oversizedBlobEntryCount,
      unavailableBlobEntryCount,
      symlinkEntryCount,
      gitlinkEntryCount,
      lfsPointerEntryCount,
      assessedBlobBytes,
      readObjectBytes,
      readObjectCount: readableObjectIds.length,
      metadataBytes,
    },
    limits,
  };
}
