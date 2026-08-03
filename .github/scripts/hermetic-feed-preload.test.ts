import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getInput, inputEnvName } from "../../src/action/github.ts";

const PRELOAD = join(import.meta.dir, "hermetic-feed-preload.cjs");
const INPUT_NAME = "max-feed-age-days";

/**
 * The hermetic e2e fixture is byte-pinned, so its `generatedAt` necessarily ages past any
 * freshness horizon while the CI job keeps asserting `scan-status: complete`. The preload
 * neutralizes the guard for that job, and it can only do so through the exact env name the
 * runner uses — hyphens preserved, not underscored. An underscored name fails silently
 * until the fixture crosses the default horizon, so pin the real `--require` path here
 * instead of waiting for CI to break weeks later.
 */
describe("hermetic feed preload", () => {
  test("disables the feed-staleness guard under the runner's real input env name", async () => {
    const envName = inputEnvName(INPUT_NAME);
    expect(envName).toBe("INPUT_MAX-FEED-AGE-DAYS");

    const child = Bun.spawn(
      ["node", `--require=${PRELOAD}`, "-e", `console.log(JSON.stringify(process.env))`],
      { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });

    const childEnv = JSON.parse(stdout) as Record<string, string | undefined>;
    expect(childEnv[envName]).toBe("");
    // Read it back through the production accessor: an emptied input disables the guard.
    expect(getInput(INPUT_NAME, childEnv)).toBe("");
  });
});
