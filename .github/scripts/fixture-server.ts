import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixture = await readFile(resolve(".github/fixtures/deprecations.json"), "utf8");
const port = Number(Bun.argv[2] ?? "8123");
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("Fixture-server port must be an integer from 0 to 65535.");
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/health") return new Response("ok\n");
    if (path === "/deprecations.json") {
      return new Response(fixture, {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response("not found\n", { status: 404 });
  },
});

function stop(): void {
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (Bun.argv[3]) await Bun.write(Bun.argv[3], server.url.toString());
console.log(`Fixture server listening at ${server.url}`);
await new Promise(() => {});
