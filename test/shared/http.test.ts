import { describe, expect, test } from "bun:test";
import {
  fetchJsonDocument,
  postSlack,
  type FetchLike,
  type RequestPolicy,
} from "../../src/shared/http.ts";

function policy(
  fetchImplementation: FetchLike,
  overrides: Partial<Omit<RequestPolicy, "fetch">> = {},
): RequestPolicy {
  return {
    timeoutMs: 1_000,
    retries: 2,
    fetch: fetchImplementation,
    sleep: async () => undefined,
    random: () => 0,
    ...overrides,
  };
}

describe("bounded HTTP requests", () => {
  test("retries retryable responses and honors numeric Retry-After", async () => {
    const responses = [
      new Response("busy", { status: 503, headers: { "Retry-After": "0" } }),
      new Response('{"items":[1]}', { status: 200 }),
    ];
    const sleeps: number[] = [];
    const signals: AbortSignal[] = [];
    const fetchImplementation: FetchLike = async (_input, init) => {
      if (init?.signal) signals.push(init.signal);
      const response = responses.shift();
      if (!response) throw new Error("unexpected extra request");
      return response;
    };

    await expect(
      fetchJsonDocument("https://example.com/feed.json", {
        ...policy(fetchImplementation),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      }),
    ).resolves.toEqual({ items: [1] });
    expect(responses).toHaveLength(0);
    expect(sleeps).toEqual([0]);
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  test("does not retry non-retryable HTTP failures", async () => {
    let requests = 0;
    const fetchImplementation: FetchLike = async () => {
      requests += 1;
      return new Response("bad request", { status: 400, statusText: "Bad Request" });
    };

    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(fetchImplementation, { retries: 5 }),
      ),
    ).rejects.toThrow(
      "Deprecations feed request failed after 1 attempt(s): HTTP 400 Bad Request.",
    );
    expect(requests).toBe(1);
  });

  test("reports timeouts without hanging", async () => {
    const fetchImplementation: FetchLike = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return reject(new Error("missing abort signal"));
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });

    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(fetchImplementation, { timeoutMs: 5, retries: 0 }),
      ),
    ).rejects.toThrow(
      "Deprecations feed request failed after 1 attempt(s): request timed out.",
    );
  });

  test("keeps the timeout active while consuming a stalled response body", async () => {
    const fetchImplementation: FetchLike = async (_input, init) => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          streamController.enqueue(new TextEncoder().encode("{"));
        },
      });
      init?.signal?.addEventListener(
        "abort",
        () => controller?.error(new DOMException("aborted", "AbortError")),
        { once: true },
      );
      return new Response(body);
    };

    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(fetchImplementation, { timeoutMs: 5, retries: 0 }),
      ),
    ).rejects.toThrow("request timed out");
  });

  test("rejects declared and actual bodies above the configured limit", async () => {
    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(async () =>
          new Response("{}", { headers: { "Content-Length": "100" } })),
        10,
      ),
    ).rejects.toThrow("feed is 100 bytes; the limit is 10");

    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(async () => new Response('"1234567890"')),
        10,
      ),
    ).rejects.toThrow("Deprecations feed exceeded the 10-byte response limit");
  });

  test("fails clearly when a bounded body is not JSON", async () => {
    await expect(
      fetchJsonDocument(
        "https://example.com/feed.json",
        policy(async () => new Response("not json")),
      ),
    ).rejects.toThrow(/did not contain valid JSON/);
  });
});

describe("Slack delivery", () => {
  test("never retries webhook POSTs and sends a JSON content type", async () => {
    const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetchImplementation: FetchLike = async (input, init) => {
      const request: { input: string | URL | Request; init?: RequestInit } = { input };
      if (init !== undefined) request.init = init;
      requests.push(request);
      return new Response("uncertain delivery", { status: 500 });
    };

    await expect(
      postSlack(
        "https://hooks.slack.test/services/a/b/c",
        "hello",
        policy(fetchImplementation, { retries: 5 }),
      ),
    ).rejects.toThrow("Slack notification failed after 1 attempt(s)");

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://hooks.slack.test/services/a/b/c");
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: '{"text":"hello"}',
    });
  });

  test("cancels an unneeded successful response body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("ok"));
      },
      cancel() {
        cancelled = true;
      },
    });

    await postSlack(
      "https://hooks.slack.test/services/a/b/c",
      "hello",
      policy(async () => new Response(body, { status: 200 })),
    );
    expect(cancelled).toBe(true);
  });
});
