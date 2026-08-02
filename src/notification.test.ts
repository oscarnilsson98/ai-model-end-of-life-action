import { describe, expect, test } from "bun:test";
import {
  decideNotification,
  parseNotificationMode,
  parsePreviousAlertFingerprint,
} from "./notification.ts";

const CURRENT = "a".repeat(64);
const PREVIOUS = "b".repeat(64);

describe("notification fingerprint handoff", () => {
  test("validates the mode and previous fingerprint", () => {
    expect(parseNotificationMode(undefined)).toBe("always");
    expect(parseNotificationMode(" ON-CHANGE ")).toBe("on-change");
    expect(() => parseNotificationMode("sometimes")).toThrow("notification-mode");
    expect(parsePreviousAlertFingerprint(undefined)).toBeNull();
    expect(parsePreviousAlertFingerprint(PREVIOUS.toUpperCase())).toBe(PREVIOUS);
    expect(() => parsePreviousAlertFingerprint("abc")).toThrow(
      "previous-alert-fingerprint",
    );
  });

  test("keeps snapshot mode compatible", () => {
    expect(
      decideNotification({
        mode: "always",
        previousFingerprint: CURRENT,
        currentFingerprint: CURRENT,
        alertCount: 2,
      }),
    ).toEqual({ shouldNotify: true, reason: "always" });
    expect(
      decideNotification({
        mode: "always",
        previousFingerprint: null,
        currentFingerprint: CURRENT,
        alertCount: 0,
      }),
    ).toEqual({ shouldNotify: false, reason: "no-alerts" });
  });

  test("notifies only initial, changed, and resolved states in on-change mode", () => {
    expect(
      decideNotification({
        mode: "on-change",
        previousFingerprint: null,
        currentFingerprint: CURRENT,
        alertCount: 1,
      }),
    ).toEqual({ shouldNotify: true, reason: "initial" });
    expect(
      decideNotification({
        mode: "on-change",
        previousFingerprint: CURRENT,
        currentFingerprint: CURRENT,
        alertCount: 1,
      }),
    ).toEqual({ shouldNotify: false, reason: "unchanged" });
    expect(
      decideNotification({
        mode: "on-change",
        previousFingerprint: PREVIOUS,
        currentFingerprint: CURRENT,
        alertCount: 1,
      }),
    ).toEqual({ shouldNotify: true, reason: "changed" });
    expect(
      decideNotification({
        mode: "on-change",
        previousFingerprint: PREVIOUS,
        currentFingerprint: CURRENT,
        alertCount: 0,
      }),
    ).toEqual({ shouldNotify: true, reason: "resolved" });
    expect(
      decideNotification({
        mode: "on-change",
        previousFingerprint: CURRENT,
        currentFingerprint: CURRENT,
        alertCount: 0,
      }),
    ).toEqual({ shouldNotify: false, reason: "no-alerts" });
  });
});
