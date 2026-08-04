import { describe, expect, test } from "bun:test";

type JsonSchema = Record<string, unknown>;

const SCHEMA_NAMES = [
  "policy.schema.json",
  "usage-evidence.schema.json",
  "lifecycle-feed.schema.json",
  "assessment-report.schema.json",
] as const;

async function schema(name: (typeof SCHEMA_NAMES)[number]): Promise<JsonSchema> {
  const value = JSON.parse(
    await Bun.file(new URL(`../../schemas/${name}`, import.meta.url)).text(),
  ) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must contain a JSON object.`);
  }
  return value as JsonSchema;
}

function definition(document: JsonSchema, name: string): JsonSchema {
  const definitions = document.$defs as Record<string, JsonSchema> | undefined;
  const value = definitions?.[name];
  if (value === undefined) throw new Error(`Missing schema definition ${name}.`);
  return value;
}

function required(document: JsonSchema): string[] {
  return document.required as string[];
}

function walk(value: unknown, path: string, visit: (schema: JsonSchema, path: string) => void): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit));
    return;
  }
  const object = value as JsonSchema;
  visit(object, path);
  for (const [key, child] of Object.entries(object)) {
    walk(child, `${path}.${key}`, visit);
  }
}

describe("published v3 JSON Schemas", () => {
  test("all schemas are Draft 2020-12 documents with stable IDs", async () => {
    for (const name of SCHEMA_NAMES) {
      const document = await schema(name);
      expect(document.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(document.$id).toBe(
        `https://raw.githubusercontent.com/oscarnilsson98/ai-model-end-of-life-action/v3/schemas/${name}`,
      );
    }
  });

  test("every declared object boundary rejects unknown properties", async () => {
    for (const name of SCHEMA_NAMES) {
      const document = await schema(name);
      walk(document, name, (candidate, path) => {
        if (candidate.type === "object") {
          expect(candidate.additionalProperties, path).toBe(false);
        }
      });
    }
  });

  test("policy schema preserves the checked-in authority surface and parser bounds", async () => {
    const document = await schema("policy.schema.json");
    expect(required(document)).toEqual(["schemaVersion"]);
    expect((document.properties as JsonSchema).schemaVersion).toEqual({ const: 1 });
    expect((definition(document, "policyDays").maximum)).toBe(36_500);
    expect(required(definition(document, "assertion"))).toEqual([
      "evidenceId",
      "modelId",
      "servingPlatform",
      "scope",
      "environment",
      "reason",
      "provenance",
      "assertedAt",
      "reviewedAt",
      "reviewAfter",
      "expiresAt",
    ]);
    const servingPlatforms = (document.properties as JsonSchema).servingPlatforms as JsonSchema;
    expect(servingPlatforms.items).toEqual({ $ref: "#/$defs/canonicalPlatform" });
    expect(servingPlatforms.minItems).toBe(1);
    expect(servingPlatforms.uniqueItems).toBe(true);
    expect(required(definition(document, "suppression"))).toContain("target");
    const suppressionTarget = (definition(document, "suppression").properties as JsonSchema)
      .target as JsonSchema;
    expect(suppressionTarget.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          required: ["evidenceId"],
          properties: { evidenceId: { $ref: "#/$defs/stableId" } },
        }),
      ]),
    );
    const suppressionPattern = definition(document, "suppressionPattern");
    expect(suppressionPattern.allOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ pattern: "[^*?/]" })]),
    );
  });

  test("usage-evidence schema keeps source kinds discriminated and bounded", async () => {
    const document = await schema("usage-evidence.schema.json");
    expect(required(document)).toEqual(["schemaVersion", "source", "records"]);
    expect(document.oneOf).toHaveLength(3);
    expect(required(definition(document, "runtimeSource"))).toContain("observedThrough");
    expect(required(definition(document, "deploymentSource"))).toContain("sourceBoundary");
    expect(required(definition(document, "generatedSource"))).toContain("reviewAfter");
    const records = (definition(document, "runtimeDocument").properties as JsonSchema)
      .records as JsonSchema;
    expect(records.maxItems).toBe(10_000);
    const observationCount = (definition(document, "runtimeRecord").properties as JsonSchema)
      .observationCount as JsonSchema;
    expect(observationCount.minimum).toBe(1);
    expect(observationCount.maximum).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("typed feed schema excludes non-model entities from model eligibility", async () => {
    const document = await schema("lifecycle-feed.schema.json");
    expect(required(document)).toEqual(["schemaVersion", "adapter", "generatedAt", "records"]);
    const records = (document.properties as JsonSchema).records as JsonSchema;
    expect(records.minItems).toBe(1);
    expect(records.maxItems).toBe(100_000);
    const nonModel = definition(document, "nonModelRecord");
    const properties = nonModel.properties as Record<string, JsonSchema>;
    expect(properties.literalScanEligible).toEqual({ const: false });
    expect((properties.recordKind?.enum as string[])).not.toContain("model");
    expect(required(definition(document, "modelRecord"))).toContain("replacementModels");
  });

  test("assessment report schema requires independent outcome and health dimensions", async () => {
    const document = await schema("assessment-report.schema.json");
    expect(required(document)).toEqual(expect.arrayContaining([
      "result",
      "scanStatus",
      "comparisonStatus",
      "exitReason",
      "evidenceHealth",
      "evidenceFacts",
      "lifecycleFindings",
      "diagnostics",
      "counts",
      "feed",
    ]));
    const event = definition(document, "event");
    const eventProperties = event.properties as Record<string, JsonSchema>;
    const targetOid = eventProperties.targetOid;
    expect(targetOid?.oneOf).toEqual(expect.arrayContaining([{ const: "unavailable" }]));
    expect(definition(document, "gitOid").pattern).toBe(
      "^(?:[0-9a-f]{40}|[0-9a-f]{64})$",
    );
    const targetParents = eventProperties.targetParentOids;
    expect(targetParents?.minItems).toBe(2);
    expect(targetParents?.maxItems).toBe(2);
    expect(required(definition(document, "evidenceFact"))).toContain("policyEligible");
    expect(required(definition(document, "lifecycleFinding"))).toContain("feedConflict");
    expect(required(definition(document, "lifecycleFinding"))).toContain("servingPlatforms");
    // The finding definition is additionalProperties:false, so every emitted lifecycle
    // day-count must be declared or real reports stop validating.
    const findingProperties = definition(document, "lifecycleFinding").properties as Record<
      string,
      JsonSchema
    >;
    expect(findingProperties.daysUntilDeprecation).toEqual({ type: "integer" });
    expect(findingProperties.deprecationDate).toBeDefined();
    const findingPlatforms = findingProperties.servingPlatforms as JsonSchema;
    expect(findingPlatforms.minItems).toBe(1);
    expect(findingPlatforms.uniqueItems).toBe(true);
  });

  test("assessment report schema publishes upstream feed freshness", async () => {
    const document = await schema("assessment-report.schema.json");
    const feed = definition(document, "feedIdentity");
    expect(required(feed)).toEqual(expect.arrayContaining(["generatedAt", "ageDays"]));
    const properties = feed.properties as Record<string, JsonSchema>;
    // An unavailable feed still has to serialize, so both admit the empty/null form.
    expect(properties.generatedAt?.oneOf).toEqual(
      expect.arrayContaining([{ const: "" }]),
    );
    expect(properties.ageDays?.type).toEqual(["integer", "null"]);
    expect(properties.ageDays?.minimum).toBe(0);
  });
});
