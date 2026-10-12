import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RunnerBundleMissingError,
  type RunnerBundle,
  type RunnerBundleEntry,
  type RunnerBundleFile,
} from './types.js';

const DEFAULT_DIR = fileURLToPath(new URL('../../../../agent-runner/dist/', import.meta.url));

/** Reads the bundle from `agent-runner/dist/` (resolved from this file, not the cwd). */
export class FsRunnerBundle implements RunnerBundle {
  constructor(private readonly dir: string = DEFAULT_DIR) {}

  async list(): Promise<RunnerBundleEntry[]> {
    const names = await this.fileNames();
    return Promise.all(
      names.map(async (name) => ({
        path: name,
        size_bytes: (await stat(path.join(this.dir, name))).size,
      })),
    );
  }

  async read(): Promise<RunnerBundleFile[]> {
    const names = await this.fileNames();
    return Promise.all(
      names.map(async (name) => ({
        path: name,
        contents: await readFile(path.join(this.dir, name), 'utf8'),
      })),
    );
  }

  /** Regular files under the bundle root, `/`-separated, sorted; requires `index.js`. */
  private async fileNames(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      const entries = await readdir(path.join(this.dir, rel), { withFileTypes: true });
      for (const e of entries) {
        const next = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(next);
        else if (e.isFile()) out.push(next);
      }
    };
    try {
      await walk('');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new RunnerBundleMissingError(this.dir);
      throw err;
    }
    if (!out.includes('index.js')) throw new RunnerBundleMissingError(this.dir);
    return out.sort();
  }
}
