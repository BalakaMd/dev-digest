/** How many top-ranked source files `repoIntel.getConventionSamples()` contributes. */
export const SAMPLE_COUNT = 12;

/**
 * Style/tooling configs probed for at the clone root and at the top-level
 * folder of every ranked sample (so `client/tsconfig.json` is found in a repo
 * made of several packages). repo-intel never indexes configs (it walks JS/TS
 * only and filters configs out of rank samples), so the extractor probes for
 * them itself. A missing file is simply skipped.
 */
export const CONFIG_FILES = [
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'biome.json',
  '.editorconfig',
] as const;

/** At most this many top-level folders are probed for configs besides the root. */
export const MAX_CONFIG_DIRS = 4;

/** Lines of each file shown to the model (numbered). Evidence is still checked against the whole file. */
export const MAX_LINES_PER_FILE = 220;

/** Upper bound on candidates asked for in one scan. */
export const MAX_CANDIDATES = 15;

/** Evidence entries the model may cite per rule. */
export const MAX_EVIDENCE = 3;

/** Evidence entries kept on a candidate after merging duplicates. */
export const MAX_MERGED_EVIDENCE = 5;

/** A single evidence range may not span more lines than this. */
export const MAX_EVIDENCE_SPAN = 15;

/**
 * Models miscount lines now and then; when the quoted code is not at the cited
 * range, look this many lines either side and re-anchor the range on a match.
 */
export const EVIDENCE_LINE_TOLERANCE = 3;

/** Token-set Jaccard similarity at or above which two rules count as the same rule. */
export const DUPLICATE_RULE_SIMILARITY = 0.6;

/** Confidence bonus per additional distinct file backing a rule. */
export const MULTI_FILE_BONUS = 0.05;

/** Default skill type for skills built from conventions. */
export const CONVENTION_SKILL_TYPE = 'convention' as const;

/** Schema name for the structured LLM call (also the MockLLMProvider fixture key). */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

export const EXTRACTION_PROMPT = 'conventions-extraction.system.md';

/** Character budget for all sampled files in one prompt; files past it are left out. */
export const MAX_PROMPT_CHARS = 120_000;

/** Low temperature: extraction should be repeatable across re-scans. */
export const EXTRACTION_TEMPERATURE = 0.2;
