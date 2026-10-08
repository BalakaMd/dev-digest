/* expected-output.ts — local mirror of `EvalExpectedOutput` (AC-71) from
   `@devdigest/shared` (server/src/vendor/shared/contracts/eval-pipeline.ts).
   The client may not value-import the shared zod schema (client/INSIGHTS
   2026-10-04), so the shape is repeated here: change both together. The API
   stays the authority; this only gives instant feedback (AC-47). */

export const EXPECTATION_TYPES = ["must_find", "must_not_flag"] as const;

/** Reason keys map to `eval.caseEditor.reasons.*`. */
export type ExpectedOutputReason = "notJson" | "notArray" | "badType" | "badFile" | "badLines" | "badNotes";

export type ExpectedOutputCheck =
  | { ok: true; value: unknown[] }
  | { ok: false; reason: ExpectedOutputReason; /** 1-based expectation the reason refers to, when any. */ index?: number };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNote = (v: unknown) => v === undefined || v === null || typeof v === "string";

/** Parse + check the editor text: a non-empty array of expectations. */
export function validateExpectedOutput(text: string): ExpectedOutputCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { ok: false, reason: "notArray" };
  for (let i = 0; i < parsed.length; i++) {
    const e: unknown = parsed[i];
    const index = i + 1;
    if (typeof e !== "object" || e === null || Array.isArray(e)) return { ok: false, reason: "badType", index };
    const x = e as Record<string, unknown>;
    if (!EXPECTATION_TYPES.includes(x.type as (typeof EXPECTATION_TYPES)[number])) {
      return { ok: false, reason: "badType", index };
    }
    if (typeof x.file !== "string" || x.file.length === 0) return { ok: false, reason: "badFile", index };
    if (!isInt(x.start_line) || !isInt(x.end_line)) return { ok: false, reason: "badLines", index };
    if (!isNote(x.title) || !isNote(x.severity) || !isNote(x.category)) return { ok: false, reason: "badNotes", index };
  }
  return { ok: true, value: parsed };
}

/** One empty expectation with every AC-71 field present (AC-48). */
export const FINDING_SKELETON = {
  type: "",
  file: "",
  start_line: null,
  end_line: null,
  title: "",
  severity: "",
  category: "",
} as const;

/** Pretty-print stored expectations for the editor. */
export function formatExpectedOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Append a skeleton to the list in `text`; unparsable text starts a new list. */
export function appendSkeleton(text: string): string {
  let list: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    /* start a fresh list */
  }
  return formatExpectedOutput([...list, FINDING_SKELETON]);
}

/** Paths of the files in a unified diff (`+++ b/<path>`, or `--- a/<path>` for deletions). */
export function diffFilePaths(diff: string): string[] {
  const paths: string[] = [];
  for (const line of diff.split("\n")) {
    const m = /^\+\+\+ (?:b\/)?(.+?)\s*$/.exec(line) ?? /^diff --git a\/(.+?) b\//.exec(line);
    const path = m?.[1];
    if (path && path !== "/dev/null" && !paths.includes(path)) paths.push(path);
  }
  return paths;
}
