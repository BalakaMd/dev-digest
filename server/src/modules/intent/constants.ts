/**
 * Intent module constants — caps, prompt/schema names, and the source
 * classification tables from the plan's "Data sources" section.
 */

export const INTENT_PROMPT = 'intent-classifier.system.md';
export const INTENT_SCHEMA_NAME = 'IntentClassification';
export const INTENT_TEMPERATURE = 0.1;

/** Structured-output bounds (also enforced in code — strict schemas can't carry them). */
export const MAX_ITEMS = 6;
export const MAX_ITEM_CHARS = 160;

/** Non-trivial description threshold for `computeConfidence`. */
export const MIN_DESCRIPTION_CHARS = 40;

// ---- D1/D2/D3 caps (chars for title/description, counts for files) --------
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 8_000;
export const MAX_FILES = 200;
export const MAX_HUNK_HEADERS_PER_FILE = 20;

// ---- D4/D5/D6 caps (fetched content) ---------------------------------------
export const MAX_ISSUES = 3;
export const MAX_ISSUE_BYTES = 20_000;
export const MAX_DOCS = 3;
export const MAX_DOC_BYTES = 20_000;

/** Total budget for ALL fetched content (D4 + D5 + D6) — past it, `skipped`. */
export const TOTAL_FETCH_BUDGET_BYTES = 60_000;

/** Doc-looking file extensions eligible as a plan/spec source (D5/D6). */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.txt'];

/**
 * Directory segments and basename keywords that mark a changed file (D3) as a
 * plan/spec doc (D6) — mirrors the plan's globs `**\/plans/**\/*.md`,
 * `**\/specs/**\/*.md`, `**\/adr/**\/*.md`, `*plan*.md`, `*spec*.md`.
 */
export const PLAN_SPEC_DIRS = ['plans', 'specs', 'adr'];
export const PLAN_SPEC_NAME_KEYWORDS = ['plan', 'spec'];

/**
 * Known tracker/doc hosts (D7) — a link here is recorded as `unsupported` and
 * NEVER fetched. Matches the host itself or any subdomain of it.
 */
export const TICKET_HOSTS = [
  'atlassian.net',
  'linear.app',
  'notion.so',
  'notion.site',
  'docs.google.com',
  'app.clickup.com',
  'app.asana.com',
  'trello.com',
  'youtrack.cloud',
];

/** Closing keywords the PR description may use before an issue reference. Bare
 *  `#N` already matches without one — kept for readability / tests only. */
export const CLOSING_KEYWORDS = [
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
];
