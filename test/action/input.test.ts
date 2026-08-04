import { describe, expect, test } from "bun:test";
import { parseActionInputs } from "../../src/action/input.ts";

describe("v3 action inputs", () => {
  test("preserves omitted policy inputs instead of materializing defaults", () => {
    expect(parseActionInputs({})).toEqual({
      warnWithinDays: null,
      failWithinDays: null,
      allowPartial: null,
      maxFeedAgeDays: 30,
      notificationFailureMode: "fail",
    });
  });

  test("parses only the v3 surface", () => {
    expect(
      parseActionInputs({
        "INPUT_WARN-WITHIN-DAYS": "240",
        "INPUT_FAIL-WITHIN-DAYS": "30",
        "INPUT_ALLOW-PARTIAL": "true",
        "INPUT_MAX-FEED-AGE-DAYS": "7",
        "INPUT_NOTIFICATION-FAILURE-MODE": "warn",
      }),
    ).toEqual({
      warnWithinDays: 240,
      failWithinDays: 30,
      allowPartial: true,
      maxFeedAgeDays: 7,
      notificationFailureMode: "warn",
    });
  });

  test("keeps the feed-staleness guard armed unless it is explicitly emptied", () => {
    // Unlike the policy overrides, an absent input must not disable this guard: the
    // whole point is that a silent upstream freeze cannot read as a permanent all-clear.
    expect(parseActionInputs({}).maxFeedAgeDays).toBe(30);
    expect(parseActionInputs({ "INPUT_MAX-FEED-AGE-DAYS": "" }).maxFeedAgeDays).toBeNull();
    expect(parseActionInputs({ "INPUT_MAX-FEED-AGE-DAYS": "  " }).maxFeedAgeDays).toBeNull();
    expect(parseActionInputs({ "INPUT_MAX-FEED-AGE-DAYS": "0" }).maxFeedAgeDays).toBe(0);
  });

  test("rejects a malformed feed-age horizon", () => {
    for (const raw of ["-1", "1.5", "thirty", "36501"]) {
      expect(() => parseActionInputs({ "INPUT_MAX-FEED-AGE-DAYS": raw })).toThrow(
        /max-feed-age-days/,
      );
    }
  });
});
