import path from 'node:path';

/**
 * runner-bundle adapter — port for the prebuilt agent-runner (`agent-runner/dist/`)
 * that an export commits to `.devdigest/runner/`. Paths are relative to the bundle
 * root (`index.js`, `300.index.js`, ...); the caller prefixes the repo directory.
 */
export interface RunnerBundleEntry {
  path: string;
  size_bytes: number;
}

export interface RunnerBundleFile {
  path: string;
  /** The runner is JavaScript, so UTF-8 text is lossless (Git Data API commits take text). */
  contents: string;
}

export interface RunnerBundle {
  /** Every file of the bundle with its size (stat only; contents are not read). */
  list(): Promise<RunnerBundleEntry[]>;
  /** Every file of the bundle with its contents. */
  read(): Promise<RunnerBundleFile[]>;
}

/** Thrown when the bundle was not built; the message tells the operator how. */
export class RunnerBundleMissingError extends Error {
  constructor(dir: string) {
    super(
      `The agent-runner bundle is missing (${path.join(dir, 'index.js')}). ` +
        'Build it with: cd agent-runner && pnpm build',
    );
    this.name = 'RunnerBundleMissingError';
  }
}
