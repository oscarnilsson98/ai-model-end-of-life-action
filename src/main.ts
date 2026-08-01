import { run } from "./check.ts";

run().catch((error: unknown) => {
  console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
