import { decodeJsonDocument, type JsonDocument } from "./document.ts";

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRIES = 2;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RequestPolicy = {
  timeoutMs: number;
  retries: number;
  fetch: FetchLike;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
};

type ResponseConsumer<T> = (response: Response) => Promise<T>;

class InvalidResponseError extends Error {}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function defaultRequestPolicy(fetchImplementation: FetchLike = fetch): RequestPolicy {
  return {
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    fetch: fetchImplementation,
    sleep: defaultSleep,
    random: Math.random,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelay(response: Response | null, attempt: number, random: () => number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
    const timestamp = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp)) return Math.max(0, Math.min(timestamp - Date.now(), 10_000));
  }
  return Math.min(500 * 2 ** attempt + Math.floor(random() * 250), 10_000);
}

function errorDetail(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "request timed out";
  if (error instanceof Error) return error.message;
  return String(error);
}

async function consumeWithRetry<T>(
  url: string,
  init: RequestInit,
  label: string,
  policy: RequestPolicy,
  consume: ResponseConsumer<T>,
): Promise<T> {
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    attempts = attempt + 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    let response: Response | null = null;
    try {
      response = await policy.fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return await consume(response);
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const shouldRetry = isRetryableStatus(response.status) && attempt < policy.retries;
      await response.body?.cancel().catch(() => undefined);
      if (!shouldRetry) break;
    } catch (error) {
      await response?.body?.cancel().catch(() => undefined);
      if (error instanceof InvalidResponseError) throw error;
      lastError = error;
      if (attempt === policy.retries) break;
    } finally {
      clearTimeout(timeout);
    }

    await policy.sleep(retryDelay(response, attempt, policy.random));
  }
  throw new Error(
    `${label} failed after ${attempts} attempt(s): ${errorDetail(lastError).replace(/\.$/, "")}.`,
  );
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new InvalidResponseError(
          `Deprecations feed exceeded the ${maxBytes}-byte response limit.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchBoundedDocumentBytes(
  url: string,
  policy: RequestPolicy,
  maxBytes = MAX_FEED_BYTES,
): Promise<Uint8Array> {
  return consumeWithRetry(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json, application/feed+json;q=0.9",
        "User-Agent": "ai-model-end-of-life-action",
      },
    },
    "Deprecations feed request",
    policy,
    async (response) => {
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
      if (
        contentLength !== null &&
        Number.isFinite(contentLength) &&
        contentLength > maxBytes
      ) {
        throw new InvalidResponseError(
          `Deprecations feed is ${contentLength} bytes; the limit is ${maxBytes}.`,
        );
      }
      return readBoundedBody(response, maxBytes);
    },
  );
}

export async function fetchJsonDocumentWithBytes(
  url: string,
  policy: RequestPolicy,
  maxBytes = MAX_FEED_BYTES,
): Promise<JsonDocument> {
  const bytes = await fetchBoundedDocumentBytes(url, policy, maxBytes);
  try {
    return decodeJsonDocument(bytes, "Deprecations feed");
  } catch (error) {
    throw new InvalidResponseError(error instanceof Error ? error.message : String(error));
  }
}

export async function fetchJsonDocument(
  url: string,
  policy: RequestPolicy,
  maxBytes = MAX_FEED_BYTES,
): Promise<unknown> {
  return (await fetchJsonDocumentWithBytes(url, policy, maxBytes)).value;
}

/** Slack incoming-webhook posts are not retried because a failed response can still have delivered the message. */
export async function postSlack(
  webhook: string,
  text: string,
  policy: RequestPolicy,
): Promise<void> {
  await consumeWithRetry(
    webhook,
    {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
    "Slack notification",
    { ...policy, retries: 0 },
    async (response) => {
      await response.body?.cancel().catch(() => undefined);
    },
  );
}
