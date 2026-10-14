import { unzipSync } from 'fflate';
import { CI_ARTIFACT_MAX_BYTES, CI_RESULT_FILE_NAME, CiResultArtifact } from '@devdigest/shared';

export type ArtifactReadResult =
  | { ok: true; result: CiResultArtifact }
  | {
      ok: false;
      reason: 'too_large' | 'missing_file' | 'invalid_zip' | 'invalid_json' | 'invalid_schema';
      detail?: string;
    };

/**
 * Extract and validate the result file from a downloaded Actions artifact zip
 * (AC-57, NFR-2). The size cap is enforced twice before `JSON.parse`: on the
 * zip itself, and on the declared uncompressed size of the entry via the
 * `unzipSync` filter (so a zip bomb is never inflated), then on the real bytes.
 */
export function readResultArtifact(zip: Uint8Array): ArtifactReadResult {
  if (zip.byteLength > CI_ARTIFACT_MAX_BYTES) return { ok: false, reason: 'too_large' };

  let oversize = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      filter: (file) => {
        if (file.name !== CI_RESULT_FILE_NAME) return false;
        if (file.originalSize > CI_ARTIFACT_MAX_BYTES) {
          oversize = true;
          return false;
        }
        return true;
      },
    });
  } catch (err) {
    return { ok: false, reason: 'invalid_zip', detail: (err as Error).message };
  }
  if (oversize) return { ok: false, reason: 'too_large' };

  const bytes = files[CI_RESULT_FILE_NAME];
  if (!bytes) return { ok: false, reason: 'missing_file' };
  if (bytes.byteLength > CI_ARTIFACT_MAX_BYTES) return { ok: false, reason: 'too_large' };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (err) {
    return { ok: false, reason: 'invalid_json', detail: (err as Error).message };
  }
  const parsed = CiResultArtifact.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_schema', detail: parsed.error.issues[0]?.message };
  }
  return { ok: true, result: parsed.data };
}
