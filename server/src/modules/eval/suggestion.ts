import type { EvalExpectationType, EvalLineRange, EvalSuggestionReason } from '@devdigest/shared';
import {
  EVAL_FULL_FILE_KINDS,
  EVAL_RATIONALE_MAX_CHARS,
  EVAL_SUGGEST_MAX_LINES,
  EVAL_SUGGEST_MAX_SPILL,
  EVAL_TERMS_MAX,
  EVAL_TERM_MAX_LENGTH,
  EVAL_TERM_MIN_LENGTH,
  EVAL_TITLE_MAX_CHARS,
} from './constants.js';
import type { EvalStructure } from './types.js';

/**
 * SPEC-07 — pure line-range suggestion for a case made from a finding. No IO, no clock, no random:
 * the same finding and patch always give the same answer (NFR-1). Finding text is untrusted: it is
 * only ever used as a literal for `String.includes` and never compiled into a pattern (NFR-3).
 */

export interface SuggestInput {
  type: EvalExpectationType;
  kind: string;
  file: string;
  cited: EvalLineRange;
  title: string;
  rationale: string;
  /** New-side lines of the patch. */
  lines: Array<{ line: number; text: string }>;
  /** New-side hunk bounds. */
  hunks: EvalLineRange[];
  /** Structure of a source fragment (lines relative to it), `null` = not available. */
  analyze: (source: string) => EvalStructure | null;
}

export interface SuggestOutput {
  cited: EvalLineRange;
  suggested: EvalLineRange;
  reason: EvalSuggestionReason;
}

// ------------------------------------------------------------------ terms

const IDENT_TOKEN = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?/g;
const CAMEL = /^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/;
const SNAKE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;
const BACKTICK = /`([^`\n]*)`/g;
const STRING_LITERAL = /'([^'\n]*)'|"([^"\n]*)"/g;
const HTTP_PATH = /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[ \t]+(\/[^\s`'",;)]*)/g;

/** AC-6 (strict reading, Q-2): search terms of a finding, distinct, in first-seen order, bounded (Q-3). */
export function extractSearchTerms(title: string, rationale: string): string[] {
  const text = `${title.slice(0, EVAL_TITLE_MAX_CHARS)}\n${rationale.slice(0, EVAL_RATIONALE_MAX_CHARS)}`;
  const terms = new Set<string>();
  const add = (term: string, innerLength = term.length) => {
    if (innerLength < EVAL_TERM_MIN_LENGTH || term.length > EVAL_TERM_MAX_LENGTH) return;
    if (terms.size < EVAL_TERMS_MAX) terms.add(term);
  };

  for (const m of text.matchAll(BACKTICK)) add(m[1]!.trim(), m[1]!.trim().length);
  for (const m of text.matchAll(IDENT_TOKEN)) {
    const tok = m[0];
    if (tok.includes('.') || tok.endsWith('()') || CAMEL.test(tok) || SNAKE.test(tok)) add(tok);
  }
  for (const m of text.matchAll(STRING_LITERAL)) {
    const inner = m[1] ?? m[2] ?? '';
    add(m[0], inner.length);
  }
  for (const m of text.matchAll(HTTP_PATH)) {
    const p = m[1]!;
    add(`'${p}'`, p.length);
    add(`"${p}"`, p.length);
  }
  return [...terms];
}

// ---------------------------------------------------------------- helpers

const NO_REASON: EvalSuggestionReason = {
  terms: [],
  expanded_to_function: null,
  function_too_long: false,
  structure_available: true,
};

const span = (r: EvalLineRange) => r.end_line - r.start_line + 1;
const contains = (outer: EvalLineRange, inner: EvalLineRange) =>
  outer.start_line <= inner.start_line && outer.end_line >= inner.end_line;
const intersects = (a: EvalLineRange, b: EvalLineRange) => a.start_line <= b.end_line && a.end_line >= b.start_line;

function normalise(r: EvalLineRange): EvalLineRange {
  return { start_line: Math.min(r.start_line, r.end_line), end_line: Math.max(r.start_line, r.end_line) };
}

/** `import …`, `export … from …` and `require(…)` lines are never a "place" for retargeting (user-approved refinement of AC-7/AC-9). */
const IMPORT_LINE = /^\s*(?:import\b|export\b[^\n]*\bfrom\s*['"]|(?:[^\n]*[^\w$.])?require\s*\()/;
const isImportLine = (text: string) => IMPORT_LINE.test(text);

/** Function ranges (new-side lines) of all hunks; empty when the structure is not available. */
function functionRanges(input: SuggestInput): EvalLineRange[] {
  const ranges: EvalLineRange[] = [];
  for (const h of input.hunks) {
    const source = input.lines
      .filter((l) => l.line >= h.start_line && l.line <= h.end_line)
      .map((l) => l.text)
      .join('\n');
    const structure = input.analyze(source);
    if (!structure) continue;
    const off = h.start_line - 1;
    for (const f of structure.functions) ranges.push({ start_line: f.start + off, end_line: f.end + off });
  }
  return ranges;
}

/**
 * AC-7 / AC-9: the line outside `cited` with the most distinct terms (import-like lines excluded); ties: a line
 * inside a function beats a top-level one, then nearest, then lower number.
 */
function retarget(input: SuggestInput, cited: EvalLineRange, terms: string[]) {
  const counts = new Map<string, number>(terms.map((t) => [t, 0]));
  for (const l of input.lines) for (const t of terms) if (l.text.includes(t)) counts.set(t, counts.get(t)! + 1);
  const present = terms.filter((t) => counts.get(t)! > 0);
  if (present.length === 0) return null; // AC-51

  const inCited = (n: number) => n >= cited.start_line && n <= cited.end_line;
  if (input.lines.some((l) => inCited(l.line) && present.some((t) => l.text.includes(t)))) return null; // AC-8

  let fns: EvalLineRange[] | null = null;
  const insideFn = (n: number) => {
    fns ??= functionRanges(input);
    return fns.some((f) => n >= f.start_line && n <= f.end_line);
  };

  let best: { line: number; matched: string[]; dist: number; inFn: boolean } | null = null;
  for (const l of input.lines) {
    if (inCited(l.line) || isImportLine(l.text)) continue;
    const matched = present.filter((t) => l.text.includes(t));
    if (matched.length === 0) continue;
    const dist = l.line < cited.start_line ? cited.start_line - l.line : l.line - cited.end_line;
    const inFn = insideFn(l.line);
    if (
      !best ||
      matched.length > best.matched.length ||
      (matched.length === best.matched.length &&
        (inFn !== best.inFn
          ? inFn
          : dist < best.dist || (dist === best.dist && l.line < best.line)))
    ) {
      best = { line: l.line, matched, dist, inFn };
    }
  }
  if (!best) return null;
  const reasonTerms = best.matched
    .map((term) => ({ term, count: counts.get(term)! }))
    .sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  return { range: { start_line: best.line, end_line: best.line }, reasonTerms };
}

/** AC-10 / AC-42 / AC-12 / AC-13 / AC-45 on top of the starting range. */
function expand(input: SuggestInput, start: EvalLineRange, base: SuggestOutput): SuggestOutput {
  const touched = input.hunks.filter((h) => intersects(h, start));
  const functions: EvalStructure['functions'] = [];
  const blocks: EvalStructure['blocks'] = [];
  for (const h of touched) {
    const source = input.lines
      .filter((l) => l.line >= h.start_line && l.line <= h.end_line)
      .map((l) => l.text)
      .join('\n');
    const structure = input.analyze(source);
    if (!structure) return { ...base, suggested: start, reason: { ...base.reason, structure_available: false } };
    const off = h.start_line - 1;
    for (const f of structure.functions) functions.push({ name: f.name, start: f.start + off, end: f.end + off });
    for (const b of structure.blocks) blocks.push({ start: b.start + off, end: b.end + off });
  }
  if (touched.length === 0) return { ...base, suggested: start };

  const fnRange = (f: { start: number; end: number }) => ({ start_line: f.start, end_line: f.end });
  const overlapOf = (f: { start: number; end: number }) =>
    Math.min(f.end, start.end_line) - Math.max(f.start, start.start_line) + 1;
  let candidates = functions.filter((f) => contains(fnRange(f), start));
  if (candidates.length === 0) {
    // Models often cite a line or two past the closing brace: snap to the function holding most of the range.
    candidates = functions.filter((f) => {
      const overlap = overlapOf(f);
      const spill = span(start) - overlap;
      return overlap > 0 && spill <= EVAL_SUGGEST_MAX_SPILL && overlap >= spill;
    });
    candidates.sort((a, b) => overlapOf(b) - overlapOf(a));
  }
  if (candidates.length === 0) return { ...base, suggested: start }; // AC-45
  // innermost: smallest span, then greater start (when the range was snapped: the most overlap first)
  candidates.sort(
    (a, b) => overlapOf(b) - overlapOf(a) || a.end - a.start - (b.end - b.start) || b.start - a.start,
  );
  const fn = candidates[0]!;

  const lo = Math.min(...touched.map((h) => h.start_line));
  const hi = Math.max(...touched.map((h) => h.end_line));
  const clamp = (r: EvalLineRange): EvalLineRange => ({
    start_line: Math.max(r.start_line, lo),
    end_line: Math.min(r.end_line, hi),
  });
  const expanded = clamp(fnRange(fn));

  if (span(expanded) <= EVAL_SUGGEST_MAX_LINES) {
    return { ...base, suggested: expanded, reason: { ...base.reason, expanded_to_function: { name: fn.name } } };
  }
  // AC-12: the largest block inside the function that holds the starting range and fits the cap.
  let chosen: EvalLineRange | null = null;
  for (const b of blocks) {
    const r = clamp(fnRange(b));
    if (!contains(expanded, r) || !contains(r, start) || span(r) > EVAL_SUGGEST_MAX_LINES) continue;
    if (!chosen || span(r) > span(chosen) || (span(r) === span(chosen) && r.start_line < chosen.start_line)) chosen = r;
  }
  return { ...base, suggested: chosen ?? start, reason: { ...base.reason, function_too_long: true } };
}

// ------------------------------------------------------------------- main

export function suggestRange(input: SuggestInput): SuggestOutput {
  const cited = normalise(input.cited);
  const base: SuggestOutput = { cited, suggested: cited, reason: { ...NO_REASON } };

  if (EVAL_FULL_FILE_KINDS.includes(input.kind)) return base; // AC-44

  let start = cited;
  let reason = base.reason;
  if (input.type === 'must_find') {
    const found = retarget(input, cited, extractSearchTerms(input.title, input.rationale));
    if (found) {
      start = found.range;
      reason = { ...reason, terms: found.reasonTerms };
    }
  }

  const withReason: SuggestOutput = { cited, suggested: start, reason };
  const result = span(start) > EVAL_SUGGEST_MAX_LINES ? withReason : expand(input, start, withReason); // AC-30
  // AC-5: a suggestion must touch a hunk; otherwise fall back to the cited range.
  if (!input.hunks.some((h) => intersects(h, result.suggested))) return { ...base };
  return result;
}
