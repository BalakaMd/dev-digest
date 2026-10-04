import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A loopback HTTP server that stands in for an LLM provider API and counts the
 * requests it receives — used to prove "exactly one HTTP call" at the provider
 * boundary (SPEC-03 NFR-1), which a mocked SDK client cannot show (the SDKs
 * retry internally). Binds 127.0.0.1 only; always `close()` it.
 */
export interface StubReply {
  status: number;
  body: unknown;
}

export interface LlmHttpStub {
  /** Base URL including no trailing slash, e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** Number of HTTP requests received so far. */
  hits(): number;
  close(): Promise<void>;
}

export async function startLlmHttpStub(
  respond: (hit: number) => StubReply,
): Promise<LlmHttpStub> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      hits += 1;
      const reply = respond(hits);
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
