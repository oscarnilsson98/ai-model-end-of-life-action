export type NotificationMode = "always" | "on-change";

export type NotificationReason =
  | "disabled"
  | "no-alerts"
  | "always"
  | "initial"
  | "changed"
  | "unchanged"
  | "resolved"
  | "error";

export type NotificationDecision = {
  shouldNotify: boolean;
  reason: NotificationReason;
};

export function parseNotificationMode(raw: string | undefined): NotificationMode {
  const normalized = raw?.trim().toLowerCase() || "always";
  if (normalized === "always" || normalized === "on-change") return normalized;
  throw new Error("Invalid notification-mode: expected `always` or `on-change`.");
}

export function parsePreviousAlertFingerprint(raw: string | undefined): string | null {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized === "") return null;
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(
      "Invalid previous-alert-fingerprint: expected an empty value or 64 hexadecimal characters.",
    );
  }
  return normalized;
}

/** Decide Slack delivery without pretending the action owns durable cross-run state. */
export function decideNotification(input: {
  mode: NotificationMode;
  previousFingerprint: string | null;
  currentFingerprint: string;
  alertCount: number;
}): NotificationDecision {
  if (input.mode === "always") {
    return input.alertCount > 0
      ? { shouldNotify: true, reason: "always" }
      : { shouldNotify: false, reason: "no-alerts" };
  }

  if (input.alertCount === 0) {
    return input.previousFingerprint !== null &&
      input.previousFingerprint !== input.currentFingerprint
      ? { shouldNotify: true, reason: "resolved" }
      : { shouldNotify: false, reason: "no-alerts" };
  }
  if (input.previousFingerprint === input.currentFingerprint) {
    return { shouldNotify: false, reason: "unchanged" };
  }
  return {
    shouldNotify: true,
    reason: input.previousFingerprint === null ? "initial" : "changed",
  };
}
