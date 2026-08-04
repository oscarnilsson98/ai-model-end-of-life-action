export type Result =
  | "no-actionable-risk"
  | "advisory"
  | "blocking"
  | "unknown";

export type ScanStatus = "complete" | "partial" | "failed";
export type ComparisonStatus =
  | "available"
  | "partial"
  | "unavailable"
  | "not-applicable";
export type ExitReason =
  | "none"
  | "assessment-failed"
  | "trusted-base-unavailable"
  | "policy-breach"
  | "partial-disallowed"
  | "notification-failed";
export type NotificationStatus = "disabled" | "skipped" | "sent" | "failed";
export type EvidenceHealth =
  | "current"
  | "review-overdue"
  | "stale"
  | "expired"
  | "invalid";

export type EvidenceOrigin = "repository" | "external-source" | "manual-claim";
export type EvidenceKind =
  | "sdk-argument"
  | "structured-config"
  | "deployment-resource"
  | "env-binding"
  | "manual-claim"
  | "runtime-observation"
  | "deployment-snapshot"
  | "generated-declaration"
  | "lexical";
export type EvidenceConfidence = "high" | "medium" | "low";
export type EvidenceScope =
  | "application"
  | "deployment"
  | "test"
  | "example"
  | "documentation"
  | "unknown";
export type EvidenceEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test"
  | "unknown";
export type ModelResolution = "resolved" | "dynamic" | "unresolved";
export type ModelSelectorKind =
  | "model-id"
  | "deployment-name"
  | "resource-name"
  | "routing-selector"
  | "polymorphic"
  | "dynamic"
  | "unknown";
export type PlatformResolution = "resolved" | "ambiguous" | "unknown";
export type LifecycleMatch = "exact" | "provider-alias" | "none";
export type PolicyOutcome = "breach" | "warning" | "notice" | "none";

export type EvidenceLocation = {
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  commitOid?: string;
  blobOid?: string;
};

export type ResolutionTrace = {
  kind: "detector" | "constant" | "environment-fallback" | "policy-resolution";
  detail: string;
};

export type EvidenceFact = {
  evidenceId: string;
  origin: EvidenceOrigin;
  kind: EvidenceKind;
  confidence: EvidenceConfidence;
  scope: EvidenceScope;
  environment: EvidenceEnvironment;
  detectorRuleId: string;
  detectorManifestVersion: string;
  rawValue: string;
  modelId?: string;
  servingPlatform?: string;
  modelResolution: ModelResolution;
  selectorKind: ModelSelectorKind;
  platformResolution: PlatformResolution;
  policyEligible: boolean;
  locations: EvidenceLocation[];
  resolutionTrace: ResolutionTrace[];
  sourceId?: string;
  evidenceHealth?: EvidenceHealth;
  reason?: string;
  provenance?: string;
};

export type LifecycleFinding = {
  findingId: string;
  semanticKey: string;
  evidenceIds: string[];
  modelId: string;
  servingPlatform: string;
  lifecycleMatch: LifecycleMatch;
  lifecycleStatus: "deprecated" | "shutdown-scheduled" | "retired";
  announcementDate?: string;
  deprecationDate?: string;
  shutdownDate?: string;
  daysUntilShutdown: number | null;
  /** Present exactly when `deprecationDate` is. Signed, like `daysUntilShutdown`. */
  daysUntilDeprecation?: number;
  replacementModels: Array<{ modelId: string; servingPlatform?: string }>;
  sourceUrls: string[];
  feedConflict: boolean;
  outcome: PolicyOutcome;
  reasons: string[];
  scope: EvidenceScope;
  environment: EvidenceEnvironment;
  confidence: EvidenceConfidence;
  selectorKind: ModelSelectorKind;
  locations: EvidenceLocation[];
  suppressedBy?: string;
  delta?: "new" | "worsened" | "unchanged" | "resolved" | "comparison-unknown";
};

export type CoverageDiagnostic = {
  code: string;
  message: string;
  path?: string;
  severity: "notice" | "partial" | "failed";
};

export type Policy = {
  warnWithinDays: number;
  failWithinDays: number | null;
  allowPartial: boolean;
  usageEvidenceFiles: string[];
  assertions: AssertionClaim[];
  resolutions: ResolutionRule[];
  scopeRules: ScopeRule[];
  suppressions: SuppressionRule[];
};

export type AssertionClaim = {
  evidenceId: string;
  modelId: string;
  servingPlatform: string;
  scope: EvidenceScope;
  environment: EvidenceEnvironment;
  policyEligible: boolean;
  reason: string;
  provenance: string;
  assertedAt: string;
  reviewedAt: string;
  reviewAfter: string;
  expiresAt: string;
};

export type ResolutionRule = {
  resolutionId: string;
  match: {
    detectorRuleId: string;
    rawValue: string;
    paths: string[];
  };
  resolveTo: { modelId: string; servingPlatform: string };
  reason: string;
  reviewedAt: string;
  reviewAfter: string;
  expiresAt: string;
};

export type ScopeRule = {
  scopeRuleId: string;
  detectorRuleIds: string[];
  paths: string[];
  scope: EvidenceScope;
  environment: EvidenceEnvironment;
  reason: string;
};

export type SuppressionRule = {
  suppressionId: string;
  target:
    | { evidenceId: string }
    | {
        modelId: string;
        servingPlatform: string;
        detectorRuleIds: string[];
        paths: string[];
      };
  reason: string;
  createdAt: string;
  expiresAt: string;
};

export type PolicyInspection = {
  policy: Policy;
  present: boolean;
  valid: boolean;
  digest: string;
  diagnostics: CoverageDiagnostic[];
  rawAssertionIds: string[];
};

export type EvidenceSourceInspection = {
  path: string;
  digest: string;
  sourceId?: string;
  sourceKind?: "runtime-observation" | "deployment-snapshot" | "generated-declaration";
  sourceEnvironment?: EvidenceEnvironment;
  lineageIdentity?: string;
  sourceVersionTime?: string;
  freshnessBoundary?: string;
  expiresAt?: string;
  rawEvidenceIds: string[];
  present: boolean;
  valid: boolean;
  health: EvidenceHealth;
  partialCoverage: boolean;
  facts: EvidenceFact[];
  diagnostics: CoverageDiagnostic[];
};

export type Evaluation = {
  result: Exclude<Result, "unknown">;
  scanStatus: Exclude<ScanStatus, "failed">;
  evidence: EvidenceFact[];
  findings: LifecycleFinding[];
  unresolved: EvidenceFact[];
  diagnostics: CoverageDiagnostic[];
  evidenceHealth: EvidenceHealth;
};

export type EventSelection = {
  eventName: string;
  targetOid: string;
  targetKind:
    | "commit"
    | "synthetic-merge"
    | "synthetic-merge-uncompared"
    | "merge-group"
    | "raw-head-fallback";
  baseOid?: string;
  submittedHeadOid?: string;
  /** Actual parent order for a validated synthetic pull-request merge commit. */
  targetParentOids?: [string, string];
  comparisonRequested: boolean;
};

export type AssessmentCounts = {
  evidence: number;
  findings: number;
  blocking: number;
  advisory: number;
  notices: number;
  unresolved: number;
  byScope: Record<EvidenceScope, number>;
  byResolution: Record<ModelResolution, number>;
};

export type FeedIdentity = {
  sourceFeedSha256: string;
  normalizedFeedSha256: string;
  activeRecordsSha256: string;
  feedAdapterManifestSha256: string;
  /** Upstream production instant, or empty when the feed could not be loaded. */
  generatedAt: string;
  /** Whole days between `generatedAt` and evaluation; null when the feed is unavailable. */
  ageDays: number | null;
};

export type AssessmentReport = {
  schemaVersion: 3;
  evaluatedAt: string;
  result: Result;
  baselineResult?: Result;
  targetResult?: Result;
  scanStatus: ScanStatus;
  baselineScanStatus?: ScanStatus;
  targetScanStatus?: ScanStatus;
  comparisonStatus: ComparisonStatus;
  exitReason: ExitReason;
  targetKind: EventSelection["targetKind"];
  event: EventSelection;
  evidenceHealth: EvidenceHealth;
  evidenceSources: Array<{
    id: string;
    kind: EvidenceOrigin | "repository";
    health: EvidenceHealth;
  }>;
  evidenceFacts: EvidenceFact[];
  lifecycleFindings: LifecycleFinding[];
  unresolvedReferences: EvidenceFact[];
  diagnostics: CoverageDiagnostic[];
  counts: AssessmentCounts;
  policyDiff: string[];
  feed: FeedIdentity;
  detectorManifestSha256: string;
  scanFingerprint: string;
  alertFingerprint: string;
  outputTruncated: boolean;
  notificationStatus: NotificationStatus;
  notificationReason: string;
  reportPath: string;
};

export type ActionInputs = {
  warnWithinDays: number | null;
  failWithinDays: number | null;
  allowPartial: boolean | null;
  /** Upstream-freshness horizon in days; null disables the staleness guard entirely. */
  maxFeedAgeDays: number | null;
  slackWebhook?: string;
  notificationFailureMode: "fail" | "warn";
};
