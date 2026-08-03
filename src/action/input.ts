import { getInput, type Environment } from "./github.ts";
import { MAX_POLICY_DAYS } from "../shared/limits.ts";
import type { ActionInputs } from "../shared/types.ts";

function preview(value: string | undefined): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value.length <= 160 ? value : `${value.slice(0, 159)}…`);
}

export function parseOptionalInteger(
  raw: string | undefined,
  inputName: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const normalized = raw?.trim() ?? "";
  if (normalized === "") return null;
  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) {
    throw new Error(
      `Invalid ${inputName}: expected a non-negative base-10 integer, got ${preview(raw)}.`,
    );
  }
  const value = Number(normalized);
  const minimum = options.min ?? 0;
  const maximum = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `Invalid ${inputName}: expected an integer from ${minimum} to ${maximum}, got ${preview(raw)}.`,
    );
  }
  return value;
}

export function parseBoolean(
  raw: string | undefined,
  inputName: string,
  fallback: boolean,
): boolean {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === undefined || normalized === "") return fallback;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(
    `Invalid ${inputName}: expected \`true\` or \`false\`, got ${preview(raw)}.`,
  );
}

export function parseHttpsUrl(raw: string, inputName: string): string {
  if (raw.length > 8_192) throw new Error(`Invalid ${inputName}: URL is too long.`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${inputName}: expected an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error(`Invalid ${inputName}: HTTPS without URL credentials is required.`);
  }
  return parsed.toString();
}

export function parseActionInputs(environment: Environment): ActionInputs {
  const rawWarn = getInput("warn-within-days", environment);
  const rawFail = getInput("fail-within-days", environment);
  const rawAllowPartial = getInput("allow-partial", environment);
  const slackWebhook = getInput("slack-webhook", environment);
  const rawNotificationFailure = getInput("notification-failure-mode", environment);

  const warnWithinDays = parseOptionalInteger(rawWarn, "warn-within-days", {
    max: MAX_POLICY_DAYS,
  });
  const failWithinDays = parseOptionalInteger(rawFail, "fail-within-days", {
    max: MAX_POLICY_DAYS,
  });
  const allowPartial =
    rawAllowPartial === undefined || rawAllowPartial === ""
      ? null
      : parseBoolean(rawAllowPartial, "allow-partial", false);
  const notificationFailureMode = rawNotificationFailure?.toLowerCase() || "fail";
  if (notificationFailureMode !== "fail" && notificationFailureMode !== "warn") {
    throw new Error(
      "Invalid notification-failure-mode: expected `fail` or `warn`.",
    );
  }

  const result: ActionInputs = {
    warnWithinDays,
    failWithinDays,
    allowPartial,
    notificationFailureMode,
  };
  if (slackWebhook) result.slackWebhook = parseHttpsUrl(slackWebhook, "slack-webhook");
  return result;
}

export function explicitlySuppliedPolicyInputs(inputs: ActionInputs): string[] {
  const supplied: string[] = [];
  if (inputs.warnWithinDays !== null) supplied.push("warn-within-days");
  if (inputs.failWithinDays !== null) supplied.push("fail-within-days");
  if (inputs.allowPartial !== null) supplied.push("allow-partial");
  return supplied;
}
