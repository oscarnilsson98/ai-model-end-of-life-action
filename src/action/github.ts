import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { EOL } from "node:os";

export type Environment = Record<string, string | undefined>;
export type Log = (line: string) => void;
export type CommandLevel = "debug" | "notice" | "warning" | "error";
export type AnnotationProperties = {
  title?: string;
  file?: string;
  line?: number;
  col?: number;
};

/** GitHub upper-cases input names and replaces spaces, but deliberately preserves hyphens. */
export function inputEnvName(name: string): string {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}

export function getInput(name: string, environment: Environment): string | undefined {
  const value = environment[inputEnvName(name)];
  return value === undefined ? undefined : value.trim();
}

/** Escape workflow-command data exactly as required by the runner protocol. */
export function escapeCommandData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape workflow-command property data, which has additional `:` and `,` delimiters. */
export function escapeCommandProperty(value: string): string {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function emitCommand(level: CommandLevel, message: string, log: Log = console.log): void {
  log(`::${level}::${escapeCommandData(message)}`);
}

/** Emit a source-located annotation without allowing paths or titles to forge commands. */
export function emitAnnotation(
  level: Exclude<CommandLevel, "debug">,
  message: string,
  properties: AnnotationProperties,
  log: Log = console.log,
): void {
  const serialized: string[] = [];
  if (properties.title !== undefined) {
    serialized.push(`title=${escapeCommandProperty(properties.title)}`);
  }
  if (properties.file !== undefined) {
    serialized.push(`file=${escapeCommandProperty(properties.file)}`);
  }
  for (const [name, value] of [
    ["line", properties.line],
    ["col", properties.col],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid GitHub annotation ${name}: ${value}.`);
    }
    serialized.push(`${name}=${value}`);
  }
  const prefix = serialized.length > 0 ? ` ${serialized.join(",")}` : "";
  log(`::${level}${prefix}::${escapeCommandData(message)}`);
}

export function maskSecret(secret: string, log: Log = console.log): void {
  if (secret !== "") log(`::add-mask::${escapeCommandData(secret)}`);
}

/** Append a GitHub file command with a cryptographically random multiline delimiter. */
export function appendCommand(
  file: string | undefined,
  key: string,
  value: string,
  uuid: () => string = randomUUID,
): void {
  if (!file) return;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
    throw new Error(`Invalid GitHub output name: ${key}`);
  }
  let delimiter = `ghadelimiter_${uuid()}`;
  const lines = new Set(value.split(/\r?\n/));
  while (lines.has(delimiter)) delimiter = `ghadelimiter_${uuid()}`;
  appendFileSync(file, `${key}<<${delimiter}${EOL}${value}${EOL}${delimiter}${EOL}`, "utf8");
}

export function appendSummary(file: string | undefined, markdown: string): void {
  if (file) appendFileSync(file, markdown.endsWith(EOL) ? markdown : `${markdown}${EOL}`, "utf8");
}
