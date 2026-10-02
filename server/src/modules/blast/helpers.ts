import type { BlastLog } from './types.js';

/** Pino-compatible logger (obj-first) → `BlastLog` (msg-first), for the HTTP path. */
export function fromPino(logger: { info: (obj: unknown, msg?: string) => void }): BlastLog {
  return {
    info: (msg, data) => logger.info(data !== undefined ? { data } : {}, msg),
  };
}
