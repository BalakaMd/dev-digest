import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { z } from 'zod';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';
import { startLlmHttpStub, type LlmHttpStub, type StubReply } from './helpers/llm-http-stub.js';

/**
 * SPEC-03 NFR-1 / AC-15 / AC-20 — `singleAttempt: true` means exactly ONE HTTP
 * call at the provider boundary: no `withRetry`, no SDK-internal retry, no
 * reprompt loop. Proven against a loopback stub that counts requests, because
 * a mocked SDK client cannot show the SDK's own retries.
 */

const Answer = z.object({ answer: z.string() });

type Scenario = { name: string; reply: StubReply };

const FAILURES: Record<'openai' | 'anthropic', Scenario[]> = {
  openai: [
    { name: 'HTTP 500', reply: { status: 500, body: { error: { message: 'boom' } } } },
    { name: 'HTTP 429', reply: { status: 429, body: { error: { message: 'slow down' } } } },
    {
      name: 'an unparseable answer (HTTP 200)',
      reply: {
        status: 200,
        body: {
          id: 'x',
          object: 'chat.completion',
          model: 'm',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'not json at all' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      },
    },
  ],
  anthropic: [
    { name: 'HTTP 500', reply: { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'boom' } } } },
    {
      name: 'HTTP 429',
      reply: { status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } },
    },
    {
      name: 'an unparseable answer (HTTP 200)',
      reply: {
        status: 200,
        body: {
          id: 'x',
          type: 'message',
          role: 'assistant',
          model: 'm',
          stop_reason: 'tool_use',
          stop_sequence: null,
          content: [{ type: 'tool_use', id: 't', name: 'Answer', input: { wrong: 1 } }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    },
  ],
};

const request = {
  model: 'm',
  schema: Answer,
  schemaName: 'Answer',
  singleAttempt: true,
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('LLM adapters — singleAttempt makes exactly one HTTP call', () => {
  const savedEnv = {
    openai: process.env.OPENAI_BASE_URL,
    anthropic: process.env.ANTHROPIC_BASE_URL,
  };
  let stub: LlmHttpStub | undefined;
  let current: StubReply = { status: 500, body: {} };

  const start = async (): Promise<LlmHttpStub> => {
    stub = await startLlmHttpStub(() => current);
    return stub;
  };

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  afterAll(() => {
    if (savedEnv.openai === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = savedEnv.openai;
    if (savedEnv.anthropic === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = savedEnv.anthropic;
  });

  describe('OpenAIProvider', () => {
    it.each(FAILURES.openai)('rejects after one call on $name', async ({ reply }) => {
      current = reply;
      const s = await start();
      process.env.OPENAI_BASE_URL = s.url;
      const provider = new OpenAIProvider('sk-test');
      await expect(provider.completeStructured(request)).rejects.toBeInstanceOf(Error);
      expect(s.hits()).toBe(1);
    });
  });

  describe('AnthropicProvider', () => {
    it.each(FAILURES.anthropic)('rejects after one call on $name', async ({ reply }) => {
      current = reply;
      const s = await start();
      process.env.ANTHROPIC_BASE_URL = s.url;
      const provider = new AnthropicProvider('sk-ant-test');
      await expect(provider.completeStructured(request)).rejects.toBeInstanceOf(Error);
      expect(s.hits()).toBe(1);
    });
  });
});
