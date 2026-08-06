import {
  getV3ModelPair,
  type ActiveLifecycleSignature,
  type IndexedModelPair,
  type V3FeedIndex,
} from "../lifecycle/feed.ts";
import { DETECTOR_RULES } from "../detection/manifest.ts";
import { matchRepositoryPattern, POLICY_PATH } from "./policy.ts";
import {
  canonicalSha256,
  combineEvidenceHealth,
  compareOutcome,
  daysUntilEarliestLifecycleDate,
  earliestLifecycleDays,
  resultFromFindings,
  strongerOutcome,
} from "../shared/status.ts";
import type {
  CoverageDiagnostic,
  Evaluation,
  EvidenceConfidence,
  EvidenceEnvironment,
  EvidenceFact,
  EvidenceHealth,
  EvidenceScope,
  LifecycleFinding,
  Policy,
  PolicyOutcome,
  ResolutionRule,
  ScanStatus,
  SuppressionRule,
} from "../shared/types.ts";

/**
 * Rules a repository's own trusted resolution can lift to policy eligibility:
 * every semantic source and deployment rule, and nothing inherited or lexical.
 * Derived from the manifest rather than restated, because a rule missing from a
 * hand-kept copy fails open silently — the user's resolution validates, then never
 * blocks. `DIRECT_POLICY_RULES` in the detector derives from the same list.
 */
const TRUSTED_RESOLUTION_POLICY_RULES = new Set(
  DETECTOR_RULES
    .filter((rule) => rule.ruleId.startsWith("source.") || rule.ruleId.startsWith("deploy."))
    .map((rule) => rule.ruleId),
);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function calendarDaysUntil(date: string, now: number): number {
  const evaluated = new Date(now);
  const evaluatedDay = Date.UTC(
    evaluated.getUTCFullYear(),
    evaluated.getUTCMonth(),
    evaluated.getUTCDate(),
  );
  const [year, month, day] = date.split("-").map(Number);
  return Math.round((Date.UTC(year as number, (month as number) - 1, day as number) - evaluatedDay) / 86_400_000);
}

function currentResolution(rule: ResolutionRule, now: number): "current" | "review-overdue" | "expired" {
  if (now >= Date.parse(rule.expiresAt)) return "expired";
  if (now >= Date.parse(rule.reviewAfter)) return "review-overdue";
  return "current";
}

function pathsForFact(fact: EvidenceFact): string[] {
  return [...new Set(fact.locations.map((location) => location.path))];
}

function resolutionMatches(rule: ResolutionRule, fact: EvidenceFact): boolean {
  return (
    rule.match.detectorRuleId === fact.detectorRuleId &&
    rule.match.rawValue === fact.rawValue &&
    pathsForFact(fact).some((path) =>
      rule.match.paths.some((pattern) => matchRepositoryPattern(pattern, path)),
    )
  );
}

function applyResolutions(
  evidence: readonly EvidenceFact[],
  policy: Policy,
  now: number,
): { evidence: EvidenceFact[]; diagnostics: CoverageDiagnostic[]; scanStatus: ScanStatus } {
  const diagnostics: CoverageDiagnostic[] = [];
  let scanStatus: ScanStatus = "complete";
  for (const resolution of policy.resolutions) {
    const health = currentResolution(resolution, now);
    if (health !== "current") {
      scanStatus = "partial";
      diagnostics.push({
        code: `resolution-${health}`,
        message: `Resolution ${resolution.resolutionId} is ${health} and was not applied.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "partial",
      });
    }
  }
  const resolvedEvidence = evidence.map((original): EvidenceFact => {
    let fact: EvidenceFact = {
      ...original,
      locations: [...original.locations],
      resolutionTrace: [...original.resolutionTrace],
    };
    const matches = policy.resolutions.filter(
      (rule) => currentResolution(rule, now) === "current" && resolutionMatches(rule, fact),
    );
    const pairs = new Map(
      matches.map((rule) => [
        JSON.stringify([rule.resolveTo.servingPlatform, rule.resolveTo.modelId]),
        rule,
      ]),
    );
    if (pairs.size === 1) {
      const rule = pairs.values().next().value as ResolutionRule | undefined;
      if (rule !== undefined) {
        fact = {
          ...fact,
          modelId: rule.resolveTo.modelId,
          servingPlatform: rule.resolveTo.servingPlatform,
          modelResolution: "resolved",
          selectorKind: "model-id",
          platformResolution: "resolved",
          policyEligible:
            fact.origin === "repository" &&
            TRUSTED_RESOLUTION_POLICY_RULES.has(fact.detectorRuleId) &&
            fact.confidence === "high" &&
            fact.scope !== "test" &&
            fact.scope !== "example" &&
            fact.scope !== "documentation",
          resolutionTrace: [
            ...fact.resolutionTrace,
            { kind: "policy-resolution", detail: rule.resolutionId },
          ],
        };
      }
    } else if (pairs.size > 1) {
      fact = {
        ...fact,
        modelResolution: "unresolved",
        platformResolution: "ambiguous",
        policyEligible: false,
        resolutionTrace: [
          ...fact.resolutionTrace,
          { kind: "policy-resolution", detail: "conflicting trusted resolutions" },
        ],
      };
      diagnostics.push({
        code: "conflicting-resolutions",
        message: `Conflicting current resolutions match evidence ${fact.evidenceId}.`,
        ...(fact.locations[0]?.path === undefined ? {} : { path: fact.locations[0].path }),
        severity: "partial",
      });
      scanStatus = "partial";
    }
    return fact;
  });
  for (const resolution of policy.resolutions) {
    if (!evidence.some((fact) => resolutionMatches(resolution, fact))) {
      diagnostics.push({
        code: "unused-resolution",
        message: `Resolution ${resolution.resolutionId} did not match evidence in this tree.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "notice",
      });
    }
  }
  return { evidence: resolvedEvidence, diagnostics, scanStatus };
}

const PROTECTED_SCOPES = new Set<EvidenceScope>(["documentation", "test", "example"]);
const REPOSITORY_BLOCKING_KINDS = new Set<EvidenceFact["kind"]>([
  "sdk-argument",
  "structured-config",
  "deployment-resource",
]);

function originAndKindCanBlock(fact: EvidenceFact): boolean {
  if (fact.origin === "repository") return REPOSITORY_BLOCKING_KINDS.has(fact.kind);
  if (fact.origin === "manual-claim") return fact.kind === "manual-claim";
  return fact.kind === "runtime-observation" || fact.kind === "deployment-snapshot";
}

function scopeRuleStrength(scope: EvidenceScope, environment: EvidenceEnvironment): number {
  const scopeRank: Record<EvidenceScope, number> = {
    documentation: 0,
    example: 1,
    test: 2,
    unknown: 3,
    application: 4,
    deployment: 5,
  };
  const environmentRank: Record<EvidenceEnvironment, number> = {
    unknown: 0,
    test: 1,
    development: 2,
    staging: 3,
    production: 4,
  };
  return scopeRank[scope] * 10 + environmentRank[environment];
}

function applyScopeRules(
  evidence: readonly EvidenceFact[],
  policy: Policy,
  diagnostics: CoverageDiagnostic[],
): EvidenceFact[] {
  return evidence.map((original): EvidenceFact => {
    const applicable: Array<{ scope: EvidenceScope; environment: EvidenceEnvironment }> = [];
    for (const rule of policy.scopeRules) {
      if (!rule.detectorRuleIds.includes(original.detectorRuleId)) continue;
      if (
        !pathsForFact(original).some((path) =>
          rule.paths.some((pattern) => matchRepositoryPattern(pattern, path)),
        )
      ) {
        continue;
      }
      if (PROTECTED_SCOPES.has(original.scope) && !PROTECTED_SCOPES.has(rule.scope)) {
        diagnostics.push({
          code: "protected-scope-promotion-ignored",
          message: `Scope rule ${rule.scopeRuleId} cannot promote ${original.scope} evidence.`,
          ...(original.locations[0]?.path === undefined
            ? {}
            : { path: original.locations[0].path }),
          severity: "notice",
        });
        continue;
      }
      applicable.push({ scope: rule.scope, environment: rule.environment });
    }
    if (applicable.length === 0) return original;
    applicable.sort((left, right) => {
      const strength = scopeRuleStrength(right.scope, right.environment) -
        scopeRuleStrength(left.scope, left.environment);
      return strength || compareText(left.scope, right.scope) ||
        compareText(left.environment, right.environment);
    });
    const selected = applicable[0] as {
      scope: EvidenceScope;
      environment: EvidenceEnvironment;
    };
    return { ...original, ...selected };
  });
}

function suppressionMatches(
  suppression: SuppressionRule,
  fact: EvidenceFact,
  modelId: string,
  servingPlatform: string,
): boolean {
  const target = suppression.target;
  if ("evidenceId" in target) {
    return target.evidenceId === fact.evidenceId;
  }
  return (
    target.modelId === modelId &&
    target.servingPlatform === servingPlatform &&
    target.detectorRuleIds.includes(fact.detectorRuleId) &&
    pathsForFact(fact).some((path) =>
      target.paths.some((pattern) => matchRepositoryPattern(pattern, path)),
    )
  );
}

function dayPhrase(subject: string, days: number): string {
  if (days < 0) return `${subject} was ${Math.abs(days)} UTC calendar day(s) ago`;
  if (days === 0) return `${subject} is today`;
  return `${subject} is ${days} UTC calendar day(s) away`;
}

function horizonReason(
  daysUntilShutdown: number | null,
  daysUntilDeprecation: number | null,
): string {
  if (daysUntilShutdown === null) {
    return daysUntilDeprecation === null
      ? "The joined lifecycle record has no published shutdown date."
      : `The joined lifecycle record has no published shutdown date; ${dayPhrase("deprecation", daysUntilDeprecation)}.`;
  }
  if (daysUntilDeprecation === null || daysUntilDeprecation >= daysUntilShutdown) {
    return `${dayPhrase("Shutdown", daysUntilShutdown)}.`;
  }
  return `${dayPhrase("Deprecation", daysUntilDeprecation)}; ${dayPhrase("shutdown", daysUntilShutdown)}.`;
}

function policyOutcome(input: {
  fact: EvidenceFact;
  pair: IndexedModelPair;
  lifecycle: ActiveLifecycleSignature;
  policy: Policy;
  now: number;
  exactPlatform: boolean;
}): {
  outcome: PolicyOutcome;
  daysUntilShutdown: number | null;
  daysUntilDeprecation: number | null;
  reasons: string[];
} {
  const { fact, pair, lifecycle, policy, exactPlatform } = input;
  const daysUntilShutdown =
    lifecycle.shutdownDate === null ? null : calendarDaysUntil(lifecycle.shutdownDate, input.now);
  const daysUntilDeprecation =
    lifecycle.deprecationDate === null
      ? null
      : calendarDaysUntil(lifecycle.deprecationDate, input.now);
  const reasons: string[] = [];
  const scopeEligible = fact.scope === "application" || fact.scope === "deployment";
  const protectedOrUnknown =
    fact.scope === "documentation" ||
    fact.scope === "test" ||
    fact.scope === "example" ||
    fact.scope === "unknown";
  const daysUntilLifecycle = daysUntilEarliestLifecycleDate(
    daysUntilShutdown,
    daysUntilDeprecation,
  );
  const insideWarning =
    daysUntilLifecycle === null || daysUntilLifecycle <= policy.warnWithinDays;
  let outcome: PolicyOutcome = "none";
  if (insideWarning) {
    if (fact.kind === "lexical") {
      outcome = scopeEligible ? "warning" : "notice";
      reasons.push(
        scopeEligible
          ? "Exact typed-feed ID appears in application/deployment text; lexical evidence cannot block."
          : "Exact typed-feed ID appears only in protected or unknown-scope text.",
      );
    } else if (scopeEligible || fact.origin !== "repository") {
      outcome = "warning";
      reasons.push(horizonReason(daysUntilShutdown, daysUntilDeprecation));
    } else if (protectedOrUnknown) {
      outcome = "notice";
      reasons.push("Evidence is outside an actionable application/deployment scope.");
    }
  } else {
    outcome = "notice";
    reasons.push("Lifecycle date is outside the warning horizon.");
  }
  if (pair.conflict) {
    if (outcome === "notice" || outcome === "none") outcome = "warning";
    reasons.push("The feed has conflicting active lifecycle signatures for this exact pair.");
  }
  // Enforcement deliberately stays keyed to the shutdown date. The warning horizon may
  // open early on a deprecation, but failing a job is the irreversible direction and
  // `failWithinDays` is contracted against the date the model stops being served.
  const breachEligible =
    policy.failWithinDays !== null &&
    daysUntilShutdown !== null &&
    daysUntilShutdown <= policy.failWithinDays &&
    originAndKindCanBlock(fact) &&
    fact.policyEligible &&
    fact.confidence === "high" &&
    (fact.scope === "deployment" ||
      (fact.scope === "application" && fact.environment === "production")) &&
    fact.modelResolution === "resolved" &&
    fact.platformResolution === "resolved" &&
    fact.selectorKind === "model-id" &&
    exactPlatform &&
    pair.blockingJoinEligible &&
    !pair.conflict &&
    (fact.evidenceHealth === undefined || fact.evidenceHealth === "current");
  if (breachEligible) {
    outcome = "breach";
    reasons.push(`Definite evidence breaches failWithinDays=${policy.failWithinDays}.`);
  }
  return { outcome, daysUntilShutdown, daysUntilDeprecation, reasons };
}

function strongestScope(left: EvidenceScope, right: EvidenceScope): EvidenceScope {
  const rank: Record<EvidenceScope, number> = {
    documentation: 0,
    test: 0,
    example: 0,
    unknown: 1,
    application: 2,
    deployment: 3,
  };
  return rank[left] >= rank[right] ? left : right;
}

function strongestEnvironment(
  left: EvidenceEnvironment,
  right: EvidenceEnvironment,
): EvidenceEnvironment {
  const rank: Record<EvidenceEnvironment, number> = {
    unknown: 0,
    test: 1,
    development: 2,
    staging: 3,
    production: 4,
  };
  return rank[left] >= rank[right] ? left : right;
}

function strongestConfidence(
  left: EvidenceConfidence,
  right: EvidenceConfidence,
): EvidenceConfidence {
  const rank: Record<EvidenceConfidence, number> = { low: 0, medium: 1, high: 2 };
  return rank[left] >= rank[right] ? left : right;
}

function compareLocation(
  left: LifecycleFinding["locations"][number],
  right: LifecycleFinding["locations"][number],
): number {
  return (
    compareText(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    (left.endLine ?? 0) - (right.endLine ?? 0) ||
    (left.endColumn ?? 0) - (right.endColumn ?? 0)
  );
}

function lifecycleFinding(
  fact: EvidenceFact,
  pair: IndexedModelPair,
  lifecycle: ActiveLifecycleSignature,
  policy: Policy,
  now: number,
  exactPlatform: boolean,
): LifecycleFinding {
  const evaluated = policyOutcome({ fact, pair, lifecycle, policy, now, exactPlatform });
  const semanticKey = JSON.stringify([
    pair.servingPlatform,
    pair.modelId,
    lifecycle.signatureIdentity,
  ]);
  return {
    findingId: canonicalSha256("ai-model-eol/lifecycle-finding/v3", semanticKey),
    semanticKey,
    evidenceIds: [fact.evidenceId],
    modelId: pair.modelId,
    servingPlatform: pair.servingPlatform,
    servingPlatforms: [pair.servingPlatform],
    lifecycleMatch: "exact",
    lifecycleStatus: lifecycle.lifecycleStatus,
    ...(lifecycle.announcementDate === null ? {} : { announcementDate: lifecycle.announcementDate }),
    ...(lifecycle.deprecationDate === null ? {} : { deprecationDate: lifecycle.deprecationDate }),
    ...(lifecycle.shutdownDate === null ? {} : { shutdownDate: lifecycle.shutdownDate }),
    daysUntilShutdown: evaluated.daysUntilShutdown,
    ...(evaluated.daysUntilDeprecation === null
      ? {}
      : { daysUntilDeprecation: evaluated.daysUntilDeprecation }),
    replacementModels: lifecycle.provenance.flatMap((entry) => [...entry.replacementModels]),
    sourceUrls: [...lifecycle.primarySourceUrls],
    feedConflict: pair.conflict,
    outcome: evaluated.outcome,
    reasons: evaluated.reasons,
    scope: fact.scope,
    environment: fact.environment,
    confidence: fact.confidence,
    selectorKind: fact.selectorKind,
    locations: [...fact.locations],
  };
}

type ReplacementModel = LifecycleFinding["replacementModels"][number];

function mergeReplacementModels(
  replacements: readonly ReplacementModel[],
): ReplacementModel[] {
  return [
    ...new Map(
      replacements.map((replacement) => [
        JSON.stringify([replacement.servingPlatform ?? null, replacement.modelId]),
        replacement,
      ]),
    ).values(),
  ].sort((left, right) =>
    compareText(left.servingPlatform ?? "", right.servingPlatform ?? "") ||
    compareText(left.modelId, right.modelId)
  );
}

/**
 * A serving platform the evidence itself established. A lexical hit never
 * establishes one: its platform is inferred from the feed listing exactly one
 * platform for that model ID, which is a property of the feed, not of the code.
 */
function platformIsProven(fact: EvidenceFact): boolean {
  return fact.platformResolution === "resolved" && fact.kind !== "lexical";
}

/**
 * Strongest outcome first, then the nearest deadline. Urgency is measured by the
 * date the warning horizon measured — the earliest of deprecation and shutdown —
 * so a candidate already past its deprecation date is not buried under one whose
 * shutdown merely happens to be sooner. A record with no published shutdown date
 * has no measurable end and orders last.
 */
function compareAmbiguousCandidate(left: LifecycleFinding, right: LifecycleFinding): number {
  const leftDays = earliestLifecycleDays(left);
  const rightDays = earliestLifecycleDays(right);
  return (
    compareOutcome(right.outcome, left.outcome) ||
    (leftDays === null ? 1 : 0) - (rightDays === null ? 1 : 0) ||
    (leftDays ?? 0) - (rightDays ?? 0) ||
    compareText(left.servingPlatform, right.servingPlatform) ||
    compareText(left.semanticKey, right.semanticKey)
  );
}

/**
 * One unproven-platform occurrence is one risk, not one risk per feed provider
 * that happens to publish the same model ID. Collapse the candidates into a
 * single finding that reports every candidate platform and the most severe of
 * their lifecycle records, so alert volume follows evidence, not feed breadth.
 */
function collapseAmbiguousCandidates(
  candidates: readonly LifecycleFinding[],
  restrictedTo: readonly string[],
): LifecycleFinding {
  const ordered = [...candidates].sort(compareAmbiguousCandidate);
  const representative = ordered[0] as LifecycleFinding;
  const servingPlatforms = [
    ...new Set(ordered.map((candidate) => candidate.servingPlatform)),
  ].sort(compareText);
  const semanticKey = JSON.stringify([
    "ambiguous-platform",
    servingPlatforms,
    representative.semanticKey,
  ]);
  const reasons = [
    ...representative.reasons,
    servingPlatforms.length === 1
      ? "Serving platform is ambiguous; this match cannot block."
      : `Serving platform is ambiguous across ${servingPlatforms.join(
          ", ",
        )}; the most urgent of their lifecycle records is reported and this match cannot block.`,
    ...(restrictedTo.length === 0
      ? []
      : [`Matching was restricted to the declared serving platform(s): ${restrictedTo.join(", ")}.`]),
  ];
  return {
    ...representative,
    findingId: canonicalSha256("ai-model-eol/lifecycle-finding/v3", semanticKey),
    semanticKey,
    servingPlatforms,
    // The representative already holds the strongest outcome; recombining keeps
    // severity independent of the ordering rule.
    outcome: ordered.reduce<PolicyOutcome>(
      (strongest, candidate) => strongerOutcome(strongest, candidate.outcome),
      "none",
    ),
    feedConflict: ordered.some((candidate) => candidate.feedConflict),
    sourceUrls: [...new Set(ordered.flatMap((candidate) => candidate.sourceUrls))].sort(compareText),
    replacementModels: mergeReplacementModels(
      ordered.flatMap((candidate) => candidate.replacementModels),
    ),
    reasons,
  };
}

function joinFact(fact: EvidenceFact, feed: V3FeedIndex, policy: Policy, now: number): LifecycleFinding[] {
  if (fact.modelResolution !== "resolved" || fact.modelId === undefined) return [];
  let pairs: IndexedModelPair[] = [];
  let exactPlatform = false;
  if (fact.platformResolution === "resolved" && fact.servingPlatform !== undefined) {
    const pair = getV3ModelPair(feed, fact.servingPlatform, fact.modelId);
    if (pair !== undefined) pairs = [pair];
    exactPlatform = true;
  } else if (fact.platformResolution === "ambiguous") {
    pairs = feed.modelPairs.filter((pair) => pair.modelId === fact.modelId);
  }
  // A declared platform set narrows only the platforms the evidence left open,
  // so a declaration can never hide a finding that could have blocked.
  const restrictedTo =
    policy.servingPlatforms.length > 0 && !platformIsProven(fact) ? policy.servingPlatforms : [];
  if (restrictedTo.length > 0) {
    const declared = new Set(restrictedTo);
    pairs = pairs.filter((pair) => declared.has(pair.servingPlatform));
  }
  const findings: LifecycleFinding[] = [];
  for (const pair of pairs) {
    for (const lifecycle of pair.activeLifecycles) {
      const finding = lifecycleFinding(fact, pair, lifecycle, policy, now, exactPlatform);
      if (!exactPlatform && finding.outcome === "breach") finding.outcome = "warning";
      findings.push(finding);
    }
  }
  if (exactPlatform || findings.length === 0) return findings;
  return [collapseAmbiguousCandidates(findings, restrictedTo)];
}

function aggregateFindings(findings: readonly LifecycleFinding[]): LifecycleFinding[] {
  const byKey = new Map<string, LifecycleFinding>();
  for (const finding of [...findings].sort((left, right) =>
    compareText(left.evidenceIds[0] ?? "", right.evidenceIds[0] ?? "") ||
    compareText(left.semanticKey, right.semanticKey)
  )) {
    const existing = byKey.get(finding.semanticKey);
    if (existing === undefined) {
      byKey.set(finding.semanticKey, {
        ...finding,
        evidenceIds: [...finding.evidenceIds],
        servingPlatforms: [...finding.servingPlatforms],
        replacementModels: [...finding.replacementModels],
        sourceUrls: [...finding.sourceUrls],
        reasons: [...finding.reasons],
        locations: [...finding.locations],
      });
      continue;
    }
    existing.outcome = strongerOutcome(existing.outcome, finding.outcome);
    existing.servingPlatforms = [
      ...new Set([...existing.servingPlatforms, ...finding.servingPlatforms]),
    ].sort(compareText);
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText);
    existing.sourceUrls = [...new Set([...existing.sourceUrls, ...finding.sourceUrls])].sort(compareText);
    existing.reasons = [...new Set([...existing.reasons, ...finding.reasons])].sort(compareText);
    existing.locations = [...existing.locations, ...finding.locations]
      .sort(compareLocation)
      .slice(0, 20);
    existing.replacementModels = mergeReplacementModels([
      ...existing.replacementModels,
      ...finding.replacementModels,
    ]);
    existing.scope = strongestScope(existing.scope, finding.scope);
    existing.environment = strongestEnvironment(existing.environment, finding.environment);
    existing.confidence = strongestConfidence(existing.confidence, finding.confidence);
    if (existing.suppressedBy !== finding.suppressedBy) delete existing.suppressedBy;
  }
  return [...byKey.values()].sort((left, right) => {
    // Order by the deadline the horizon actually measures, so a model already past its
    // deprecation date is not buried under one with a nearer shutdown.
    const daysLeft = earliestLifecycleDays(left) ?? Number.MAX_SAFE_INTEGER;
    const daysRight = earliestLifecycleDays(right) ?? Number.MAX_SAFE_INTEGER;
    return daysLeft - daysRight || compareText(left.semanticKey, right.semanticKey);
  });
}

function applySuppressions(
  findings: LifecycleFinding[],
  evidenceById: ReadonlyMap<string, EvidenceFact>,
  policy: Policy,
  now: number,
  diagnostics: CoverageDiagnostic[],
): void {
  const current = policy.suppressions.filter((suppression) => {
    if (now < Date.parse(suppression.expiresAt)) return true;
    diagnostics.push({
      code: "suppression-expired",
      message: `Suppression ${suppression.suppressionId} expired and was not applied.`,
      path: ".github/ai-model-lifecycle.yml",
      severity: "notice",
    });
    return false;
  });
  for (const finding of findings) {
    for (const suppression of current) {
      const matched = finding.evidenceIds.some((evidenceId) => {
        const fact = evidenceById.get(evidenceId);
        return (
          fact !== undefined &&
          // A collapsed finding covers several candidate platforms; a suppression
          // naming any one of them still targets this finding.
          finding.servingPlatforms.some((servingPlatform) =>
            suppressionMatches(suppression, fact, finding.modelId, servingPlatform),
          )
        );
      });
      if (matched) {
        finding.suppressedBy = suppression.suppressionId;
        finding.outcome = "none";
        finding.reasons.push(`Suppressed by ${suppression.suppressionId}.`);
        break;
      }
    }
  }
}

function evidenceHealth(evidence: readonly EvidenceFact[]): EvidenceHealth {
  return combineEvidenceHealth(
    ...evidence.map((fact) => fact.evidenceHealth ?? "current"),
  );
}

export function evaluateEvidence(input: {
  evidence: readonly EvidenceFact[];
  feed: V3FeedIndex;
  policy: Policy;
  now: number;
  scanStatus: Exclude<ScanStatus, "failed">;
  diagnostics?: readonly CoverageDiagnostic[];
}): Evaluation {
  const diagnostics = [...(input.diagnostics ?? [])];
  if (input.policy.servingPlatforms.length > 0) {
    diagnostics.push({
      code: "declared-serving-platforms",
      message: `Lifecycle matching for lexical and platform-ambiguous evidence is restricted to the declared serving platform(s): ${input.policy.servingPlatforms.join(
        ", ",
      )}.`,
      path: POLICY_PATH,
      severity: "notice",
    });
  }
  const orderedEvidence = [...input.evidence].sort((left, right) =>
    compareText(left.evidenceId, right.evidenceId)
  );
  const resolved = applyResolutions(orderedEvidence, input.policy, input.now);
  diagnostics.push(...resolved.diagnostics);
  const scoped = applyScopeRules(resolved.evidence, input.policy, diagnostics);
  const unresolved = scoped.filter(
    (fact) =>
      fact.modelResolution !== "resolved" ||
      fact.platformResolution !== "resolved" ||
      fact.selectorKind !== "model-id" ||
      fact.modelId === undefined ||
      fact.servingPlatform === undefined,
  );
  const rawFindings = scoped.flatMap((fact) => joinFact(fact, input.feed, input.policy, input.now));
  const evidenceById = new Map(scoped.map((fact) => [fact.evidenceId, fact]));
  applySuppressions(rawFindings, evidenceById, input.policy, input.now, diagnostics);
  const findings = aggregateFindings(rawFindings);
  let result = resultFromFindings(findings);
  const health = evidenceHealth(scoped);
  // Unresolved evidence never elevates the result on its own. A runtime-computed selector
  // can be unresolvable by construction, so an elevation here would pin the repository to a
  // standing advisory that no change clears — and the Slack snapshot, which reconciles its
  // finding list against blocking and advisory counts, would have no finding to name for it.
  // Unresolved references stay in the counts, the job summary, the `unresolved-references`
  // output, and the snapshot's own unresolved section.
  if (result === "no-actionable-risk" && health !== "current") {
    result = "advisory";
  }
  return {
    result,
    scanStatus:
      input.scanStatus === "partial" || resolved.scanStatus === "partial" || health !== "current"
        ? "partial"
        : "complete",
    evidence: scoped,
    findings,
    unresolved,
    diagnostics,
    evidenceHealth: health,
  };
}
