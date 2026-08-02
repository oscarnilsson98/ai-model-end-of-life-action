import { decodeJsonDocument, readBoundedFileBytes } from "./document.ts";
import { rawBytesSha256 } from "./digest.ts";
import {
  fetchBoundedDocumentBytes,
  MAX_FEED_BYTES,
  type RequestPolicy,
} from "./http.ts";
import { parseHttpUrl } from "./input.ts";

export type FeedSourceKind = "url" | "file";

export type LoadedFeedDocument = {
  value: unknown;
  bytes: Uint8Array;
  rawSha256: string;
  sourceKind: FeedSourceKind;
  url?: string;
};

export function parseExpectedSha256(raw: string | undefined): string | null {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized === "") return null;
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(
      "Invalid expected-feed-sha256: expected an empty value or 64 hexadecimal characters.",
    );
  }
  return normalized;
}

export async function loadFeedDocument(input: {
  feedUrl: string | undefined;
  feedFile: string | undefined;
  expectedSha256: string | null;
  defaultFeedUrl: string;
  workspace: string;
  requestPolicy: RequestPolicy;
}): Promise<LoadedFeedDocument> {
  const requestedUrl = input.feedUrl?.trim() ?? "";
  const requestedFile = input.feedFile?.trim() ?? "";
  if (requestedUrl !== "" && requestedFile !== "") {
    throw new Error("Provide only one of `feed-url` or `feed-file`, not both.");
  }

  let bytes: Uint8Array;
  let sourceKind: FeedSourceKind;
  let url: string | undefined;
  let label: string;
  if (requestedFile !== "") {
    sourceKind = "file";
    label = "`feed-file`";
    bytes = readBoundedFileBytes(
      requestedFile,
      input.workspace,
      MAX_FEED_BYTES,
      label,
    );
  } else {
    sourceKind = "url";
    label = "Deprecations feed";
    url = parseHttpUrl(requestedUrl || input.defaultFeedUrl, "feed-url");
    bytes = await fetchBoundedDocumentBytes(url, input.requestPolicy);
  }

  const rawSha256 = rawBytesSha256(bytes);
  if (input.expectedSha256 !== null && rawSha256 !== input.expectedSha256) {
    throw new Error(
      `${label} SHA-256 mismatch: expected ${input.expectedSha256}, received ${rawSha256}.`,
    );
  }
  const document = decodeJsonDocument(bytes, label);
  const loaded: LoadedFeedDocument = {
    value: document.value,
    bytes,
    rawSha256,
    sourceKind,
  };
  if (url !== undefined) loaded.url = url;
  return loaded;
}
