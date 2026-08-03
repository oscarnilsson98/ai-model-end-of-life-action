"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const EXPECTED_FEED_URL = "https://deprecations.info/v1/deprecations.json";
const fixture = readFileSync(
  join(__dirname, "../fixtures/hermetic-lifecycle-feed.json"),
);

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
