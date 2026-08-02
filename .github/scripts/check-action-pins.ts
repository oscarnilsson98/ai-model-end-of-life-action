import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export type MutableActionReference = {
  file: string;
  line: number;
  reference: string;
};

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

function workflowFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...workflowFiles(path));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapping(value: unknown, context: string): Record<string, unknown> {
  if (!isMapping(value)) {
    throw new Error(`Cannot validate action pins: ${context} must be a YAML mapping.`);
  }
  return value;
}

function reference(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return `<non-string ${typeof value}>`;
}

function workflowReferences(contents: string, file: string): string[] {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Cannot validate action pins: ${file} is not valid YAML.`, {
      cause: error,
    });
  }

  const workflow = mapping(parsed, file);
  const jobs = mapping(workflow.jobs, `${file}: jobs`);
  const references: string[] = [];

  for (const [jobId, jobValue] of Object.entries(jobs)) {
    const job = mapping(jobValue, `${file}: job ${JSON.stringify(jobId)}`);
    if (Object.hasOwn(job, "uses")) references.push(reference(job.uses));

    if (job.steps === undefined) continue;
    if (!Array.isArray(job.steps)) {
      throw new Error(
        `Cannot validate action pins: ${file}: job ${JSON.stringify(jobId)} steps must be a YAML sequence.`,
      );
    }

    for (const [index, stepValue] of job.steps.entries()) {
      const step = mapping(
        stepValue,
        `${file}: job ${JSON.stringify(jobId)} step ${index + 1}`,
      );
      if (Object.hasOwn(step, "uses")) references.push(reference(step.uses));
    }
  }
  return references;
}

function hasUsesKey(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "#") return false;

    if (character === '"' || character === "'") {
      const quote = character;
      let end = index + 1;
      while (end < line.length) {
        if (quote === '"' && line[end] === "\\") {
          end += 2;
          continue;
        }
        if (line[end] === quote) {
          if (quote === "'" && line[end + 1] === "'") {
            end += 2;
            continue;
          }
          break;
        }
        end += 1;
      }
      const next = line.slice(end + 1).match(/^\s*:/);
      if (line.slice(index + 1, end) === "uses" && next !== null) return true;
      index = end;
      continue;
    }

    if (!line.startsWith("uses", index)) continue;
    const before = line[index - 1];
    if (before !== undefined && /[0-9A-Za-z_-]/.test(before)) continue;
    if (/^\s*:/.test(line.slice(index + 4))) return true;
  }
  return false;
}

function locateReferences(contents: string, references: readonly string[]): number[] {
  const lines = contents.split(/\r?\n/);
  let nextLine = 0;
  return references.map((actionReference) => {
    const findLine = (start: number): number => {
      for (let index = start; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (!hasUsesKey(line)) continue;
        if (actionReference !== "" && !line.includes(actionReference)) continue;
        return index;
      }
      return -1;
    };

    let index = findLine(nextLine);
    if (index === -1) index = findLine(0);
    if (index === -1) return 1;
    nextLine = index + 1;
    return index + 1;
  });
}

function isImmutableReference(reference: string): boolean {
  if (reference.startsWith("./")) return true;
  const separator = reference.lastIndexOf("@");
  if (separator <= 0) return false;
  return FULL_COMMIT_SHA.test(reference.slice(separator + 1));
}

export function findMutableActionReferences(
  directory = ".github/workflows",
): MutableActionReference[] {
  const root = resolve(directory);
  const violations: MutableActionReference[] = [];
  for (const file of workflowFiles(root)) {
    const contents = readFileSync(file, "utf8");
    const references = workflowReferences(contents, file);
    const lines = locateReferences(contents, references);
    for (const [index, actionReference] of references.entries()) {
      if (!isImmutableReference(actionReference)) {
        violations.push({
          file: relative(process.cwd(), file) || file,
          line: lines[index] ?? 1,
          reference: actionReference,
        });
      }
    }
  }
  return violations;
}

export function assertImmutableActionReferences(directory = ".github/workflows"): void {
  const violations = findMutableActionReferences(directory);
  if (violations.length === 0) return;
  const details = violations
    .map(({ file, line, reference }) => `${file}:${line}: ${reference || "<empty>"}`)
    .join("\n");
  throw new Error(
    `Every external action reference must use a full 40-character commit SHA:\n${details}`,
  );
}

if (import.meta.main) assertImmutableActionReferences(Bun.argv[2]);
