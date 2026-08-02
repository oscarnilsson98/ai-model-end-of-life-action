import { readBoundedFileBytes } from "./document.ts";
import type { InputModel } from "./types.ts";

export const MAX_MODELS = 1_000;
export const MAX_MODEL_ID_LENGTH = 256;
export const MAX_MODELS_INPUT_BYTES = 1_000_000;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const MAX_PATH_LENGTH = 4_096;
const MAX_URL_LENGTH = 8_192;

/** JSON Schema `maxLength` and human-facing character limits count Unicode code points. */
export function unicodeCodePointLength(value: string): number {
  let length = 0;
  for (const _character of value) length += 1;
  return length;
}

function preview(value: string | undefined, maxLength = 160): string {
  if (value === undefined) return "undefined";
  const shortened =
    value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
  return JSON.stringify(shortened);
}

const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  openai: "openai",
  "open-ai": "openai",
  anthropic: "anthropic",
  "anthropic-ai": "anthropic",
  google: "google",
  "google-ai": "google",
  gemini: "google",
  "google-gemini": "google",
  "google-vertex": "google-vertex",
  "google-vertex-ai": "google-vertex",
  "google-cloud-vertex": "google-vertex",
  "google-cloud-vertex-ai": "google-vertex",
  vertex: "google-vertex",
  vertexai: "google-vertex",
  "vertex-ai": "google-vertex",
  gcp: "google-vertex",
  "gcp-vertex": "google-vertex",
  "gcp-vertex-ai": "google-vertex",
  "aws-bedrock": "aws-bedrock",
  "amazon-bedrock": "aws-bedrock",
  "amazon-web-services-bedrock": "aws-bedrock",
  bedrock: "aws-bedrock",
  aws: "aws-bedrock",
  azure: "azure",
  "azure-ai": "azure",
  "azure-openai": "azure",
  "azure-foundry": "azure",
  "azure-ai-foundry": "azure",
  "microsoft-azure": "azure",
  "microsoft-azure-ai": "azure",
  cohere: "cohere",
  groq: "groq",
  xai: "xai",
  "x-ai": "xai",
};

function providerKey(provider: string): string {
  return provider
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Fold documented serving-platform aliases while keeping distinct platforms separate. */
export function normalizeProvider(provider: string): string {
  const key = providerKey(provider);
  return PROVIDER_ALIASES[key] ?? key;
}

function validateText(value: string, field: string, index: number, maxLength: number): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`\`models[${index}].${field}\` must not be empty.`);
  }
  if (unicodeCodePointLength(normalized) > maxLength) {
    throw new Error(`\`models[${index}].${field}\` must be at most ${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER.test(normalized)) {
    throw new Error(`\`models[${index}].${field}\` must not contain control characters.`);
  }
  return normalized;
}

/** Parse and validate one JSON model inventory. */
export function parseModels(raw: string, inputName = "models"): InputModel[] {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error(`\`${inputName}\` input is empty.`);
  if (Buffer.byteLength(trimmed, "utf8") > MAX_MODELS_INPUT_BYTES) {
    throw new Error(`\`${inputName}\` is larger than ${MAX_MODELS_INPUT_BYTES} bytes.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `\`${inputName}\` is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`\`${inputName}\` must be a JSON array.`);
  }
  if (parsed.length === 0) {
    throw new Error(`\`${inputName}\` must contain at least one model.`);
  }
  if (parsed.length > MAX_MODELS) {
    throw new Error(`\`${inputName}\` contains ${parsed.length} models; the limit is ${MAX_MODELS}.`);
  }

  const models = parsed.map((entry, index): InputModel => {
    if (typeof entry === "string") {
      return { id: validateText(entry, "id", index, MAX_MODEL_ID_LENGTH) };
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`\`models[${index}]\` must be a string or an object with an \`id\` string.`);
    }

    const candidate = entry as { id?: unknown; provider?: unknown };
    const unsupportedKeys = Object.keys(candidate).filter(
      (key) => key !== "id" && key !== "provider",
    );
    if (unsupportedKeys.length > 0) {
      const shown = unsupportedKeys.slice(0, 10).map((key) => preview(key, 80));
      const omitted = unsupportedKeys.length - shown.length;
      throw new Error(
        `\`models[${index}]\` has unsupported field(s): ${shown.join(", ")}${omitted > 0 ? `, … +${omitted} more` : ""}. Expected only \`id\` and optional \`provider\`.`,
      );
    }
    if (typeof candidate.id !== "string") {
      throw new Error(`\`models[${index}].id\` must be a string.`);
    }
    const id = validateText(candidate.id, "id", index, MAX_MODEL_ID_LENGTH);
    if (candidate.provider === undefined) return { id };
    if (typeof candidate.provider !== "string") {
      throw new Error(`\`models[${index}].provider\` must be a string when supplied.`);
    }
    const provider = validateText(candidate.provider, "provider", index, 100);
    if (normalizeProvider(provider) === "") {
      throw new Error(
        `\`models[${index}].provider\` must contain at least one Unicode letter or number.`,
      );
    }
    return { id, provider };
  });

  return deduplicateModels(models);
}

export function deduplicateModels(models: InputModel[]): InputModel[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    const key = `${model.id}\u0000${model.provider ? normalizeProvider(model.provider) : "*"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Load and merge the inline inventory and an optional checked-out JSON inventory file. */
export function loadModels(
  rawModels: string | undefined,
  modelsFile: string | undefined,
  workspace: string,
): InputModel[] {
  const inventories: InputModel[][] = [];
  if (rawModels !== undefined && rawModels.trim() !== "") {
    inventories.push(parseModels(rawModels, "models"));
  }
  if (modelsFile !== undefined && modelsFile.trim() !== "") {
    const requestedPath = modelsFile.trim();
    if (requestedPath.length > MAX_PATH_LENGTH || CONTROL_CHARACTER.test(requestedPath)) {
      throw new Error(`\`models-file\` must be a safe path of at most ${MAX_PATH_LENGTH} characters.`);
    }
    const bytes = readBoundedFileBytes(
      requestedPath,
      workspace,
      MAX_MODELS_INPUT_BYTES,
      "`models-file`",
    );
    let contents: string;
    try {
      contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      throw new Error(
        `\`models-file\` was not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    inventories.push(parseModels(contents, "models-file"));
  }
  if (inventories.length === 0) {
    throw new Error("Provide at least one of `models` or `models-file`.");
  }

  const models = deduplicateModels(inventories.flat());
  if (models.length > MAX_MODELS) {
    throw new Error(`The merged inventory contains ${models.length} models; the limit is ${MAX_MODELS}.`);
  }
  return models;
}

export function parseOptionalInteger(
  raw: string | undefined,
  inputName: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return null;
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    throw new Error(
      `Invalid ${inputName}: expected a non-negative base-10 integer, got ${preview(raw)}.`,
    );
  }
  const value = Number(trimmed);
  const min = options.min ?? 0;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `Invalid ${inputName}: expected an integer from ${min} to ${max}, got ${preview(raw)}.`,
    );
  }
  return value;
}

export function parseRequiredInteger(
  raw: string | undefined,
  inputName: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number {
  return parseOptionalInteger(raw === undefined || raw.trim() === "" ? String(fallback) : raw, inputName, options) as number;
}

export function parseBoolean(raw: string | undefined, inputName: string, fallback: boolean): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (trimmed === undefined || trimmed === "") return fallback;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  throw new Error(
    `Invalid ${inputName}: expected \`true\` or \`false\`, got ${preview(raw)}.`,
  );
}

export function parseHttpUrl(raw: string, inputName: string): string {
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`Invalid ${inputName}: URL exceeds ${MAX_URL_LENGTH} characters.`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid ${inputName}: expected an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid ${inputName}: only HTTP(S) URLs are supported.`);
  }
  if (url.username || url.password) {
    throw new Error(`Invalid ${inputName}: URL credentials are not supported.`);
  }
  return url.toString();
}

export function parseHttpsUrl(raw: string, inputName: string): string {
  const parsed = parseHttpUrl(raw, inputName);
  if (new URL(parsed).protocol !== "https:") {
    throw new Error(`Invalid ${inputName}: HTTPS is required.`);
  }
  return parsed;
}
