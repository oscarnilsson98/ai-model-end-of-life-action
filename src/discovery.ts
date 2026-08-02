import {
  lstatSync,
  opendirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  FileByteLimitError,
  readBoundedRegularFileBytes,
} from "./document.ts";
import { normalizeProvider } from "./input.ts";
import type { DeprecationRecord, InputModel } from "./types.ts";

export type DiscoveryLocation = {
  path: string;
  line: number;
  column: number;
};

export type DiscoveredModel = {
  id: string;
  providers: string[];
  ambiguous: boolean;
  occurrenceCount: number;
  locations: DiscoveryLocation[];
  locationsTruncated: boolean;
  tracked: boolean;
};

export type DiscoveryLimits = {
  maxPaths: number;
  maxCandidates: number;
  maxCandidateCodeUnits: number;
  maxAutomatonNodes: number;
  maxEntries: number;
  maxFiles: number;
  maxDirectories: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxMatches: number;
  maxLocationsPerModel: number;
};

export type DiscoveryOptions = {
  inventory?: readonly InputModel[];
  excludedPaths?: readonly string[];
  limits?: Partial<DiscoveryLimits>;
};

export type DiscoveryResult = {
  models: DiscoveredModel[];
  candidateCount: number;
  examinedFileCount: number;
  scannedFileCount: number;
  scannedByteCount: number;
  skippedFileCount: number;
  skippedSymlinkCount: number;
  matchCount: number;
};

export type PublishedDiscoveredModel = Omit<
  DiscoveredModel,
  "providers" | "locations" | "locationsTruncated"
> & {
  providers: string[];
  providersTruncated: boolean;
  locations: DiscoveryLocation[];
  locationsTruncated: boolean;
};

export type DiscoveryPublication = {
  json: string;
  truncated: boolean;
};

export const DEFAULT_DISCOVERY_LIMITS: Readonly<DiscoveryLimits> = Object.freeze({
  maxPaths: 100,
  maxCandidates: 20_000,
  maxCandidateCodeUnits: 250_000,
  maxAutomatonNodes: 250_000,
  maxEntries: 50_000,
  maxFiles: 25_000,
  maxDirectories: 25_000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxMatches: 100_000,
  maxLocationsPerModel: 50,
});

export const DISCOVERY_SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".tox",
  ".turbo",
  ".venv",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "env",
  "generated",
  "node_modules",
  "out",
  "target",
  "vendor",
  "vendors",
  "venv",
]);

export const DISCOVERY_LOCKFILES: ReadonlySet<string> = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "flake.lock",
  "gemfile.lock",
  "go.sum",
  "gradle.lockfile",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "packages.lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock",
]);

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".a",
  ".arrow",
  ".avif",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".dat",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".ogg",
  ".onnx",
  ".otf",
  ".parquet",
  ".pb",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".safetensors",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".tiff",
  ".ttf",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
  ".zst",
]);

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MACHINE_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$/;
const IDENTIFIER_CHARACTER = /^[\p{L}\p{N}\p{M}._:/-]$/u;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const MAX_PATH_LENGTH = 4_096;
const MAX_PUBLISHED_PROVIDERS = 20;
const MAX_PUBLISHED_LOCATIONS = 5;

type Candidate = {
  id: string;
  providers: string[];
  providerKeys: ReadonlySet<string>;
};

type AutomatonNode = {
  transitions: Map<string, number>;
  failure: number;
  outputs: number[];
};

type MutableStats = {
  examinedFileCount: number;
  scannedFileCount: number;
  scannedByteCount: number;
  skippedFileCount: number;
  skippedSymlinkCount: number;
  directoryCount: number;
  examinedEntryCount: number;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolvedLimits(overrides: Partial<DiscoveryLimits> | undefined): DiscoveryLimits {
  const result = { ...DEFAULT_DISCOVERY_LIMITS };
  if (overrides === undefined) return result;
  for (const key of Object.keys(overrides) as (keyof DiscoveryLimits)[]) {
    if (!(key in DEFAULT_DISCOVERY_LIMITS)) {
      throw new Error(`Unknown discovery limit: ${key}.`);
    }
    const value = overrides[key];
    if (
      value === undefined ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > DEFAULT_DISCOVERY_LIMITS[key]
    ) {
      throw new Error(
        `Invalid discovery limit ${key}: expected an integer from 1 to ${DEFAULT_DISCOVERY_LIMITS[key]}.`,
      );
    }
    result[key] = value;
  }
  return result;
}

/** Split comma/newline-separated literal paths. An empty value scans the workspace root. */
export function parseDiscoveryPaths(
  rawPaths: string | undefined,
  maxPaths = DEFAULT_DISCOVERY_LIMITS.maxPaths,
): string[] {
  if (
    !Number.isSafeInteger(maxPaths) ||
    maxPaths < 1 ||
    maxPaths > DEFAULT_DISCOVERY_LIMITS.maxPaths
  ) {
    throw new Error(
      `Invalid discovery path limit: expected an integer from 1 to ${DEFAULT_DISCOVERY_LIMITS.maxPaths}.`,
    );
  }
  const paths = (rawPaths?.trim() === "" || rawPaths === undefined ? "." : rawPaths)
    .split(/[,\r\n]+/)
    .map((path) => path.trim())
    .filter((path) => path !== "");
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (path.length > MAX_PATH_LENGTH || CONTROL_CHARACTER.test(path)) {
      throw new Error(
        `Discovery path must not contain control characters and must be at most ${MAX_PATH_LENGTH} characters.`,
      );
    }
    if (!seen.has(path)) {
      seen.add(path);
      unique.push(path);
    }
  }
  if (unique.length > maxPaths) {
    throw new Error(`Discovery requested ${unique.length} paths; the limit is ${maxPaths}.`);
  }
  return unique;
}

/** Conservative model IDs are ASCII machine tokens with a digit or separator. */
export function isDiscoverableModelId(id: string): boolean {
  return (
    id.length >= 2 &&
    id.length <= 256 &&
    MACHINE_IDENTIFIER.test(id) &&
    /[A-Za-z]/.test(id) &&
    !id.includes("://") &&
    (/[0-9]/.test(id) || /[._:/-]/.test(id))
  );
}

function buildCandidates(
  feed: readonly DeprecationRecord[],
  maxCandidates: number,
  maxCandidateCodeUnits: number,
): Candidate[] {
  const providersById = new Map<string, Map<string, Set<string>>>();
  let candidateCodeUnits = 0;
  for (const record of feed) {
    if (!isDiscoverableModelId(record.model_id)) continue;
    let providerMap = providersById.get(record.model_id);
    if (providerMap === undefined) {
      if (providersById.size >= maxCandidates) {
        throw new Error(
          `Discovery feed contains more than ${maxCandidates} eligible model identifiers.`,
        );
      }
      candidateCodeUnits += record.model_id.length;
      if (candidateCodeUnits > maxCandidateCodeUnits) {
        throw new Error(
          `Discovery feed model identifiers exceed the ${maxCandidateCodeUnits}-code-unit candidate limit.`,
        );
      }
      providerMap = new Map();
      providersById.set(record.model_id, providerMap);
    }
    const providerKey = normalizeProvider(record.provider);
    let displays = providerMap.get(providerKey);
    if (displays === undefined) {
      displays = new Set();
      providerMap.set(providerKey, displays);
    }
    displays.add(record.provider);
  }

  return [...providersById.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, providerMap]) => {
      const providerKeys = new Set([...providerMap.keys()].sort(compareText));
      const providers = [...providerMap.values()]
        .map((displays) => [...displays].sort(compareText)[0] as string)
        .sort(compareText);
      return { id, providers, providerKeys };
    });
}

function buildAutomaton(
  candidates: readonly Candidate[],
  maxAutomatonNodes: number,
): AutomatonNode[] {
  const nodes: AutomatonNode[] = [
    { transitions: new Map(), failure: 0, outputs: [] },
  ];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex] as Candidate;
    let state = 0;
    for (const character of candidate.id) {
      const existing = nodes[state]?.transitions.get(character);
      if (existing !== undefined) {
        state = existing;
        continue;
      }
      const next = nodes.length;
      if (next >= maxAutomatonNodes) {
        throw new Error(
          `Discovery matcher requires more than ${maxAutomatonNodes} automaton nodes.`,
        );
      }
      nodes.push({ transitions: new Map(), failure: 0, outputs: [] });
      nodes[state]?.transitions.set(character, next);
      state = next;
    }
    nodes[state]?.outputs.push(candidateIndex);
  }

  const queue: number[] = [];
  for (const state of nodes[0]?.transitions.values() ?? []) {
    queue.push(state);
  }
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const state = queue[queueIndex] as number;
    const node = nodes[state] as AutomatonNode;
    for (const [character, next] of node.transitions) {
      queue.push(next);
      let fallback = node.failure;
      while (fallback !== 0 && !nodes[fallback]?.transitions.has(character)) {
        fallback = (nodes[fallback] as AutomatonNode).failure;
      }
      const fallbackTransition = nodes[fallback]?.transitions.get(character);
      const failure = fallbackTransition === undefined || fallbackTransition === next
        ? 0
        : fallbackTransition;
      const nextNode = nodes[next] as AutomatonNode;
      nextNode.failure = failure;
    }
  }
  return nodes;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && IDENTIFIER_CHARACTER.test(value);
}

function characterBefore(value: string, offset: number): string | undefined {
  if (offset <= 0) return undefined;
  const lastCodeUnit = value.charCodeAt(offset - 1);
  const start =
    lastCodeUnit >= 0xdc00 && lastCodeUnit <= 0xdfff && offset >= 2
      ? offset - 2
      : offset - 1;
  return String.fromCodePoint(value.codePointAt(start) as number);
}

function characterAt(value: string, offset: number): string | undefined {
  const codePoint = value.codePointAt(offset);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
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

function displayPath(workspace: string, filePath: string): string {
  return relative(workspace, filePath).split(sep).join("/");
}

function isSkippedFile(filePath: string): boolean {
  const fileName = filePath.slice(filePath.lastIndexOf(sep) + 1).toLowerCase();
  return (
    DISCOVERY_LOCKFILES.has(fileName) ||
    fileName.endsWith(".lock") ||
    BINARY_EXTENSIONS.has(extname(fileName).toLowerCase())
  );
}

function collectFiles(
  workspace: string,
  lexicalWorkspace: string,
  paths: readonly string[],
  excludedFiles: ReadonlySet<string>,
  limits: DiscoveryLimits,
  stats: MutableStats,
): string[] {
  const files = new Set<string>();
  const examinedFiles = new Set<string>();
  const queuedDirectories = new Set<string>();
  const directoryStack: string[] = [];

  const addFile = (filePath: string): void => {
    if (examinedFiles.has(filePath)) return;
    examinedFiles.add(filePath);
    stats.examinedFileCount += 1;
    if (stats.examinedFileCount > limits.maxFiles) {
      throw new Error(`Discovery examined more than ${limits.maxFiles} files.`);
    }
    if (excludedFiles.has(filePath)) {
      stats.skippedFileCount += 1;
      return;
    }
    if (isSkippedFile(filePath)) {
      stats.skippedFileCount += 1;
      return;
    }
    files.add(filePath);
  };

  const addDirectory = (directory: string): void => {
    if (queuedDirectories.has(directory)) return;
    queuedDirectories.add(directory);
    stats.directoryCount += 1;
    if (stats.directoryCount > limits.maxDirectories) {
      throw new Error(`Discovery entered more than ${limits.maxDirectories} directories.`);
    }
    directoryStack.push(directory);
  };

  for (const requestedPath of paths) {
    const absoluteRequest = isAbsolute(requestedPath);
    const lexicalPath = absoluteRequest
      ? resolve(requestedPath)
      : resolve(workspace, requestedPath);
    const containmentRoot = absoluteRequest ? lexicalWorkspace : workspace;
    if (!withinWorkspace(containmentRoot, lexicalPath)) {
      throw new Error(`Discovery path escapes the workspace: ${requestedPath}`);
    }
    let pathStats: ReturnType<typeof lstatSync>;
    try {
      pathStats = lstatSync(lexicalPath);
    } catch (error) {
      throw new Error(
        `Could not access discovery path ${requestedPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (pathStats.isSymbolicLink()) {
      stats.skippedSymlinkCount += 1;
      continue;
    }
    const canonicalPath = realpathSync(lexicalPath);
    if (!withinWorkspace(workspace, canonicalPath)) {
      throw new Error(`Discovery path resolves outside the workspace: ${requestedPath}`);
    }
    if (pathStats.isFile()) addFile(canonicalPath);
    else if (pathStats.isDirectory()) {
      const baseName = canonicalPath.slice(canonicalPath.lastIndexOf(sep) + 1).toLowerCase();
      if (canonicalPath === workspace || !DISCOVERY_SKIPPED_DIRECTORIES.has(baseName)) {
        addDirectory(canonicalPath);
      }
    } else {
      stats.skippedFileCount += 1;
    }
  }

  while (directoryStack.length > 0) {
    const directory = directoryStack.pop() as string;
    let directoryHandle: ReturnType<typeof opendirSync>;
    try {
      directoryHandle = opendirSync(directory, { encoding: "utf8" });
    } catch (error) {
      throw new Error(
        `Could not read discovery directory ${displayPath(workspace, directory)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      while (true) {
        let entry: ReturnType<typeof directoryHandle.readSync>;
        try {
          entry = directoryHandle.readSync();
        } catch (error) {
          throw new Error(
            `Could not read discovery directory ${displayPath(workspace, directory)}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (entry === null) break;
        stats.examinedEntryCount += 1;
        if (stats.examinedEntryCount > limits.maxEntries) {
          throw new Error(
            `Discovery examined more than ${limits.maxEntries} filesystem entries.`,
          );
        }
        const childPath = resolve(directory, entry.name);
        let childStats: ReturnType<typeof lstatSync>;
        try {
          childStats = lstatSync(childPath);
        } catch {
          stats.skippedFileCount += 1;
          continue;
        }
        if (childStats.isSymbolicLink()) {
          stats.skippedSymlinkCount += 1;
          continue;
        }
        if (childStats.isDirectory()) {
          if (!DISCOVERY_SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) {
            addDirectory(childPath);
          }
        } else if (childStats.isFile()) {
          addFile(childPath);
        } else {
          stats.skippedFileCount += 1;
        }
      }
    } finally {
      try {
        directoryHandle.closeSync();
      } catch {
        // The directory may already be closed after an underlying read failure.
      }
    }
  }

  return [...files].sort(compareText);
}

function resolveExcludedFiles(
  workspace: string,
  lexicalWorkspace: string,
  requestedPaths: readonly string[],
): Set<string> {
  const excluded = new Set<string>();
  for (const requestedPath of requestedPaths) {
    const trimmed = requestedPath.trim();
    if (trimmed === "" || trimmed.length > MAX_PATH_LENGTH || CONTROL_CHARACTER.test(trimmed)) {
      continue;
    }
    const absoluteRequest = isAbsolute(trimmed);
    const lexicalPath = absoluteRequest ? resolve(trimmed) : resolve(workspace, trimmed);
    const containmentRoot = absoluteRequest ? lexicalWorkspace : workspace;
    if (!withinWorkspace(containmentRoot, lexicalPath)) continue;
    try {
      const canonicalPath = realpathSync(lexicalPath);
      if (withinWorkspace(workspace, canonicalPath) && statSync(canonicalPath).isFile()) {
        excluded.add(canonicalPath);
      }
    } catch {
      // The owning input loader reports inaccessible configured files with a more specific error.
    }
  }
  return excluded;
}

function readText(
  filePath: string,
  limits: DiscoveryLimits,
  stats: MutableStats,
): string | null {
  const remainingAggregateBytes = limits.maxTotalBytes - stats.scannedByteCount;
  const readLimit = Math.min(limits.maxFileBytes, remainingAggregateBytes);
  let bytes: Uint8Array;
  try {
    bytes = readBoundedRegularFileBytes(
      filePath,
      readLimit,
      "discovery file",
    );
  } catch (error) {
    if (
      error instanceof FileByteLimitError &&
      error.observedBytes <= limits.maxFileBytes &&
      readLimit === remainingAggregateBytes
    ) {
      throw new Error(
        `Discovery input exceeds the ${limits.maxTotalBytes}-byte aggregate limit.`,
      );
    }
    stats.skippedFileCount += 1;
    return null;
  }
  if (bytes.length === 0) return null;
  if (stats.scannedByteCount + bytes.length > limits.maxTotalBytes) {
    throw new Error(
      `Discovery input exceeds the ${limits.maxTotalBytes}-byte aggregate limit.`,
    );
  }
  stats.scannedByteCount += bytes.length;
  if (bytes.includes(0)) {
    stats.skippedFileCount += 1;
    return null;
  }
  try {
    const text = UTF8_DECODER.decode(bytes);
    stats.scannedFileCount += 1;
    return text;
  } catch {
    stats.skippedFileCount += 1;
    return null;
  }
}

function trackedByInventory(
  candidate: Candidate,
  inventory: readonly InputModel[],
): boolean {
  return inventory.some(
    (model) =>
      model.id === candidate.id &&
      (model.provider === undefined || candidate.providerKeys.has(normalizeProvider(model.provider))),
  );
}

/**
 * Scan workspace-local files for exact, case-sensitive feed model IDs.
 * The result contains coordinates only and never returns source text or snippets.
 */
export function discoverModels(
  feed: readonly DeprecationRecord[],
  workspacePath: string,
  rawPaths: string | undefined,
  options: DiscoveryOptions = {},
): DiscoveryResult {
  const limits = resolvedLimits(options.limits);
  const lexicalWorkspace = resolve(workspacePath);
  const workspace = realpathSync(lexicalWorkspace);
  if (!statSync(workspace).isDirectory()) {
    throw new Error(`Discovery workspace is not a directory: ${workspacePath}`);
  }
  const paths = parseDiscoveryPaths(rawPaths, limits.maxPaths);
  const candidates = buildCandidates(
    feed,
    limits.maxCandidates,
    limits.maxCandidateCodeUnits,
  );
  const automaton = buildAutomaton(candidates, limits.maxAutomatonNodes);
  const inventory = options.inventory ?? [];
  const stats: MutableStats = {
    examinedFileCount: 0,
    scannedFileCount: 0,
    scannedByteCount: 0,
    skippedFileCount: 0,
    skippedSymlinkCount: 0,
    directoryCount: 0,
    examinedEntryCount: 0,
  };
  const excludedFiles = resolveExcludedFiles(
    workspace,
    lexicalWorkspace,
    options.excludedPaths ?? [],
  );
  const files = collectFiles(
    workspace,
    lexicalWorkspace,
    paths,
    excludedFiles,
    limits,
    stats,
  );
  const matches = new Map<
    number,
    { occurrenceCount: number; locations: DiscoveryLocation[] }
  >();
  let matchCount = 0;

  for (const filePath of files) {
    const text = readText(filePath, limits, stats);
    if (text === null || candidates.length === 0) continue;
    let state = 0;
    let line = 1;
    let column = 1;
    let codeUnitOffset = 0;
    let previousWasCarriageReturn = false;
    for (const character of text) {
      while (state !== 0 && !automaton[state]?.transitions.has(character)) {
        state = (automaton[state] as AutomatonNode).failure;
      }
      state = automaton[state]?.transitions.get(character) ?? 0;
      const node = automaton[state] as AutomatonNode;
      // A proper suffix output is always preceded by another valid identifier
      // character from the longer candidate, so it cannot pass the token boundary.
      // Keeping only terminal outputs avoids both propagated-output memory growth
      // and unbounded suffix walks for large identifier tokens.
      for (const candidateIndex of node.outputs) {
        const candidate = candidates[candidateIndex] as Candidate;
        const endOffset = codeUnitOffset + character.length;
        const startOffset = endOffset - candidate.id.length;
        if (
          isIdentifierCharacter(characterBefore(text, startOffset)) ||
          isIdentifierCharacter(characterAt(text, endOffset))
        ) {
          continue;
        }
        matchCount += 1;
        if (matchCount > limits.maxMatches) {
          throw new Error(`Discovery found more than ${limits.maxMatches} model occurrences.`);
        }
        let found = matches.get(candidateIndex);
        if (found === undefined) {
          found = { occurrenceCount: 0, locations: [] };
          matches.set(candidateIndex, found);
        }
        found.occurrenceCount += 1;
        if (found.locations.length < limits.maxLocationsPerModel) {
          found.locations.push({
            path: displayPath(workspace, filePath),
            line,
            column: column - candidate.id.length + 1,
          });
        }
      }
      codeUnitOffset += character.length;
      if (character === "\r") {
        line += 1;
        column = 1;
        previousWasCarriageReturn = true;
      } else if (character === "\n") {
        if (!previousWasCarriageReturn) line += 1;
        column = 1;
        previousWasCarriageReturn = false;
      } else {
        column += 1;
        previousWasCarriageReturn = false;
      }
    }
  }

  const models = [...matches.entries()]
    .sort(([left], [right]) => compareText(
      (candidates[left] as Candidate).id,
      (candidates[right] as Candidate).id,
    ))
    .map(([candidateIndex, found]): DiscoveredModel => {
      const candidate = candidates[candidateIndex] as Candidate;
      return {
        id: candidate.id,
        providers: candidate.providers,
        ambiguous: candidate.providerKeys.size > 1,
        occurrenceCount: found.occurrenceCount,
        locations: found.locations,
        locationsTruncated: found.locations.length < found.occurrenceCount,
        tracked: trackedByInventory(candidate, inventory),
      };
    });

  return {
    models,
    candidateCount: candidates.length,
    examinedFileCount: stats.examinedFileCount,
    scannedFileCount: stats.scannedFileCount,
    scannedByteCount: stats.scannedByteCount,
    skippedFileCount: stats.skippedFileCount,
    skippedSymlinkCount: stats.skippedSymlinkCount,
    matchCount,
  };
}

/** Serialize a deterministic prefix of discovery results within a UTF-16 output budget. */
export function publishDiscoveredModels(
  models: readonly DiscoveredModel[],
  maxCodeUnits = 100_000,
): DiscoveryPublication {
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 2 || maxCodeUnits > 400_000) {
    throw new Error("Invalid discovery output budget: expected an integer from 2 to 400000.");
  }
  const entries: string[] = [];
  let usedCodeUnits = 2;
  let truncated = false;
  for (const model of models) {
    const providers = model.providers.slice(0, MAX_PUBLISHED_PROVIDERS);
    const locations = model.locations.slice(0, MAX_PUBLISHED_LOCATIONS);
    const published: PublishedDiscoveredModel = {
      id: model.id,
      providers,
      providersTruncated: providers.length < model.providers.length,
      ambiguous: model.ambiguous,
      occurrenceCount: model.occurrenceCount,
      locations,
      locationsTruncated:
        model.locationsTruncated || locations.length < model.locations.length,
      tracked: model.tracked,
    };
    let serialized = JSON.stringify(published);
    const separatorSize = entries.length === 0 ? 0 : 1;
    if (usedCodeUnits + separatorSize + serialized.length > maxCodeUnits) {
      const compact: PublishedDiscoveredModel = {
        ...published,
        providers: providers.slice(0, 1),
        providersTruncated: providers.length > 1 || published.providersTruncated,
        locations: locations.slice(0, 1),
        locationsTruncated: locations.length > 1 || published.locationsTruncated,
      };
      serialized = JSON.stringify(compact);
      if (usedCodeUnits + separatorSize + serialized.length > maxCodeUnits) {
        truncated = true;
        break;
      }
      truncated = true;
    }
    if (published.providersTruncated || published.locationsTruncated) truncated = true;
    entries.push(serialized);
    usedCodeUnits += separatorSize + serialized.length;
  }
  if (entries.length < models.length) truncated = true;
  return { json: `[${entries.join(",")}]`, truncated };
}
