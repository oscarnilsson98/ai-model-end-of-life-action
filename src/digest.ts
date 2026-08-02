import { createHash } from "node:crypto";
import { normalizeProvider } from "./input.ts";
import type { DeprecationRecord, Finding, InputModel } from "./types.ts";

const INVENTORY_DOMAIN = "ai-model-eol/inventory/v1";
const LIFECYCLE_FEED_DOMAIN = "ai-model-eol/lifecycle-feed/v1";
const FINDING_ID_DOMAIN = "ai-model-eol/finding-id/v1";
const ALERT_DOMAIN = "ai-model-eol/alert/v1";

type InventoryEntry = readonly [id: string, provider: string | null];

type LifecycleFeedEntry = readonly [
  provider: string,
  modelId: string,
  shutdownDate: string | null,
  deprecationDate: string | null,
  announcementDate: string | null,
  replacementModels: readonly string[],
  url: string | null,
];

type AlertFindingEntry = readonly [
  findingId: string,
  status: Finding["status"],
  deprecationDate: string | null,
  announcementDate: string | null,
  replacementModels: readonly string[],
  url: string | null,
  context: string | null,
  breaching: boolean,
];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSet<T>(values: readonly T[]): T[] {
  const serialized = new Map<string, T>();
  for (const value of values) serialized.set(JSON.stringify(value), value);
  return [...serialized]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, value]) => value);
}

function digestCanonical(domain: string, value: unknown): string {
  return createHash("sha256").update(JSON.stringify([domain, value]), "utf8").digest("hex");
}

function inventoryEntries(models: readonly InputModel[]): InventoryEntry[] {
  return canonicalSet(
    models.map(
      (model): InventoryEntry => [
        model.id,
        model.provider === undefined ? null : normalizeProvider(model.provider),
      ],
    ),
  );
}

function lifecycleFeedEntries(feed: readonly DeprecationRecord[]): LifecycleFeedEntry[] {
  return canonicalSet(
    feed.map(
      (record): LifecycleFeedEntry => [
        normalizeProvider(record.provider),
        record.model_id,
        record.shutdown_date ?? null,
        record.deprecation_date ?? null,
        record.announcement_date ?? null,
        [...(record.replacement_models ?? [])],
        record.url ?? null,
      ],
    ),
  );
}

function findingIdentity(finding: Pick<Finding, "id" | "provider" | "shutdownDate">): readonly [
  provider: string,
  modelId: string,
  shutdownDate: string | null,
] {
  return [normalizeProvider(finding.provider), finding.id, finding.shutdownDate];
}

/** Standard SHA-256 of exact bytes, suitable for comparison with external checksum tools. */
export function rawBytesSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Order-independent digest of exact model IDs and canonical serving-platform aliases. */
export function canonicalInventorySha256(models: readonly InputModel[]): string {
  return digestCanonical(INVENTORY_DOMAIN, inventoryEntries(models));
}

/**
 * Order-independent digest of lifecycle fields used by the action.
 * Observation timestamps and verbose context are deliberately excluded.
 */
export function canonicalLifecycleFeedSha256(
  feed: readonly DeprecationRecord[],
): string {
  return digestCanonical(LIFECYCLE_FEED_DOMAIN, lifecycleFeedEntries(feed));
}

/** Stable identity for one provider/model/shutdown-date tuple; undated findings use JSON null. */
export function stableFindingId(
  finding: Pick<Finding, "id" | "provider" | "shutdownDate">,
): string {
  return digestCanonical(FINDING_ID_DOMAIN, findingIdentity(finding));
}

export type AlertFingerprintInput = {
  findings: readonly Finding[];
  breaching: readonly Finding[];
  unmatchedBreaching: readonly InputModel[];
};

/**
 * Stable policy-signal fingerprint for alert deduplication by an external state store.
 * Daily countdown values are excluded; status, content, source, and breach transitions remain meaningful.
 */
export function stableAlertFingerprint(input: AlertFingerprintInput): string {
  const breachingIds = new Set(input.breaching.map(stableFindingId));
  const findings = canonicalSet(
    input.findings.map(
      (finding): AlertFindingEntry => [
        stableFindingId(finding),
        finding.status,
        finding.deprecationDate ?? null,
        finding.announcementDate ?? null,
        [...finding.replacementModels],
        finding.url ?? null,
        finding.context ?? null,
        breachingIds.has(stableFindingId(finding)),
      ],
    ),
  );
  return digestCanonical(ALERT_DOMAIN, [findings, inventoryEntries(input.unmatchedBreaching)]);
}

export type AuditRecordInput = AlertFingerprintInput & {
  inventory: readonly InputModel[];
  feed: readonly DeprecationRecord[];
  rawFeedBytes?: Uint8Array;
};

export type AuditRecord = {
  schemaVersion: 1;
  inventorySha256: string;
  lifecycleFeedSha256: string;
  alertFingerprint: string;
  checkedModelCount: number;
  feedRecordCount: number;
  findingCount: number;
  breachCount: number;
  unmatchedBreachCount: number;
  rawFeedSha256?: string;
};

/** Build a compact record without clocks or other nondeterministic process metadata. */
export function buildAuditRecord(input: AuditRecordInput): AuditRecord {
  const record: AuditRecord = {
    schemaVersion: 1,
    inventorySha256: canonicalInventorySha256(input.inventory),
    lifecycleFeedSha256: canonicalLifecycleFeedSha256(input.feed),
    alertFingerprint: stableAlertFingerprint(input),
    checkedModelCount: input.inventory.length,
    feedRecordCount: input.feed.length,
    findingCount: input.findings.length,
    breachCount: input.breaching.length + input.unmatchedBreaching.length,
    unmatchedBreachCount: input.unmatchedBreaching.length,
  };
  if (input.rawFeedBytes !== undefined) {
    record.rawFeedSha256 = rawBytesSha256(input.rawFeedBytes);
  }
  return record;
}
