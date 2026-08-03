import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

type Workflow = {
  on?: unknown;
  jobs?: Record<string, {
    if?: string;
    permissions?: Record<string, string>;
    steps?: Array<{
      env?: Record<string, string>;
    }>;
  }>;
};

const workflowPath = join(
  import.meta.dir,
  "..",
  "workflows",
  "move-major-tag.yml",
);

describe("release workflow contract", () => {
  test("uses one stable release event and the published tag as its authority", () => {
    const source = readFileSync(workflowPath, "utf8");
    const workflow = parse(source) as Workflow;
    const validate = workflow.jobs?.["validate-release"];
    const promote = workflow.jobs?.["promote-major-tag"];
    const resolveRelease = validate?.steps?.find((step) => step.env?.TAG);

    expect(workflow.on).toEqual({ release: { types: ["published"] } });
    expect(resolveRelease?.env?.TAG).toBe("${{ github.event.release.tag_name }}");
    expect(validate?.if).toBe("${{ !github.event.release.prerelease }}");
    expect(promote?.if).toBe("${{ !github.event.release.prerelease }}");
    expect(validate?.permissions).toEqual({ contents: "read" });
    expect(promote?.permissions).toEqual({ contents: "write" });
    expect(source).not.toContain("workflow_dispatch");
    expect(source).not.toContain("github.ref_name");
    expect(source).not.toContain("inputs.");
    expect(source).not.toContain("package_version");
  });
});
