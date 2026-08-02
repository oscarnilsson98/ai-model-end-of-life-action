function assertEqual(name: string, actual: string | undefined, expected: string): void {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function assertSha256(name: string, actual: string | undefined): asserts actual is string {
  if (!actual || !/^[0-9a-f]{64}$/.test(actual)) {
    throw new Error(`${name}: expected a lowercase SHA-256, got ${JSON.stringify(actual)}.`);
  }
}

const scenario = Bun.argv[2];
switch (scenario) {
  case "success": {
    assertEqual("has-findings", Bun.env.HAS_FINDINGS, "true");
    assertEqual("finding-count", Bun.env.FINDING_COUNT, "2");
    assertEqual("has-breaches", Bun.env.HAS_BREACHES, "false");
    assertEqual("breach-count", Bun.env.BREACH_COUNT, "0");
    assertEqual("matched-model-count", Bun.env.MATCHED_MODEL_COUNT, "2");
    assertEqual("checked-model-count", Bun.env.CHECKED_MODEL_COUNT, "3");
    assertEqual("unmatched-model-count", Bun.env.UNMATCHED_MODEL_COUNT, "1");
    assertEqual("feed-record-count", Bun.env.FEED_RECORD_COUNT, "4");
    assertEqual("notification-sent", Bun.env.NOTIFICATION_SENT, "false");
    assertEqual("notification-reason", Bun.env.NOTIFICATION_REASON, "disabled");
    assertEqual("next-alert-fingerprint", Bun.env.NEXT_ALERT_FINGERPRINT, "");
    assertSha256("feed-sha256", Bun.env.FEED_SHA256);
    assertSha256("lifecycle-feed-sha256", Bun.env.LIFECYCLE_FEED_SHA256);
    assertSha256("inventory-sha256", Bun.env.INVENTORY_SHA256);
    assertSha256("alert-fingerprint", Bun.env.ALERT_FINGERPRINT);

    const findings = JSON.parse(Bun.env.FINDINGS ?? "null") as Array<{
      findingId?: unknown;
      id?: unknown;
      status?: unknown;
      shutdownDate?: unknown;
      daysUntilShutdown?: unknown;
    }>;
    const ids = findings.map((finding) => finding.id).sort();
    if (JSON.stringify(ids) !== JSON.stringify(["retired-fixture", "undated-fixture"])) {
      throw new Error(`Unexpected fixture findings: ${JSON.stringify(findings)}.`);
    }
    if (findings.some((finding) => !/^[0-9a-f]{64}$/.test(String(finding.findingId)))) {
      throw new Error(`Fixture findings lack stable IDs: ${JSON.stringify(findings)}.`);
    }
    const retired = findings.find((finding) => finding.id === "retired-fixture");
    const undated = findings.find((finding) => finding.id === "undated-fixture");
    if (
      retired?.status !== "shutdown-passed" ||
      typeof retired.daysUntilShutdown !== "number" ||
      retired.daysUntilShutdown > 0 ||
      undated?.status !== "date-unknown" ||
      undated.shutdownDate !== null ||
      undated.daysUntilShutdown !== null
    ) {
      throw new Error(`Unexpected lifecycle status output: ${JSON.stringify(findings)}.`);
    }

    const unmatched = JSON.parse(Bun.env.UNMATCHED_MODELS ?? "null") as Array<{
      id?: unknown;
      provider?: unknown;
    }>;
    if (
      unmatched.length !== 1 ||
      unmatched[0]?.id !== "missing-fixture" ||
      unmatched[0]?.provider !== "openai"
    ) {
      throw new Error(`Unexpected unmatched inventory output: ${JSON.stringify(unmatched)}.`);
    }

    const audit = JSON.parse(Bun.env.AUDIT_RECORD ?? "null") as Record<string, unknown>;
    if (
      audit.rawFeedSha256 !== Bun.env.FEED_SHA256 ||
      audit.lifecycleFeedSha256 !== Bun.env.LIFECYCLE_FEED_SHA256 ||
      audit.inventorySha256 !== Bun.env.INVENTORY_SHA256 ||
      audit.alertFingerprint !== Bun.env.ALERT_FINGERPRINT ||
      audit.feedRecordCount !== 4 ||
      audit.findingCount !== 2
    ) {
      throw new Error(`Unexpected audit record: ${JSON.stringify(audit)}.`);
    }
    break;
  }
  case "snapshot-discovery": {
    assertEqual(
      "feed-sha256",
      Bun.env.FEED_SHA256,
      "bb2ca01c6b30a384b3a495d34adba857cd528ba6348e4572ebd44afa1cc07e62",
    );
    assertEqual("discovered-model-count", Bun.env.DISCOVERED_MODEL_COUNT, "2");
    assertEqual("untracked-discovered-model-count", Bun.env.UNTRACKED_DISCOVERED_MODEL_COUNT, "1");
    assertEqual("discovery-match-count", Bun.env.DISCOVERY_MATCH_COUNT, "2");
    assertEqual("discovery-output-truncated", Bun.env.DISCOVERY_OUTPUT_TRUNCATED, "false");
    const discovered = JSON.parse(Bun.env.DISCOVERED_MODELS ?? "null") as Array<{
      id?: unknown;
      tracked?: unknown;
      locations?: Array<{ path?: unknown; line?: unknown; column?: unknown }>;
    }>;
    if (
      discovered.length !== 2 ||
      discovered.find((model) => model.id === "retired-fixture")?.tracked !== true ||
      discovered.find((model) => model.id === "other-provider-fixture")?.tracked !== false ||
      discovered.some(
        (model) => model.locations?.[0]?.path !== ".github/fixtures/source-usage.txt",
      )
    ) {
      throw new Error(`Unexpected discovery output: ${JSON.stringify(discovered)}.`);
    }
    break;
  }
  case "narrow-window":
    assertEqual("has-findings", Bun.env.HAS_FINDINGS, "false");
    assertEqual("finding-count", Bun.env.FINDING_COUNT, "0");
    break;
  case "failure-gate":
    assertEqual("failure-gate outcome", Bun.env.STEP_OUTCOME, "failure");
    assertEqual("has-breaches", Bun.env.HAS_BREACHES, "true");
    assertEqual("breach-count", Bun.env.BREACH_COUNT, "1");
    break;
  case "coverage-gate":
    assertEqual("coverage-gate outcome", Bun.env.STEP_OUTCOME, "failure");
    assertEqual("has-findings", Bun.env.HAS_FINDINGS, "false");
    assertEqual("has-breaches", Bun.env.HAS_BREACHES, "true");
    assertEqual("breach-count", Bun.env.BREACH_COUNT, "1");
    assertEqual("unmatched-model-count", Bun.env.UNMATCHED_MODEL_COUNT, "1");
    break;
  case "stale-feed":
    assertEqual("stale-feed outcome", Bun.env.STEP_OUTCOME, "failure");
    break;
  default:
    throw new Error(`Unknown E2E assertion scenario: ${scenario ?? "<missing>"}.`);
}
