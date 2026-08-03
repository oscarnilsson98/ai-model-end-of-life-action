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

export const DETECTOR_MANIFEST_VERSION = "3.0.0-2";

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
