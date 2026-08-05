import { describe, expect, test } from "bun:test";
import { detectSnapshot } from "../../src/detection/detectors.ts";
import { buildV3FeedIndex } from "../../src/lifecycle/feed.ts";
import type { GitTreeSnapshot } from "../../src/repository/git.ts";

/** A registered non-OpenAI platform, for the single-platform provider packages. */
const groqFeed = buildV3FeedIndex({
  schemaVersion: 3,
  adapter: { id: "fixture", version: "1", sourceSha256: "a".repeat(64) },
  generatedAt: "2026-08-01T00:00:00Z",
  records: [
    {
      recordId: "groq-old",
      servingPlatform: "groq",
      primarySourceUrl: "https://example.com/groq",
      supersedesRecordIds: [],
      recordKind: "model",
      modelId: "groq-old",
      literalScanEligible: true,
      lifecycleStatus: "shutdown-scheduled",
      shutdownDate: "2027-01-01",
      replacementModels: [],
    },
  ],
});

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
      maxEntries: Math.max(100, entries.length),
      maxUniqueObjects: Math.max(100, entries.length),
      maxMetadataBytes: Math.max(10_000, bytes),
      maxBlobBytes: 10_000,
      maxTotalBlobBytes: Math.max(100_000, bytes),
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

  /**
   * Every chain `methodRule` accepts, in the syntax qualified against openai 7.4.0 (npm)
   * and 2.46.0 (PyPI). Most of these had no test at all, so a provider reshaping one of
   * them degraded detection to the lexical fallback — lower confidence, unable to block —
   * while coverage still reported `complete` and nothing failed. These lock the accepted
   * set so the next major bump is a test run rather than a manual read of the type surface.
   */
  describe("every accepted OpenAI model-selector chain", () => {
    const javascript: ReadonlyArray<readonly [chain: string, call: string]> = [
      ["responses.create", `client.responses.create({ model: "gpt-old", input: "hi" })`],
      ["responses.stream", `client.responses.stream({ model: "gpt-old", input: "hi" })`],
      [
        "chat.completions.create",
        `client.chat.completions.create({ model: "gpt-old", messages: [] })`,
      ],
      [
        "chat.completions.stream",
        `client.chat.completions.stream({ model: "gpt-old", messages: [] })`,
      ],
      ["embeddings.create", `client.embeddings.create({ model: "gpt-old", input: "hi" })`],
      ["images.generate", `client.images.generate({ model: "gpt-old", prompt: "hi" })`],
      ["images.edit", `client.images.edit({ model: "gpt-old", image: file, prompt: "hi" })`],
      ["audio.speech.create", `client.audio.speech.create({ model: "gpt-old", input: "hi", voice: "alloy" })`],
      [
        "audio.transcriptions.create",
        `client.audio.transcriptions.create({ model: "gpt-old", file })`,
      ],
      [
        "audio.translations.create",
        `client.audio.translations.create({ model: "gpt-old", file })`,
      ],
    ];

    for (const [chain, call] of javascript) {
      test(`resolves ${chain} in TypeScript`, () => {
        const result = detectSnapshot(
          snapshot(
            "src/chat.ts",
            `import OpenAI from "openai";\nconst client = new OpenAI({ apiKey: key });\nawait ${call};\n`,
          ),
          feed,
        );
        expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
          detectorRuleId: "source.ts.openai.request-model@1",
          modelId: "gpt-old",
          servingPlatform: "openai",
          confidence: "high",
          policyEligible: true,
        });
        // A resolved semantic fact must suppress the lexical span for the same literal.
        expect(result.evidence.filter((fact) => fact.modelId === "gpt-old")).toHaveLength(1);
      });
    }

    const python: ReadonlyArray<readonly [chain: string, call: string]> = [
      ["responses.create", `client.responses.create(model="gpt-old", input="hi")`],
      [
        "chat.completions.create",
        `client.chat.completions.create(model="gpt-old", messages=[])`,
      ],
      ["embeddings.create", `client.embeddings.create(model="gpt-old", input="hi")`],
      ["images.generate", `client.images.generate(model="gpt-old", prompt="hi")`],
      ["audio.speech.create", `client.audio.speech.create(model="gpt-old", input="hi", voice="alloy")`],
      [
        "audio.transcriptions.create",
        `client.audio.transcriptions.create(model="gpt-old", file=handle)`,
      ],
    ];

    for (const [chain, call] of python) {
      test(`resolves ${chain} in Python`, () => {
        const result = detectSnapshot(
          snapshot(
            "src/chat.py",
            `from openai import OpenAI\nclient = OpenAI()\n${call}\n`,
          ),
          feed,
        );
        expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
          detectorRuleId: "source.py.openai.request-model@1",
          modelId: "gpt-old",
          servingPlatform: "openai",
          confidence: "high",
        });
        expect(result.evidence.filter((fact) => fact.modelId === "gpt-old")).toHaveLength(1);
      });
    }

    test("distinguishes the Azure constructor's deployment name from an OpenAI model ID", () => {
      // AzureOpenAI still extends OpenAI and is still exported from "openai" in v7. Its
      // `model` argument names an Azure deployment rather than a model, so the selector
      // kind differs and the fact cannot block on its own.
      const azure = detectSnapshot(
        snapshot(
          "src/chat.ts",
          `import { AzureOpenAI } from "openai";\nconst client = new AzureOpenAI({ apiKey: key });\nawait client.chat.completions.create({ model: "gpt-old", messages: [] });\n`,
        ),
        feed,
      );
      expect(azure.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
        detectorRuleId: "source.ts.openai.request-model@1",
        servingPlatform: "azure",
        platformResolution: "resolved",
        selectorKind: "deployment-name",
        policyEligible: false,
      });

      const openai = detectSnapshot(
        snapshot(
          "src/chat.ts",
          `import { OpenAI } from "openai";\nconst client = new OpenAI({ apiKey: key });\nawait client.chat.completions.create({ model: "gpt-old", messages: [] });\n`,
        ),
        feed,
      );
      expect(openai.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
        servingPlatform: "openai",
        selectorKind: "model-id",
        policyEligible: true,
      });
    });
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

  test("reports an out-of-range unicode escape as a notice instead of throwing", () => {
    const result = detectSnapshot(
      snapshot("src/limits.ts", `const boundary = "\\u{110000}";\n`),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic-tokenization-incomplete@1",
      path: "src/limits.ts",
      severity: "notice",
    }));
  });

  test("keeps declared coverage complete for a construct the tokenizer cannot accept", () => {
    // Element syntax itself is lexed now, so the fidelity path is reached by a
    // documented gap instead: JSX inside a template-literal substitution.
    const source = `import { useChat } from "ai/react";

export default function Page() {
  const { messages } = useChat({ model: "gpt-old" });
  return html\`<ul class="messages">\${<li>{messages.length}</li>}</ul>\`;
}
`;
    const result = detectSnapshot(snapshot("app/page.tsx", source), feed);
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "semantic-tokenization-incomplete@1",
        path: "app/page.tsx",
        severity: "notice",
      }),
    ]);
    // The blob is still assessed: the lexical fallback reports the model at
    // advisory-only authority, which is the whole reason coverage stays complete.
    expect(
      result.evidence.some((fact) => fact.kind === "lexical" && fact.modelId === "gpt-old"),
    ).toBe(true);
    expect(result.evidence.every((fact) => !fact.policyEligible)).toBe(true);
  });

  test("keeps an unassessed blob partial even when other blobs only degrade fidelity", () => {
    const result = detectSnapshot(
      {
        ...repositorySnapshot({
          "app/page.tsx": "export const view = html`${<div>gpt-old</div>}`;\n",
        }),
        scanStatus: "partial",
        diagnostics: [
          {
            code: "blob-too-large",
            coverageImpact: "partial",
            displayPath: "assets/model-dump.bin",
            objectId: "c".repeat(40),
            objectSize: 3_000_000,
            limitBytes: 2_097_152,
          },
        ],
      },
      feed,
    );
    expect(result.scanStatus).toBe("partial");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "blob-too-large",
      path: "assets/model-dump.bin",
      severity: "partial",
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic-tokenization-incomplete@1",
      path: "app/page.tsx",
      severity: "notice",
    }));
  });

  test("keeps a non-UTF-8 blob partial because no detector assessed it", () => {
    const path = "src/client.ts";
    const base = repositorySnapshot({ [path]: "" });
    const bytes = Buffer.from([0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0xff, 0xfe, 0x0a]);
    const entry = { ...(base.entries[0] as (typeof base.entries)[number]) };
    entry.objectSize = bytes.byteLength;
    entry.content = { state: "available", bytes };
    const result = detectSnapshot({ ...base, entries: [entry] }, feed);
    expect(result.scanStatus).toBe("partial");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "invalid-detector-encoding",
      path,
      severity: "partial",
    }));
  });

  test("reports incomplete token constructs as fidelity notices and keeps only lexical fallback evidence", () => {
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
      expect(result.scanStatus, testCase.path).toBe("complete");
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "semantic-tokenization-incomplete@1" &&
            diagnostic.path === testCase.path &&
            diagnostic.severity === "notice",
        ),
        testCase.path,
      ).toBe(true);
      expect(
        result.evidence.every((fact) => fact.kind === "lexical" && !fact.policyEligible),
        testCase.path,
      ).toBe(true);
    }
  });

  test("resolves semantic evidence from a JSX component instead of lexical fallback", () => {
    const result = detectSnapshot(
      snapshot(
        "app/components/chat.tsx",
        `import OpenAI from "openai";
import { useState } from "react";
const client = new OpenAI();
export function Chat() {
  const [reply, setReply] = useState("");
  async function send() {
    const result = await client.responses.create({ model: "gpt-old", input: "hi" });
    setReply(result.output_text);
  }
  return (
    <div className="chat">
      <button onClick={send}>Send</button>
      <p>It's ready — see https://example.com/docs</p>
    </div>
  );
}
`,
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.find((fact) => fact.kind === "sdk-argument")).toMatchObject({
      detectorRuleId: "source.ts.openai.request-model@1",
      modelId: "gpt-old",
      servingPlatform: "openai",
      confidence: "high",
      policyEligible: true,
    });
  });

  test("keeps JSX syntax forms synchronized without discarding semantic evidence", () => {
    const cases = [
      {
        name: "closing tags and text punctuation",
        path: "app/text.tsx",
        body: `return <div className="a">It's 50/50 — 3 < 4 and "quoted"</div>;`,
      },
      {
        name: "fragments",
        path: "app/fragment.jsx",
        body: `return (<><span>a</span><React.Fragment key="k">b</React.Fragment></>);`,
      },
      {
        name: "expression containers and nested elements",
        path: "app/list.tsx",
        body:
          `return (<ul>{["a"].map((item, index) => (<li key={item} data-index={index}>` +
          `{item.replace(/-/g, " ")} · {index / 2} · {index < 3 ? <b>lo</b> : <i>hi</i>}</li>))}</ul>);`,
      },
      {
        name: "spread, boolean, dashed, and namespaced attributes",
        path: "app/input.tsx",
        body: `return <input {...props} disabled data-testid="x" xlink:href="#a" />;`,
      },
      {
        name: "jsx comments",
        path: "app/comment.tsx",
        body: `return (<div>{/* it's a "note" with a / and </div> inside */}<b /* inline */ id="a">ok</b></div>);`,
      },
      {
        name: "multi-line attribute text",
        path: "app/svg.tsx",
        body: `return (<feColorMatrix type="matrix" values="0 0 0 0 0\n  0 0 0 1 0" />);`,
      },
      {
        name: "type-argument list on an element",
        path: "app/generic.tsx",
        body: `return (<Tooltip<Datum> render={(datum) => <b>{datum.id}</b>} />);`,
      },
      {
        name: "member and deeply nested elements",
        path: "app/nested.tsx",
        body: `return (<Form.Group><a><b><c>{[1].map((n) => <d key={n}>{n}</d>)}</c></b></a></Form.Group>);`,
      },
      {
        name: "template literal and regex inside a container",
        path: "app/template.tsx",
        body: 'return (<div aria-label={`row ${count}`}>{/x/.test(name) ? name : "-"}</div>);',
      },
      // An unbalanced brace inside an attribute expression must not end the
      // opening-tag lookahead early: the tag would go unrecognized and the
      // paired `</…>` would then reopen regex-literal disambiguation, which
      // discards every semantic fact in the file.
      {
        name: "unbalanced brace in an attribute expression string",
        path: "app/sample.tsx",
        body: `return (<CodeBlock code={"if (ready) {"}>{name}</CodeBlock>);`,
      },
      {
        name: "unbalanced brace in an attribute expression regex",
        path: "app/pattern.tsx",
        body: `return (<Input test={/^\\{/.source}>{name}</Input>);`,
      },
      {
        name: "unbalanced brace in an attribute expression comment",
        path: "app/handler.tsx",
        body: `return (<Button onClick={() => { /* } */ reset(); }}>{name}</Button>);`,
      },
      {
        name: "unbalanced brace in an attribute expression template literal",
        path: "app/css.tsx",
        body: 'return (<Styled css={`&:hover { color: red;`}>{name}</Styled>);',
      },
    ] as const;

    for (const testCase of cases) {
      const source = `import OpenAI from "openai";
const client = new OpenAI();
export function Component({ props, count, name }) {
  client.responses.create({ model: "gpt-old" });
  ${testCase.body}
}
`;
      const result = detectSnapshot(snapshot(testCase.path, source), feed);
      expect(result.diagnostics, testCase.name).toEqual([]);
      expect(result.scanStatus, testCase.name).toBe("complete");
      expect(
        result.evidence.some((fact) => fact.kind === "sdk-argument" && fact.modelId === "gpt-old"),
        testCase.name,
      ).toBe(true);
    }
  });

  test("keeps `<` an operator where JSX is impossible or ambiguous", () => {
    const cases = [
      {
        name: "generic arrow functions in a .tsx file",
        path: "app/generics.tsx",
        source: `import OpenAI from "openai";
const client = new OpenAI();
const identity = <T,>(value: T): T => value;
const widen = <T extends object>(value: T): T => value;
const sizes = new Map<string, number>();
export function Component({ count }) {
  client.responses.create({ model: "gpt-old" });
  sizes.set(identity("a"), widen({ n: 1 }).n);
  for (let index = 0; index < count; index += 1) void (index << 1);
  return count < 3;
}
`,
      },
      {
        name: "a type assertion in a .ts file where JSX is illegal",
        path: "src/assertion.ts",
        source: `import OpenAI from "openai";
const client = new OpenAI();
const field = <HTMLInputElement>document.getElementById("a");
client.responses.create({ model: "gpt-old" });
export const value = field.value;
`,
      },
    ] as const;

    for (const testCase of cases) {
      const result = detectSnapshot(snapshot(testCase.path, testCase.source), feed);
      expect(result.diagnostics, testCase.name).toEqual([]);
      expect(result.scanStatus, testCase.name).toBe("complete");
      expect(
        result.evidence.some((fact) => fact.kind === "sdk-argument"),
        testCase.name,
      ).toBe(true);
    }
  });

  test("divides after a non-null assertion and skips a shebang line", () => {
    const cases = [
      {
        name: "non-null assertion before a division",
        path: "src/ratio.ts",
        source: `import OpenAI from "openai";
const client = new OpenAI();
const scaled = filters[0]! / 100;
export const ready = !/pending/.test(String(scaled));
client.responses.create({ model: "gpt-old" });
`,
      },
      {
        name: "shebang line",
        path: "scripts/run.js",
        source: `#!/usr/bin/env node
import OpenAI from "openai";
const client = new OpenAI();
client.responses.create({ model: "gpt-old" });
`,
      },
    ] as const;

    for (const testCase of cases) {
      const result = detectSnapshot(snapshot(testCase.path, testCase.source), feed);
      expect(result.diagnostics, testCase.name).toEqual([]);
      expect(result.scanStatus, testCase.name).toBe("complete");
      expect(
        result.evidence.some((fact) => fact.kind === "sdk-argument"),
        testCase.name,
      ).toBe(true);
    }
  });

  test("scans a thousand-component React application with complete coverage", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 1_000; index += 1) {
      const extension = index % 5 === 0 ? "jsx" : "tsx";
      files[`apps/web/components/Component${index}.${extension}`] = `import OpenAI from "openai";
const client = new OpenAI();
export function Component${index}({ items, open }) {
  client.responses.create({ model: "gpt-old" });
  return (
    <section className="card" data-index="${index}">
      {/* component ${index} */}
      <h2>Item's list — ${index}/1000</h2>
      {open && <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
      <>{open ? <b>open</b> : <i>closed</i>}</>
    </section>
  );
}
`;
    }
    const result = detectSnapshot(repositorySnapshot(files), feed);
    expect(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "semantic-tokenization-incomplete@1",
      ),
    ).toEqual([]);
    expect(result.scanStatus).toBe("complete");
    expect(result.evidence.filter((fact) => fact.kind === "sdk-argument")).toHaveLength(1_000);
  });

  test("aggregates a repeated diagnostic code into one counted entry", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 12; index += 1) {
      files[`src/broken${index}.ts`] = `const invalid = /unterminated\nconst model = "gpt-old";\n`;
    }
    const result = detectSnapshot(repositorySnapshot(files), feed);
    const aggregated = result.diagnostics.filter(
      (diagnostic) => diagnostic.code === "semantic-tokenization-incomplete@1",
    );
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.severity).toBe("notice");
    expect(aggregated[0]?.path).toBeUndefined();
    expect(aggregated[0]?.message).toContain("12 files reported this diagnostic");
    expect(aggregated[0]?.message).toContain("Sampled paths (10 of 12)");
    expect(aggregated[0]?.message).toContain("src/broken0.ts");
    expect(aggregated[0]?.message).not.toContain("src/broken11.ts");
    // Every blob stayed assessed by lexical fallback, so aggregation reports
    // degraded fidelity without pinning declared coverage to partial.
    expect(result.scanStatus).toBe("complete");
  });

  test("keeps a single diagnostic addressable by path", () => {
    const result = detectSnapshot(
      snapshot("src/regex.ts", `const invalid = /unterminated\nconst model = "gpt-old";\n`),
      feed,
    );
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "semantic-tokenization-incomplete@1",
      path: "src/regex.ts",
      severity: "notice",
    });
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

describe("v3 Vercel AI SDK provider rules", () => {
  const providerFact = (source: string, path = "src/model.ts") =>
    detectSnapshot(snapshot(path, source), feed).evidence.find((fact) =>
      fact.detectorRuleId.startsWith("source.ts.vercel-ai-sdk."),
    );

  test("resolves each provider package to its pinned serving platform", () => {
    const cases = [
      {
        source: `import { openai } from "@ai-sdk/openai";\nawait openai("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.openai-model@1",
        servingPlatform: "openai",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        source: `import { anthropic } from "@ai-sdk/anthropic";\nawait anthropic("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.anthropic-model@1",
        servingPlatform: "anthropic",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        source: `import { google } from "@ai-sdk/google";\nawait google("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.google-model@1",
        servingPlatform: "google",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        // The package's own `googleVertex as vertex` alias.
        source: `import { vertex } from "@ai-sdk/google-vertex";\nawait vertex("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.google-vertex-model@1",
        servingPlatform: "google-vertex",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        // Azure names a deployment, so it can never be policy eligible without
        // a trusted resolution, exactly as in the official Azure rules.
        source: `import { azure } from "@ai-sdk/azure";\nawait azure("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.azure-model@1",
        servingPlatform: "azure",
        selectorKind: "deployment-name",
        policyEligible: false,
      },
      {
        source: `import { bedrock } from "@ai-sdk/amazon-bedrock";\nawait bedrock("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.amazon-bedrock-model@1",
        servingPlatform: "aws-bedrock",
        selectorKind: "polymorphic",
        policyEligible: false,
      },
      {
        source: `import { cohere } from "@ai-sdk/cohere";\nawait cohere("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.cohere-model@1",
        servingPlatform: "cohere",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        source: `import { groq } from "@ai-sdk/groq";\nawait groq("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.groq-model@1",
        servingPlatform: "groq",
        selectorKind: "model-id",
        policyEligible: true,
      },
      {
        source: `import { xai } from "@ai-sdk/xai";\nawait xai("gpt-old");\n`,
        ruleId: "source.ts.vercel-ai-sdk.xai-model@1",
        servingPlatform: "xai",
        selectorKind: "model-id",
        policyEligible: true,
      },
    ] as const;
    for (const testCase of cases) {
      expect(providerFact(testCase.source), testCase.ruleId).toMatchObject({
        detectorRuleId: testCase.ruleId,
        kind: "sdk-argument",
        confidence: "high",
        modelId: "gpt-old",
        servingPlatform: testCase.servingPlatform,
        modelResolution: "resolved",
        platformResolution: "resolved",
        selectorKind: testCase.selectorKind,
        scope: "application",
        policyEligible: testCase.policyEligible,
      });
    }
  });

  test("reads the published model-factory members and rejects the rest", () => {
    for (const member of ["chat", "responses", "completion", "languageModel", "textEmbeddingModel", "imageModel"]) {
      expect(
        providerFact(`import { openai } from "@ai-sdk/openai";\nawait openai.${member}("gpt-old");\n`),
        member,
      ).toMatchObject({ modelId: "gpt-old", policyEligible: true });
    }
    for (const member of ["tools", "files", "skills"]) {
      expect(
        providerFact(`import { openai } from "@ai-sdk/openai";\nawait openai.${member}("gpt-old");\n`),
        member,
      ).toBeUndefined();
    }
  });

  test("anchors on the provider call rather than the surrounding ai function", () => {
    // The provider call constructs the model specification, so it is evidence
    // wherever the result is used.
    const sources = [
      `import { openai } from "@ai-sdk/openai";\nimport { generateText } from "ai";\nawait generateText({ model: openai("gpt-old") });\n`,
      `import { openai } from "@ai-sdk/openai";\nexport const model = openai("gpt-old");\n`,
      `import { openai } from "@ai-sdk/openai";\nimport { wrapLanguageModel } from "ai";\nwrapLanguageModel({ model: openai("gpt-old"), middleware: [] });\n`,
    ];
    for (const source of sources) {
      expect(providerFact(source), source).toMatchObject({
        modelId: "gpt-old",
        policyEligible: true,
      });
    }
  });

  test("resolves a same-file constant and keeps a runtime selector visible", () => {
    expect(
      providerFact(`import { google } from "@ai-sdk/google";\nconst modelId = "gpt-old";\nexport const g = google(modelId);\n`),
    ).toMatchObject({
      modelId: "gpt-old",
      modelResolution: "resolved",
      selectorKind: "model-id",
      policyEligible: true,
    });
    expect(
      providerFact(`import { openai } from "@ai-sdk/openai";\nawait openai(process.env.MODEL_ID);\n`),
    ).toMatchObject({
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      policyEligible: false,
    });
  });

  test("links a committed dotenv value to an AI SDK runtime selector", () => {
    const evidence = detectSnapshot(
      repositorySnapshot({
        "src/chat.ts": `import { openai } from "@ai-sdk/openai";\nawait openai(process.env.MODEL_ID);\n`,
        ".env": "MODEL_ID=gpt-old\n",
      }),
      feed,
    ).evidence;
    const binding = evidence.find((fact) => fact.kind === "env-binding");
    expect(binding).toMatchObject({
      detectorRuleId: "binding.env.consumed-model@1",
      modelId: "gpt-old",
      servingPlatform: "openai",
    });
    expect(binding?.locations.map((location) => location.path)).toEqual([".env", "src/chat.ts"]);
  });

  test("keeps a single-platform integration on its own platform for env bindings", () => {
    // A single-platform provider names its own platform, so the dotenv join must
    // reach it rather than falling through to the Bedrock candidate set.
    const evidence = detectSnapshot(
      repositorySnapshot({
        "src/chat.ts": `import { groq } from "@ai-sdk/groq";\nawait groq(process.env.MODEL_ID);\n`,
        ".env": "MODEL_ID=groq-old\n",
      }),
      groqFeed,
    ).evidence;
    expect(evidence.find((fact) => fact.kind === "env-binding")).toMatchObject({
      detectorRuleId: "binding.env.consumed-model@1",
      modelId: "groq-old",
      servingPlatform: "groq",
    });
  });

  test("resolves a provider factory and leaves a custom gateway unresolved", () => {
    expect(
      providerFact(`import { createOpenAI } from "@ai-sdk/openai";\nconst p = createOpenAI({ apiKey: "k" });\nawait p("gpt-old");\n`),
    ).toMatchObject({ servingPlatform: "openai", platformResolution: "resolved", policyEligible: true });
    expect(
      providerFact(`import { createGoogleGenerativeAI } from "@ai-sdk/google";\nconst p = createGoogleGenerativeAI();\nawait p("gpt-old");\n`),
    ).toMatchObject({ servingPlatform: "google", platformResolution: "resolved" });
    // A factory invoked directly never binds a variable.
    expect(
      providerFact(`import { createOpenAI } from "@ai-sdk/openai";\nawait createOpenAI({ apiKey: "k" })("gpt-old");\n`),
    ).toMatchObject({ servingPlatform: "openai", platformResolution: "resolved", policyEligible: true });
    expect(
      providerFact(`import { createOpenAI } from "@ai-sdk/openai";\nawait createOpenAI({ baseURL: "https://gateway.example" })("gpt-old");\n`),
    ).toMatchObject({ platformResolution: "unknown", policyEligible: false });
    for (const source of [
      // A custom gateway cannot be attributed to the package's platform.
      `import { createOpenAI } from "@ai-sdk/openai";\nconst p = createOpenAI({ baseURL: "https://gateway.example" });\nawait p("gpt-old");\n`,
      // A recognized endpoint that disagrees with the package is ambiguous.
      `import { createOpenAI } from "@ai-sdk/openai";\nconst p = createOpenAI({ baseURL: "https://x.openai.azure.com" });\nawait p("gpt-old");\n`,
    ]) {
      const fact = providerFact(source);
      expect(fact?.policyEligible, source).toBe(false);
      expect(["unknown", "ambiguous"], source).toContain(fact?.platformResolution ?? "");
    }
  });

  test("does not trust a shadowed, reassigned, or type-only provider import", () => {
    const sources = [
      `import { openai } from "@ai-sdk/openai";\nfunction build(openai) {\n  return openai("gpt-old");\n}\n`,
      `import { openai } from "@ai-sdk/openai";\nopenai = other;\nawait openai("gpt-old");\n`,
      `import type { openai } from "@ai-sdk/openai";\nawait openai("gpt-old");\n`,
      // A provider name that was never imported from an @ai-sdk package.
      `const openai = (id) => id;\nawait openai("gpt-old");\n`,
    ];
    for (const source of sources) {
      expect(providerFact(source), source).toBeUndefined();
    }
  });

  test("treats a Google resource path as a resource name rather than a model ID", () => {
    expect(
      providerFact(`import { google } from "@ai-sdk/google";\nawait google("projects/p/locations/l/models/gpt-old");\n`),
    ).toMatchObject({ modelResolution: "unresolved", selectorKind: "resource-name" });
  });

  test("resolves a provider call in a JSX file", () => {
    // The AI SDK's centre of gravity is React and Next.js, so a provider call
    // beside JSX is the common case rather than an edge one.
    const cases = [
      { path: "app/a.tsx", body: `export const C = () => <div className="x">hi</div>;\n` },
      { path: "app/b.tsx", body: `export const C = () => <p>It's ready</p>;\n` },
      { path: "app/c.jsx", body: `export const C = (p) => <Foo {...p} bar="1" />;\n` },
      {
        path: "app/d.tsx",
        body: `export const C = ({ xs }) => <ul>{xs.map((x) => <li key={x}>{x / 2}</li>)}</ul>;\n`,
      },
    ] as const;
    for (const testCase of cases) {
      const result = detectSnapshot(
        snapshot(
          testCase.path,
          `import { openai } from "@ai-sdk/openai";\nconst m = openai("gpt-old");\n${testCase.body}`,
        ),
        feed,
      );
      expect(result.evidence.map((fact) => fact.detectorRuleId), testCase.path).toEqual([
        "source.ts.vercel-ai-sdk.openai-model@1",
      ]);
      expect(result.diagnostics, testCase.path).toEqual([]);
    }
  });

  test("resolves the Next.js server-action shape", () => {
    const result = detectSnapshot(
      snapshot(
        "app/page.tsx",
        `import { openai } from "@ai-sdk/openai";\nimport { generateText } from "ai";\nasync function act() {\n  return generateText({ model: openai("gpt-old"), prompt: "p" });\n}\nexport default function Page() {\n  return <main><button onClick={act}>go</button></main>;\n}\n`,
      ),
      feed,
    );
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      detectorRuleId: "source.ts.vercel-ai-sdk.openai-model@1",
      modelId: "gpt-old",
      servingPlatform: "openai",
      policyEligible: true,
    });
  });

  test("suppresses the duplicate lexical fact for a resolved provider literal", () => {
    const evidence = detectSnapshot(
      snapshot("src/model.ts", `import { openai } from "@ai-sdk/openai";\nawait openai("gpt-old");\n`),
      feed,
    ).evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.kind).toBe("sdk-argument");
  });

  test("leaves an endpoint it cannot read platform-unresolved", () => {
    // A shorthand or computed options object names an endpoint whose value is
    // invisible here, so attributing it to the package's platform would date the
    // call against a schedule the traffic may never reach.
    for (const source of [
      `import { createOpenAI } from "@ai-sdk/openai";\nconst baseURL = process.env.G;\nconst p = createOpenAI({ baseURL });\nexport const m = p("gpt-old");\n`,
      `import { createOpenAI } from "@ai-sdk/openai";\nexport const m = createOpenAI({ baseURL })("gpt-old");\n`,
    ]) {
      expect(providerFact(source), source).toMatchObject({
        platformResolution: "unknown",
        policyEligible: false,
      });
    }
  });

  test("keeps the binding through a property named after a provider", () => {
    // `openai` is an ordinary object key and React prop, so neither spelling is
    // a reassignment that should discard the import.
    const cases = [
      {
        path: "src/model.ts",
        source:
          `import { openai } from "@ai-sdk/openai";\nconst flags = { a: 1 };\nflags.openai = true;\nexport const model = openai("gpt-old");\n`,
      },
      {
        path: "app/page.tsx",
        source:
          `import { openai } from "@ai-sdk/openai";\nexport const model = openai("gpt-old");\nexport const C = () => <Row openai="x" />;\n`,
      },
    ] as const;
    for (const testCase of cases) {
      expect(providerFact(testCase.source, testCase.path), testCase.path).toMatchObject({
        servingPlatform: "openai",
        policyEligible: true,
      });
    }
    // A real reassignment is still distrusted.
    expect(
      providerFact(`import { openai } from "@ai-sdk/openai";\nopenai = other;\nawait openai("gpt-old");\n`),
    ).toBeUndefined();
  });

  test("reads a provider call beside JSX props that share its names", () => {
    // A JSX attribute is markup, so it neither reassigns a binding nor rebinds a
    // constant. Two props of the same name used to look like a reassignment.
    expect(
      providerFact(
        `import { openai } from "@ai-sdk/openai";\nexport const m = openai("gpt-old");\nexport const A = () => <Row openai="x" />;\nexport const B = () => <Col openai="y" />;\n`,
        "app/a.tsx",
      ),
    ).toMatchObject({ servingPlatform: "openai", policyEligible: true });
    expect(
      providerFact(
        `import { openai } from "@ai-sdk/openai";\nconst modelId = "gpt-old";\nexport const m = openai(modelId);\nexport const C = () => <Row modelId="x" />;\n`,
        "app/b.tsx",
      ),
    ).toMatchObject({ modelId: "gpt-old", modelResolution: "resolved" });
    // collectConstants is shared, so the official rules see the same fix.
    expect(
      ruleEvidence(
        "app/c.tsx",
        `import OpenAI from "openai";\nconst modelId = "gpt-old";\nconst c = new OpenAI();\nc.responses.create({ model: modelId, input: "h" });\nexport const C = () => <Row modelId="x" />;\n`,
        "source.ts.openai.request-model@1",
      ),
    ).toMatchObject({ modelId: "gpt-old", modelResolution: "resolved" });
  });

  test("does not trust two provider packages bound to one local name", () => {
    // Resolving last-wins would date the call against the wrong platform.
    for (const source of [
      `let { openai: model } = require("@ai-sdk/openai");\nif (u) ({ vertex: model } = require("@ai-sdk/google-vertex"));\nmodule.exports = model("gpt-old");\n`,
      `import { openai as m } from "@ai-sdk/openai";\nimport { anthropic as m } from "@ai-sdk/anthropic";\nawait m("gpt-old");\n`,
    ]) {
      expect(providerFact(source), source).toBeUndefined();
    }
  });

  test("binds a factory to its variable, not a property or a type name", () => {
    // `this.client = createOpenAI(...)` must not register the bare name `client`,
    // or an unrelated call to a function of that name reads as a provider call.
    expect(
      providerFact(
        `import { createOpenAI } from "@ai-sdk/openai";\nclass S { constructor(k) { this.client = createOpenAI({ apiKey: k }); } }\nexport function client(id) { return id; }\nclient("gpt-old");\n`,
      ),
    ).toBeUndefined();
    // A property named after another provider must not re-bind that provider.
    expect(
      providerFact(
        `import { openai } from "@ai-sdk/openai";\nimport { createAnthropic } from "@ai-sdk/anthropic";\nregistry.openai = createAnthropic({});\nawait openai("gpt-old");\n`,
      ),
    ).toMatchObject({
      detectorRuleId: "source.ts.vercel-ai-sdk.openai-model@1",
      servingPlatform: "openai",
    });
    // A TypeScript annotation sits between the declared name and the `=`.
    expect(
      providerFact(
        `import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";\nconst openai: OpenAIProvider = createOpenAI({ apiKey: "k" });\nawait openai("gpt-old");\n`,
      ),
    ).toMatchObject({ servingPlatform: "openai", policyEligible: true });
  });

  test("distrusts a provider injected as a parameter in any binder form", () => {
    const preamble = `import { openai } from "@ai-sdk/openai";\n`;
    for (
      const body of [
        `class F { build(openai) { return openai("gpt-old"); } }\n`,
        `const o = { build(openai) { return openai("gpt-old"); } };\n`,
        `const build = function (openai) { return openai("gpt-old"); };\n`,
        `export const h = async ({ openai }) => openai("gpt-old");\n`,
        `for (const openai of providers) { await openai("gpt-old"); }\n`,
        `try { go(); } catch (openai) { openai("gpt-old"); }\n`,
        `function build(openai) { return openai("gpt-old"); }\n`,
      ]
    ) {
      expect(providerFact(`${preamble}${body}`), body).toBeUndefined();
    }
    // An ordinary function that closes over the import still resolves.
    expect(
      providerFact(`${preamble}export function make() { return openai("gpt-old"); }\n`),
    ).toMatchObject({ policyEligible: true });
  });

  test("reads only a first argument that can be a model selector", () => {
    // An object, array, or spread argument is not a selector; recording one would
    // publish a punctuation rawValue and mark an unread shape as read.
    for (const argument of ["{ id: \"gpt-old\" }", "...args", "() => \"gpt-old\""]) {
      expect(
        providerFact(`import { openai } from "@ai-sdk/openai";\nexport const m = openai(${argument});\n`),
        argument,
      ).toBeUndefined();
    }
    for (const argument of ["\"gpt-old\"", "modelId", "process.env.MODEL_ID", "config.model"]) {
      expect(
        providerFact(
          `import { openai } from "@ai-sdk/openai";\nconst modelId = "gpt-old";\nexport const m = openai(${argument});\n`,
        ),
        argument,
      ).toMatchObject({ detectorRuleId: "source.ts.vercel-ai-sdk.openai-model@1" });
    }
  });
});

describe("v3 unsupported integration notices", () => {
  const unsupportedNotices = (files: Readonly<Record<string, string>>) =>
    detectSnapshot(repositorySnapshot(files), feed).diagnostics.filter(
      (diagnostic) => diagnostic.code.startsWith("unsupported-integration-import."),
    );

  test("reports a framework whose model selection reaches no semantic rule", () => {
    const cases = [
      {
        // The AI SDK gateway string yields no evidence at all: its provider
        // prefix makes the feed ID fail the lexical identifier-boundary rule.
        path: "src/gateway.ts",
        source:
          `import { generateText } from "ai";\nawait generateText({ model: "openai/gpt-old", prompt: "hi" });\n`,
      },
      {
        // A provider member outside the published model-factory set.
        path: "src/tools.ts",
        source: `import { openai } from "@ai-sdk/openai";\nconst t = openai.tools.webSearch({});\n`,
      },
      { path: "app/chain.py", source: `from langchain_openai import ChatOpenAI\nllm = ChatOpenAI()\n` },
      { path: "app/legacy.py", source: `import google.generativeai as genai\ngenai.configure()\n` },
      { path: "app/router.py", source: `import litellm\nlitellm.completion(model="gpt-old")\n` },
      { path: "src/index.cjs", source: `const { generateText } = require("ai");\n` },
    ] as const;
    for (const testCase of cases) {
      const result = detectSnapshot(snapshot(testCase.path, testCase.source), feed);
      expect(
        result.diagnostics.some((diagnostic) =>
          diagnostic.code.startsWith("unsupported-integration-import.")
        ),
        testCase.path,
      ).toBe(true);
      // A notice must never make declared coverage partial, or enforcement
      // would fail closed on an unsupported import alone.
      expect(result.scanStatus, testCase.path).toBe("complete");
      expect(
        result.diagnostics.every((diagnostic) => diagnostic.severity === "notice"),
        testCase.path,
      ).toBe(true);
    }
  });

  test("stays silent for supported integrations and discarded type imports", () => {
    const cases = [
      {
        path: "src/openai.ts",
        source:
          `import OpenAI from "openai";\nconst client = new OpenAI();\nclient.responses.create({ model: "gpt-old" });\n`,
      },
      {
        path: "src/google.ts",
        source:
          `import { GoogleGenAI } from "@google/genai";\nconst client = new GoogleGenAI({ apiKey: "k" });\nclient.models.generateContent({ model: "gpt-old" });\n`,
      },
      {
        path: "app/bedrock.py",
        source: `import boto3\nclient = boto3.client("bedrock-runtime")\nclient.converse(modelId="gpt-old")\n`,
      },
      { path: "src/types.ts", source: `import type { LanguageModel } from "ai";\nexport type M = LanguageModel;\n` },
      { path: "app/storage.py", source: `import google.cloud.storage\n` },
      { path: "src/local.ts", source: `import { helper } from "./ai";\nhelper();\n` },
    ] as const;
    for (const testCase of cases) {
      expect(
        unsupportedNotices({ [testCase.path]: testCase.source }),
        testCase.path,
      ).toEqual([]);
    }
  });

  test("stays silent for a file where a published AI SDK rule resolved a model", () => {
    // Partial support: a resolved provider call means the file was understood,
    // so a bare `ai` import alongside it is not a coverage gap.
    expect(
      unsupportedNotices({
        "src/chat.ts":
          `import { openai } from "@ai-sdk/openai";\nimport { generateText } from "ai";\nawait generateText({ model: openai("gpt-old") });\n`,
      }),
    ).toEqual([]);
    // A dynamic selector still counts as understood: the call site is visible
    // and its environment variable can be joined from a committed assignment.
    expect(
      unsupportedNotices({
        "src/dynamic.ts":
          `import { openai } from "@ai-sdk/openai";\nawait openai(process.env.MODEL_ID);\n`,
      }),
    ).toEqual([]);
  });

  test("aggregates one deterministic notice per framework across files", () => {
    const notices = unsupportedNotices({
      "apps/b/src/y.ts": `import { generateText } from "ai";\nawait generateText({ model: "anthropic/x" });\n`,
      "apps/a/src/x.ts": `import { generateText } from "ai";\nawait generateText({ model: "openai/gpt-old" });\n`,
      "svc/chain.py": `from langchain.chat_models import init_chat_model\n`,
    });
    expect(notices).toHaveLength(2);
    expect(notices[0]?.message).toContain("The Vercel AI SDK (vercel-ai-sdk)");
    expect(notices[0]?.message).toContain("imported by 2 tracked file(s)");
    // Sorted sample paths keep the message stable across snapshot entry order.
    expect(notices[0]?.message).toContain("Files: apps/a/src/x.ts, apps/b/src/y.ts.");
    expect(notices[1]?.message).toContain("LangChain (langchain)");
    // Framework-scoped codes are what keep both notices alive through
    // aggregateDiagnostics, which groups by code and severity.
    expect(notices.map((notice) => notice.code)).toEqual([
      "unsupported-integration-import.vercel-ai-sdk@1",
      "unsupported-integration-import.langchain@1",
    ]);
  });

  test("defers to the tokenization diagnostic when the import parse is untrustworthy", () => {
    const result = detectSnapshot(
      snapshot("src/broken.ts", `import { generateText } from "ai";\nconst invalid = "unterminated\n`),
      feed,
    );
    // The tokenization notice already reports that this blob reached lexical
    // fallback only, and its import list cannot be trusted to name a framework.
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "semantic-tokenization-incomplete@1",
    ]);
    expect(result.scanStatus).toBe("complete");
  });

  test("matches a module prefix only in the ecosystem that publishes it", () => {
    // `ai` is an npm distribution, so a dotted or underscored Python module of
    // that name is a local package and a `.js` suffix is a different specifier.
    for (
      const testCase of [
        { path: "app/x.py", source: "import ai.utils\n" },
        { path: "app/y.py", source: "from ai_helpers import go\n" },
        { path: "app/z.py", source: "import ai\n" },
        { path: "src/v.ts", source: `import { h } from "vertexai_helpers";\n` },
        { path: "src/j.ts", source: `import x from "ai.js";\n` },
        { path: "src/k.ts", source: `import { h } from "./ai";\n` },
      ] as const
    ) {
      expect(unsupportedNotices({ [testCase.path]: testCase.source }), testCase.path).toEqual([]);
    }
    // The Python sibling and submodule forms still match a Python prefix.
    for (
      const testCase of [
        { path: "app/c.py", source: "from langchain_openai import ChatOpenAI\n", id: "langchain" },
        {
          path: "app/g.py",
          source: "import google.generativeai as genai\n",
          id: "google-generative-ai-legacy",
        },
        { path: "src/l.ts", source: `import { OpenAI } from "@llamaindex/openai";\n`, id: "llamaindex" },
      ] as const
    ) {
      expect(
        unsupportedNotices({ [testCase.path]: testCase.source }).map((notice) => notice.code),
        testCase.path,
      ).toEqual([`unsupported-integration-import.${testCase.id}@1`]);
    }
  });

  test("reads every clause of a Python import statement", () => {
    // A framework in any position but the first would otherwise go unreported.
    for (const source of ["import os, litellm\n", "import litellm, os\n", "import litellm as l, os\n"]) {
      expect(unsupportedNotices({ "app/m.py": source }).map((notice) => notice.code), source)
        .toEqual(["unsupported-integration-import.litellm@1"]);
    }
    // The namespace bindings the same walk feeds still resolve.
    expect(
      detectSnapshot(
        snapshot(
          "app/b.py",
          `import boto3, os\nclient = boto3.client("bedrock-runtime")\nclient.converse(modelId="gpt-old")\n`,
        ),
        feed,
      ).evidence.map((fact) => fact.detectorRuleId),
    ).toEqual(["source.py.aws-bedrock.converse-model@1"]);
  });

  test("names a framework reached by re-export or dynamic import", () => {
    // A barrel file leaves the call site's specifier local, so without these the
    // provider is neither read nor reported.
    expect(
      unsupportedNotices({
        "lib/providers.ts": `export { openai } from "@ai-sdk/openai";\n`,
        "src/use.ts": `import { openai } from "./providers";\nawait openai("gpt-old");\n`,
      }).map((notice) => notice.code),
    ).toEqual(["unsupported-integration-import.vercel-ai-sdk@1"]);
    for (
      const source of [
        `export * from "@ai-sdk/openai";\n`,
        `const { openai } = await import("@ai-sdk/openai");\nawait openai("gpt-old");\n`,
      ]
    ) {
      expect(unsupportedNotices({ "src/a.ts": source }), source).toHaveLength(1);
    }
    // A re-exported type is erased just as an imported one is.
    expect(unsupportedNotices({ "src/t.ts": `export type { LanguageModel } from "ai";\n` })).toEqual([]);
  });

  test("stays silent for an inline type-only specifier", () => {
    expect(
      unsupportedNotices({
        "src/types.ts": `import { type LanguageModel } from "ai";\nexport type M = LanguageModel;\n`,
      }),
    ).toEqual([]);
    // A runtime specifier alongside the type import is still a real import.
    expect(
      unsupportedNotices({
        "src/mixed.ts":
          `import { generateText, type LanguageModel } from "ai";\nexport type M = LanguageModel;\n`,
      }),
    ).toHaveLength(1);
  });

  test("names an unread provider package beside a read one", () => {
    // Suppression is per specifier: `@ai-sdk/mistral` has no rule, so a resolved
    // `@ai-sdk/openai` call in the same file must not buy silence for it.
    expect(
      unsupportedNotices({
        "src/registry.ts":
          `import { mistral } from "@ai-sdk/mistral";\nimport { openai } from "@ai-sdk/openai";\nexport const a = openai("gpt-old");\nexport const b = mistral(process.env.MODEL_ID);\n`,
      }).map((notice) => notice.code),
    ).toEqual(["unsupported-integration-import.vercel-ai-sdk@1"]);
  });

  test("treats the framework's non-provider packages as entrypoints", () => {
    // `@ai-sdk/react` and `@ai-sdk/rsc` export no provider, so an unread import of
    // one is not the coverage gap an unread provider package is.
    for (const specifier of ["ai", "ai/rsc", "@ai-sdk/react", "@ai-sdk/rsc"]) {
      expect(
        unsupportedNotices({
          "lib/model.ts":
            `import { openai } from "@ai-sdk/openai";\nexport const model = openai("gpt-old");\n`,
          "app/chat.tsx": `import { useChat } from "${specifier}";\nexport const C = () => <div />;\n`,
        }),
        specifier,
      ).toEqual([]);
    }
  });

  test("stays silent when the provider call resolved in another file", () => {
    // The framework entrypoints select no model themselves, so an `ai` import
    // whose model came from a provider call elsewhere is not a coverage gap.
    const result = detectSnapshot(
      repositorySnapshot({
        "lib/model.ts": `import { openai } from "@ai-sdk/openai";\nexport const model = openai("gpt-old");\n`,
        "app/route.ts":
          `import { streamText } from "ai";\nimport { model } from "../lib/model";\nstreamText({ model });\n`,
      }),
      feed,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence.filter((fact) => fact.policyEligible)).toHaveLength(1);
  });

  test("keeps the sampled paths inside the published message budget", () => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 7; index += 1) {
      files[`packages/backend-services/src/features/assistant/providers/gateway-${index}.ts`] =
        `import { generateText } from "ai";\nawait generateText({ model: "openai/gpt-old" });\n`;
    }
    const message = unsupportedNotices(files)[0]?.message ?? "";
    // The publisher compacts a diagnostic message to 800 code points, so the
    // sample is trimmed to whole paths rather than cut mid-path by the cap.
    expect(message.length).toBeLessThanOrEqual(800);
    expect(message).toContain("is imported by 7 tracked file(s)");
    expect(message.endsWith(" more).")).toBe(true);
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
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format  = "OpenAI"
    name    = "gpt-old"
    version = "0613"
  }
}
`,
      ),
      feed,
    );
    const facts = result.evidence.filter(
      (fact) => fact.detectorRuleId === "deploy.hcl.azure.cognitive-deployment-model@1",
    );
    expect(facts).toHaveLength(1);
    const fact = facts[0];
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

  test("carries any Azure model format, not only OpenAI", () => {
    // azurerm 5.0 documents `format` values including AI21 Labs, Black Forest Labs,
    // Cohere, Core42, DeepSeek, Meta, Microsoft, Mistral AI, OpenAI and xAI. The rule is
    // deliberately format-agnostic: it records the tuple and leaves resolution to policy,
    // so a family the registry does not know yet still produces deployment evidence.
    for (const format of ["Mistral AI", "DeepSeek", "Meta"]) {
      const result = detectSnapshot(
        snapshot(
          "deploy/main.tf",
          `resource "azurerm_cognitive_deployment" "chat" {\n  model {\n    format  = "${format}"\n    name    = "some-model"\n    version = "1"\n  }\n}\n`,
        ),
        feed,
      );
      const facts = result.evidence.filter(
        (fact) => fact.detectorRuleId === "deploy.hcl.azure.cognitive-deployment-model@1",
      );
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({
        servingPlatform: "azure",
        rawValue: `["${format}","some-model","1"]`,
        selectorKind: "deployment-name",
      });
    }
  });

  test("keeps an omitted Azure Terraform model version as an unresolved tuple", () => {
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format = "OpenAI"
    name   = "gpt-azure-omitted"
  }
}
`,
      ),
      feed,
    );
    const facts = result.evidence.filter(
      (fact) => fact.detectorRuleId === "deploy.hcl.azure.cognitive-deployment-model@1",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "deployment-resource",
      rawValue: `["OpenAI","gpt-azure-omitted",null]`,
      servingPlatform: "azure",
      modelResolution: "unresolved",
      selectorKind: "deployment-name",
      platformResolution: "resolved",
      policyEligible: false,
    });
    expect(facts[0]?.modelId).toBeUndefined();
  });

  test("does not treat a dynamic Azure Terraform model version as omitted", () => {
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format  = "OpenAI"
    name    = "gpt-old"
    version = var.model_version
  }
}
`,
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.evidence.filter((fact) => fact.kind === "deployment-resource")).toEqual([]);
    expect(
      result.evidence.filter(
        (fact) =>
          fact.detectorRuleId === "fallback.text.lifecycle-id@1" &&
          fact.rawValue === "gpt-old",
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "lexical",
        confidence: "low",
        scope: "deployment",
        modelId: "gpt-old",
        modelResolution: "resolved",
        selectorKind: "model-id",
        policyEligible: false,
      }),
    ]);
  });

  test("does not treat an interpolated Azure Terraform model name as static", () => {
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format  = "OpenAI"
    name    = "\${var.model_prefix}gpt-old"
    version = "0613"
  }
}
`,
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.evidence.filter((fact) => fact.kind === "deployment-resource")).toEqual([]);
    expect(
      result.evidence.filter(
        (fact) =>
          fact.detectorRuleId === "fallback.text.lifecycle-id@1" &&
          fact.rawValue === "gpt-old",
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "lexical",
        confidence: "low",
        scope: "deployment",
        modelId: "gpt-old",
        modelResolution: "resolved",
        selectorKind: "model-id",
        policyEligible: false,
      }),
    ]);
  });

  test("does not promote the quoted prefix of an unsupported HCL expression", () => {
    const result = detectSnapshot(
      snapshot(
        "deploy/main.tf",
        `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format = "OpenAI"
    name = "gpt-old"
      + var.model_suffix
  }
}
`,
      ),
      feed,
    );
    expect(result.scanStatus).toBe("complete");
    expect(result.evidence.filter((fact) => fact.kind === "deployment-resource")).toEqual([]);
    expect(result.evidence).toContainEqual(expect.objectContaining({
      detectorRuleId: "fallback.text.lifecycle-id@1",
      kind: "lexical",
      rawValue: "gpt-old",
      policyEligible: false,
    }));
  });

  test("keeps ordinary template-adjacent characters in a direct HCL string static", () => {
    const fact = ruleEvidence(
      "deploy/main.tf",
      `resource "azurerm_cognitive_deployment" "chat" {
  model {
    format  = "OpenAI"
    name    = "gpt-$cash-100%-v1.preview/0613"
    version = "0613"
  }
}
`,
      "deploy.hcl.azure.cognitive-deployment-model@1",
    );
    expect(fact).toMatchObject({
      kind: "deployment-resource",
      rawValue: `["OpenAI","gpt-$cash-100%-v1.preview/0613","0613"]`,
      modelResolution: "unresolved",
      selectorKind: "deployment-name",
    });
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
      expect(result.scanStatus).toBe("complete");
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "semantic-tokenization-incomplete@1" &&
            diagnostic.severity === "notice",
        ),
      ).toBe(true);
    }
  });
});
