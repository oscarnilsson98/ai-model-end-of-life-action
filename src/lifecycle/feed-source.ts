import {
  defaultRequestPolicy,
  fetchBoundedDocumentBytes,
  type FetchLike,
  type RequestPolicy,
} from "../shared/http.ts";
import { V3_FEED_LIMITS, type LoadedV3Feed } from "./feed.ts";
import { loadTypedOrAdaptedLegacyFeed } from "./legacy-feed-adapter.ts";

export const DEFAULT_V3_FEED_URL = "https://deprecations.info/v1/deprecations.json";

export type FeedLoadDependencies = {
  bytes?: Uint8Array;
  fetch?: FetchLike;
  requestPolicy?: RequestPolicy;
};

export async function loadLifecycleFeed(
  dependencies: FeedLoadDependencies = {},
): Promise<LoadedV3Feed> {
  const bytes =
    dependencies.bytes ??
    (await fetchBoundedDocumentBytes(
      DEFAULT_V3_FEED_URL,
      dependencies.requestPolicy ?? defaultRequestPolicy(dependencies.fetch ?? fetch),
      V3_FEED_LIMITS.maxDocumentBytes,
    ));
  return loadTypedOrAdaptedLegacyFeed(bytes);
}
