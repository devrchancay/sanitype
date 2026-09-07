import { describe, it, expect } from 'vitest';
import {
  createInMemoryTokenStore,
  createSanitizer,
  defineDetector,
  sanitize,
  sanitizeAsync,
} from '../src/index.js';

const payload = {
  user: {
    name: 'John Smith',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
  },
  card: '4111 1111 1111 1111',
  notes: 'Contact jane@corp.io or 0991234567 from 192.168.10.20.',
  password: 'hunter2hunter2',
  count: 3,
  active: true,
  nothing: null,
  tags: ['a', 'b@c.de'],
};

describe('sanitize()', () => {
  it('scrubs detector matches and leaves everything else untouched', () => {
    const { data, report } = sanitize(payload);
    expect(data.user.email).toBe('[REDACTED_EMAIL]');
    expect(data.user.phone).toBe('[REDACTED_PHONE]');
    expect(data.card).toBe('[REDACTED_CREDIT_CARD]');
    expect(data.notes).toBe(
      'Contact [REDACTED_EMAIL] or [REDACTED_PHONE] from [REDACTED_IP_ADDRESS].',
    );
    expect(data.tags).toEqual(['a', '[REDACTED_EMAIL]']);
    expect(data.user.name).toBe('John Smith'); // heuristic detectors are off by default
    expect(data.password).toBe('hunter2hunter2'); // no key-based guessing without a rule
    expect(data.count).toBe(3);
    expect(data.active).toBe(true);
    expect(data.nothing).toBeNull();
    expect(report.modified).toBe(true);
    expect(report.summary).toEqual({ email: 3, phone: 2, credit_card: 1, ip_address: 1 });
    expect(report.entries.find((e) => e.path === 'notes' && e.category === 'email')).toMatchObject({
      source: 'detector',
      action: 'redact',
      matches: 1,
    });
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('never mutates the input', () => {
    const copy = structuredClone(payload);
    sanitize(payload, { fields: { password: 'drop' } });
    expect(payload).toEqual(copy);
  });

  it('applies field rules with precedence over detectors', () => {
    const { data, report } = sanitize(payload, {
      fields: {
        'user.email': 'hash',
        'user.name': { action: 'mask', category: 'person_name' },
        password: 'drop',
        'tags[*]': 'allow',
      },
    });
    expect(data.user.email).toMatch(/^[0-9a-f]{64}$/);
    expect(data.user.name).toBe('J*** S****');
    expect('password' in data).toBe(false);
    expect(data.tags).toEqual(['a', 'b@c.de']);
    expect(report.entries).toContainEqual({
      path: 'password',
      category: 'field',
      source: 'field',
      action: 'drop',
    });
    expect(report.entries).toContainEqual({
      path: 'tags[1]',
      category: 'field',
      source: 'field',
      action: 'allow',
    });
  });

  it('infers the category of a mask/redact field rule when the whole value matches a detector', () => {
    const { data, report } = sanitize(
      {
        email: ' john.doe@example.com ',
        card: '4111 1111 1111 1111',
        text: 'hi john.doe@example.com',
        n: 42,
      },
      { fields: { email: 'mask', card: 'redact', text: 'mask', n: 'mask' } },
    );
    expect(data).toEqual({
      email: ' j***.d**@e******.com ',
      card: '[REDACTED_CREDIT_CARD]',
      text: '** ****.***@*******.***', // partial match: generic mask, nothing kept
      n: '**',
    });
    expect(report.entries.map((e) => [e.path, e.category, e.source])).toEqual([
      ['email', 'email', 'field'],
      ['card', 'credit_card', 'field'],
      ['text', 'field', 'field'],
      ['n', 'field', 'field'],
    ]);
    // Inference only uses enabled detectors and never applies to hash/drop/tokenize/allow.
    const { data: hashed } = sanitize(
      { email: 'a@b.co' },
      { fields: { email: 'hash' }, detectors: [] },
    );
    expect(hashed.email).toMatch(/^[0-9a-f]{64}$/);
    const { report: off } = sanitize(
      { email: 'a@b.co' },
      { fields: { email: 'mask' }, detectors: [] },
    );
    expect(off.entries[0]?.category).toBe('field');
  });

  it('applies container-level rules to every leaf, and drop/allow to the subtree', () => {
    const input = {
      secret: { a: 'x', b: [1, 'y', true, null] },
      gone: { z: 1 },
      kept: { e: 'a@b.co' },
    };
    const { data } = sanitize(input, { fields: { secret: 'mask', gone: 'drop', kept: 'allow' } });
    expect(data.secret).toEqual({ a: '*', b: ['*', '*', true, null] });
    expect(data).not.toHaveProperty('gone');
    expect(data.kept).toEqual({ e: 'a@b.co' });
  });

  it('drops array elements and removes matched substrings when a detector uses drop', () => {
    const { data } = sanitize(
      { list: ['keep', 'x@y.io', 'keep'], text: 'mail x@y.io now' },
      { fields: { 'list[1]': 'drop' }, detectors: { email: 'drop' } },
    );
    expect(data.list).toEqual(['keep', 'keep']);
    expect(data.text).toBe('mail  now');
  });

  it('handles the root being a string, array or dropped value', () => {
    expect(sanitize('mail a@b.co').data).toBe('mail [REDACTED_EMAIL]');
    expect(sanitize(['a@b.co']).data).toEqual(['[REDACTED_EMAIL]']);
    expect(sanitize('secret', { fields: { $: 'drop' } }).data).toBeUndefined();
    expect(sanitize(42).data).toBe(42);
    expect(sanitize(null).data).toBeNull();
  });

  it('supports per-detector actions and disabling detectors', () => {
    const { data } = sanitize(payload, {
      detectors: { email: 'mask', phone: false, ip_address: 'hash' },
      hash: { length: 10, prefix: 'ip:' },
    });
    expect(data.user.email).toBe('j***.d**@e******.com');
    expect(data.user.phone).toBe('+1 (555) 123-4567');
    expect(data.notes).toMatch(/from ip:[0-9a-f]{10}\.$/);
  });

  it('supports an explicit detector list that replaces the defaults', () => {
    const sanitizer = createSanitizer({ detectors: ['email'] });
    expect(sanitizer.detectors.map((d) => d.detector.name)).toEqual(['email']);
    expect(sanitizer.sanitize(payload).data.card).toBe('4111 1111 1111 1111');
  });

  it('enables heuristic detectors only on request', () => {
    const { data } = sanitize('Hello John Smith at 42 Main St', {
      detectors: { person_name: true, physical_address: 'mask' },
    });
    expect(data).toBe('Hello [REDACTED_PERSON_NAME] at ** **** **');
  });

  it('accepts custom detectors', () => {
    const customerId = defineDetector({
      name: 'customer_id',
      pattern: /\bCUST-\d{6}\b/,
      action: 'hash',
    });
    const { data, report } = sanitize('id CUST-123456 and a@b.co', {
      customDetectors: [customerId],
    });
    expect(data).toMatch(/^id [0-9a-f]{64} and \[REDACTED_EMAIL\]$/);
    expect(report.summary).toEqual({ customer_id: 1, email: 1 });

    const disabled = sanitize('id CUST-123456', {
      customDetectors: [customerId],
      detectors: { customer_id: false },
    });
    expect(disabled.data).toBe('id CUST-123456');

    const custom = sanitize('id CUST-123456', { detectors: [customerId, 'email'] });
    expect(custom.data).not.toContain('CUST-123456');
  });

  it('rejects unknown detectors, actions and invalid custom detectors', () => {
    expect(() => createSanitizer({ detectors: { nope: true } })).toThrow(/Unknown detector "nope"/);
    expect(() => createSanitizer({ detectors: { email: 'explode' as never } })).toThrow(
      /Unknown action/,
    );
    expect(() => createSanitizer({ customDetectors: [{ name: 'x' } as never] })).toThrow(
      /custom detector/,
    );
    expect(() => defineDetector({ name: 'Bad Name', pattern: /x/ })).toThrow(
      /Invalid detector name/,
    );
    expect(() => defineDetector({ name: 'empty' })).toThrow(/needs a "pattern"/);
    expect(() => createSanitizer({ maxStringLength: 0 })).toThrow(/maxStringLength/);
  });

  it('resolves overlapping matches by priority', () => {
    const { data, report } = sanitize('card 4111 1111 1111 1111 and 5500000000000004');
    expect(data).toBe('card [REDACTED_CREDIT_CARD] and [REDACTED_CREDIT_CARD]');
    expect(report.summary).toEqual({ credit_card: 2 });
  });

  it('skips oversized strings, circular references and unsupported values', () => {
    const big = 'a@b.co '.repeat(20);
    const circular: Record<string, unknown> = { email: 'a@b.co' };
    circular['self'] = circular;
    const { data, report } = sanitize(
      { big, circular, when: new Date(0), map: new Map([['k', 'a@b.co']]) },
      { maxStringLength: 50 },
    );
    expect(data.big).toBe(big);
    expect(data.circular.email).toBe('[REDACTED_EMAIL]');
    expect(data.circular.self).toBe('[Circular]');
    expect(data.when).toBeInstanceOf(Date);
    expect(data.map).toBeInstanceOf(Map);
    expect(report.skipped).toEqual([
      { path: 'big', reason: 'max_string_length', detail: '140 > 50' },
      { path: 'circular.self', reason: 'circular' },
      { path: 'map', reason: 'unsupported_value', detail: 'Map' },
    ]);
  });

  it('includes masked previews in audit mode and never the raw value', () => {
    const { report } = sanitize(payload, { audit: true, fields: { password: 'drop' } });
    const email = report.entries.find((e) => e.path === 'user.email')!;
    expect(email.preview).toBe('j***.d**@e******.com');
    const password = report.entries.find((e) => e.path === 'password')!;
    expect(password.preview).toBe('**************');
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(JSON.stringify(report)).not.toContain('john.doe@example.com');
  });

  it('supports custom redaction markers and mask characters', () => {
    const { data } = sanitize(
      { email: 'a@b.co', phone: '+1 555 123 4567' },
      {
        detectors: { phone: 'mask' },
        redact: { format: (category) => `<${category ?? 'hidden'}>` },
        mask: { char: '#' },
      },
    );
    expect(data).toEqual({ email: '<email>', phone: '+# ### ### ##67' });
  });

  it('tokenizes with a synchronous store and restores the original text', () => {
    const store = createInMemoryTokenStore();
    const sanitizer = createSanitizer({ detectors: { email: 'tokenize' }, tokenStore: store });
    const { data } = sanitizer.sanitize('write to a@b.co');
    expect(data).toMatch(/^write to tok_[0-9a-f]{32}$/);
    expect(store.restore(data)).toBe('write to a@b.co');
  });

  it('requires a token store for tokenize and rejects async stores in sync mode', () => {
    expect(() => sanitize('a@b.co', { detectors: { email: 'tokenize' } })).toThrow(/tokenStore/);
    const asyncStore = { tokenize: async () => 'tok' };
    expect(() =>
      sanitize('a@b.co', { detectors: { email: 'tokenize' }, tokenStore: asyncStore }),
    ).toThrow(/sanitizeAsync/);
  });

  it('awaits asynchronous token stores in sanitizeAsync', async () => {
    let n = 0;
    const asyncStore = { tokenize: async () => `tok${++n}` };
    const { data, report } = await sanitizeAsync(
      { emails: ['a@b.co', 'c@d.co'], text: 'x@y.co and z@w.co', nested: { email: 'q@r.co' } },
      { detectors: { email: 'tokenize' }, tokenStore: asyncStore },
    );
    expect(data).toEqual({
      emails: ['tok1', 'tok2'],
      text: 'tok3 and tok4',
      nested: { email: 'tok5' },
    });
    expect(report.summary).toEqual({ email: 5 });
    const root = await sanitizeAsync('a@b.co', {
      detectors: { email: 'tokenize' },
      tokenStore: asyncStore,
    });
    expect(root.data).toBe('tok6');
  });

  it('exposes detect() for inspection without modification', () => {
    const sanitizer = createSanitizer();
    expect(sanitizer.detect('mail a@b.co')).toEqual([
      { detector: 'email', confidence: 'high', start: 5, end: 11, value: 'a@b.co' },
    ]);
    expect(sanitizer.detect(123 as never)).toEqual([]);
  });

  it('extend() merges configuration into a new instance', () => {
    const base = createSanitizer({ fields: { a: 'drop' }, detectors: { email: 'mask' } });
    const extended = base.extend({ fields: { b: 'drop' }, detectors: { phone: false } });
    expect(extended.config.fields).toEqual({ a: 'drop', b: 'drop' });
    expect(extended.detectors.some((d) => d.detector.name === 'phone')).toBe(false);
    expect(extended.detectors.find((d) => d.detector.name === 'email')?.action).toBe('mask');
    expect(base.detectors.some((d) => d.detector.name === 'phone')).toBe(true);
  });

  it('is safe to reuse across concurrent calls', async () => {
    const sanitizer = createSanitizer();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(sanitizer.sanitize({ i, email: `u${i}@x.io` })),
      ),
    );
    results.forEach(({ data, report }, i) => {
      expect(data).toEqual({ i, email: '[REDACTED_EMAIL]' });
      expect(report.entries).toHaveLength(1);
    });
  });
});
