import { parseDocument } from "yaml";
import { MAX_POLICY_DAYS } from "../shared/limits.ts";
import { canonicalSha256, combineEvidenceHealth } from "../shared/status.ts";
import type {
  ActionInputs,
  AssertionClaim,
  CoverageDiagnostic,
  EvidenceFact,
  EvidenceHealth,
  EvidenceScope,
  Policy,
  PolicyInspection,
  ResolutionRule,
  ScopeRule,
  SuppressionRule,
} from "../shared/types.ts";

export const POLICY_PATH = ".github/ai-model-lifecycle.yml";
export const DEFAULT_WARN_WITHIN_DAYS = 180;
export const MAX_POLICY_BYTES = 512 * 1024;
const MAX_RULES = 1_000;
const MAX_TEXT = 4_096;
const ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const PLATFORM = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?Z$/;
const CANONICAL_PLATFORMS = new Set([
  "openai",
  "azure",
  "anthropic",
  "aws-bedrock",
  "google",
  "google-vertex",
  "cohere",
  "groq",
  "xai",
]);
const SCOPES = new Set<EvidenceScope>([
  "application",
  "deployment",
  "test",
  "example",
  "documentation",
  "unknown",
]);
const ENVIRONMENTS = new Set([
  "production",
  "staging",
  "development",
  "test",
  "unknown",
]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value: JsonObject, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field(s): ${unknown.sort().join(", ")}.`);
  }
}

function text(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > max) {
    throw new Error(`${label} must not exceed ${max} Unicode code points.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  return value;
}

function id(value: unknown, label: string): string {
  const normalized = text(value, label, 128);
  if (!ID.test(normalized)) throw new Error(`${label} has an invalid stable ID.`);
  return normalized;
}

function modelId(value: unknown, label: string): string {
  return text(value, label, 256);
}

function platform(value: unknown, label: string): string {
  const normalized = text(value, label, 63);
  if (!PLATFORM.test(normalized) || !CANONICAL_PLATFORMS.has(normalized)) {
    throw new Error(`${label} must be a registered canonical serving-platform slug.`);
  }
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label, 64);
  const match = RFC3339_UTC.exec(normalized);
  const parsed = Date.parse(normalized);
  if (match === null || Number.isNaN(parsed)) {
    throw new Error(`${label} must be an RFC 3339 UTC timestamp.`);
  }
  const instant = new Date(parsed);
  if (
    instant.getUTCFullYear() !== Number(match[1]) ||
    instant.getUTCMonth() + 1 !== Number(match[2]) ||
    instant.getUTCDate() !== Number(match[3]) ||
    instant.getUTCHours() !== Number(match[4]) ||
    instant.getUTCMinutes() !== Number(match[5]) ||
    instant.getUTCSeconds() !== Number(match[6])
  ) {
    throw new Error(`${label} must be a real RFC 3339 UTC instant.`);
  }
  return normalized;
}

function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_POLICY_DAYS) {
    throw new Error(`${label} must be an integer from 0 to ${MAX_POLICY_DAYS}.`);
  }
  return value as number;
}

function array(value: unknown, label: string, required = false): unknown[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > MAX_RULES) throw new Error(`${label} exceeds ${MAX_RULES} entries.`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  const values = array(value, label, true).map((entry, index) =>
    text(entry, `${label}[${index}]`, 1_024),
  );
  if (values.length === 0) throw new Error(`${label} must not be empty.`);
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates.`);
  return values;
}

export function validateRepositoryPattern(value: string, label: string): string {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "" || segment === "..") ||
    /[!{}[\]]/.test(value)
  ) {
    throw new Error(`${label} is not a valid root-anchored repository pattern.`);
  }
  for (const segment of value.split("/")) {
    if (segment.includes("**") && segment !== "**") {
      throw new Error(`${label} may use ** only as a complete path segment.`);
    }
  }
  return value;
}

function patterns(value: unknown, label: string): string[] {
  return stringArray(value, label).map((entry, index) =>
    validateRepositoryPattern(entry, `${label}[${index}]`),
  );
}

function suppressionPatterns(value: unknown, label: string): string[] {
  const result = patterns(value, label);
  if (result.some((pattern) => !/[^*?/]/u.test(pattern))) {
    throw new Error(`${label} must contain a bounded literal path component.`);
  }
  return result;
}

function ordered(values: readonly [string, string][], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1] as [string, string];
    const current = values[index] as [string, string];
    if (Date.parse(previous[1]) > Date.parse(current[1])) {
      throw new Error(`${label} timestamp ordering is invalid at ${current[0]}.`);
    }
  }
}

function strictBefore(left: string, right: string, label: string): void {
  if (Date.parse(left) >= Date.parse(right)) {
    throw new Error(`${label} requires the first timestamp to be strictly earlier.`);
  }
}

function parseAssertion(value: unknown, index: number): AssertionClaim {
  const label = `assertions[${index}]`;
  const source = object(value, label);
  exactKeys(
    source,
    [
      "evidenceId",
      "modelId",
      "servingPlatform",
      "scope",
      "environment",
      "policyEligible",
      "reason",
      "provenance",
      "assertedAt",
      "reviewedAt",
      "reviewAfter",
      "expiresAt",
    ],
    label,
  );
  const scope = text(source.scope, `${label}.scope`) as EvidenceScope;
  if (!SCOPES.has(scope)) throw new Error(`${label}.scope is invalid.`);
  const environment = text(source.environment, `${label}.environment`) as AssertionClaim["environment"];
  if (!ENVIRONMENTS.has(environment)) throw new Error(`${label}.environment is invalid.`);
  const assertedAt = timestamp(source.assertedAt, `${label}.assertedAt`);
  const reviewedAt = timestamp(source.reviewedAt, `${label}.reviewedAt`);
  const reviewAfter = timestamp(source.reviewAfter, `${label}.reviewAfter`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  ordered(
    [
      ["assertedAt", assertedAt],
      ["reviewedAt", reviewedAt],
      ["reviewAfter", reviewAfter],
      ["expiresAt", expiresAt],
    ],
    label,
  );
  strictBefore(reviewedAt, reviewAfter, `${label}.reviewedAt/reviewAfter`);
  return {
    evidenceId: id(source.evidenceId, `${label}.evidenceId`),
    modelId: modelId(source.modelId, `${label}.modelId`),
    servingPlatform: platform(source.servingPlatform, `${label}.servingPlatform`),
    scope,
    environment,
    policyEligible: boolean(source.policyEligible, `${label}.policyEligible`, false),
    reason: text(source.reason, `${label}.reason`),
    provenance: text(source.provenance, `${label}.provenance`),
    assertedAt,
    reviewedAt,
    reviewAfter,
    expiresAt,
  };
}

function parseResolution(value: unknown, index: number): ResolutionRule {
  const label = `resolutions[${index}]`;
  const source = object(value, label);
  exactKeys(
    source,
    ["resolutionId", "match", "resolveTo", "reason", "reviewedAt", "reviewAfter", "expiresAt"],
    label,
  );
  const match = object(source.match, `${label}.match`);
  exactKeys(match, ["detectorRuleId", "rawValue", "paths"], `${label}.match`);
  const resolveTo = object(source.resolveTo, `${label}.resolveTo`);
  exactKeys(resolveTo, ["modelId", "servingPlatform"], `${label}.resolveTo`);
  const reviewedAt = timestamp(source.reviewedAt, `${label}.reviewedAt`);
  const reviewAfter = timestamp(source.reviewAfter, `${label}.reviewAfter`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  ordered(
    [
      ["reviewedAt", reviewedAt],
      ["reviewAfter", reviewAfter],
      ["expiresAt", expiresAt],
    ],
    label,
  );
  strictBefore(reviewedAt, reviewAfter, `${label}.reviewedAt/reviewAfter`);
  return {
    resolutionId: id(source.resolutionId, `${label}.resolutionId`),
    match: {
      detectorRuleId: text(match.detectorRuleId, `${label}.match.detectorRuleId`, 256),
      rawValue: text(match.rawValue, `${label}.match.rawValue`, 1_024),
      paths: patterns(match.paths, `${label}.match.paths`),
    },
    resolveTo: {
      modelId: modelId(resolveTo.modelId, `${label}.resolveTo.modelId`),
      servingPlatform: platform(
        resolveTo.servingPlatform,
        `${label}.resolveTo.servingPlatform`,
      ),
    },
    reason: text(source.reason, `${label}.reason`),
    reviewedAt,
    reviewAfter,
    expiresAt,
  };
}

function parseScopeRule(value: unknown, index: number): ScopeRule {
  const label = `scopeRules[${index}]`;
  const source = object(value, label);
  exactKeys(
    source,
    ["scopeRuleId", "detectorRuleIds", "paths", "scope", "environment", "reason"],
    label,
  );
  const scope = text(source.scope, `${label}.scope`) as EvidenceScope;
  if (!SCOPES.has(scope)) throw new Error(`${label}.scope is invalid.`);
  const environment = text(source.environment, `${label}.environment`) as ScopeRule["environment"];
  if (!ENVIRONMENTS.has(environment)) throw new Error(`${label}.environment is invalid.`);
  return {
    scopeRuleId: id(source.scopeRuleId, `${label}.scopeRuleId`),
    detectorRuleIds: stringArray(source.detectorRuleIds, `${label}.detectorRuleIds`),
    paths: patterns(source.paths, `${label}.paths`),
    scope,
    environment,
    reason: text(source.reason, `${label}.reason`),
  };
}

function parseSuppression(value: unknown, index: number): SuppressionRule {
  const label = `suppressions[${index}]`;
  const source = object(value, label);
  exactKeys(source, ["suppressionId", "target", "reason", "createdAt", "expiresAt"], label);
  const target = object(source.target, `${label}.target`);
  const targetKeys = Object.keys(target);
  let parsedTarget: SuppressionRule["target"];
  if (targetKeys.includes("evidenceId")) {
    exactKeys(target, ["evidenceId"], `${label}.target`);
    parsedTarget = { evidenceId: id(target.evidenceId, `${label}.target.evidenceId`) };
  } else {
    exactKeys(
      target,
      ["modelId", "servingPlatform", "detectorRuleIds", "paths"],
      `${label}.target`,
    );
    parsedTarget = {
      modelId: modelId(target.modelId, `${label}.target.modelId`),
      servingPlatform: platform(
        target.servingPlatform,
        `${label}.target.servingPlatform`,
      ),
      detectorRuleIds: stringArray(
        target.detectorRuleIds,
        `${label}.target.detectorRuleIds`,
      ),
      paths: suppressionPatterns(target.paths, `${label}.target.paths`),
    };
  }
  const createdAt = timestamp(source.createdAt, `${label}.createdAt`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  strictBefore(createdAt, expiresAt, `${label}.createdAt/expiresAt`);
  return {
    suppressionId: id(source.suppressionId, `${label}.suppressionId`),
    target: parsedTarget,
    reason: text(source.reason, `${label}.reason`),
    createdAt,
    expiresAt,
  };
}

function uniqueIds(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate ID ${value}.`);
    seen.add(value);
  }
}

export function defaultPolicy(): Policy {
  return {
    warnWithinDays: DEFAULT_WARN_WITHIN_DAYS,
    failWithinDays: null,
    allowPartial: false,
    usageEvidenceFiles: [],
    assertions: [],
    resolutions: [],
    scopeRules: [],
    suppressions: [],
  };
}

export function parsePolicyPayload(payload: unknown): Policy {
  const root = object(payload, "Policy document");
  exactKeys(
    root,
    [
      "schemaVersion",
      "policy",
      "usageEvidenceFiles",
      "assertions",
      "resolutions",
      "scopeRules",
      "suppressions",
    ],
    "Policy document",
  );
  if (root.schemaVersion !== 1) throw new Error("Policy document schemaVersion must be 1.");
  const policy = defaultPolicy();
  if (root.policy !== undefined) {
    const source = object(root.policy, "policy");
    exactKeys(source, ["warnWithinDays", "failWithinDays", "allowPartial"], "policy");
    if (source.warnWithinDays !== undefined) {
      policy.warnWithinDays = integer(source.warnWithinDays, "policy.warnWithinDays");
    }
    if (source.failWithinDays !== undefined && source.failWithinDays !== null) {
      policy.failWithinDays = integer(source.failWithinDays, "policy.failWithinDays");
    }
    policy.allowPartial = boolean(source.allowPartial, "policy.allowPartial", false);
  }
  if (root.usageEvidenceFiles !== undefined) {
    policy.usageEvidenceFiles = patterns(root.usageEvidenceFiles, "usageEvidenceFiles");
  }
  policy.assertions = array(root.assertions, "assertions").map(parseAssertion);
  policy.resolutions = array(root.resolutions, "resolutions").map(parseResolution);
  policy.scopeRules = array(root.scopeRules, "scopeRules").map(parseScopeRule);
  policy.suppressions = array(root.suppressions, "suppressions").map(parseSuppression);
  uniqueIds(policy.assertions.map((entry) => entry.evidenceId), "assertions");
  uniqueIds(policy.resolutions.map((entry) => entry.resolutionId), "resolutions");
  uniqueIds(policy.scopeRules.map((entry) => entry.scopeRuleId), "scopeRules");
  uniqueIds(policy.suppressions.map((entry) => entry.suppressionId), "suppressions");
  return policy;
}

export function inspectPolicy(textValue: string | undefined): PolicyInspection {
  if (textValue === undefined) {
    return {
      policy: defaultPolicy(),
      present: false,
      valid: true,
      digest: canonicalSha256("ai-model-eol/policy-document/v3", null),
      diagnostics: [],
      rawAssertionIds: [],
    };
  }
  if (Buffer.byteLength(textValue, "utf8") > MAX_POLICY_BYTES) {
    return invalidInspection(`Policy document exceeds ${MAX_POLICY_BYTES} bytes.`, textValue);
  }
  try {
    const document = parseDocument(textValue, {
      schema: "core",
      uniqueKeys: true,
      prettyErrors: false,
      strict: true,
    });
    if (document.errors.length > 0) {
      throw new Error(document.errors.map((error) => error.message).join("; "));
    }
    if (document.warnings.length > 0) {
      throw new Error(document.warnings.map((warning) => warning.message).join("; "));
    }
    const payload = document.toJS({ maxAliasCount: 0 }) as unknown;
    const policy = parsePolicyPayload(payload);
    return {
      policy,
      present: true,
      valid: true,
      digest: canonicalSha256("ai-model-eol/policy-document/v3", payload),
      diagnostics: [],
      rawAssertionIds: policy.assertions.map((entry) => entry.evidenceId).sort(),
    };
  } catch (error) {
    return invalidInspection(
      error instanceof Error ? error.message : String(error),
      textValue,
    );
  }
}

function invalidInspection(message: string, source: string): PolicyInspection {
  return {
    policy: defaultPolicy(),
    present: true,
    valid: false,
    digest: canonicalSha256("ai-model-eol/policy-document/v3", source),
    diagnostics: [
      {
        code: "invalid-policy",
        message,
        path: POLICY_PATH,
        severity: "failed",
      },
    ],
    rawAssertionIds: [],
  };
}

export function applyTrustedInputs(policy: Policy, inputs: ActionInputs): Policy {
  return {
    ...policy,
    warnWithinDays: inputs.warnWithinDays ?? policy.warnWithinDays,
    failWithinDays: inputs.failWithinDays ?? policy.failWithinDays,
    allowPartial: inputs.allowPartial ?? policy.allowPartial,
  };
}

function appendUniqueById<T>(
  base: readonly T[],
  proposed: readonly T[],
  identity: (value: T) => string,
): T[] {
  const result = [...base];
  const serialized = new Set(base.map((value) => JSON.stringify(value)));
  for (const value of proposed) {
    const exact = JSON.stringify(value);
    if (!serialized.has(exact)) {
      result.push(value);
      serialized.add(exact);
    }
  }
  return result.sort((left, right) => {
    const leftId = identity(left);
    const rightId = identity(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

/** Combine base authority with target tightenings without accepting target suppressions. */
export function monotonicPolicy(base: Policy, proposed: Policy): Policy {
  const failWithinDays =
    base.failWithinDays === null
      ? proposed.failWithinDays
      : proposed.failWithinDays === null
        ? base.failWithinDays
        : Math.max(base.failWithinDays, proposed.failWithinDays);
  return {
    warnWithinDays: Math.max(base.warnWithinDays, proposed.warnWithinDays),
    failWithinDays,
    allowPartial: base.allowPartial && proposed.allowPartial,
    usageEvidenceFiles: [...new Set([...base.usageEvidenceFiles, ...proposed.usageEvidenceFiles])].sort(),
    assertions: appendUniqueById(base.assertions, proposed.assertions, (entry) => entry.evidenceId),
    resolutions: appendUniqueById(base.resolutions, proposed.resolutions, (entry) => entry.resolutionId),
    scopeRules: appendUniqueById(base.scopeRules, proposed.scopeRules, (entry) => entry.scopeRuleId),
    suppressions: [...base.suppressions],
  };
}

export function policyDiff(base: PolicyInspection, target: PolicyInspection, inputs: ActionInputs): string[] {
  const changes: string[] = [];
  if (base.digest !== target.digest) changes.push("Checked-in policy/configuration changed.");
  if (!target.valid) changes.push("Target policy/configuration is invalid and was not trusted.");
  if (inputs.warnWithinDays !== null) {
    changes.push(`Action input proposes warnWithinDays=${inputs.warnWithinDays}.`);
  }
  if (inputs.failWithinDays !== null) {
    changes.push(`Action input proposes failWithinDays=${inputs.failWithinDays}.`);
  }
  if (inputs.allowPartial !== null) {
    changes.push(`Action input proposes allowPartial=${String(inputs.allowPartial)}.`);
  }
  return changes;
}

function globSegment(pattern: string, value: string): boolean {
  let expression = "^";
  for (const character of pattern) {
    if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${expression}$`, "u").test(value);
}

export function matchRepositoryPattern(pattern: string, path: string): boolean {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  const memo = new Map<string, boolean>();
  const visit = (patternIndex: number, pathIndex: number): boolean => {
    const key = `${patternIndex}:${pathIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result: boolean;
    if (patternIndex === patternSegments.length) result = pathIndex === pathSegments.length;
    else if (patternSegments[patternIndex] === "**") {
      result =
        visit(patternIndex + 1, pathIndex) ||
        (pathIndex < pathSegments.length && visit(patternIndex, pathIndex + 1));
    } else {
      result =
        pathIndex < pathSegments.length &&
        globSegment(patternSegments[patternIndex] as string, pathSegments[pathIndex] as string) &&
        visit(patternIndex + 1, pathIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}

export function assertionHealth(assertion: AssertionClaim, now: number): EvidenceHealth {
  if (now >= Date.parse(assertion.expiresAt)) return "expired";
  if (now >= Date.parse(assertion.reviewAfter)) return "review-overdue";
  return "current";
}

export function assertionsToEvidence(
  assertions: readonly AssertionClaim[],
  now: number,
): { facts: EvidenceFact[]; health: EvidenceHealth; diagnostics: CoverageDiagnostic[] } {
  let health: EvidenceHealth = "current";
  const diagnostics: CoverageDiagnostic[] = [];
  const facts = assertions.map((assertion): EvidenceFact => {
    const currentHealth = assertionHealth(assertion, now);
    health = combineEvidenceHealth(health, currentHealth);
    if (currentHealth !== "current") {
      diagnostics.push({
        code: `assertion-${currentHealth}`,
        message: `Assertion ${assertion.evidenceId} is ${currentHealth}.`,
        path: POLICY_PATH,
        severity: "partial",
      });
    }
    return {
      evidenceId: assertion.evidenceId,
      origin: "manual-claim",
      kind: "manual-claim",
      confidence: "high",
      scope: assertion.scope,
      environment: assertion.environment,
      detectorRuleId: "claim.manual.assertion@1",
      detectorManifestVersion: "3.0.0-1",
      rawValue: assertion.modelId,
      modelId: assertion.modelId,
      servingPlatform: assertion.servingPlatform,
      modelResolution: "resolved",
      selectorKind: "model-id",
      platformResolution: "resolved",
      policyEligible: assertion.policyEligible && currentHealth === "current",
      locations: [{ path: POLICY_PATH, line: 1, column: 1 }],
      resolutionTrace: [{ kind: "detector", detail: "checked-in manual assertion" }],
      evidenceHealth: currentHealth,
      reason: assertion.reason,
      provenance: assertion.provenance,
    };
  });
  return { facts, health, diagnostics };
}
