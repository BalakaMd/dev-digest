/** Most changed files queried against GitHub per request (GraphQL cost guard). */
export const HISTORY_MAX_FILES = 20;

/** Latest commits inspected per file on the base ref. */
export const HISTORY_COMMITS_PER_FILE = 20;

/** Associated pull requests read per commit. */
export const HISTORY_PULLS_PER_COMMIT = 3;

/** Most prior PRs returned to the client. */
export const HISTORY_MAX_PRS = 8;

/** A prior PR touching more files than this is a mass refactor and is dropped as noise. */
export const HISTORY_MAX_PR_CHANGED_FILES = 100;

/** How long a successful result stays in the in-memory cache. */
export const HISTORY_CACHE_TTL_MS = 10 * 60_000;

/** Upper bound of cached results; the oldest entry is evicted first. */
export const HISTORY_CACHE_MAX_ENTRIES = 200;

/** File names whose history says nothing about the change (lockfiles). */
export const HISTORY_SKIP_BASENAMES: readonly string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
];

/** Directory names whose files are vendored, built or snapshot output. */
export const HISTORY_SKIP_SEGMENTS: readonly string[] = [
  'vendor',
  'dist',
  'build',
  'node_modules',
  '__snapshots__',
];

/** File name suffixes of generated or minified artifacts. */
export const HISTORY_SKIP_SUFFIXES: readonly string[] = ['.lock', '.snap', '.min.js'];

/** File name infix marking generated code (e.g. `api.generated.ts`). */
export const HISTORY_SKIP_INFIX = '.generated.';
