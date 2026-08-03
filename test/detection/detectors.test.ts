import { describe, expect, test } from "bun:test";
import { detectSnapshot } from "../../src/detection/detectors.ts";
import { buildV3FeedIndex } from "../../src/lifecycle/feed.ts";
import type { GitTreeSnapshot } from "../../src/repository/git.ts";

const feed = buildV3FeedIndex({
  schemaVersion: 3,
  adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
  generatedAt: "2026-08-01T00:00:00Z",
  records: [
    {
      recordId: "old",
      servingPlatform: "openai",
      primarySourceUrl: "https://example.com/old",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "gpt-old",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2027-01-01",
      replacementModels: [],
    },
    {
      recordId: "feature",
      servingPlatform: "openai",
      primarySourceUrl: "https://example.com/feature",
      supersedesRecordIds: [],
      recordKind: "agent",
      resourceId: "Agent Builder",
      displayName: "Agent Builder",
      literalScanEligible: false,
    },
  ],
});

function snapshot(path: string, source: string): GitTreeSnapshot {
  return {
    treeObjectId: "a".repeat(40),
    scanStatus: "complete",
    entries: [
      {
        pathBytes: Buffer.from(path),
        displayPath: path,
        mode: "100644",
        kind: "regular",
        objectId: "b".repeat(40),
        declaredObjectType: "blob",
        objectSize: Buffer.byteLength(source),
        content: { state: "available", bytes: Buffer.from(source) },
      },
    ],
    diagnostics: [],
    stats: {
      entryCount: 1,
      blobEntryCount: 1,
      uniqueObjectCount: 1,
      uniqueBlobObjectCount: 1,
      availableBlobEntryCount: 1,
      oversizedBlobEntryCount: 0,
      unavailableBlobEntryCount: 0,
      symlinkEntryCount: 0,
      gitlinkEntryCount: 0,
      lfsPointerEntryCount: 0,
      assessedBlobBytes: Buffer.byteLength(source),
      readObjectBytes: Buffer.byteLength(source),
      readObjectCount: 1,
      metadataBytes: 1,
    },
    limits: {
      maxEntries: 100,
      maxUniqueObjects: 100,
      maxMetadataBytes: 1_000,
      maxBlobBytes: 1_000,
      maxTotalBlobBytes: 1_000,
    },
  };
}

function repositorySnapshot(files: Readonly<Record<string, string>>): GitTreeSnapshot {
  const entries = Object.entries(files).map(([path, source], index) => ({
    pathBytes: Buffer.from(path),
    displayPath: path,
    mode: "100644" as const,
    kind: "regular" as const,
    objectId: (index + 1).toString(16).padStart(40, "0"),
    declaredObjectType: "blob" as const,
    objectSize: Buffer.byteLength(source),
    content: { state: "available" as const, bytes: Buffer.from(source) },
  }));
  const bytes = Object.values(files).reduce(
    (total, source) => total + Buffer.byteLength(source),
    0,
  );
  return {
    treeObjectId: "a".repeat(40),
    scanStatus: "complete",
    entries,
    diagnostics: [],
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length,
      uniqueObjectCount: entries.length,
      uniqueBlobObjectCount: entries.length,
      availableBlobEntryCount: entries.length,
      oversizedBlobEntryCount: 0,
      unavailableBlobEntryCount: 0,
      symlinkEntryCount: 0,
      gitlinkEntryCount: 0,
      lfsPointerEntryCount: 0,
      assessedBlobBytes: bytes,
      readObjectBytes: bytes,
      readObjectCount: entries.length,
      metadataBytes: entries.length,
    },
    limits: {
      maxEntries: 100,
      maxUniqueObjects: 100,
      maxMetadataBytes: 10_000,
      maxBlobBytes: 10_000,
      maxTotalBlobBytes: 100_000,
    },
  };
}

describe("v3 detectors", () => {
  test("emits feed-independent semantic OpenAI evidence", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: key });\nclient.responses.create({ model: "gpt-old", input: "hi" });\n`,
      ),
      feed,
    );
    expect(result.evidence.some((fact) => fact.detectorRuleId === "source.ts.openai.request-model@1")).toBe(true);
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "openai",
      scope: "application",
      confidence: "high",
    });
    expect(result.evidence.filter((fact) => fact.modelId === "gpt-old")).toHaveLength(1);
    expect(result.evidence.some((fact) => fact.kind === "lexical")).toBe(false);
  });

  test("deduplicates lexical fallback evidence by the exact semantic literal span", () => {
    const python = detectSnapshot(
      snapshot(
        "src/chat.py",
        `from openai import OpenAI\nclient = OpenAI()\nclient.responses.create(model="""gpt-old""")\n`,
      ),
      feed,
    );
    expect(python.evidence.filter((fact) => fact.modelId === "gpt-old")).toHaveLength(1);
    expect(python.evidence[0]).toMatchObject({ kind: "sdk-argument", modelId: "gpt-old" });
  });

  test("reads string literals as data rather than syntax", () => {
    const bracketInString = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: key });\nclient.responses.create({ stop: [")"], model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(bracketInString.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      modelId: "gpt-old",
      policyEligible: true,
    });

    const propertyNameInValue = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: key });\nclient.responses.create({ label: flag ? "model" : "other", model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(propertyNameInValue.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      modelId: "gpt-old",
    });
  });

  test("still reads quoted object keys", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.py",
        `from openai import OpenAI\nclient = OpenAI()\nclient.responses.create(**{"model": "gpt-old"})\n`,
      ),
      feed,
    );
    expect(result.evidence.some((fact) => fact.modelId === "gpt-old")).toBe(true);
  });

  test("does not let a regex literal swallow following code", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: key });\nconst escaped = raw.replace(/"/g, "");\nclient.responses.create({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      modelId: "gpt-old",
    });
  });

  test("does not treat inherited object-property names as closing delimiters", () => {
    const result = detectSnapshot(
      snapshot(
        "src/syntax.ts",
        `class Example {
  constructor(readonly value: string) {}
  render() { return this.value.toString(); }
}
const names = { __proto__: null, hasOwnProperty: true };
`,
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics).toEqual([]);
  });

  test("keeps nested template literals synchronized through interpolation expressions", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.ts",
        'const rendered = `outer ${flag ? "" : `inner ${value++ / 2}`}`;\n' +
          'import OpenAI from "openai";\n' +
          "const client = new OpenAI();\n" +
          'client.responses.create({ model: "gpt-old" });\n',
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      modelId: "gpt-old",
    });
  });

  test("reports an out-of-range unicode escape as partial instead of throwing", () => {
    const result = detectSnapshot(
      snapshot("src/limits.ts", `const boundary = "\\u{110000}";\n`),
      feed,
    );
    expect(result.scanStatus).toBe("partial");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic-tokenization-incomplete@1",
      path: "src/limits.ts",
      severity: "partial",
    }));
  });

  test("marks incomplete token constructs partial and keeps only lexical fallback evidence", () => {
    const cases = [
      {
        path: "src/regex.ts",
        source: `import OpenAI from "openai";\nconst client = new OpenAI();\nconst invalid = /unterminated\nclient.responses.create({ model: "gpt-old" });\n`,
      },
      {
        path: "src/comment.ts",
        source: `import OpenAI from "openai";\n/* unterminated\nclient.responses.create({ model: "gpt-old" });\n`,
      },
      {
        path: "src/string.py",
        source: `from openai import OpenAI\ninvalid = "unterminated\nclient = OpenAI()\nclient.responses.create(model="gpt-old")\n`,
      },
      {
        path: "src/template.ts",
        source: 'const invalid = `outer ${flag ? `inner` : value};\nconst model = "gpt-old";\n',
      },
    ] as const;
    for (const testCase of cases) {
      const result = detectSnapshot(snapshot(testCase.path, testCase.source), feed);
      expect(result.scanStatus, testCase.path).toBe("partial");
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "semantic-tokenization-incomplete@1" &&
            diagnostic.path === testCase.path,
        ),
        testCase.path,
      ).toBe(true);
      expect(
        result.evidence.every((fact) => fact.kind === "lexical" && !fact.policyEligible),
        testCase.path,
      ).toBe(true);
    }
  });

  test("treats a comment-only workflow as complete coverage", () => {
    const result = detectSnapshot(
      snapshot(".github/workflows/disabled.yml", "# temporarily disabled\n"),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "invalid-github-actions-yaml")).toBe(
      false,
    );
  });

  test("keeps custom endpoints unresolved", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: "https://gateway.example" });\nclient.responses.create({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      platformResolution: "unknown",
      policyEligible: false,
    });
  });

  test("does not trust package names found only in comments or unrelated constructors", () => {
    const commented = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `// import OpenAI from "openai";\nclass OpenAI {}\nconst client = new OpenAI();\nclient.responses.create({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(commented.evidence.some((fact) => fact.kind === "sdk-argument")).toBe(false);

    const shadow = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OfficialOpenAI from "openai";\nclass OpenAI {}\nconst client = new OpenAI();\nclient.responses.create({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(shadow.evidence.some((fact) => fact.kind === "sdk-argument")).toBe(false);

    const parameterShadow = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nfunction run(OpenAI) {\n  const client = new OpenAI();\n  client.responses.create({ model: "gpt-old" });\n}\n`,
      ),
      feed,
    );
    expect(parameterShadow.evidence.some((fact) => fact.kind === "sdk-argument")).toBe(false);

    const stringDelimiterShadow = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nfunction run(label = "(", OpenAI) {\n  const client = new OpenAI();\n  client.responses.create({ model: "gpt-old" });\n}\n`,
      ),
      feed,
    );
    expect(stringDelimiterShadow.evidence.some((fact) => fact.kind === "sdk-argument")).toBe(
      false,
    );
  });

  test("does not treat nested unrelated model properties as request selectors", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI();\nclient.responses.create({ metadata: { model: "gpt-old" } });\n`,
      ),
      feed,
    );
    expect(result.evidence.some((fact) => fact.kind === "sdk-argument")).toBe(false);
  });

  test("rejects look-alike endpoint hosts and classifies recognized Azure endpoints", () => {
    const lookalike = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: "https://api.openai.com.attacker.example" });\nclient.responses.create({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(lookalike.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      platformResolution: "unknown",
      policyEligible: false,
    });

    const azure = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: "https://example.openai.azure.com" });\nclient.responses.create({ model: "deployment-name" });\n`,
      ),
      feed,
    );
    expect(azure.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      servingPlatform: "azure",
      platformResolution: "resolved",
      selectorKind: "deployment-name",
      policyEligible: false,
    });
  });

  test("applies the same custom-endpoint guard to Python", () => {
    const result = detectSnapshot(
      snapshot(
        "src/chat.py",
        `from openai import OpenAI\nclient = OpenAI(base_url="https://gateway.example")\nclient.responses.create(model="gpt-old")\n`,
      ),
      feed,
    );
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      platformResolution: "unknown",
      policyEligible: false,
    });
  });

  test("finds nested Google endpoint overrides before resolving the platform", () => {
    const result = detectSnapshot(
      snapshot(
        "src/gemini.ts",
        `import { GoogleGenAI } from "@google/genai";\nconst ai = new GoogleGenAI({ apiKey: key, httpOptions: { baseUrl: "https://gateway.example" } });\nai.models.generateContent({ model: "gpt-old" });\n`,
      ),
      feed,
    );
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      platformResolution: "unknown",
      policyEligible: false,
    });
  });

  test("does not resolve Bedrock commands through a custom endpoint", () => {
    const result = detectSnapshot(
      snapshot(
        "src/bedrock.ts",
        `import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";\nconst client = new BedrockRuntimeClient({ endpoint: "https://gateway.example" });\nconst command = new InvokeModelCommand({ modelId: "gpt-old" });\nclient.send(command);\n`,
      ),
      feed,
    );
    expect(
      result.evidence.find(
        (fact) => fact.detectorRuleId === "source.ts.aws-bedrock.invoke-model@1",
      ),
    ).toMatchObject({
      platformResolution: "unknown",
      selectorKind: "polymorphic",
      policyEligible: false,
    });
  });

  test("ignores commented HCL deployment resources", () => {
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `# resource "azurerm_cognitive_deployment" "old" {\n#   model { format = "OpenAI" name = "gpt-old" }\n# }\n`,
      ),
      feed,
    );
    expect(result.evidence.some((fact) => fact.kind === "deployment-resource")).toBe(false);
  });

  test("non-model feed records never enter lexical detection", () => {
    const result = detectSnapshot(
      snapshot("README.md", "Agent Builder and gpt-old"),
      feed,
    );
    expect(result.evidence.map((fact) => fact.modelId)).toEqual(["gpt-old"]);
    expect(result.evidence[0]?.scope).toBe("documentation");
  });
});

function ruleEvidence(path: string, source: string, ruleId: string) {
  return detectSnapshot(snapshot(path, source), feed).evidence.find(
    (fact) => fact.detectorRuleId === ruleId,
  );
}

describe("v3 semantic support matrix golden cases", () => {
  test("recognizes representative official OpenAI JavaScript and Python methods", () => {
    const javascript = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const client = new OpenAI();
client.chat.completions.stream({ model: "gpt-old", messages: [] });
`,
      "source.ts.openai.request-model@1",
    );
    expect(javascript).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "openai",
      modelResolution: "resolved",
      selectorKind: "model-id",
      platformResolution: "resolved",
      policyEligible: true,
    });

    const python = ruleEvidence(
      "src/chat.py",
      `from openai import AsyncOpenAI
MODEL = "gpt-old"
client = AsyncOpenAI()
client.embeddings.create(model=MODEL, input="hello")
`,
      "source.py.openai.request-model@1",
    );
    expect(python).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "openai",
      modelResolution: "resolved",
      selectorKind: "model-id",
      platformResolution: "resolved",
      policyEligible: true,
    });
    expect(python?.resolutionTrace).toContainEqual({
      kind: "constant",
      detail: "same-file constant MODEL",
    });
  });

  test("recognizes direct Anthropic JavaScript and Python clients and guards custom endpoints", () => {
    const javascript = ruleEvidence(
      "src/claude.ts",
      `import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
client.messages.countTokens({ model: "gpt-old", messages: [] });
`,
      "source.ts.anthropic.messages-model@1",
    );
    expect(javascript).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "anthropic",
      platformResolution: "resolved",
      policyEligible: true,
    });

    const python = ruleEvidence(
      "src/claude.py",
      `from anthropic import AsyncAnthropic
client = AsyncAnthropic()
client.messages.count_tokens(model="gpt-old", messages=[])
`,
      "source.py.anthropic.messages-model@1",
    );
    expect(python).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "anthropic",
      platformResolution: "resolved",
      policyEligible: true,
    });

    const customEndpoint = ruleEvidence(
      "src/claude.py",
      `from anthropic import Anthropic
client = Anthropic(base_url="https://gateway.example")
client.messages.create(model="gpt-old", messages=[])
`,
      "source.py.anthropic.messages-model@1",
    );
    expect(customEndpoint).toMatchObject({
      modelId: "gpt-old",
      platformResolution: "unknown",
      policyEligible: false,
    });
    expect(customEndpoint?.servingPlatform).toBeUndefined();
  });

  test("distinguishes explicit Google AI Studio and Vertex modes in JavaScript and Python", () => {
    const cases = [
      {
        path: "src/google.ts",
        source: `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: key });
ai.models.generateContent({ model: "gpt-old", contents: "hello" });
`,
        ruleId: "source.ts.google-genai.generate-model@1",
        servingPlatform: "google",
      },
      {
        path: "src/vertex.ts",
        source: `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ vertexai: true, project: "project", location: "us-central1" });
ai.models.generateContentStream({ model: "gpt-old", contents: "hello" });
`,
        ruleId: "source.ts.google-genai.generate-model@1",
        servingPlatform: "google-vertex",
      },
      {
        path: "src/google.py",
        source: `from google import genai
ai = genai.Client(api_key=key)
ai.models.generate_content(model="gpt-old", contents="hello")
`,
        ruleId: "source.py.google-genai.generate-model@1",
        servingPlatform: "google",
      },
      {
        path: "src/vertex.py",
        source: `from google import genai
ai = genai.Client(vertexai=True, project="project", location="us-central1")
ai.models.generate_content_stream(model="gpt-old", contents="hello")
`,
        ruleId: "source.py.google-genai.generate-model@1",
        servingPlatform: "google-vertex",
      },
    ] as const;

    for (const testCase of cases) {
      expect(ruleEvidence(testCase.path, testCase.source, testCase.ruleId)).toMatchObject({
        modelId: "gpt-old",
        servingPlatform: testCase.servingPlatform,
        platformResolution: "resolved",
        policyEligible: true,
      });
    }
  });

  test("keeps unspecified Google mode ambiguous and unsafe Google endpoints unresolved", () => {
    const ambiguous = ruleEvidence(
      "src/google.ts",
      `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
ai.models.generateContent({ model: "gpt-old", contents: "hello" });
`,
      "source.ts.google-genai.generate-model@1",
    );
    expect(ambiguous).toMatchObject({
      modelId: "gpt-old",
      platformResolution: "ambiguous",
      policyEligible: false,
    });
    expect(ambiguous?.servingPlatform).toBeUndefined();

    const unsafe = ruleEvidence(
      "src/google.py",
      `from google import genai
ai = genai.Client(api_key="key", http_options={"base_url": "https://generativelanguage.googleapis.com.attacker.example"})
ai.models.generate_content(model="gpt-old", contents="hello")
`,
      "source.py.google-genai.generate-model@1",
    );
    expect(unsafe).toMatchObject({
      modelId: "gpt-old",
      platformResolution: "unknown",
      policyEligible: false,
    });
    expect(unsafe?.servingPlatform).toBeUndefined();
  });

  test("rejects unsafe nested Google request endpoints", () => {
    const fact = ruleEvidence(
      "src/google.ts",
      `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: key });
ai.models.generateContent({
  model: "gpt-old",
  contents: "hello",
  config: { httpOptions: { baseUrl: "https://gateway.example" } },
});
`,
      "source.ts.google-genai.generate-model@1",
    );
    expect(fact).toMatchObject({
      modelId: "gpt-old",
      platformResolution: "unknown",
      policyEligible: false,
    });
    expect(fact?.servingPlatform).toBeUndefined();
  });
});

describe("v3 consumed environment bindings", () => {
  test("links an exact dotenv value only when a supported SDK selector consumes its name", () => {
    const result = detectSnapshot(
      repositorySnapshot({
        "src/chat.ts": `import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: process.env.OPENAI_MODEL, input: "hello" });
`,
        ".env": `# COMMENTED_MODEL=gpt-old
OPENAI_MODEL="gpt-old"
UNUSED_MODEL=gpt-old
SECRET_VALUE=super-secret-runtime-value
`,
      }),
      feed,
    );
    const bindings = result.evidence.filter((fact) => fact.kind === "env-binding");
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      detectorRuleId: "binding.env.consumed-model@1",
      confidence: "high",
      modelId: "gpt-old",
      servingPlatform: "openai",
      modelResolution: "resolved",
      platformResolution: "resolved",
      selectorKind: "model-id",
      policyEligible: false,
      locations: [
        { path: ".env", line: 2 },
        { path: "src/chat.ts", line: 3 },
      ],
    });
    expect(JSON.stringify(result.evidence)).not.toContain("super-secret-runtime-value");
    expect(
      bindings.some((fact) => fact.resolutionTrace.some((trace) => trace.detail.includes("UNUSED_MODEL"))),
    ).toBe(false);
  });

  test("links static GitHub workflow env mappings and ignores comments and expressions", () => {
    const result = detectSnapshot(
      repositorySnapshot({
        "src/chat.py": `import os
from openai import OpenAI
client = OpenAI()
client.responses.create(model=os.environ["OPENAI_MODEL"], input="hello")
`,
        ".github/workflows/ci.yml": `env:
  # COMMENTED_MODEL: gpt-old
  OPENAI_MODEL: gpt-old
  UNUSED_MODEL: gpt-old
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
        env:
          OPENAI_MODEL: \${{ matrix.model }}
`,
      }),
      feed,
    );
    const bindings = result.evidence.filter(
      (fact) => fact.detectorRuleId === "binding.github-actions.consumed-model@1",
    );
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      kind: "env-binding",
      modelId: "gpt-old",
      servingPlatform: "openai",
      confidence: "high",
      policyEligible: false,
    });
    expect(bindings[0]?.locations[0]).toMatchObject({
      path: ".github/workflows/ci.yml",
      line: 3,
    });
  });

  test("keeps a cross-platform ambiguous binding visible but platform-unknown", () => {
    const ambiguousFeed = buildV3FeedIndex({
      schemaVersion: 3,
      adapter: { id: "fixture", version: "1", sourceSha256: "b".repeat(64) },
      generatedAt: "2026-08-01T00:00:00Z",
      records: [
        {
          recordId: "openai-old",
          servingPlatform: "openai",
          primarySourceUrl: "https://example.com/openai-old",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "gpt-old",
          literalScanEligible: true,
          lifecycleStatus: "shutdown-scheduled",
          shutdownDate: "2027-01-01",
          replacementModels: [],
        },
        {
          recordId: "google-old",
          servingPlatform: "google",
          primarySourceUrl: "https://example.com/google-old",
          supersedesRecordIds: [],
          recordKind: "model",
          modelId: "gpt-old",
          literalScanEligible: true,
          lifecycleStatus: "shutdown-scheduled",
          shutdownDate: "2027-01-01",
          replacementModels: [],
        },
      ],
    });
    const result = detectSnapshot(
      repositorySnapshot({
        "src/google.ts": `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});
ai.models.generateContent({ model: process.env.MODEL, contents: "hello" });
`,
        ".env": "MODEL=gpt-old\n",
      }),
      ambiguousFeed,
    );
    const binding = result.evidence.find((fact) => fact.kind === "env-binding");
    expect(binding).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      platformResolution: "unknown",
      policyEligible: false,
    });
    expect(binding?.servingPlatform).toBeUndefined();
  });

  test("does not emit binding evidence for unconsumed or cross-provider assignments", () => {
    const result = detectSnapshot(
      repositorySnapshot({
        "src/chat.ts": `import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
client.messages.create({ model: process.env.ANTHROPIC_MODEL, messages: [] });
`,
        ".env": "UNUSED_MODEL=gpt-old\nANTHROPIC_MODEL=gpt-old\n",
      }),
      feed,
    );
    expect(result.evidence.some((fact) => fact.kind === "env-binding")).toBe(false);
  });
});

describe("v3 conservative expression safety", () => {
  test("does not count delimiter-looking string contents as source structure", () => {
    const fact = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";
const marker = "{";
const MODEL = "gpt-old";
const client = new OpenAI();
client.responses.create({ model: MODEL });
`,
      ),
      feed,
    ).evidence.find((candidate) => candidate.kind === "sdk-argument");
    expect(fact).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      policyEligible: true,
    });
  });

  test("does not trust computed endpoint or Google mode option prefixes", () => {
    const openai = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";
const client = new OpenAI({ baseURL: "https://api.openai.com" + ".attacker.example" });
client.responses.create({ model: "gpt-old" });
`,
      ),
      feed,
    ).evidence.find((fact) => fact.kind === "sdk-argument");
    expect(openai).toMatchObject({ platformResolution: "unknown", policyEligible: false });

    const python = detectSnapshot(
      snapshot(
        "src/chat.py",
        `from openai import OpenAI
client = OpenAI(base_url="https://api.openai.com" + ".attacker.example")
client.responses.create(model="gpt-old")
`,
      ),
      feed,
    ).evidence.find((fact) => fact.kind === "sdk-argument");
    expect(python).toMatchObject({ platformResolution: "unknown", policyEligible: false });

    const google = detectSnapshot(
      snapshot(
        "src/google.ts",
        `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ vertexai: false || true });
ai.models.generateContent({ model: "gpt-old" });
`,
      ),
      feed,
    ).evidence.find((fact) => fact.kind === "sdk-argument");
    expect(google).toMatchObject({ platformResolution: "ambiguous", policyEligible: false });
  });

  test("does not resolve composite Python selectors or shadowed constants", () => {
    const composite = detectSnapshot(
      snapshot(
        "src/chat.py",
        `from openai import OpenAI
client = OpenAI()
client.responses.create(model="gpt-" + "old")
`,
      ),
      feed,
    ).evidence.find((fact) => fact.kind === "sdk-argument");
    expect(composite).toMatchObject({
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      policyEligible: false,
    });
    expect(composite?.modelId).toBeUndefined();

    const shadowed = detectSnapshot(
      snapshot(
        "src/chat.ts",
        `import OpenAI from "openai";
const MODEL = "gpt-old";
const client = new OpenAI();
function run(MODEL) {
  client.responses.create({ model: MODEL });
}
`,
      ),
      feed,
    ).evidence.find((fact) => fact.kind === "sdk-argument");
    expect(shadowed).toMatchObject({
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      policyEligible: false,
    });
    expect(shadowed?.modelId).toBeUndefined();
  });
});

describe("v3 semantic support matrix golden cases continued", () => {

  test("keeps Google resource, tuned, and partner selectors unresolved", () => {
    const selectors = [
      "projects/project/locations/us-central1/publishers/google/models/gemini-2.5-pro",
      "tunedModels/customer-tuned-model",
      "publishers/anthropic/models/claude-sonnet-4",
    ];
    for (const selector of selectors) {
      const fact = ruleEvidence(
        "src/google.ts",
        `import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: key });
ai.models.generateContent({ model: "${selector}", contents: "hello" });
`,
        "source.ts.google-genai.generate-model@1",
      );
      expect(fact).toMatchObject({
        rawValue: selector,
        modelResolution: "unresolved",
        policyEligible: false,
      });
      expect(fact?.modelId).toBeUndefined();
    }
  });

  test("recognizes AWS JavaScript commands and Python boto3 runtime methods", () => {
    const javascript = ruleEvidence(
      "src/bedrock.ts",
      `import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const command = new ConverseStreamCommand({ modelId: "gpt-old", messages: [] });
client.send(command);
`,
      "source.ts.aws-bedrock.converse-model@1",
    );
    expect(javascript).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "aws-bedrock",
      modelResolution: "resolved",
      selectorKind: "polymorphic",
      platformResolution: "resolved",
      policyEligible: false,
    });

    const python = ruleEvidence(
      "src/bedrock.py",
      `import boto3
client = boto3.client("bedrock-runtime", region_name="us-east-1")
client.invoke_model_with_response_stream(modelId="gpt-old", body=b"{}")
`,
      "source.py.aws-bedrock.invoke-model@1",
    );
    expect(python).toMatchObject({
      modelId: "gpt-old",
      servingPlatform: "aws-bedrock",
      modelResolution: "resolved",
      selectorKind: "polymorphic",
      platformResolution: "resolved",
      policyEligible: false,
    });
  });

  test("keeps a static Azure Terraform deployment as an unresolved tuple", () => {
    const fact = ruleEvidence(
      "deploy/main.tf",
      `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format  = "OpenAI"
    name    = "gpt-old"
    version = "0613"
  }
}
`,
      "deploy.hcl.azure.cognitive-deployment-model@1",
    );
    expect(fact).toMatchObject({
      kind: "deployment-resource",
      scope: "deployment",
      servingPlatform: "azure",
      rawValue: `["OpenAI","gpt-old","0613"]`,
      modelResolution: "unresolved",
      selectorKind: "deployment-name",
      platformResolution: "resolved",
      policyEligible: false,
    });
    expect(fact?.modelId).toBeUndefined();
  });

  test("resolves same-file constants and static environment fallbacks without making fallbacks enforceable", () => {
    const javascriptConstant = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const MODEL = "gpt-old";
const client = new OpenAI();
client.responses.create({ model: MODEL, input: "hello" });
`,
      "source.ts.openai.request-model@1",
    );
    expect(javascriptConstant).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      selectorKind: "model-id",
      policyEligible: true,
    });

    const javascriptFallback = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: process.env.OPENAI_MODEL ?? "gpt-old", input: "hello" });
`,
      "source.ts.openai.request-model@1",
    );
    expect(javascriptFallback).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      selectorKind: "dynamic",
      policyEligible: false,
    });
    expect(javascriptFallback?.resolutionTrace).toContainEqual({
      kind: "environment-fallback",
      detail: "static fallback for a runtime environment selector",
    });

    const pythonFallback = ruleEvidence(
      "src/chat.py",
      `import os
from openai import OpenAI
client = OpenAI()
client.responses.create(model=os.getenv("OPENAI_MODEL", "gpt-old"), input="hello")
`,
      "source.py.openai.request-model@1",
    );
    expect(pythonFallback).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      selectorKind: "dynamic",
      policyEligible: false,
    });
  });

  test("never truncates a concatenated selector into an enforceable model ID", () => {
    const fact = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: "gpt-" + "old", input: "hello" });
`,
      "source.ts.openai.request-model@1",
    );
    expect(fact?.modelId).not.toBe("gpt-");
    if (fact?.modelResolution === "resolved") {
      expect(fact).toMatchObject({
        modelId: "gpt-old",
        selectorKind: "model-id",
        policyEligible: true,
      });
    } else {
      expect(fact).toMatchObject({
        modelResolution: "dynamic",
        selectorKind: "dynamic",
        policyEligible: false,
      });
      expect(fact?.modelId).toBeUndefined();
    }
  });

  test("keeps documentation, tests, and examples in protected scopes", () => {
    const cases = [
      { path: "DOCS/client.ts", scope: "documentation", environment: "unknown" },
      { path: "Tests/client.ts", scope: "test", environment: "test" },
      { path: "Examples/client.ts", scope: "example", environment: "unknown" },
    ] as const;
    const source = `import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: "gpt-old", input: "hello" });
`;
    for (const testCase of cases) {
      expect(
        ruleEvidence(testCase.path, source, "source.ts.openai.request-model@1"),
      ).toMatchObject({
        scope: testCase.scope,
        environment: testCase.environment,
        policyEligible: false,
      });
    }

    expect(ruleEvidence("production/client.ts", source, "source.ts.openai.request-model@1")).toMatchObject({
      scope: "application",
      environment: "unknown",
    });
    expect(ruleEvidence("dist/client.ts", source, "source.ts.openai.request-model@1")).toMatchObject({
      scope: "unknown",
      environment: "unknown",
    });
  });

  test("emits non-enforceable evidence for dynamic selectors and endpoints", () => {
    const dynamicSelector = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: selectedModel, input: "hello" });
`,
      "source.ts.openai.request-model@1",
    );
    expect(dynamicSelector).toMatchObject({
      rawValue: "selectedModel",
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      platformResolution: "resolved",
      policyEligible: false,
    });
    expect(dynamicSelector?.modelId).toBeUndefined();

    const dynamicEndpoint = ruleEvidence(
      "src/chat.ts",
      `import OpenAI from "openai";
const client = new OpenAI({ baseURL: process.env.LLM_GATEWAY });
client.responses.create({ model: "gpt-old", input: "hello" });
`,
      "source.ts.openai.request-model@1",
    );
    expect(dynamicEndpoint).toMatchObject({
      modelId: "gpt-old",
      platformResolution: "unknown",
      policyEligible: false,
    });
    expect(dynamicEndpoint?.servingPlatform).toBeUndefined();
  });

  test("comments and malformed syntax never become semantic evidence", () => {
    const cases = [
      {
        path: "src/chat.ts",
        source: `import OpenAI from "openai";
const client = new OpenAI();
// client.responses.create({ model: "gpt-old" });
client.responses.create({ model: "gpt-old"
`,
      },
      {
        path: "src/chat.py",
        source: `from openai import OpenAI
client = OpenAI()
# client.responses.create(model="gpt-old")
client.responses.create(model="gpt-old"
`,
      },
      {
        path: "deploy/main.tf",
        source: `# resource "azurerm_cognitive_deployment" "commented" {
#   model { format = "OpenAI" name = "gpt-old" }
# }
resource "azurerm_cognitive_deployment" "malformed" {
  model { format = "OpenAI" name = "gpt-old"
`,
      },
    ] as const;

    for (const testCase of cases) {
      const result = detectSnapshot(snapshot(testCase.path, testCase.source), feed);
      expect(
        result.evidence.filter((fact) => fact.kind === "sdk-argument" || fact.kind === "deployment-resource"),
      ).toEqual([]);
      expect(result.evidence.every((fact) => !fact.policyEligible)).toBe(true);
      expect(result.evidence.some((fact) => fact.kind === "lexical")).toBe(true);
      expect(result.scanStatus).toBe("partial");
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.code === "semantic-tokenization-incomplete@1",
        ),
      ).toBe(true);
    }
  });
});
