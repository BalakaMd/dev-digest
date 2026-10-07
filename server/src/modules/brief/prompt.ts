import type { BriefShortenedInput } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { FILE_ROLE_ORDER } from './constants.js';
import type { BudgetSource, FitResult, FindingFact, PromptFile, PromptInput } from './types.js';

/**
 * Pure user-message assembly and the token budget (AC-23, AC-24, AC-25, AC-40).
 * Every source that can carry attacker-controlled text (title, description,
 * file paths, hunk header text, issue, specs, Intent, findings) goes through
 * `wrapUntrusted`. Diff body lines never reach this module: `PromptFile` only
 * holds hunk headers.
 */

const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Files ordered by Smart Diff role, then path (stable, deterministic). */
export function orderFiles(files: readonly PromptFile[]): PromptFile[] {
  const rank = (f: PromptFile): number => FILE_ROLE_ORDER.indexOf(f.role);
  return [...files].sort((a, b) => rank(a) - rank(b) || byteOrder(a.path, b.path));
}

/** Largest prefix (by code points) of `text`. */
function prefix(text: string, chars: number): string {
  return Array.from(text).slice(0, chars).join('');
}

// ---------------------------------------------------------------- sections

function languageSection(input: PromptInput): string {
  return `TASK: write the summary, risk titles, risk explanations and review-focus reasons in ${input.language}. Keep file paths, code identifiers, symbol names and route patterns verbatim.`;
}

function titleSection(input: PromptInput): string {
  return `PR TITLE:\n${wrapUntrusted('pr-title', input.title)}`;
}

function descriptionSection(text: string): string {
  return `PR DESCRIPTION:\n${wrapUntrusted('pr-description', text)}`;
}

function intentSection(input: PromptInput): string | null {
  if (!input.intent) return null;
  const { summary, in_scope, out_of_scope } = input.intent;
  const list = (items: string[]): string => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- (none)');
  const body = `Summary: ${summary}\nIn scope:\n${list(in_scope)}\nOut of scope:\n${list(out_of_scope)}`;
  return `INTENT:\n${wrapUntrusted('intent', body)}`;
}

function blastSection(input: PromptInput, callersKept: number): string | null {
  if (!input.blast) return null;
  const callers = input.blast.callers.slice(0, callersKept);
  const lines = callers.map((c) => `${c.symbol} — ${c.file}:${c.line}`);
  const body = `Summary: ${input.blast.summary}\nCallers (symbol — file:line):\n${lines.length ? lines.join('\n') : '(none)'}`;
  return `BLAST RADIUS:\n${wrapUntrusted('blast-radius', body)}`;
}

function totalsSection(input: PromptInput): string {
  const t = input.totals;
  return `DIFF TOTALS: ${t.files} files changed, ${t.additions} additions, ${t.deletions} deletions.`;
}

function filesSection(files: readonly PromptFile[]): string | null {
  if (files.length === 0) return null;
  const lines: string[] = [];
  for (const f of files) {
    lines.push(`${f.path} | +${f.additions} -${f.deletions} | ${f.role}`);
    for (const h of f.hunks) lines.push(`  ${h.header}`);
  }
  return `FILES (path | additions deletions | role; hunk headers indented):\n${wrapUntrusted('changed-files', lines.join('\n'))}`;
}

function findingsSection(findings: readonly FindingFact[]): string | null {
  if (findings.length === 0) return null;
  const lines = findings.map((f) => `${f.file}${f.line === null ? '' : `:${f.line}`} | ${f.severity} | ${f.title}`);
  return `REVIEW FINDINGS (file:line | severity | title):\n${wrapUntrusted('review-findings', lines.join('\n'))}`;
}

function issueSection(title: string, body: string): string {
  return `LINKED ISSUE:\n${wrapUntrusted('linked-issue', `${title}\n\n${body}`)}`;
}

function specsSection(specs: readonly { path: string; content: string }[]): string | null {
  if (specs.length === 0) return null;
  return `SPECIFICATION DOCUMENTS:\n${specs.map((s) => wrapUntrusted(s.path, s.content)).join('\n\n')}`;
}

// ---------------------------------------------------------------- state

/** How much of each shrinkable source is kept; `max` of each = untouched. */
interface Kept {
  specs: number;
  /** 0 = left out, n >= 1 = title + first n-1 chars of the body. */
  issue: number;
  callers: number;
  /** 0 = left out, n = first n chars. */
  description: number;
  findings: number;
  files: number;
}

interface Rendered {
  parts: Partial<Record<BudgetSource, string>>;
}

function render(input: PromptInput, ordered: readonly PromptFile[], specs: readonly { path: string; content: string }[], k: Kept): Rendered {
  const keptFiles = ordered.slice(0, k.files);
  const keptPaths = new Set(keptFiles.map((f) => f.path));
  const keptFindings = input.findings.filter((f) => keptPaths.has(f.file)).slice(0, k.findings);
  const parts: Partial<Record<BudgetSource, string>> = {};
  const set = (key: BudgetSource, text: string | null): void => {
    if (text) parts[key] = text;
  };
  set('system', languageSection(input));
  set('title', titleSection(input));
  set('description', k.description > 0 && input.description ? descriptionSection(prefix(input.description, k.description)) : null);
  set('intent', intentSection(input));
  set('blast', blastSection(input, k.callers));
  set('totals', totalsSection(input));
  set('files', filesSection(keptFiles));
  set('findings', findingsSection(keptFindings));
  set('issue', k.issue > 0 && input.issue ? issueSection(input.issue.title, prefix(input.issue.body, k.issue - 1)) : null);
  set('specs', specsSection(specs.slice(0, k.specs)));
  return { parts };
}

/** User-message section order (kept stable: facts first, long untrusted documents last). */
const SECTION_ORDER: readonly BudgetSource[] = [
  'system',
  'title',
  'description',
  'intent',
  'blast',
  'totals',
  'files',
  'findings',
  'issue',
  'specs',
];

function orderedUser(parts: Partial<Record<BudgetSource, string>>): string {
  return SECTION_ORDER.map((k) => parts[k]).filter((p): p is string => !!p).join('\n\n');
}

// ---------------------------------------------------------------- budget

/**
 * Shorten or leave out inputs until `count(system) + count(user) <= budget`,
 * in AC-25 order: specs (whole documents from the end of the path order),
 * linked issue, Blast callers, PR description, then the per-file list (review
 * findings first, then files from the end of the Smart Diff order). Each stage
 * is reduced only as far as needed (Q-1). The system message, Intent, diff
 * totals, title and the fixed framing are never shortened (Q-4); when they
 * alone exceed the budget the result is `over_budget` (AC-40).
 */
export function fitToBudget(args: {
  system: string;
  input: PromptInput;
  count: (text: string) => number;
  budget: number;
}): FitResult {
  const { system, input, count, budget } = args;
  const specs = [...input.specs].sort((a, b) => byteOrder(a.path, b.path));
  const ordered = orderFiles(input.files);
  const systemTokens = count(system);

  const max: Kept = {
    specs: specs.length,
    issue: input.issue ? Array.from(input.issue.body).length + 1 : 0,
    callers: input.blast?.callers.length ?? 0,
    description: input.description ? Array.from(input.description).length : 0,
    findings: input.findings.length,
    files: ordered.length,
  };
  const measure = (k: Kept): number => {
    const r = render(input, ordered, specs, k);
    return systemTokens + count(orderedUser(r.parts));
  };

  const empty: Kept = { specs: 0, issue: 0, callers: 0, description: 0, findings: 0, files: 0 };
  const baseline = measure(empty);
  if (baseline > budget) return { ok: false, reason: 'over_budget', fixedTokens: baseline };

  const k: Kept = { ...max };
  const shortened = new Map<BriefShortenedInput['input'], BriefShortenedInput['action']>();
  const stages: { key: keyof Kept; source: BriefShortenedInput['input'] }[] = [
    { key: 'specs', source: 'specs' },
    { key: 'issue', source: 'issue' },
    { key: 'callers', source: 'callers' },
    { key: 'description', source: 'description' },
    { key: 'findings', source: 'files' },
    { key: 'files', source: 'files' },
  ];
  for (const { key, source } of stages) {
    if (measure(k) <= budget) break;
    if (max[key] === 0) continue;
    // Invariant: `lo` fits, `hi` does not. `lo = 0` fits (all later stages are still full, so
    // check it explicitly).
    k[key] = 0;
    if (measure(k) > budget) {
      shortened.set(source, key === 'findings' ? 'shortened' : 'left_out');
      continue;
    }
    let lo = 0;
    let hi = max[key];
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      k[key] = mid;
      if (measure(k) <= budget) lo = mid;
      else hi = mid;
    }
    k[key] = lo;
    // Findings are part of the per-file list: dropping them is a shortening; the file stage
    // that follows overrides it when files themselves are cut.
    shortened.set(source, key !== 'findings' && lo === 0 ? 'left_out' : 'shortened');
  }

  const rendered = render(input, ordered, specs, k);
  const user = orderedUser(rendered.parts);
  const tokensBySource: Partial<Record<BudgetSource, number>> = {};
  for (const src of SECTION_ORDER) {
    const text = rendered.parts[src];
    if (text) tokensBySource[src] = count(text);
  }
  tokensBySource.system = systemTokens + (tokensBySource.system ?? 0);
  return {
    ok: true,
    user,
    total: systemTokens + count(user),
    tokensBySource,
    shortened: [...shortened].map(([inp, action]) => ({ input: inp, action })),
  };
}
