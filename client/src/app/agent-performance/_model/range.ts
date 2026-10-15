/* Range rules (AC-4, AC-5, AC-6): preset/custom selection → API instants, validation, labels.
   Framework-free; dates are "YYYY-MM-DD" strings read in the browser's time zone. */
import { MAX_CUSTOM_DAYS, PRESET_SPAN_MS, type RangeKind } from "./constants";

export interface RangeSelection {
  kind: RangeKind;
  /** "YYYY-MM-DD"; only for `custom`. */
  start?: string;
  end?: string;
}

export interface Instants {
  from: string;
  to: string;
}

export type RangeErrorReason = "incomplete" | "endBeforeStart" | "endInFuture" | "tooLong";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" into parts; null when malformed or not a real calendar date. */
export function parseDateOnly(value: string | null | undefined): [number, number, number] | null {
  const m = value ? DATE_RE.exec(value) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null;
  return [y, mo, d];
}

/** "YYYY-MM-DD" of a local date. */
export function formatDateOnly(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Whole calendar days from `a` to `b` (DST-proof: counted on UTC midnights). */
function calendarDaysBetween(a: [number, number, number], b: [number, number, number]): number {
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** AC-6: reason a custom range is rejected, or null when it is valid. */
export function validateCustomRange(
  start: string | null | undefined,
  end: string | null | undefined,
  now: Date,
): RangeErrorReason | null {
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (!s || !e) return "incomplete";
  if (calendarDaysBetween(s, e) < 0) return "endBeforeStart";
  const today = parseDateOnly(formatDateOnly(now))!;
  if (calendarDaysBetween(today, e) > 0) return "endInFuture";
  if (calendarDaysBetween(s, e) + 1 > MAX_CUSTOM_DAYS) return "tooLong";
  return null;
}

/** AC-5: the two instants a range is sent as. `now` is the moment the read is sent. */
export function resolveInstants(sel: RangeSelection, now: Date): Instants {
  if (sel.kind !== "custom") {
    return {
      from: new Date(now.getTime() - PRESET_SPAN_MS[sel.kind]).toISOString(),
      to: now.toISOString(),
    };
  }
  const s = parseDateOnly(sel.start);
  const e = parseDateOnly(sel.end);
  if (!s || !e) throw new Error("resolveInstants: custom range needs valid start and end dates");
  // Local midnights; day + 1 lets the Date constructor roll over month/year ends.
  return {
    from: new Date(s[0], s[1] - 1, s[2]).toISOString(),
    to: new Date(e[0], e[1] - 1, e[2] + 1).toISOString(),
  };
}

/** AC-4 card-label text: "1D", "30D" or "<start> – <end>" (without brackets). */
export function rangeLabel(sel: RangeSelection): string {
  if (sel.kind === "1d") return "1D";
  if (sel.kind === "30d") return "30D";
  return `${sel.start} – ${sel.end}`;
}

/** Stable key for the React Query cache: no instants, so "now" is resolved at send time. */
export function rangeKey(sel: RangeSelection): string {
  return sel.kind === "custom" ? `custom:${sel.start}:${sel.end}` : sel.kind;
}
