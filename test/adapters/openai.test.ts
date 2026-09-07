import { describe, it, expect } from 'vitest';
import { createSanitizer } from '../../src/index.js';
import type { SanitizeReport } from '../../src/index.js';
import {
  sanitizeChatCompletionParams,
  sanitizeOpenAI,
  sanitizeResponsesParams,
  wrapChatCompletions,
  wrapResponses,
} from '../../src/openai/index.js';

const sanitizer = createSanitizer({ detectors: { email: 'mask' } });

const params = {
  model: 'gpt-4o-mini',
  temperature: 0,
  messages: [
    { role: 'system', content: 'You help support@company.com agents.' },
    { role: 'user', content: 'My email is john@example.com and my card is 4111 1111 1111 1111.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Call me at +1 555 123 4567' },
        { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
      ],
    },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', function: { name: 'lookup', arguments: '{"email":"jane@corp.io"}' } },
      ],
    },
  ],
};

describe('openai adapter', () => {
  it('sanitizes every message by default and leaves other params alone', () => {
    const { params: clean, report } = sanitizeChatCompletionParams(params, sanitizer);
    expect(clean.model).toBe('gpt-4o-mini');
    expect(clean.messages[0]!.content).toBe('You help s******@c******.com agents.');
    expect(clean.messages[1]!.content).toBe(
      'My email is j***@e******.com and my card is [REDACTED_CREDIT_CARD].',
    );
    expect(clean.messages[2]!.content).toEqual([
      { type: 'text', text: 'Call me at [REDACTED_PHONE]' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]);
    expect((clean.messages[3] as any).tool_calls[0].function.arguments).toBe(
      '{"email":"j***@c***.io"}',
    );
    expect(report.summary).toEqual({ email: 3, credit_card: 1, phone: 1 });
    expect(params.messages[1]!.content).toContain('john@example.com'); // input untouched
  });

  it('restricts sanitization to the given roles', () => {
    const { params: clean, report } = sanitizeChatCompletionParams(params, sanitizer, {
      roles: ['user'],
    });
    expect(clean.messages[0]!.content).toBe('You help support@company.com agents.');
    expect(clean.messages[1]!.content).toContain('[REDACTED_CREDIT_CARD]');
    expect((clean.messages[3] as any).tool_calls[0].function.arguments).toBe(
      '{"email":"jane@corp.io"}',
    );
    expect(report.entries.map((e) => e.path)).toEqual([
      'messages[1].content',
      'messages[1].content',
      'messages[2].content[0].text',
    ]);
    expect(report.summary).toEqual({ email: 1, credit_card: 1, phone: 1 });
  });

  it('wraps a create function and passes the return value through', async () => {
    const calls: unknown[] = [];
    const reports: SanitizeReport[] = [];
    const create = async (p: typeof params, options?: { signal?: AbortSignal }) => {
      calls.push([p, options]);
      return { id: 'chatcmpl-1' };
    };
    const wrapped = wrapChatCompletions(create, sanitizer, { onReport: (r) => reports.push(r) });
    const result = await wrapped(params, { signal: undefined });
    expect(result).toEqual({ id: 'chatcmpl-1' });
    const [sent, options] = calls[0] as [typeof params, unknown];
    expect(sent.messages[1]!.content).not.toContain('john@example.com');
    expect(options).toEqual({ signal: undefined });
    expect(reports).toHaveLength(1);
  });

  it('supports asynchronous token stores when async is set', async () => {
    const asyncSanitizer = createSanitizer({
      detectors: { email: 'tokenize' },
      tokenStore: { tokenize: async () => 'tok_1' },
    });
    const create = (p: { messages: Array<{ role: string; content: string }> }) =>
      p.messages[0]!.content;
    const wrapped = wrapChatCompletions(create, asyncSanitizer, { async: true });
    expect(await wrapped({ messages: [{ role: 'user', content: 'a@b.co' }] })).toBe('tok_1');
  });

  it('sanitizes Responses API input and instructions', () => {
    const input = {
      model: 'gpt-4.1',
      instructions: 'Reply to john@example.com politely',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'my ip is 10.0.0.1' }] }],
    };
    const { params: clean } = sanitizeResponsesParams(input, sanitizer);
    expect(clean.instructions).toBe('Reply to j***@e******.com politely');
    expect((clean.input as any)[0].content[0].text).toBe('my ip is [REDACTED_IP_ADDRESS]');

    const create = (p: { input: string }) => p;
    expect(wrapResponses(create, sanitizer)({ input: 'mail x@y.io' }).input).toBe('mail x@y.io');
  });

  it('patches an OpenAI-like client in place', async () => {
    const seen: unknown[] = [];
    const client = {
      chat: { completions: { create: async (p: unknown) => (seen.push(p), 'chat') } },
      responses: { create: async (p: unknown) => (seen.push(p), 'responses') },
    };
    const patched = sanitizeOpenAI(client, sanitizer);
    expect(patched).toBe(client);
    expect(
      await client.chat.completions.create({ messages: [{ role: 'user', content: 'a@b.co' }] }),
    ).toBe('chat');
    expect(await client.responses.create({ input: 'a@b.co' })).toBe('responses');
    expect(seen).toEqual([
      { messages: [{ role: 'user', content: 'a@b.co' }] },
      { input: 'a@b.co' },
    ]);
  });
});
