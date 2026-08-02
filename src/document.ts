import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MAX_PATH_LENGTH = 4_096;

export type JsonDocument = {
  value: unknown;
  bytes: Uint8Array;
};

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

  let size: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("path is not a regular file");
    size = stats.size;
  } catch (error) {
    throw new Error(
      `Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (size > maxBytes) {
    throw new Error(`${label} is ${size} bytes; the limit is ${maxBytes} bytes.`);
  }

  let bytes: Uint8Array;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    throw new Error(
      `Could not read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${label} is ${bytes.byteLength} bytes; the limit is ${maxBytes} bytes.`);
  }
  return bytes;
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
