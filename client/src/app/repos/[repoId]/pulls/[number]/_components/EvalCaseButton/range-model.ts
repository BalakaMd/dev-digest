/* range-model.ts — pure logic of the range dialog (SPEC-07 AC-20…23, AC-40, AC-46).
   No React, no I/O. Types only from @devdigest/shared (value imports blank the page, see INSIGHTS). */
import type { EvalLineRange, EvalSuggestionPatchLine } from "@devdigest/shared";

export type FieldProblem = "empty" | "notNumber" | "noHunk";
export type RangeOption = "suggested" | "cited";

/** Lower number first — a reversed range is valid and is sent normalised (AC-46). */
export function normaliseRange(r: EvalLineRange): EvalLineRange {
  return r.start_line <= r.end_line ? r : { start_line: r.end_line, end_line: r.start_line };
}

export function sameRange(a: EvalLineRange, b: EvalLineRange): boolean {
  const x = normaliseRange(a);
  const y = normaliseRange(b);
  return x.start_line === y.start_line && x.end_line === y.end_line;
}

/** A trimmed whole number (digits only), or null. */
export function parseLineField(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

export function rangeIntersectsHunks(r: EvalLineRange, hunks: readonly EvalLineRange[]): boolean {
  const { start_line: a, end_line: b } = normaliseRange(r);
  return hunks.some((h) => a <= h.end_line && b >= h.start_line);
}

/** The parsed, normalised range of the two fields, or null when either is not a whole number. */
export function fieldsToRange(startText: string, endText: string): EvalLineRange | null {
  const start = parseLineField(startText);
  const end = parseLineField(endText);
  return start === null || end === null ? null : normaliseRange({ start_line: start, end_line: end });
}

/** Why the fields cannot be confirmed, or null when they can (AC-23). */
export function validateFields(
  startText: string,
  endText: string,
  hunks: readonly EvalLineRange[],
): FieldProblem | null {
  if (startText.trim() === "" || endText.trim() === "") return "empty";
  const range = fieldsToRange(startText, endText);
  if (!range) return "notNumber";
  return rangeIntersectsHunks(range, hunks) ? null : "noHunk";
}

/** Which switch option the fields equal; null when neither (AC-40). "Suggested" wins a tie. */
export function selectedOption(
  startText: string,
  endText: string,
  suggested: EvalLineRange,
  cited: EvalLineRange,
): RangeOption | null {
  const range = fieldsToRange(startText, endText);
  if (!range) return null;
  if (sameRange(range, suggested)) return "suggested";
  if (sameRange(range, cited)) return "cited";
  return null;
}

/** The patch's new-side lines inside the range; lines outside every hunk are simply absent (AC-21). */
export function previewLines(
  patchLines: readonly EvalSuggestionPatchLine[],
  range: EvalLineRange,
): EvalSuggestionPatchLine[] {
  const { start_line: a, end_line: b } = normaliseRange(range);
  return patchLines.filter((l) => l.line >= a && l.line <= b);
}
