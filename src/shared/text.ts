import type { Result, ScanStatus } from "./types.ts";

/** BIDI direction-control characters that can visually reorder rendered text. */
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
/** C0, DEL, and C1 controls. Keep these escaped so the source remains plain text. */
const CONTROL_OR_WHITESPACE_PATTERN = /[\u0000-\u001f\u007f-\u009f\s]+/g;

/**
 * Produce one bounded single-line rendering of untrusted text: strips BIDI
 * direction controls and C0/C1 control characters, collapses all whitespace
 * (including newlines), and truncates by Unicode code points — never splitting
 * a surrogate pair — appending an ellipsis when shortened.
 */
export function compact(value: string, maximum: number): string {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error("Text compaction maximum must be a positive safe integer.");
  }
  const singleLine = value
    .replace(BIDI_CONTROL_PATTERN, "")
    .replace(CONTROL_OR_WHITESPACE_PATTERN, " ")
    .trim();
  const codePoints = [...singleLine];
  if (codePoints.length <= maximum) return singleLine;
  return `${codePoints.slice(0, maximum - 1).join("")}…`;
}

/**
 * Render the serving platform(s) one finding covers. A collapsed unproven-platform
 * finding names every candidate so the reader is never told a single platform was
 * established when it was not.
 */
export function servingPlatformLabel(
  finding: Readonly<{ servingPlatform: string; servingPlatforms: readonly string[] }>,
): string {
  const platforms = finding.servingPlatforms.length === 0
    ? [finding.servingPlatform]
    : finding.servingPlatforms;
  return platforms.join(" or ");
}

/**
 * Shared status icon for summaries, notifications, and logs. The optional scan
 * status downgrades an otherwise clean result to a warning when coverage was
 * only partial.
 */
export function resultIcon(result: Result, scanStatus?: ScanStatus): string {
  if (result === "blocking" || result === "unknown") return "❌";
  if (result === "advisory" || scanStatus === "partial") return "⚠️";
  return "✅";
}
