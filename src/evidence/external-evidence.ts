import { DETECTOR_MANIFEST_VERSION } from "../detection/manifest.ts";
import { canonicalSha256 } from "../shared/status.ts";
import type {
  CoverageDiagnostic,
  EvidenceEnvironment,
  EvidenceFact,
  EvidenceHealth,
  EvidenceScope,
  EvidenceSourceInspection,
} from "../shared/types.ts";

export const DEFAULT_EVIDENCE_PREFIX = ".github/ai-model-evidence/";
export const MAX_EVIDENCE_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_EVIDENCE_RECORDS = 10_000;
const ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const PLATFORM = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?Z$/;
const PLATFORMS = new Set([
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
const ENVIRONMENTS = new Set<EvidenceEnvironment>([
  "production",
  "staging",
  "development",
  "test",
  "unknown",
]);

type JsonObject = Record<string, unknown>;
type SourceKind = "runtime-observation" | "deployment-snapshot" | "generated-declaration";

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function object(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(source: JsonObject, keys: readonly string[], label: string): void {
  const supported = new Set(keys);
  const unknown = Object.keys(source).filter((key) => !supported.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field(s): ${unknown.sort().join(", ")}.`);
  }
}

function text(value: unknown, label: string, maximum = 4_096): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > maximum) {
    throw new Error(`${label} must not exceed ${maximum} Unicode code points.`);
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

function ordered(values: readonly [string, string][], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const left = values[index - 1] as [string, string];
    const right = values[index] as [string, string];
    if (Date.parse(left[1]) > Date.parse(right[1])) {
      throw new Error(`${label} timestamp ordering is invalid at ${right[0]}.`);
    }
  }
}

function sourceKind(value: unknown): SourceKind {
  if (
    value === "runtime-observation" ||
    value === "deployment-snapshot" ||
    value === "generated-declaration"
  ) {
    return value;
  }
  throw new Error("source.kind is invalid.");
}

function environment(value: unknown, label: string): EvidenceEnvironment {
  const result = text(value, label) as EvidenceEnvironment;
  if (!ENVIRONMENTS.has(result)) throw new Error(`${label} is invalid.`);
  return result;
}

function scope(value: unknown, label: string): EvidenceScope {
  const result = text(value, label) as EvidenceScope;
  if (!SCOPES.has(result)) throw new Error(`${label} is invalid.`);
  return result;
}

function platform(value: unknown, label: string): string {
  const result = text(value, label, 63);
  if (!PLATFORM.test(result) || !PLATFORMS.has(result)) {
    throw new Error(`${label} must be a registered canonical platform.`);
  }
  return result;
}

function invalid(path: string, message: string, digest: string): EvidenceSourceInspection {
  return {
    path,
    digest,
    present: true,
    valid: false,
    health: "invalid",
    rawEvidenceIds: [],
    partialCoverage: false,
    facts: [],
    diagnostics: [
      { code: "invalid-evidence-document", message, path, severity: "failed" },
    ],
  };
}

export function inspectEvidenceDocument(
  path: string,
  bytes: Uint8Array,
  now: number,
): EvidenceSourceInspection {
  const digest = canonicalSha256("ai-model-eol/external-evidence-document/v3", [...bytes]);
  if (bytes.byteLength > MAX_EVIDENCE_DOCUMENT_BYTES) {
    return invalid(path, `Evidence document exceeds ${MAX_EVIDENCE_DOCUMENT_BYTES} bytes.`, digest);
  }
  let payload: unknown;
  try {
    const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    payload = JSON.parse(sourceText) as unknown;
  } catch (error) {
    return invalid(path, error instanceof Error ? error.message : String(error), digest);
  }
  try {
    const root = object(payload, "Evidence document");
    exactKeys(root, ["schemaVersion", "source", "records"], "Evidence document");
    if (root.schemaVersion !== 1) throw new Error("Evidence document schemaVersion must be 1.");
    const source = object(root.source, "source");
    const kind = sourceKind(source.kind);
    const commonKeys = [
      "id",
      "kind",
      "claimBasis",
      "environment",
      "policyEligible",
      "provenance",
      "expiresAt",
    ];
    if (kind === "runtime-observation") {
      exactKeys(
        source,
        [...commonKeys, "generatedAt", "observedFrom", "observedThrough", "freshUntil", "snapshotSemantics"],
        "source",
      );
    } else if (kind === "deployment-snapshot") {
      exactKeys(
        source,
        [...commonKeys, "capturedAt", "freshUntil", "snapshotSemantics", "sourceBoundary"],
        "source",
      );
    } else {
      exactKeys(
        source,
        [...commonKeys, "generatedAt", "reviewAfter", "generator", "ruleset", "reason"],
        "source",
      );
    }
    if (source.claimBasis !== "repository-supplied") {
      throw new Error("source.claimBasis must be repository-supplied.");
    }
    const sourceId = id(source.id, "source.id");
    const sourceEnvironment = environment(source.environment, "source.environment");
    const policyEligible = boolean(source.policyEligible, "source.policyEligible", false);
    const provenance = text(source.provenance, "source.provenance");
    const expiresAt = timestamp(source.expiresAt, "source.expiresAt");
    let freshnessBoundary: string;
    let sourceVersionTime: string;
    let lineageIdentity: string;
    let partialCoverage = false;
    if (kind === "runtime-observation") {
      if (source.snapshotSemantics !== "observations-only") {
        throw new Error("runtime source.snapshotSemantics must be observations-only.");
      }
      const observedFrom = timestamp(source.observedFrom, "source.observedFrom");
      const observedThrough = timestamp(source.observedThrough, "source.observedThrough");
      const generatedAt = timestamp(source.generatedAt, "source.generatedAt");
      sourceVersionTime = generatedAt;
      lineageIdentity = "observations-only";
      freshnessBoundary = timestamp(source.freshUntil, "source.freshUntil");
      ordered(
        [
          ["observedFrom", observedFrom],
          ["observedThrough", observedThrough],
          ["generatedAt", generatedAt],
          ["freshUntil", freshnessBoundary],
          ["expiresAt", expiresAt],
        ],
        "source",
      );
    } else if (kind === "deployment-snapshot") {
      const capturedAt = timestamp(source.capturedAt, "source.capturedAt");
      sourceVersionTime = capturedAt;
      freshnessBoundary = timestamp(source.freshUntil, "source.freshUntil");
      if (source.snapshotSemantics !== "complete-for-source" && source.snapshotSemantics !== "partial") {
        throw new Error(
          "deployment source.snapshotSemantics must be complete-for-source or partial.",
        );
      }
      partialCoverage = source.snapshotSemantics === "partial";
      lineageIdentity = text(source.sourceBoundary, "source.sourceBoundary");
      ordered(
        [
          ["capturedAt", capturedAt],
          ["freshUntil", freshnessBoundary],
          ["expiresAt", expiresAt],
        ],
        "source",
      );
    } else {
      const generatedAt = timestamp(source.generatedAt, "source.generatedAt");
      sourceVersionTime = generatedAt;
      freshnessBoundary = timestamp(source.reviewAfter, "source.reviewAfter");
      const generator = text(source.generator, "source.generator");
      const ruleset = text(source.ruleset, "source.ruleset");
      lineageIdentity = JSON.stringify([generator, ruleset]);
      text(source.reason, "source.reason");
      ordered(
        [
          ["generatedAt", generatedAt],
          ["reviewAfter", freshnessBoundary],
          ["expiresAt", expiresAt],
        ],
        "source",
      );
    }

    let health: EvidenceHealth = "current";
    if (now >= Date.parse(expiresAt)) health = "expired";
    else if (now >= Date.parse(freshnessBoundary)) {
      health = kind === "generated-declaration" ? "review-overdue" : "stale";
    }
    const rawRecords = root.records;
    if (!Array.isArray(rawRecords)) throw new Error("records must be an array.");
    if (rawRecords.length > MAX_EVIDENCE_RECORDS) {
      throw new Error(`records exceeds ${MAX_EVIDENCE_RECORDS} entries.`);
    }
    const seen = new Set<string>();
    const facts = rawRecords.map((value, index): EvidenceFact => {
      const label = `records[${index}]`;
      const record = object(value, label);
      const commonRecordKeys = [
        "evidenceId",
        "modelId",
        "servingPlatform",
        "scope",
        "environment",
        "reason",
      ];
      if (kind === "runtime-observation") {
        exactKeys(
          record,
          [...commonRecordKeys, "firstObservedAt", "lastObservedAt", "observationCount"],
          label,
        );
      } else {
        exactKeys(record, commonRecordKeys, label);
      }
      const evidenceId = id(record.evidenceId, `${label}.evidenceId`);
      if (seen.has(evidenceId)) throw new Error(`Duplicate evidenceId ${evidenceId}.`);
      seen.add(evidenceId);
      const recordEnvironment = environment(record.environment, `${label}.environment`);
      if (recordEnvironment !== sourceEnvironment) {
        throw new Error(`${label}.environment must equal source.environment.`);
      }
      if (kind === "runtime-observation") {
        const first = timestamp(record.firstObservedAt, `${label}.firstObservedAt`);
        const last = timestamp(record.lastObservedAt, `${label}.lastObservedAt`);
        ordered(
          [
            ["firstObservedAt", first],
            ["lastObservedAt", last],
          ],
          label,
        );
        if (!Number.isSafeInteger(record.observationCount) || (record.observationCount as number) < 1) {
          throw new Error(`${label}.observationCount must be a positive integer.`);
        }
      }
      const recordScope = scope(record.scope, `${label}.scope`);
      return {
        evidenceId,
        origin: "external-source",
        kind,
        confidence: "high",
        scope: recordScope,
        environment: recordEnvironment,
        detectorRuleId: `claim.external.${kind}@1`,
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue: text(record.modelId, `${label}.modelId`, 256),
        modelId: text(record.modelId, `${label}.modelId`, 256),
        servingPlatform: platform(record.servingPlatform, `${label}.servingPlatform`),
        modelResolution: "resolved",
        selectorKind: "model-id",
        platformResolution: "resolved",
        policyEligible:
          policyEligible &&
          health === "current" &&
          kind !== "generated-declaration" &&
          (recordScope === "deployment" ||
            (recordScope === "application" && recordEnvironment === "production")),
        locations: [{ path, line: 1, column: 1 }],
        resolutionTrace: [{ kind: "detector", detail: `checked-in ${kind} claim` }],
        sourceId,
        evidenceHealth: health,
        reason: text(record.reason, `${label}.reason`),
        provenance,
      };
    });
    const diagnostics: CoverageDiagnostic[] = [];
    if (health !== "current") {
      diagnostics.push({
        code: `evidence-source-${health}`,
        message: `Evidence source ${sourceId} is ${health}.`,
        path,
        severity: "partial",
      });
    }
    if (partialCoverage) {
      diagnostics.push({
        code: "evidence-source-partial",
        message: `Evidence source ${sourceId} declares partial coverage.`,
        path,
        severity: "partial",
      });
    }
    return {
      path,
      digest,
      sourceId,
      sourceKind: kind,
      sourceEnvironment,
      lineageIdentity,
      sourceVersionTime,
      freshnessBoundary,
      expiresAt,
      rawEvidenceIds: [...seen].sort(),
      present: true,
      valid: true,
      health,
      partialCoverage,
      facts,
      diagnostics,
    };
  } catch (error) {
    return invalid(path, error instanceof Error ? error.message : String(error), digest);
  }
}
