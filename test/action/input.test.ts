import { describe, expect, test } from "bun:test";
import { parseActionInputs } from "../../src/action/input.ts";

describe("v3 action inputs", () => {
  test("preserves omitted policy inputs instead of materializing defaults", () => {
    expect(parseActionInputs({})).toEqual({
      warnWithinDays: null,
      failWithinDays: null,
      allowPartial: null,
      notificationFailureMode: "fail",
    });
  });

  test("parses only the v3 surface", () => {
    expect(
      parseActionInputs({
        "INPUT_WARN-WITHIN-DAYS": "240",
        "INPUT_FAIL-WITHIN-DAYS": "30",
        "INPUT_ALLOW-PARTIAL": "true",
        "INPUT_NOTIFICATION-FAILURE-MODE": "warn",
      }),
    ).toEqual({
      warnWithinDays: 240,
      failWithinDays: 30,
      allowPartial: true,
      notificationFailureMode: "warn",
    });
  });
});
