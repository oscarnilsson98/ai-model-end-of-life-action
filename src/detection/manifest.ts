import { canonicalSha256 } from "../shared/status.ts";

export type DetectorRuleManifestEntry = {
  ruleId: string;
  languages: string[];
  confidence: "high" | "low";
  policyEligible: boolean;
};

export type DetectorQualificationEntry = {
  ecosystem: "npm" | "pypi" | "terraform-provider";
  package: string;
  version: string;
  sourceUrl: string;
};

export const DETECTOR_MANIFEST_VERSION = "3.0.0-5";

/** Syntax baselines reviewed for the v3.0 rule set; repository packages are never installed. */
export const DETECTOR_QUALIFICATION: readonly DetectorQualificationEntry[] =
  Object.freeze([
    Object.freeze({
      ecosystem: "npm",
      package: "openai",
      version: "6.49.0",
      sourceUrl: "https://www.npmjs.com/package/openai/v/6.49.0",
    }),
    Object.freeze({
      ecosystem: "pypi",
      package: "openai",
      version: "2.46.0",
      sourceUrl: "https://pypi.org/project/openai/2.46.0/",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@anthropic-ai/sdk",
      version: "0.112.4",
      sourceUrl: "https://www.npmjs.com/package/@anthropic-ai/sdk/v/0.112.4",
    }),
    Object.freeze({
      ecosystem: "pypi",
      package: "anthropic",
      version: "0.117.0",
      sourceUrl: "https://pypi.org/project/anthropic/0.117.0/",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@google/genai",
      version: "2.13.0",
      sourceUrl: "https://www.npmjs.com/package/@google/genai/v/2.13.0",
    }),
    Object.freeze({
      ecosystem: "pypi",
      package: "google-genai",
      version: "2.13.0",
      sourceUrl: "https://pypi.org/project/google-genai/2.13.0/",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@aws-sdk/client-bedrock-runtime",
      version: "3.1096.0",
      sourceUrl:
        "https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime/v/3.1096.0",
    }),
    Object.freeze({
      ecosystem: "pypi",
      package: "boto3",
      version: "1.43.51",
      sourceUrl: "https://pypi.org/project/boto3/1.43.51/",
    }),
    Object.freeze({
      ecosystem: "terraform-provider",
      package: "hashicorp/azurerm",
      version: "4.79.0",
      sourceUrl: "https://registry.terraform.io/providers/hashicorp/azurerm/4.79.0",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "ai",
      version: "7.0.49",
      sourceUrl: "https://www.npmjs.com/package/ai/v/7.0.49",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/openai",
      version: "4.0.27",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/openai/v/4.0.27",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/anthropic",
      version: "4.0.27",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/anthropic/v/4.0.27",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/google",
      version: "4.0.31",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/google/v/4.0.31",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/google-vertex",
      version: "5.0.38",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/google-vertex/v/5.0.38",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/azure",
      version: "4.0.28",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/azure/v/4.0.28",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/amazon-bedrock",
      version: "5.0.40",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/amazon-bedrock/v/5.0.40",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/cohere",
      version: "4.0.20",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/cohere/v/4.0.20",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/groq",
      version: "4.0.21",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/groq/v/4.0.21",
    }),
    Object.freeze({
      ecosystem: "npm",
      package: "@ai-sdk/xai",
      version: "4.0.27",
      sourceUrl: "https://www.npmjs.com/package/@ai-sdk/xai/v/4.0.27",
    }),
  ]);

export const DETECTOR_RULES: readonly DetectorRuleManifestEntry[] = Object.freeze([
  {
    ruleId: "source.ts.openai.request-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.py.openai.request-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.anthropic.messages-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.py.anthropic.messages-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.google-genai.generate-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.py.google-genai.generate-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.aws-bedrock.invoke-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "source.ts.aws-bedrock.converse-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "source.py.aws-bedrock.invoke-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "source.py.aws-bedrock.converse-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.openai-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.anthropic-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.google-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.google-vertex-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    // Azure names a deployment, not an exact model ID, exactly as in the
    // official Azure client and Terraform rules.
    ruleId: "source.ts.vercel-ai-sdk.azure-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false,
  },
  {
    // Bedrock selectors are polymorphic, matching the official Bedrock rules.
    ruleId: "source.ts.vercel-ai-sdk.amazon-bedrock-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.cohere-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.groq-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "source.ts.vercel-ai-sdk.xai-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true,
  },
  {
    ruleId: "deploy.hcl.azure.cognitive-deployment-model@1",
    languages: ["hcl"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "binding.env.consumed-model@1",
    languages: ["dotenv"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "binding.github-actions.consumed-model@1",
    languages: ["yaml"],
    confidence: "high",
    policyEligible: false,
  },
  {
    ruleId: "fallback.text.lifecycle-id@1",
    languages: ["text"],
    confidence: "low",
    policyEligible: false,
  },
]);

export const DETECTOR_MANIFEST_SHA256 = canonicalSha256(
  "ai-model-eol/detector-manifest/v3",
  {
    version: DETECTOR_MANIFEST_VERSION,
    rules: DETECTOR_RULES,
    qualification: DETECTOR_QUALIFICATION,
    providerAliasRegistry: [],
  },
);
