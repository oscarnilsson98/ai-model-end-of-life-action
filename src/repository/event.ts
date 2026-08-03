import { spawnSync } from "node:child_process";
import { readBoundedRegularFileBytes } from "../shared/document.ts";
import { gitEnvironment } from "./git.ts";
import type { Environment } from "../action/github.ts";
import type { ComparisonStatus, CoverageDiagnostic, EventSelection } from "../shared/types.ts";

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_EVENT_BYTES = 2 * 1024 * 1024;

export type GitCommitProbe = {
  /** Resolve a full commit and its tree without fetching; null means unavailable. */
  resolveCommit(revision: string): string | null;
  parents(oid: string): string[];
  /** null means the local history is insufficient to prove either answer. */
  isAncestor(base: string, head: string): boolean | null;
};

export type ResolvedEventSelection = {
  selection: EventSelection;
  comparisonStatus: Extract<ComparisonStatus, "available" | "unavailable" | "not-applicable">;
  diagnostics: CoverageDiagnostic[];
  /** Actual parent order for a validated synthetic merge, when one is readable. */
  targetParentOids?: [string, string];
};

export class EventSelectionError extends Error {
  constructor(
    readonly scanStatus: "partial" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "EventSelectionError";
  }
}

function runGit(
  repositoryPath: string,
  arguments_: readonly string[],
): ReturnType<typeof spawnSync> {
  return spawnSync("git", arguments_, {
    cwd: repositoryPath,
    env: gitEnvironment(),
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
}

function defaultProbe(repositoryPath: string): GitCommitProbe {
  return {
    resolveCommit(revision) {
      if (revision !== "HEAD" && !OID.test(revision)) return null;
      const result = runGit(repositoryPath, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${revision}^{commit}`,
      ]);
      if (result.status !== 0 || typeof result.stdout !== "string") return null;
      const resolved = result.stdout.trim();
      if (!OID.test(resolved)) return null;
      const tree = runGit(repositoryPath, ["cat-file", "-e", `${resolved}^{tree}`]);
      return tree.status === 0 ? resolved : null;
    },
    parents(oid) {
      // --no-show-signature: a runner with log.showSignature=true would
      // otherwise prefix signature-verification lines onto the parent list.
      const result = runGit(repositoryPath, [
        "show",
        "-s",
        "--no-show-signature",
        "--format=%P",
        oid,
      ]);
      if (result.status !== 0 || typeof result.stdout !== "string") {
        throw new EventSelectionError("failed", `Could not inspect parents for commit ${oid}.`);
      }
      const rendered = result.stdout.trim();
      if (rendered === "") return [];
      const parents = rendered.split(" ");
      if (parents.some((parent) => !OID.test(parent))) {
        throw new EventSelectionError("failed", `Commit ${oid} has malformed parent metadata.`);
      }
      return parents;
    },
    isAncestor(base, head) {
      const result = runGit(repositoryPath, ["merge-base", "--is-ancestor", base, head]);
      if (result.status === 0) return true;
      if (result.status !== 1) return null;
      const shallow = runGit(repositoryPath, ["rev-parse", "--is-shallow-repository"]);
      if (
        shallow.status !== 0 ||
        typeof shallow.stdout !== "string" ||
        !/^(?:true|false)\s*$/.test(shallow.stdout)
      ) {
        return null;
      }
      return shallow.stdout.trim() === "true" ? null : false;
    },
  };
}

function oid(value: unknown, label: string): string {
  if (typeof value !== "string" || !OID.test(value)) {
    throw new EventSelectionError("failed", `${label} must be a full lowercase Git object ID.`);
  }
  return value;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EventSelectionError("failed", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readEventPayload(environment: Environment): unknown {
  const path = environment.GITHUB_EVENT_PATH;
  if (!path) throw new EventSelectionError("failed", "GITHUB_EVENT_PATH is required.");
  try {
    const bytes = readBoundedRegularFileBytes(
      path,
      MAX_EVENT_BYTES,
      "GitHub event payload",
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new EventSelectionError(
      "failed",
      `Could not read the GitHub event payload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function unavailableDiagnostic(message: string): CoverageDiagnostic {
  return { code: "trusted-base-unavailable", message, severity: "partial" };
}

function resolveCommit(
  probe: GitCommitProbe,
  revision: string,
  label: string,
): string | null {
  const resolved = probe.resolveCommit(revision);
  if (resolved === null) return null;
  if (!OID.test(resolved)) {
    throw new EventSelectionError(
      "failed",
      `${label} resolved to a malformed Git commit object ID.`,
    );
  }
  if (OID.test(revision) && resolved !== revision) {
    throw new EventSelectionError(
      "failed",
      `${label} did not resolve to the exact event commit.`,
    );
  }
  return resolved;
}

function exactParents(
  actual: readonly string[],
  base: string,
  head: string,
): [string, string] | null {
  if (actual.length !== 2) return null;
  const expected = [base, head].sort();
  const sortedActual = [...actual].sort();
  if (sortedActual[0] !== expected[0] || sortedActual[1] !== expected[1]) return null;
  const first = actual[0];
  const second = actual[1];
  if (first === undefined || second === undefined) return null;
  return [first, second];
}

export function resolveEventSelection(options: {
  repositoryPath: string;
  environment: Environment;
  eventPayload?: unknown;
  probe?: GitCommitProbe;
}): ResolvedEventSelection {
  const eventName = options.environment.GITHUB_EVENT_NAME?.trim() || "local";
  const probe = options.probe ?? defaultProbe(options.repositoryPath);
  const targetFromEnvironment = options.environment.GITHUB_SHA?.trim();

  if (eventName === "pull_request") {
    const payload = object(
      options.eventPayload ?? readEventPayload(options.environment),
      "Event payload",
    );
    const pullRequest = object(payload.pull_request, "Event payload.pull_request");
    const base = object(pullRequest.base, "Event payload.pull_request.base");
    const head = object(pullRequest.head, "Event payload.pull_request.head");
    const baseOid = oid(base.sha, "pull_request.base.sha");
    const headOid = oid(head.sha, "pull_request.head.sha");
    const mergeOid = oid(targetFromEnvironment, "GITHUB_SHA");
    const mergeAvailable = resolveCommit(probe, mergeOid, "GITHUB_SHA") !== null;
    const headAvailable =
      resolveCommit(probe, headOid, "pull_request.head.sha") !== null;
    const baseAvailable =
      resolveCommit(probe, baseOid, "pull_request.base.sha") !== null;

    if (mergeAvailable) {
      const parents = probe.parents(mergeOid);
      const validatedParents = exactParents(parents, baseOid, headOid);
      if (validatedParents === null) {
        throw new EventSelectionError(
          "failed",
          "GITHUB_SHA is not the validated synthetic merge of the event base and head commits.",
        );
      }
      if (baseAvailable && headAvailable) {
        return {
          selection: {
            eventName,
            targetOid: mergeOid,
            targetKind: "synthetic-merge",
            baseOid,
            submittedHeadOid: headOid,
            comparisonRequested: true,
          },
          comparisonStatus: "available",
          diagnostics: [],
          targetParentOids: validatedParents,
        };
      }
      return {
        selection: {
          eventName,
          targetOid: mergeOid,
          targetKind: "synthetic-merge-uncompared",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true,
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic(
            "The synthetic merge is readable, but the exact base or submitted head " +
              "commit is unavailable locally. Use checkout fetch-depth: 0.",
          ),
        ],
        targetParentOids: validatedParents,
      };
    }
    if (headAvailable) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "raw-head-fallback",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true,
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic(
            "The validated synthetic merge is unavailable; the raw submitted head " +
              "is diagnostic only. Use checkout fetch-depth: 0.",
          ),
        ],
      };
    }
    throw new EventSelectionError(
      "failed",
      "Neither the validated pull-request merge commit nor the exact submitted head " +
        "is available locally.",
    );
  }

  if (eventName === "merge_group") {
    const payload = object(
      options.eventPayload ?? readEventPayload(options.environment),
      "Event payload",
    );
    const mergeGroup = object(payload.merge_group, "Event payload.merge_group");
    const baseOid = oid(mergeGroup.base_sha, "merge_group.base_sha");
    const headOid = oid(mergeGroup.head_sha, "merge_group.head_sha");
    const baseAvailable =
      resolveCommit(probe, baseOid, "merge_group.base_sha") !== null;
    const headAvailable =
      resolveCommit(probe, headOid, "merge_group.head_sha") !== null;
    if (!headAvailable) {
      throw new EventSelectionError(
        "failed",
        "The exact merge-group head commit is unavailable locally.",
      );
    }
    if (!baseAvailable) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "merge-group",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true,
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic(
            "The merge-group head is readable, but its trusted base is unavailable " +
              "locally. Use checkout fetch-depth: 0.",
          ),
        ],
      };
    }
    const ancestry = probe.isAncestor(baseOid, headOid);
    if (ancestry === null) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "merge-group",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true,
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic(
            "The merge-group head and base are readable, but their ancestry cannot be " +
              "proven from local history. Use checkout fetch-depth: 0.",
          ),
        ],
      };
    }
    if (!ancestry) {
      throw new EventSelectionError(
        "failed",
        "The merge-group base is not an ancestor of its combined head.",
      );
    }
    return {
      selection: {
        eventName,
        targetOid: headOid,
        targetKind: "merge-group",
        baseOid,
        submittedHeadOid: headOid,
        comparisonRequested: true,
      },
      comparisonStatus: "available",
      diagnostics: [],
    };
  }

  if (
    eventName !== "local" &&
    eventName !== "schedule" &&
    eventName !== "workflow_dispatch" &&
    eventName !== "push" &&
    eventName !== "release"
  ) {
    throw new EventSelectionError("failed", `Unsupported GitHub event: ${eventName}.`);
  }
  const targetRevision =
    eventName === "local" && !targetFromEnvironment
      ? "HEAD"
      : oid(targetFromEnvironment, "GITHUB_SHA");
  const targetOid = resolveCommit(probe, targetRevision, "Target commit");
  if (targetOid === null) {
    throw new EventSelectionError(
      "failed",
      `Target commit ${targetRevision} and its tree are unavailable locally.`,
    );
  }
  return {
    selection: {
      eventName,
      targetOid,
      targetKind: "commit",
      comparisonRequested: false,
    },
    comparisonStatus: "not-applicable",
    diagnostics: [],
  };
}
