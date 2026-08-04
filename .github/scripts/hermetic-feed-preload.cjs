"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const EXPECTED_FEED_URL = "https://deprecations.info/v1/deprecations.json";
const fixture = readFileSync(
  join(__dirname, "../fixtures/hermetic-lifecycle-feed.json"),
);

// The fixture is pinned so its bytes hash to a fixed source digest, which means its
// generatedAt necessarily ages past any freshness horizon. Disable the staleness guard
// here rather than in the workflow: this shim is already the hermeticity boundary, and
// the e2e job must keep asserting `scan-status: complete` for the zero-input surface.
// Feed-staleness behaviour itself is covered by the deterministic unit tests.
//
// The runner preserves hyphens in input env names, so this key must not be underscored;
// hermetic-feed-preload.test.ts pins that, because the wrong key fails silently until the
// fixture crosses the default horizon.
process.env["INPUT_MAX-FEED-AGE-DAYS"] = "";

globalThis.fetch = async (input, init = {}) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const method = String(init.method ?? (typeof input === "object" ? input.method : "GET") ?? "GET")
    .toUpperCase();

  if (url !== EXPECTED_FEED_URL || method !== "GET") {
    throw new Error(
      `Hermetic action test blocked an unexpected ${method} request to ${url}.`,
    );
  }

  return new Response(fixture, {
    status: 200,
    headers: {
      "content-length": String(fixture.byteLength),
      "content-type": "application/json",
    },
  });
};
