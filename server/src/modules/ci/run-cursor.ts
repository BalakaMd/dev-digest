import type { CiRunsKeyset } from './types.js';

/** Opaque keyset cursor of the CI runs list: base64url of `<ran_at ISO>|<run id>`. */

const ID_RE = /^[0-9a-f-]{36}$/i;

export function encodeRunsCursor(k: CiRunsKeyset): string {
  return Buffer.from(`${k.ranAt.toISOString()}|${k.id}`, 'utf8').toString('base64url');
}

/** Null when the cursor is not one this module produced. */
export function decodeRunsCursor(cursor: string): CiRunsKeyset | null {
  let text: string;
  try {
    text = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const [iso, id, ...rest] = text.split('|');
  if (!iso || !id || rest.length > 0 || !ID_RE.test(id)) return null;
  const ranAt = new Date(iso);
  if (Number.isNaN(ranAt.getTime()) || ranAt.toISOString() !== iso) return null;
  return { ranAt, id };
}
