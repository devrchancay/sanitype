import { describe, it, expect } from 'vitest';
import { createSanitizer } from '../../src/index.js';
import {
  sanitizeAnthropic,
  sanitizeMessageParams,
  wrapMessages,
} from '../../src/anthropic/index.js';

const sanitizer = createSanitizer({ detectors: { email: 'mask' } });

const params = {
  model: 'claude-sonnet-5',
  max_tokens: 256,
  system: 'Support inbox: support@company.com',
  messages: [
    { role: 'user', content: 'I am john@example.com, ssn 123-45-6789' },
    { role: 'user', content: [{ type: 'text', text: 'card 4111 1111 1111 1111' }] },
  ],
};

describe('anthropic adapter', () => {
  it('sanitizes messages and the system prompt', () => {
    const { params: clean, report } = sanitizeMessageParams(params, sanitizer);
    expect(clean.system).toBe('Support inbox: s******@c******.com');
    expect(clean.messages[0]!.content).toBe('I am j***@e******.com, ssn [REDACTED_SSN_US]');
    expect(clean.messages[1]!.content).toEqual([
      { type: 'text', text: 'card [REDACTED_CREDIT_CARD]' },
    ]);
    expect(clean.max_tokens).toBe(256);
    expect(report.summary).toEqual({ email: 2, ssn_us: 1, credit_card: 1 });
  });

  it('can leave the system prompt alone', () => {
    const { params: clean } = sanitizeMessageParams(params, sanitizer, { system: false });
    expect(clean.system).toBe(params.system);
  });

  it('wraps and patches clients', async () => {
    const seen: unknown[] = [];
    const client = { messages: { create: async (p: unknown) => (seen.push(p), 'ok') } };
    sanitizeAnthropic(client, sanitizer);
    expect(await client.messages.create(params)).toBe('ok');
    expect((seen[0] as typeof params).messages[0]!.content).not.toContain('john@example.com');

    const wrapped = wrapMessages((p: typeof params) => p, sanitizer, {
      system: false,
      onReport: () => {},
    });
    expect(wrapped(params).system).toBe(params.system);
  });
});
