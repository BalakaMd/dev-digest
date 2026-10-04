import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/**
 * SPEC-03 NFR-1 / AC-15 / AC-20 — with `singleAttempt: true` the OpenRouter
 * provider makes exactly ONE HTTP call: no reprompt loop, no SDK-internal
 * retry (the SDK retries 429/5xx by default). Proven against a loopback stub
 * that counts requests.
 */

const Answer = z.object({ answer: z.string() });

interface Stub {
  url: string;
  hits(): number;
  close(): Promise<void>;
}

async function startStub(status: number, body: unknown): Promise<Stub> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      hits += 1;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
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

const unparseable = {
  id: 'x',
  object: 'chat.completion',
  model: 'm',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'not json at all' } }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const SCENARIOS = [
  { name: 'HTTP 500', status: 500, body: { error: { message: 'boom' } } },
  { name: 'HTTP 429', status: 429, body: { error: { message: 'slow down' } } },
  { name: 'an unparseable answer (HTTP 200)', status: 200, body: unparseable },
];

describe('OpenRouterProvider — singleAttempt makes exactly one HTTP call', () => {
  let stub: Stub | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  it.each(SCENARIOS)('rejects after one call on $name', async ({ status, body }) => {
    stub = await startStub(status, body);
    // The constructor-level maxRetries (default 2) must not leak into a single-attempt request.
    const provider = new OpenRouterProvider('sk-test', { baseURL: stub.url, maxRetries: 2 });
    await expect(
      provider.completeStructured({
        model: 'm',
        schema: Answer,
        schemaName: 'Answer',
        singleAttempt: true,
        maxRetries: 2,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(stub.hits()).toBe(1);
  });
});
