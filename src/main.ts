import { ReportedActionError, run } from "./check.ts";
import { appendSummary, emitCommand, getInput } from "./github.ts";
import { renderFailureSummary } from "./render.ts";

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  emitCommand("error", message);
  if (
    !(error instanceof ReportedActionError) &&
    getInput("job-summary", process.env)?.toLowerCase() !== "false"
  ) {
    appendSummary(process.env.GITHUB_STEP_SUMMARY, renderFailureSummary(message));
  }
  process.exitCode = 1;
});
