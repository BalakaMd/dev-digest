import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

/**
 * SPEC-10 AC-45 — the OpenRouter provider tags every result with where its cost came from:
 * `provider` when every HTTP attempt returned `usage.cost`, `estimate` when none did (cost then
 * comes from the injected estimator), `mixed` when only some did. Proven against a loopback stub
 * that answers requests from a queue.
 */

const Answer = z.object({ answer: z.string() });

interface Reply {
  content: string;
  /** Omit to leave `usage.cost` out of the response. */
  cost?: number;
}

interface Stub {
  url: string;
  hits(): number;
  close(): Promise<void>;
}

async function startStub(replies: Reply[]): Promise<Stub> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const reply = replies[Math.min(hits, replies.length - 1)]!;
      hits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          model: 'm',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: reply.content } }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
            ...(reply.cost === undefined ? {} : { cost: reply.cost }),
          },
        }),
      );
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

const GOOD = JSON.stringify({ answer: 'ok' });
const BAD = 'not json at all';
const ESTIMATE = 0.5;

describe('OpenRouterProvider — costSource (AC-45)', () => {
  let stub: Stub | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  async function call(replies: Reply[]) {
    stub = await startStub(replies);
    const provider = new OpenRouterProvider('sk-test', {
      baseURL: stub.url,
      maxRetries: 0,
      estimateCost: () => ESTIMATE,
    });
    return provider.completeStructured({
      model: 'm',
      schema: Answer,
      schemaName: 'Answer',
      messages: [{ role: 'user', content: 'hi' }],
    });
  }

  it('usage.cost present → provider, with the provider-reported cost (not the estimate)', async () => {
    const res = await call([{ content: GOOD, cost: 0.0123 }]);
    expect(res.costSource).toBe('provider');
    expect(res.costUsd).toBeCloseTo(0.0123);
  });

  it('usage.cost absent → estimate, with the injected estimator cost', async () => {
    const res = await call([{ content: GOOD }]);
    expect(res.costSource).toBe('estimate');
    expect(res.costUsd).toBe(ESTIMATE);
  });

  it('usage.cost on only one of two attempts → mixed', async () => {
    // Attempt 1 is unparseable (re-prompted) and carries a cost; attempt 2 parses and has none.
    const res = await call([{ content: BAD, cost: 0.01 }, { content: GOOD }]);
    expect(stub!.hits()).toBe(2);
    expect(res.attempts).toBe(2);
    expect(res.costSource).toBe('mixed');
  });

  it('usage.cost on both of two attempts → provider, costs summed', async () => {
    const res = await call([
      { content: BAD, cost: 0.01 },
      { content: GOOD, cost: 0.02 },
    ]);
    expect(res.attempts).toBe(2);
    expect(res.costSource).toBe('provider');
    expect(res.costUsd).toBeCloseTo(0.03);
  });
});
