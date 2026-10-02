import type { HistoryLog } from './types.js';

/** Pino-compatible logger (obj-first) → `HistoryLog` (msg-first), for the HTTP path. */
export function fromPino(logger: { info: (obj: unknown, msg?: string) => void }): HistoryLog {
  return {
    info: (msg, data) => logger.info(data !== undefined ? { data } : {}, msg),
  };
}
