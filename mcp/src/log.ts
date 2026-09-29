/**
 * stderr-only logger. stdout carries the MCP protocol (stdio hygiene) — never
 * write anything but a JSON-RPC message to stdout, in this file or anywhere
 * else in the package.
 */
function write(level: string, message: string, meta?: unknown): void {
  const line = meta === undefined ? `[devdigest-mcp] ${level}: ${message}` : `[devdigest-mcp] ${level}: ${message} ${safeStringify(meta)}`;
  process.stderr.write(line + '\n');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
