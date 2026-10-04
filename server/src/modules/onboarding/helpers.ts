import { z } from 'zod';
import type {
  OnboardingBlocked,
  OnboardingTour,
  TourFirstTask,
  TourLanguage,
} from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import type { OnboardingFacts } from '../repo-intel/types.js';
import {
  FOLDER_RUN_SOURCE_FILES,
  MAX_COMMAND_CHARS,
  MAX_ERROR_CHARS,
  MAX_FIRST_TASKS,
  MAX_PROMPT_PATHS,
  MAX_RUN_COMMANDS,
  MAX_RUN_SOURCE_CHARS,
  MAX_RUN_SOURCE_DIRS,
  ROOT_RUN_SOURCE_FILES,
} from './constants.js';
import type { IndexSnapshot, RunSource } from './types.js';

/**
 * Pure core of the onboarding tour: the model's lenient output schema, the
 * deterministic assembly of the stored tour, readiness, staleness and prompt
 * assembly. No I/O — unit-tested directly.
 */

// ------------------------------------------------------------ model output

/**
 * What the single LLM request returns. Strict-compatible (no optionals, no
 * bounds); every limit is enforced in `assembleTour`. File selection and order
 * are NOT taken from here — only reasons, prose, commands and tasks.
 */
export const OnboardingNarrative = z.object({
  architecture: z.object({ markdown: z.string(), diagram: z.string().nullable() }).nullable(),
  critical_paths: z.array(z.object({ path: z.string(), reason: z.string() })),
  run_commands: z.array(z.string()),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(z.object({ description: z.string(), paths: z.array(z.string()) })),
});
export type OnboardingNarrative = z.infer<typeof OnboardingNarrative>;

// ------------------------------------------------------------ assembly

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t.length > 0 ? t : null;
};

export interface AssembleInput {
  narrative: OnboardingNarrative;
  facts: OnboardingFacts;
  language: TourLanguage;
  indexedFiles: number;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface AssembleResult {
  tour: OnboardingTour;
  /** Model-named paths that were dropped (not in the index / not a fact file). */
  droppedPaths: number;
}

/**
 * Build the stored tour. File choice and order come ONLY from `facts`; the
 * model contributes reasons (matched by exact path; missing → null), prose,
 * commands and tasks. A section that is empty after cleaning is `null`.
 */
export function assembleTour(input: AssembleInput): AssembleResult {
  const { narrative, facts } = input;
  const indexed = new Set(facts.indexedPaths);
  let dropped = 0;

  const reasonsFor = (rows: { path: string; reason: string }[], allowed: Set<string>) => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (!allowed.has(r.path)) {
        dropped += 1;
        continue;
      }
      const reason = clean(r.reason);
      if (reason && !map.has(r.path)) map.set(r.path, reason);
    }
    return map;
  };

  const criticalReasons = reasonsFor(
    narrative.critical_paths,
    new Set(facts.criticalPaths.map((f) => f.path)),
  );
  const readingReasons = reasonsFor(
    narrative.reading_path,
    new Set(facts.readingPath.map((f) => f.path)),
  );

  const markdown = clean(narrative.architecture?.markdown);
  const architecture = markdown
    ? { markdown, diagram: clean(narrative.architecture?.diagram) }
    : null;

  const critical_paths =
    facts.criticalPaths.length > 0
      ? facts.criticalPaths.map((f) => ({
          path: f.path,
          reason: criticalReasons.get(f.path) ?? null,
          imported_by: f.importedBy,
          imports: f.imports,
        }))
      : null;

  const reading_path =
    facts.readingPath.length > 0
      ? facts.readingPath.map((f, i) => ({
          rank: i + 1,
          path: f.path,
          reason: readingReasons.get(f.path) ?? null,
        }))
      : null;

  const tasks: TourFirstTask[] = [];
  for (const task of narrative.first_tasks) {
    const description = clean(task.description);
    const paths: string[] = [];
    for (const raw of task.paths) {
      const p = raw.trim();
      if (!indexed.has(p)) {
        dropped += 1;
        continue;
      }
      if (!paths.includes(p)) paths.push(p);
    }
    if (description && paths.length > 0) tasks.push({ description, paths });
  }
  const first_tasks = tasks.length > 0 ? tasks.slice(0, MAX_FIRST_TASKS) : null;

  return {
    droppedPaths: dropped,
    tour: {
      generated_at: input.generatedAt,
      language: input.language,
      indexed_files: input.indexedFiles,
      provider: input.provider,
      model: input.model,
      architecture,
      critical_paths,
      run: { commands: cleanCommands(narrative.run_commands) },
      reading_path,
      first_tasks,
    },
  };
}

/** Trimmed, single-line, de-duplicated, bounded commands. Always an array. */
export function cleanCommands(raw: string[]): string[] {
  const out: string[] = [];
  for (const c of raw) {
    const t = c.trim();
    if (!t || /[\r\n\0]/.test(t) || t.length > MAX_COMMAND_CHARS) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= MAX_RUN_COMMANDS) break;
  }
  return out;
}

// ------------------------------------------------------------ readiness / staleness

const BLOCKED_MESSAGES = {
  not_indexed: 'This repository has not been indexed yet. Index it first, then generate the tour.',
  partial: 'The repository index is partial. Re-index the repository to get a complete index.',
  degraded: 'The repository index is degraded. Re-index the repository to restore it.',
  no_clone: 'The repository has no working copy. Import or sync it first.',
  no_source_files: 'The index contains no source files, so there is nothing to tour.',
} as const;

/** AC-24: why a generation cannot start, or `null` when it can. */
export function evaluateReadiness(input: {
  index: IndexSnapshot;
  clonePath: string | null;
}): OnboardingBlocked | null {
  const { index } = input;
  const block = (reason: keyof typeof BLOCKED_MESSAGES): OnboardingBlocked => ({
    reason,
    message: BLOCKED_MESSAGES[reason],
    index_status: index.status,
    files_indexed: index.filesIndexed,
  });
  if (index.status === 'none') return block('not_indexed');
  if (index.status === 'partial') return block('partial');
  if (index.status === 'degraded' || index.status === 'failed') return block('degraded');
  if (!input.clonePath) return block('no_clone');
  if (index.filesIndexed <= 0) return block('no_source_files');
  return null;
}

/** AC-40 / AC-35 flags for a stored tour. */
export function staleFlags(input: {
  storedLanguage: TourLanguage;
  currentLanguage: TourLanguage;
  indexStatus: IndexSnapshot['status'];
  indexUpdatedAt: Date;
  generatedAt: Date;
}): { language_changed: boolean; index_changed: boolean } {
  return {
    language_changed: input.storedLanguage !== input.currentLanguage,
    index_changed:
      input.indexStatus !== 'none' &&
      input.indexUpdatedAt.getTime() > input.generatedAt.getTime(),
  };
}

/** Bounded, single-line failure text safe to show in the UI (no stack, keys redacted). */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.replace(/\s+/g, ' ').trim() || 'Generation failed';
  const redacted = line.replace(/\b(sk|or|key)[-_][A-Za-z0-9_-]{8,}/gi, '[redacted]');
  return redacted.length > MAX_ERROR_CHARS ? `${redacted.slice(0, MAX_ERROR_CHARS)}…` : redacted;
}

// ------------------------------------------------------------ run sources (pure parts)

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Fixed candidate file names: root set + a few top-level folders taken from indexed paths. */
export function runSourceCandidates(indexedPaths: string[]): string[] {
  const dirs: string[] = [];
  for (const p of indexedPaths) {
    const i = p.indexOf('/');
    if (i <= 0) continue;
    const seg = p.slice(0, i);
    if (seg.startsWith('.') || !SAFE_SEGMENT.test(seg)) continue;
    if (!dirs.includes(seg)) dirs.push(seg);
  }
  dirs.sort();
  const out: string[] = [...ROOT_RUN_SOURCE_FILES];
  for (const d of dirs.slice(0, MAX_RUN_SOURCE_DIRS)) {
    for (const f of FOLDER_RUN_SOURCE_FILES) out.push(`${d}/${f}`);
  }
  return out;
}

/** `package.json` → only its `scripts` (as JSON text); `null` when absent/unparseable. */
export function extractScripts(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    const scripts = parsed?.scripts;
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return null;
    const entries = Object.entries(scripts as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    );
    if (entries.length === 0) return null;
    return JSON.stringify(Object.fromEntries(entries), null, 2);
  } catch {
    return null;
  }
}

export function boundText(text: string, max = MAX_RUN_SOURCE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n…[truncated]` : text;
}

// ------------------------------------------------------------ prompt

export function buildUserMessage(input: {
  language: TourLanguage;
  repoFullName: string;
  indexedFiles: number;
  facts: OnboardingFacts;
  runSources: RunSource[];
}): string {
  const { facts } = input;
  const fmt = (rows: OnboardingFacts['readingPath']) =>
    rows.map((r) => `${r.path} (imported_by=${r.importedBy}, imports=${r.imports})`).join('\n') ||
    '(none)';

  const lines: string[] = [
    `Write the onboarding tour in ${input.language}. File paths, code identifiers, package names, scripts, commands, environment variable names and route patterns stay verbatim.`,
    '',
    `Repository: ${input.repoFullName}`,
    `Indexed files: ${input.indexedFiles}`,
    '',
    'FACTS — critical files (one reason each; counts are exact, quote them as given):',
    wrapUntrusted('facts-critical-paths', fmt(facts.criticalPaths)),
    '',
    'FACTS — reading path files in reading order (one reason each):',
    wrapUntrusted('facts-reading-path', fmt(facts.readingPath)),
    '',
    `FILE TREE (top ${MAX_PROMPT_PATHS} indexed paths by rank; first tasks may reference ONLY indexed paths):`,
    wrapUntrusted('file-tree', facts.indexedPaths.slice(0, MAX_PROMPT_PATHS).join('\n') || '(none)'),
    '',
    'RUN SOURCES (the ONLY allowed origin of run commands):',
  ];
  if (input.runSources.length === 0) lines.push('(none found — return an empty run_commands list)');
  for (const s of input.runSources) lines.push(wrapUntrusted(`run-source:${s.name}`, s.content));
  lines.push('', `Remember: all prose in ${input.language}.`);
  return lines.join('\n');
}
