import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveInside } from './path-guard.js';
import { ContextDocError } from './types.js';

/** Sidecar in a repo's overlay folder: `{ version: 1, origins: { "<path>": "<sha256>" } }`. */
export const ORIGINS_FILE = '.origins.json';

const HEX_RE = /^[0-9a-f]{64}$/;

/**
 * Per-repo record of the repository-text version each override copy was made
 * from (or last acknowledged against). Lives inside `<contextDir>/<repoId>/`
 * only, so it disappears with the repository. Values are only compared, never
 * used as content; a missing or malformed file reads as empty.
 */
export class OriginStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  /** `rootFor` returns the repo's overlay folder (and validates the repo id). */
  constructor(private readonly rootFor: (repoId: string) => string) {}

  async get(repoId: string): Promise<Map<string, string>> {
    const root = this.rootFor(repoId);
    const out = new Map<string, string>();
    try {
      const abs = await resolveInside(root, ORIGINS_FILE);
      const parsed: unknown = JSON.parse(await readFile(abs, 'utf8'));
      const origins = (parsed as { origins?: unknown } | null)?.origins;
      if (origins && typeof origins === 'object') {
        for (const [path, version] of Object.entries(origins)) {
          if (typeof version === 'string' && HEX_RE.test(version)) out.set(path, version);
        }
      }
    } catch {
      /* missing, unreadable or malformed: no origins recorded */
    }
    return out;
  }

  /**
   * Read-modify-write, serialised per repo. `mutate` returns true when it
   * changed the map; only then is the file rewritten (tmp + rename, mode 0600).
   * Write failures surface as `ContextDocError('io_error')`.
   */
  update(repoId: string, mutate: (origins: Map<string, string>) => boolean): Promise<void> {
    const root = this.rootFor(repoId);
    const run = async (): Promise<void> => {
      const origins = await this.get(repoId);
      if (!mutate(origins)) return;
      const body = JSON.stringify({ version: 1, origins: Object.fromEntries(origins) });
      let tmp: string | undefined;
      try {
        await mkdir(root, { recursive: true });
        const abs = await resolveInside(root, ORIGINS_FILE);
        tmp = join(root, `.origins.${process.pid}.${Date.now()}.tmp`);
        await writeFile(tmp, body, { flag: 'wx', mode: 0o600 });
        await rename(tmp, abs);
      } catch {
        if (tmp) await rm(tmp, { force: true }).catch(() => undefined);
        throw new ContextDocError('io_error');
      }
    };
    const prev = this.chains.get(repoId) ?? Promise.resolve();
    const next = prev.then(run, run);
    const tail = next.catch(() => undefined);
    this.chains.set(repoId, tail);
    void tail.then(() => {
      if (this.chains.get(repoId) === tail) this.chains.delete(repoId);
    });
    return next;
  }
}
