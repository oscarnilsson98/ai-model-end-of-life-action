import { emitCommand } from "./action/github.ts";
import { run } from "./action/run.ts";

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  emitCommand("error", message);
  process.exitCode = 1;
});
