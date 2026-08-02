import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MAX_PATH_LENGTH = 4_096;
const READ_CHUNK_BYTES = 64 * 1024;

export type JsonDocument = {
  value: unknown;
  bytes: Uint8Array;
};

export class FileByteLimitError extends Error {
  constructor(
    label: string,
    readonly observedBytes: number,
    readonly limitBytes: number,
    observedExactly: boolean,
  ) {
    super(
      observedExactly
        ? `${label} is ${observedBytes} bytes; the limit is ${limitBytes} bytes.`
        : `${label} is at least ${observedBytes} bytes; the limit is ${limitBytes} bytes.`,
    );
    this.name = "FileByteLimitError";
  }
}

/** Read one regular file through a single descriptor with a hard byte ceiling. */
export function readBoundedRegularFileBytes(
  filePath: string,
  maxBytes: number,
  label: string,
): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error(`Invalid byte limit for ${label}.`);
  }

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let descriptor: number;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | noFollow);
  } catch (error) {
    throw new Error(
      `Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    let size: number;
    try {
      const stats = fstatSync(descriptor);
      if (!stats.isFile()) throw new Error("path is not a regular file");
      size = stats.size;
    } catch (error) {
      throw new Error(
        `Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (size > maxBytes) {
      throw new FileByteLimitError(label, size, maxBytes, true);
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (totalBytes <= maxBytes) {
      const chunk = Buffer.allocUnsafe(
        Math.min(READ_CHUNK_BYTES, maxBytes + 1 - totalBytes),
      );
      let bytesRead: number;
      try {
        bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      } catch (error) {
        throw new Error(
          `Could not read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (bytesRead === 0) break;
      chunks.push(bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maxBytes) {
      throw new FileByteLimitError(label, totalBytes, maxBytes, false);
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    try {
      closeSync(descriptor);
    } catch {
      // The read result or primary error is more actionable than a close failure.
    }
  }
}

function withinWorkspace(workspace: string, candidate: string): boolean {
  const pathFromWorkspace = relative(workspace, candidate);
  return (
    pathFromWorkspace === "" ||
    (!isAbsolute(pathFromWorkspace) &&
      pathFromWorkspace !== ".." &&
      !pathFromWorkspace.startsWith(`..${sep}`))
  );
}

export function readBoundedFileBytes(
  requestedPath: string,
  workspace: string,
  maxBytes: number,
  label: string,
): Uint8Array {
  const trimmed = requestedPath.trim();
  if (
    trimmed === "" ||
    trimmed.length > MAX_PATH_LENGTH ||
    CONTROL_CHARACTER.test(trimmed)
  ) {
    throw new Error(`${label} must be a safe path of at most ${MAX_PATH_LENGTH} characters.`);
  }
  let workspacePath: string;
  const lexicalWorkspace = resolve(workspace);
  try {
    workspacePath = realpathSync(lexicalWorkspace);
  } catch (error) {
    throw new Error(
      `Could not access the GitHub workspace at ${workspace}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const lexicalPath = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(lexicalWorkspace, trimmed);
  if (!withinWorkspace(lexicalWorkspace, lexicalPath)) {
    throw new Error(`${label} must resolve within the GitHub workspace.`);
  }

  let filePath: string;
  try {
    filePath = realpathSync(lexicalPath);
  } catch (error) {
    throw new Error(
      `Could not access ${label} at ${lexicalPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!withinWorkspace(workspacePath, filePath)) {
    throw new Error(`${label} must resolve within the GitHub workspace.`);
  }

  return readBoundedRegularFileBytes(filePath, maxBytes, label);
}

/** Decode one bounded JSON document with strict UTF-8 semantics. */
export function decodeJsonDocument(bytes: Uint8Array, label: string): JsonDocument {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `${label} was not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return { value: JSON.parse(text) as unknown, bytes };
  } catch (error) {
    throw new Error(
      `${label} did not contain valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Read a regular local JSON file without silently following an oversized input. */
export function readJsonDocumentFile(
  requestedPath: string,
  workspace: string,
  maxBytes: number,
  label: string,
): JsonDocument {
  const bytes = readBoundedFileBytes(requestedPath, workspace, maxBytes, label);
  return decodeJsonDocument(bytes, label);
}
