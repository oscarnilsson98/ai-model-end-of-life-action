# V3 Detector, Platform, and Feed Contract

Status: approved v3.0 detector boundary. A detector or feed adapter not listed here is unsupported in v3.0 even when lexical fallback happens to find a related token.

## Detector principles

Detectors emit evidence facts, never lifecycle or policy conclusions. Lifecycle matching and policy remain centralized.

Every evidence fact includes:

- detector and rule identity;
- repository snapshot and blob identity;
- semantic location without source snippets;
- raw model reference, feed-independent selector kind, or dynamic selector;
- independently classified evidence kind, confidence, scope, and environment;
- model and serving-platform resolution evidence;
- a bounded resolution trace;
- policy-eligibility metadata defined by the rule, not inferred by the renderer.

Semantic detectors operate independently of the lifecycle feed. The feed-backed lexical matcher is fallback evidence only.

A lifecycle join never rewrites detector evidence or selector kind. For example, a literal polymorphic Bedrock selector that happens to equal a feed model ID may produce a conditional advisory candidate, but it remains unresolved and cannot block without a feed-independent trusted local resolution.

## Versioned rule identity

Rule IDs use:

```text
<source>.<language-or-format>.<integration>.<fact>@<major>
```

Examples:

```text
source.ts.openai.request-model@1
source.py.anthropic.messages-model@1
binding.github-actions.consumed-model@1
deploy.hcl.azure.cognitive-deployment-model@1
fallback.text.lifecycle-id@1
```

Changing a rule's evidence meaning, resolution authority, confidence, scope/environment behavior, or policy eligibility requires a new rule major. Adding a new API family requires a new rule ID. A fixture-preserving parser crash/location fix or an additional syntax spelling with identical semantics may keep the rule major, but changes the versioned detector-manifest revision and digest. The release publishes the complete detector/rule manifest; every run publishes its digest.

Semantic scanner evidence IDs derive from rule ID, root-relative Git path, semantic anchor, selector identity, and occurrence discriminator. Commit/blob OIDs and line/column numbers are snapshot provenance, not semantic identity. V3.0 does not infer Git rename or copy mappings, so moving a fact changes its evidence ID and any location-specific fingerprint. Lifecycle delta comparison separately aggregates exact lifecycle signatures, which keeps an otherwise unchanged model lifecycle finding from becoming new merely because its contributing code moved.

## Canonical serving platforms

V3.0 uses these stable serving-platform slugs:

| Slug | Meaning |
| --- | --- |
| `openai` | OpenAI API |
| `azure` | Azure OpenAI / Azure AI Foundry serving lifecycle |
| `anthropic` | Anthropic API |
| `aws-bedrock` | Amazon Bedrock |
| `google` | Google Gemini API / Google AI Studio lifecycle |
| `google-vertex` | Google Vertex AI serving lifecycle |
| `cohere` | Cohere API |
| `groq` | Groq API |
| `xai` | xAI API |

The slug describes the serving platform whose lifecycle applies, not the model publisher or SDK package author. Unknown and custom OpenAI-compatible gateways remain unresolved; they are not silently classified as `openai`.

The reviewed adapter for the current public source uses this complete, case-sensitive provider mapping:

| Source provider | Canonical slug |
| --- | --- |
| `OpenAI` | `openai` |
| `Azure` | `azure` |
| `Anthropic` | `anthropic` |
| `AWS Bedrock` | `aws-bedrock` |
| `Google` | `google` |
| `Google Vertex` | `google-vertex` |
| `Cohere` | `cohere` |
| `Groq` | `groq` |
| `xAI` | `xai` |

Any other source-provider value is unregistered. The adapter retains a syntactically valid slug supplied by a typed source, but an untyped source-provider value outside this table is not guessed.

External evidence and trusted resolutions MUST use a registered slug to become platform-resolved or policy eligible. A syntactically valid typed-feed slug that is not yet registered is retained as unsupported platform evidence and cannot block. A new policy-eligible platform requires a reviewed registry addition, feed mapping, display name, detector implications, and ambiguity tests. Human-facing aliases may normalize to a slug, but canonical output never changes.

## Platform inference order

Platform resolution uses the strongest local evidence in this order:

1. explicit deployment resource, supported SDK constructor, or trusted resolution;
2. recognized endpoint/base URL together with client construction;
3. provider-specific client constructor or invocation API;
4. provider-specific model namespace or credential/configuration binding;
5. package import alone.

Package import alone is insufficient for policy-eligible platform resolution. In particular, an OpenAI client with a custom, dynamic, or non-OpenAI `baseURL` is platform-unknown unless another registered provider rule resolves it.

Conflicting strong evidence produces `platformResolution: ambiguous`, retains every supported candidate and trace, and never blocks in v3.0.

## Alias and identifier transformations

There is no generic prefix stripping, suffix stripping, fuzzy matching, case folding, edit-distance matching, or publisher-to-platform inference for model IDs.

V3 distinguishes two authorities that MUST NOT be conflated:

1. **Local evidence resolution** follows repository evidence such as an environment fallback, supported deployment relation, or trusted checked-in resolution to produce an exact `(servingPlatform, modelId)` pair before feed joining.
2. **Provider lifecycle aliasing** maps an already resolved pair to a different canonical feed pair only when the serving platform owns and publishes that equivalence.

Every local transformation is owned by one integration rule and emits its raw value, exact candidate pair, and trace. V3.0 applies at most one matching trusted repository resolution; conflicting matches remain unresolved/ambiguous and advisory at most. A repository resolution is local evidence resolution; it can never create a provider lifecycle alias.

Provider lifecycle aliases are case-sensitive, versioned, one-hop mappings keyed by serving platform. Conflicting aliases, cross-platform aliases, chains, or aliases with no provider provenance invalidate that alias-registry release. The v3.0 launch provider-alias registry is explicitly empty, so all v3.0 blocking joins are exact `(servingPlatform, modelId)` joins. Adding an alias in v3.x requires provider provenance, fixtures, a registry-version change, and conflict review.

When two applicable rules produce different canonical model/platform pairs:

- neither wins by undocumented precedence;
- resolution remains ambiguous;
- the result is advisory at most;
- a current trusted resolution may select a pair for later runs;
- head-branch resolutions cannot reduce the current PR outcome.

## V3.0 semantic support matrix

The launch matrix is intentionally bounded. “Policy eligible” below is rule capability, not the final decision: blocking still requires high confidence, `deployment` scope or trusted production environment, resolved model/platform, an exact lifecycle join, and enabled enforcement.

| Rule ID | Language/format | Integration and exact recognized model-bearing forms | Platform/model resolution guard | Policy eligible |
| --- | --- | --- | --- | --- |
| `source.ts.openai.request-model@1` | JavaScript/TypeScript | Imported `OpenAI`/`AzureOpenAI` clients from the official `openai` package: `model` in `responses.create/stream`, `chat.completions.create/stream`, `embeddings.create`, `images.generate/edit`, `audio.speech.create`, `audio.transcriptions.create`, and `audio.translations.create` | Default `OpenAI` client/endpoint → `openai` + `model-id`; `AzureOpenAI`/recognized Azure endpoint → `azure` + `deployment-name`; every custom, conflicting, or dynamic endpoint stays unresolved | OpenAI exact ID yes; Azure only after trusted local resolution |
| `source.py.openai.request-model@1` | Python | Imported `OpenAI`/`AsyncOpenAI`/`AzureOpenAI`/`AsyncAzureOpenAI` clients from the official `openai` package: the corresponding Responses, Chat Completions, Embeddings, Images, and Audio methods with `model=` | Same default OpenAI, Azure deployment-selector, and endpoint restrictions as TypeScript | Same as TypeScript |
| `source.ts.anthropic.messages-model@1` | JavaScript/TypeScript | Direct `Anthropic` client from `@anthropic-ai/sdk`: `messages.create`, `messages.stream`, and `messages.countTokens` request `model` | Direct default Anthropic endpoint → `anthropic`; custom/dynamic `baseURL` unresolved; separate Vertex/Bedrock/AWS/Foundry SDK clients are not this rule | Yes for exact direct Anthropic ID |
| `source.py.anthropic.messages-model@1` | Python | Direct `Anthropic`/`AsyncAnthropic` clients from `anthropic`: messages create, stream, and count_tokens `model=` | Direct default endpoint → `anthropic`; custom/dynamic `base_url` and platform-specific client classes are excluded | Yes for exact direct Anthropic ID |
| `source.ts.google-genai.generate-model@1` | JavaScript/TypeScript | Imported `GoogleGenAI` from `@google/genai`, followed by `models.generateContent` or `models.generateContentStream` with `model` | A direct literal `vertexai` or `apiKey` constructor option distinguishes `google-vertex` from `google`; otherwise the platform is ambiguous. Custom, conflicting, or dynamic client/request base URLs are unresolved. Full resource names, tuned names, and partner publisher paths stay unresolved | Yes only for exact ID, one resolved mode, and a safe endpoint |
| `source.py.google-genai.generate-model@1` | Python | Current `google-genai` distribution (`from google import genai`): `Client` followed by `models.generate_content` or `generate_content_stream` with `model=` | Same direct literal constructor-mode, endpoint, and selector restrictions as TypeScript | Yes only for exact ID, one resolved mode, and a safe endpoint |
| `source.ts.aws-bedrock.invoke-model@1`, `source.ts.aws-bedrock.converse-model@1` | JavaScript/TypeScript | `@aws-sdk/client-bedrock-runtime`: `InvokeModelCommand`, `InvokeModelWithResponseStreamCommand`, `ConverseCommand`, and `ConverseStreamCommand` `modelId` | Recognized/default AWS endpoint establishes `aws-bedrock`; explicit custom/dynamic `endpoint` stays platform-unresolved. Every selector remains feed-independently `polymorphic` in v3.0, including ARN, profile, prompt, and resource-shaped values | Only after trusted local resolution to an exact model ID |
| `source.py.aws-bedrock.invoke-model@1`, `source.py.aws-bedrock.converse-model@1` | Python | Imported `boto3` client whose exact service name is `bedrock-runtime`: `invoke_model`, `invoke_model_with_response_stream`, `converse`, and `converse_stream` `modelId` | Recognized/default AWS endpoint establishes `aws-bedrock`; explicit custom/dynamic `endpoint_url` stays platform-unresolved. Selector behavior matches TypeScript | Only after trusted local resolution to an exact model ID |
| `deploy.hcl.azure.cognitive-deployment-model@1` | HCL/Terraform | `azurerm_cognitive_deployment` with direct static `model.format`, `model.name`, and optional `model.version` strings | Resource establishes `azure`; the tuple remains a deployment/model tuple until a versioned trusted resolution maps it to one exact feed ID. Omitted version and auto-upgrade remain unresolved; dynamic values and unsupported forms are outside this semantic rule and receive lexical fallback only | Only after exact trusted tuple resolution |
| `binding.env.consumed-model@1`, `binding.github-actions.consumed-model@1` | Dotenv/GitHub workflow YAML | Literal value linked by exact variable name to a supported semantic selector | Inherits candidates from the consuming fact and never resolves independently | Never independently |
| `fallback.text.lifecycle-id@1` | Other bounded UTF-8 text | Boundary-safe exact ID from a record with `literalScanEligible: true` | Feed candidates only; never inferred | No |

Support is syntax-based because the action does not install repository dependencies. `src/detection/manifest.ts` pins the exact SDK/package versions used to qualify every row and includes them in the detector-manifest digest; later SDK syntax is unsupported until fixtures and the detector-manifest revision are updated.

| Ecosystem | Qualified package | Qualified version |
| --- | --- | --- |
| npm | `openai` | `6.49.0` |
| PyPI | `openai` | `2.46.0` |
| npm | `@anthropic-ai/sdk` | `0.112.4` |
| PyPI | `anthropic` | `0.117.0` |
| npm | `@google/genai` | `2.13.0` |
| PyPI | `google-genai` | `2.13.0` |
| npm | `@aws-sdk/client-bedrock-runtime` | `3.1096.0` |
| PyPI | `boto3` | `1.43.51` |
| Terraform provider | `hashicorp/azurerm` | `4.79.0` |

V3.0 does not claim semantic support for Go, Java, Kotlin, C#, Ruby, PHP, Vercel AI SDK, LiteLLM, legacy `@google/generative-ai`, the retired Vertex AI generative SDK module, platform-specific Anthropic clients, arbitrary framework wrappers, broad Kubernetes/Helm schemas, generic Terraform resources, or arbitrary keys named `model`. Those files still receive bounded lexical fallback where eligible. These higher-ambiguity integrations may ship in v3.x only with separate provider-specific rule IDs and fixtures; they are not stretched into v3.0 by generic matching.

An unsupported integration is reported rather than left silent. When a tracked JavaScript, TypeScript, or Python file imports a recognized-but-unsupported LLM framework, the run publishes one `unsupported-integration-import@1` diagnostic per framework, naming the framework and a bounded sorted sample of the importing paths. The diagnostic severity is `notice`: declared coverage stays `complete`, so enforcement never fails closed on an unsupported import alone. The diagnostic states what the degradation costs — lexical fallback cannot block, is excluded from notifications as low confidence, and produces nothing at all when the selector is dynamic or the exact model ID is not literal-scan eligible.

The recognized framework module prefixes are `ai` and `@ai-sdk` (Vercel AI SDK), `langchain` and `@langchain`, `llamaindex` and `llama_index`, `litellm`, `@google/generative-ai` and `google.generativeai`, and `vertexai` and `@google-cloud/vertexai`. A prefix matches a bare specifier, a subpath, a dotted Python submodule, or an underscored Python sibling such as `langchain_openai`. Discarded type-only imports and files whose tokenization already failed do not produce the notice; the latter already report incomplete semantic coverage.

Primary qualification references are the official [OpenAI Node](https://github.com/openai/openai-node) and [Python](https://github.com/openai/openai-python) SDKs, [Anthropic TypeScript](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript) and [Python](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python) SDKs, [Google GenAI library status](https://ai.google.dev/gemini-api/docs/libraries) and [endpoint options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html), [AWS Bedrock Runtime](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api.html) and [boto3 client endpoint configuration](https://docs.aws.amazon.com/boto3/latest/reference/core/session.html), and the [AzureRM cognitive deployment resource](https://registry.terraform.io/providers/hashicorp/Azurerm/latest/docs/resources/cognitive_deployment). `DETECTOR_QUALIFICATION` is the executable version manifest.

## Bounded value resolution

V3.0 semantic rules may resolve:

- direct static string literals, including template literals with no substitutions;
- unique, unshadowed, top-level same-file immutable string constants;
- direct supported environment references and their static string fallbacks;
- direct client bindings constructed from supported imported SDK classes;
- exact-name environment bindings consumed by a supported semantic fact;
- static Azure Terraform model tuples, which remain unresolved until an exact trusted tuple resolution exists.

V3.0 does not resolve object-property indirection, string concatenation, template substitutions, local factories, broad cross-file or interprocedural dataflow, arbitrary code evaluation, package execution, remote lookup, source-map reconstruction, or reachability. An unresolved selector remains first-class high/medium/low evidence with model/platform resolution states; it is not guessed.

Exact-name environment linking is scope-aware. Conflicting values from production, staging, tests, or several deployment files remain separate candidates with their provenance; file order or an undocumented precedence rule never selects one.

## Scope and noise classification

Evidence scope is independent of syntax:

- recognized deployment resources are `deployment`;
- parser-recognized calls in normal application source are `application` with environment `unknown` unless a supported deployment relation or trusted policy establishes another environment;
- conventional test paths are `test`;
- example/demo/sample paths are `example`;
- Markdown and conventional documentation trees are `documentation`;
- generated/bundled paths are classified as uncertain rather than universally excluded.

Comments and arbitrary strings are excluded from semantic evidence by parsers. Exact feed IDs there remain low-confidence lexical evidence: documentation/test/fixture/example/generated/unknown scopes are notices, while application/deployment scope may become advisory inside the warning horizon under the product contract. Lexical evidence is never policy eligible.

Generated-only evidence remains visible. Duplication alone cannot raise confidence or establish production.

V3.0 conventional path matching is ASCII-case-insensitive, segment-aware, and applies segment/filename rules in this order:

1. `docs`, `doc`, `documentation`, Markdown/MDX, and conventional reference-site content are `documentation`;
2. `test`, `tests`, `__tests__`, `spec`, `fixtures`, and files with `.test.*`/`.spec.*` are `test`;
3. `example`, `examples`, `demo`, `demos`, `sample`, and `samples` are `example`;
4. `dist`, `build`, `generated`, `out`, `archive`, `archived`, `legacy`, `vendor`, and recognized bundles are generated/uncertain artifacts and begin as `unknown`;
5. recognized IaC and deployment schemas outside the higher-precedence noise scopes are `deployment`;
6. a parser-recognized SDK call or a tracked conventional source file outside those scopes is `application` with environment `unknown`; v3.0 conventional extensions are `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, `.py`, `.go`, `.java`, `.kt`, `.kts`, `.cs`, `.rb`, `.php`, `.rs`, `.swift`, `.c`, `.h`, `.cc`, `.cpp`, and `.sh`;
7. other evidence is `unknown`.

Path names containing `prod` or `production` never establish an environment by themselves.

The base-tree policy may add bounded detector-and-path-specific scope/environment rules using the product-contract schema. Documentation, test/fixture, and example scope is protected and can never be promoted by a scope rule or deployment relation in v3.0; a matching promotion is ignored and reported. On pull requests, other head scope changes are monotonic: they may increase severity but cannot reclassify a base/target fact into a less severe scope/environment for the current PR.

## Feed contract

The default v3 feed is a strict discriminated union. `PlatformSlug` is any syntactically valid lower-case slug; `CanonicalPlatformSlug` is the registered subset listed above. This distinction allows valid records for a not-yet-supported platform to remain visible without pretending the action can enforce them.

```ts
type PlatformSlug = string; // schema: [a-z0-9](?:[a-z0-9-]{0,62})
type CanonicalPlatformSlug =
  | "openai" | "azure" | "anthropic" | "aws-bedrock"
  | "google" | "google-vertex" | "cohere" | "groq" | "xai";

type FeedEnvelope = {
  schemaVersion: 3;
  adapter: {
    id: string;
    version: string;
    sourceSha256: string;
  };
  generatedAt: string; // RFC 3339 UTC instant
  records: FeedRecord[];
};

type FeedRecord = ModelLifecycleRecord | NonModelLifecycleRecord;

type RecordCommon = {
  recordId: string;
  servingPlatform: PlatformSlug;
  primarySourceUrl: string;
  supersedesRecordIds: string[];
};

type ModelLifecycleRecord = RecordCommon & {
  recordKind: "model";
  modelId: string;
  literalScanEligible: boolean;
  lifecycleStatus: "deprecated" | "shutdown-scheduled" | "retired";
  announcementDate?: string;
  deprecationDate?: string;
  shutdownDate?: string;
  replacementModels: Array<{
    modelId: string;
    servingPlatform?: PlatformSlug;
  }>;
};

type NonModelLifecycleRecord = RecordCommon & {
  recordKind:
    | "api" | "sdk" | "feature" | "tool" | "product"
    | "prompt" | "agent" | "other";
  resourceId: string;
  displayName?: string;
  literalScanEligible: false;
};
```

All objects reject unknown fields. Strings, arrays, URLs, IDs, and documents have published byte/count bounds in the JSON Schema. Every model record requires at least one of `deprecationDate` or `shutdownDate`; present dates satisfy `announcementDate <= deprecationDate <= shutdownDate`. Relative to the envelope's UTC `generatedAt` date: `deprecated` requires a deprecation date and no shutdown date, `shutdown-scheduled` requires a future shutdown date, and `retired` requires a shutdown date on or before that date. The adapter does not rewrite exact model-ID case.

`recordKind` is the sole semantic distinction between models and non-model entities. Records such as reusable prompts, agent builders, APIs, SDKs, tools, and products use a non-model branch and never enter semantic model joins or the lexical model automaton. An unrecognized or missing `recordKind` is a feed-contract failure; it is not silently treated as a model or ignored.

`literalScanEligible` explicitly controls inclusion in the lexical fallback automaton. It is set by the typed producer or a versioned reviewed adapter based on record semantics and collision fixtures, never derived solely from identifier shape. A `false` model record remains eligible for semantic exact joins.

Record identity and conflict behavior are deterministic:

- `recordId` is globally unique within an envelope and stable across unchanged source events;
- `supersedesRecordIds` may reference only records in the same envelope for the same exact platform/model or platform/resource pair; missing references, self-reference, cycles, and cross-pair supersession fail validation;
- superseded records remain in provenance but do not participate in current lifecycle evaluation;
- the lifecycle signature is the exact tuple `(servingPlatform, modelId, lifecycleStatus, announcementDate|null, deprecationDate|null, shutdownDate|null, literalScanEligible)`;
- active records with the same lifecycle signature collapse for evaluation while retaining every record ID, source URL, and replacement variant in provenance;
- two or more different active lifecycle signatures for the same exact `(servingPlatform, modelId)` are a visible `feed-conflict`; there is no implicit “latest,” “earliest,” or more-specific winner. An unreferenced conflict is a feed diagnostic only; when evaluated evidence joins that pair it becomes advisory and cannot produce `blocking`;
- a conflict is resolved only when valid `supersedesRecordIds` leave exactly one active lifecycle signature for that pair;
- a pair enters the lexical automaton only when it has exactly one active lifecycle signature and that signature has `literalScanEligible: true`; a conflicted pair never enters lexical discovery;
- the same `modelId` on different platforms is always a distinct lifecycle pair and retains platform-specific dates;
- unsupported but syntactically valid platform slugs remain visible and nonblocking.

Every run validates the entire envelope before detector matching and publishes raw-source, normalized-feed, adapter-manifest, and active-record digests. The current public feed is untyped, so v3.0 includes a reviewed adapter manifest with an exact, count-and-digest-pinned registry of reviewed source pairs. Every raw row is strictly parsed. Pairs outside that registry are quarantined and omitted from normalized records rather than guessed from a token regex; absent reviewed pairs are also reported. An addition, removal, or rename makes scan coverage `partial`: warning-only runs succeed with a visible diagnostic, while enforcement fails closed unless `allowPartial: true` is configured. A later release must review an added pair before it can gain model or non-model authority.

Duplicate source pairs, malformed rows, unknown fields or providers, invalid manifest metadata, and schema failures produce `unknown + failed`. If quarantine leaves no reviewed records, the non-empty feed contract also fails. A later release may replace the reviewed adapter with an approved typed endpoint.

## Detector qualification

Every policy-eligible rule has positive and negative fixtures covering:

- every recognized API/configuration form;
- literal, same-file constant, no-substitution template, and environment-fallback resolution;
- comments, dead examples, tests, docs, and unrelated `model` keys;
- provider-specific clients and conflicting/custom endpoints;
- dynamic model and platform selectors;
- generated-source classification;
- malformed, hostile, oversized, binary, symlink, LFS, and submodule cases.

The checked-in detector and orchestration suites are the executable qualification corpus. Release verification requires:

- no false `blocking` outcome in any negative fixture;
- no policy-eligible evidence emitted from documentation, example, fixture, or test-only facts;
- no top-level `advisory` produced solely by lexical documentation, test, fixture, or example evidence;
- no unexpected high/medium-confidence advisory and bounded aggregation of repeated unresolved facts;
- every supported golden form detected;
- every result deterministic across repeated runs and file ordering;
- all expected partial/failed coverage diagnostics reproduced;
- the zero-input packaged action scans this repository as a documentation, test, and fixture noise regression on every supported CI operating system.

Broad support claims are prohibited until the corresponding detector rule and qualification fixtures ship in a later v3.x release.
