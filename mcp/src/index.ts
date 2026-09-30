/**
 * Entry point. stdout carries only the JSON-RPC protocol — redirect
 * console.log/info/debug to stderr FIRST, before anything else runs, per
 * stdio hygiene.
 */
console.log = (...args: unknown[]) => process.stderr.write(args.map(String).join(' ') + '\n');
console.info = console.log;
console.debug = console.log;

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DevDigestApi } from './api/client.js';
import { createServer } from './server.js';
import { log } from './log.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new DevDigestApi({ baseUrl: config.apiUrl, timeoutMs: config.httpTimeoutMs });
  const server = createServer({ api, apiUrl: config.apiUrl });

  const transport = new StdioServerTransport();

  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);

  await server.connect(transport);
  log.info('devdigest MCP server connected over stdio', { apiUrl: config.apiUrl });
}

main().catch((err) => {
  log.error('fatal startup error', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
