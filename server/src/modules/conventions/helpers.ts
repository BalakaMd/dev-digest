import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionEvidence,
  type ConventionScan,
  type ConventionSkillDraft,
  type ConventionSkillSplit,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import {
  CONVENTION_SKILL_TYPE,
  DUPLICATE_RULE_SIMILARITY,
  EVIDENCE_LINE_TOLERANCE,
  MAX_EVIDENCE,
  MAX_EVIDENCE_SPAN,
  MAX_MERGED_EVIDENCE,
  MULTI_FILE_BONUS,
} from './constants.js';

/**
 * Pure helpers for the conventions extractor: prompt formatting, evidence
 * verification, confidence adjustment, de-duplication, skill drafting and DTO
 * mapping. No I/O — everything here is unit-tested directly.
 */

/** Evidence exactly as the model returned it. */
export interface RawEvidence {
  file: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

/** A candidate exactly as the model returned it. */
export interface RawCandidate {
  category: ConventionCategory;
  rule: string;
  evidence: RawEvidence[];
  confidence: number;
}

/** A candidate that survived evidence verification. */
export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  evidence: ConventionEvidence[];
  confidence: number;
  modelConfidence: number;
}

// ------------------------------------------------------------------ prompt

/** Prefix every line with its 1-based number (`  12 | code`), capped at `max` lines. */
export function numberLines(content: string, max: number): string {
  const lines = splitLines(content);
  const shown = lines.slice(0, max);
  const width = String(shown.length).length;
  const out = shown.map((line, i) => `${String(i + 1).padStart(width, ' ')} | ${line}`);
  if (lines.length > max) out.push(`… (${lines.length - max} more lines not shown)`);
  return out.join('\n');
}

export function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

/**
 * Where to look for style configs: the repo root, then the top-level folder of
 * each ranked sample (most-ranked first), e.g. `client/` and `server/` in a
 * repo made of several packages. Paths are returned root-first.
 */
export function configPaths(
  configFiles: readonly string[],
  rankedPaths: readonly string[],
  maxDirs: number,
): string[] {
  const dirs: string[] = [];
  for (const p of rankedPaths) {
    const slash = p.indexOf('/');
    if (slash <= 0) continue;
    const dir = p.slice(0, slash);
    if (!dirs.includes(dir)) dirs.push(dir);
    if (dirs.length >= maxDirs) break;
  }
  return ['', ...dirs].flatMap((dir) => configFiles.map((f) => (dir ? `${dir}/${f}` : f)));
}

// ------------------------------------------------------------ verification

/** A repo-relative path the model may cite: no absolute paths, no `..` segments. */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return !path.split(/[\\/]/).includes('..');
}

/** Canonical repo-relative form of a path the model returned (`./src/a.ts` → `src/a.ts`). */
export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\//, '');
}

/** Collapse whitespace so indentation and spacing differences never fail a match. */
export function normalizeCode(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Snippet lines worth matching: normalised, blank lines and elision markers dropped. */
function snippetLines(snippet: string): string[] {
  return splitLines(snippet)
    .map((l) => normalizeCode(l).replace(/\s*(\.\.\.|…)$/, '').trim())
    .filter((l) => l.length > 0 && l !== '...' && l !== '…');
}

/**
 * Match the snippet lines in order starting at file line index `from`, skipping
 * blank file lines. Returns the exclusive end index of the match, or -1.
 */
function matchAt(fileLines: string[], from: number, wanted: string[]): number {
  let i = from;
  for (const want of wanted) {
    while (i < fileLines.length && normalizeCode(fileLines[i]!) === '') i++;
    if (i >= fileLines.length) return -1;
    if (!normalizeCode(fileLines[i]!).includes(want)) return -1;
    i++;
  }
  return i;
}

/** Strip the common leading indentation of a block of lines. */
export function dedent(lines: string[]): string {
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n').replace(/\s+$/, '');
}

/**
 * Verify one piece of evidence against the files that were sampled. It is
 * valid only when the file was sampled (so it exists on disk), the cited range
 * is sane, and the quoted code really is at that range — allowing a small
 * line-number drift, in which case the range is re-anchored on the match.
 * The stored snippet is the file's own text, never the model's quote.
 */
export function verifyEvidence(
  ev: RawEvidence,
  files: ReadonlyMap<string, string>,
): ConventionEvidence | null {
  const path = normalizeRepoPath(ev.file);
  if (!isSafeRepoPath(path)) return null;
  const content = files.get(path);
  // An empty string is "not found": the mock git client returns '' for unknown paths.
  if (!content) return null;
  const { line_start: start, line_end: end } = ev;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 1 || end < start || end - start + 1 > MAX_EVIDENCE_SPAN) return null;

  const fileLines = splitLines(content);
  if (start > fileLines.length) return null;
  const wanted = snippetLines(ev.snippet);
  if (wanted.length === 0 || wanted.length > MAX_EVIDENCE_SPAN) return null;

  for (const offset of driftOffsets(EVIDENCE_LINE_TOLERANCE)) {
    const from = start - 1 + offset;
    if (from < 0 || from >= fileLines.length) continue;
    if (normalizeCode(fileLines[from]!) === '') continue;
    const stop = matchAt(fileLines, from, wanted);
    if (stop === -1) continue;
    return {
      path,
      line_start: from + 1,
      line_end: stop,
      snippet: dedent(fileLines.slice(from, stop)),
    };
  }
  return null;
}

/** 0, -1, 1, -2, 2, … ±n — the exact cited line is tried first. */
function driftOffsets(n: number): number[] {
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(-i, i);
  return out;
}

/**
 * Confidence after verification. The model's own number is scaled down by the
 * share of its evidence that failed verification, and nudged up for each extra
 * distinct file backing the rule (a pattern seen in several files is a
 * convention; one seen once may be a coincidence).
 */
export function adjustConfidence(
  modelConfidence: number,
  claimed: number,
  valid: number,
  distinctFiles: number,
): number {
  const base = clamp01(modelConfidence);
  if (claimed <= 0 || valid <= 0) return 0;
  const ratio = Math.min(1, valid / claimed);
  const adjusted = base * (0.5 + 0.5 * ratio) + MULTI_FILE_BONUS * Math.max(0, distinctFiles - 1);
  return round2(clamp01(adjusted));
}

/** Verify every evidence of a candidate; null when none of it holds up. */
export function verifyCandidate(
  raw: RawCandidate,
  files: ReadonlyMap<string, string>,
): VerifiedCandidate | null {
  const rule = raw.rule.trim();
  if (!rule) return null;
  const claimed = raw.evidence.slice(0, MAX_EVIDENCE);
  const evidence = uniqueEvidence(
    claimed.map((ev) => verifyEvidence(ev, files)).filter((e): e is ConventionEvidence => e !== null),
  );
  if (evidence.length === 0) return null;
  const distinctFiles = new Set(evidence.map((e) => e.path)).size;
  return {
    category: raw.category,
    rule,
    evidence,
    confidence: adjustConfidence(raw.confidence, claimed.length, evidence.length, distinctFiles),
    modelConfidence: round2(clamp01(raw.confidence)),
  };
}

function uniqueEvidence(list: ConventionEvidence[]): ConventionEvidence[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const key = `${e.path}:${e.line_start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ------------------------------------------------------------ de-duplication

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'use', 'uses', 'using', 'are', 'all', 'any', 'via', 'from',
  'into', 'instead', 'always', 'never', 'should', 'must', 'not', 'each', 'every', 'that',
  'this', 'than', 'over', 'its', 'their', 'when', 'code', 'files', 'file',
]);

/** Lower-case, punctuation-free, single-spaced form of a rule. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function ruleTokens(rule: string): Set<string> {
  return new Set(
    normalizeRule(rule)
      .split(' ')
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

/** Jaccard similarity of two rules' significant words (0..1). */
export function ruleSimilarity(a: string, b: string): number {
  const ta = ruleTokens(a);
  const tb = ruleTokens(b);
  if (ta.size === 0 || tb.size === 0) return normalizeRule(a) === normalizeRule(b) ? 1 : 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** True when `rule` restates one of `existing` (e.g. an accepted or rejected rule). */
export function isKnownRule(rule: string, existing: readonly string[]): boolean {
  return existing.some((e) => ruleSimilarity(rule, e) >= DUPLICATE_RULE_SIMILARITY);
}

/**
 * Merge candidates of the same category that state the same rule. The most
 * confident wording wins; evidence is unioned (so the merged rule is backed by
 * more files) and confidence gets the multi-file bonus for the new files.
 */
export function dedupeCandidates(candidates: VerifiedCandidate[]): {
  kept: VerifiedCandidate[];
  merged: number;
} {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: VerifiedCandidate[] = [];
  let merged = 0;
  for (const c of sorted) {
    const twin = kept.find(
      (k) => k.category === c.category && ruleSimilarity(k.rule, c.rule) >= DUPLICATE_RULE_SIMILARITY,
    );
    if (!twin) {
      kept.push({ ...c, evidence: [...c.evidence] });
      continue;
    }
    merged++;
    const before = new Set(twin.evidence.map((e) => e.path)).size;
    twin.evidence = uniqueEvidence([...twin.evidence, ...c.evidence]).slice(0, MAX_MERGED_EVIDENCE);
    const after = new Set(twin.evidence.map((e) => e.path)).size;
    twin.confidence = round2(clamp01(twin.confidence + MULTI_FILE_BONUS * (after - before)));
  }
  return { kept, merged };
}

// ------------------------------------------------------------ skill drafts

/** kebab-case slug, at most `maxWords` words. */
export function slugify(text: string, maxWords = 6): string {
  return normalizeRule(text).split(' ').filter(Boolean).slice(0, maxWords).join('-') || 'rule';
}

const FENCE_LANG: Record<string, string> = {
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js', json: 'json',
  yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
};

function fenceFor(path: string, snippet: string): { open: string; close: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const longest = Math.max(2, ...(snippet.match(/`+/g) ?? []).map((m) => m.length));
  const ticks = '`'.repeat(longest + 1);
  return { open: `${ticks}${FENCE_LANG[ext] ?? ''}`, close: ticks };
}

function evidenceRef(e: ConventionEvidence): string {
  return e.line_start === e.line_end
    ? `${e.path}:${e.line_start}`
    : `${e.path}:${e.line_start}-${e.line_end}`;
}

/** The markdown body of a skill built from accepted conventions. */
export function buildSkillBody(
  name: string,
  repoName: string,
  candidates: readonly ConventionCandidate[],
): string {
  const parts = [
    `# ${name}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];
  for (const c of candidates) {
    const [primary, ...others] = c.evidence;
    parts.push('', `## ${slugify(c.rule)}`, c.rule);
    if (!primary) continue;
    const fence = fenceFor(primary.path, primary.snippet);
    parts.push('', `Detected in \`${evidenceRef(primary)}\`:`, fence.open, primary.snippet, fence.close);
    if (others.length) parts.push(`Also seen in ${others.map((e) => `\`${evidenceRef(e)}\``).join(', ')}.`);
  }
  return `${parts.join('\n')}\n`;
}

function categoryOrder(c: ConventionCategory): number {
  return ConventionCategory.options.indexOf(c);
}

/**
 * Skill drafts from accepted conventions: one skill for everything, or one per
 * category. Every call is a fresh draft — the user may edit all of it.
 */
export function buildSkillDrafts(
  repoName: string,
  accepted: readonly ConventionCandidate[],
  split: ConventionSkillSplit,
): ConventionSkillDraft[] {
  if (accepted.length === 0) return [];
  const repoSlug = slugify(repoName, 8);
  const draft = (
    name: string,
    description: string,
    category: ConventionCategory | null,
    list: readonly ConventionCandidate[],
  ): ConventionSkillDraft => ({
    name,
    description,
    type: CONVENTION_SKILL_TYPE,
    enabled: true,
    body: buildSkillBody(name, repoName, list),
    category,
    convention_ids: list.map((c) => c.id),
  });

  if (split === 'single') {
    const name = `${repoSlug}-conventions`;
    return [
      draft(name, `${plural(accepted.length, 'house convention')} extracted from ${repoName}`, null, accepted),
    ];
  }

  const groups = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of accepted) groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
  return [...groups.entries()]
    .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b))
    .map(([category, list]) =>
      draft(
        `${repoSlug}-${category}-conventions`,
        `${plural(list.length, `${category} convention`)} extracted from ${repoName}`,
        category,
        list,
      ),
    );
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Distinct evidence files across candidates, in first-seen order. */
export function evidenceFiles(candidates: readonly ConventionCandidate[]): string[] {
  return [...new Set(candidates.flatMap((c) => c.evidence.map((e) => e.path)))];
}

// ------------------------------------------------------------ DTO mapping

export function toCandidateDto(row: ConventionRow): ConventionCandidate {
  const evidence = row.evidence ?? [];
  const primary = evidence[0];
  return {
    id: row.id,
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidence_path: row.evidencePath ?? primary?.path ?? '',
    evidence_snippet: row.evidenceSnippet ?? primary?.snippet ?? '',
    line_start: row.lineStart ?? primary?.line_start ?? 1,
    line_end: row.lineEnd ?? primary?.line_end ?? 1,
    evidence,
    confidence: row.confidence ?? 0,
    model_confidence: row.modelConfidence,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    sample_files: row.sampleFiles,
    proposed: row.proposed,
    kept: row.kept,
    dropped_unverified: row.droppedUnverified,
    merged_duplicates: row.mergedDuplicates,
    created_at: row.createdAt.toISOString(),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
