import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSanitizer } from '../src/index.js';
import { fieldsFromSchema, getSensitivity, parseDescription, sensitive } from '../src/zod/index.js';

describe('sensitive()', () => {
  it('returns the same schema instance and keeps validation intact', () => {
    const schema = z.string().email();
    expect(sensitive(schema, 'mask')).toBe(schema);
    expect(schema.safeParse('a@b.co').success).toBe(true);
    expect(schema.safeParse('nope').success).toBe(false);
    expect(getSensitivity(schema)).toEqual({ action: 'mask' });
  });

  it('defaults to redact and rejects unknown actions', () => {
    expect(getSensitivity(sensitive(z.string()))).toEqual({ action: 'redact' });
    expect(() => sensitive(z.string(), 'explode' as never)).toThrow(/Unknown action/);
  });
});

describe('parseDescription()', () => {
  it('parses sensitive tags', () => {
    expect(parseDescription('sensitive')).toEqual({ action: 'redact' });
    expect(parseDescription('sensitive:hash')).toEqual({ action: 'hash' });
    expect(parseDescription('sensitive:mask:email')).toEqual({ action: 'mask', category: 'email' });
    expect(parseDescription('The user email')).toBeUndefined();
  });
});

describe('fieldsFromSchema()', () => {
  const Address = z.object({
    street: sensitive(z.string(), { action: 'redact', category: 'physical_address' }),
    city: z.string(),
  });

  const User = z.object({
    id: z.string().uuid(),
    email: sensitive(z.string().email(), 'mask'),
    phone: sensitive(z.string(), 'hash').optional(),
    ssn: sensitive(z.string(), { action: 'redact', category: 'ssn_us' }).nullable(),
    password: sensitive(z.string(), 'drop'),
    address: Address,
    previous: z.array(Address),
    aliases: z.array(sensitive(z.string(), 'mask')).default([]),
    settings: z.record(z.string(), sensitive(z.string(), 'redact')),
    contact: z.union([z.object({ mail: sensitive(z.string().email(), 'mask') }), z.string()]),
    notes: z.string().describe('sensitive:redact:notes'),
    ip: z.ipv4().meta({ sensitive: 'mask' }),
    profile: z.object({ bio: z.string() }).describe('sensitive'),
  });

  it('derives field rules with inferred categories', () => {
    expect(fieldsFromSchema(User)).toEqual({
      email: { action: 'mask', category: 'email' },
      phone: { action: 'hash' },
      ssn: { action: 'redact', category: 'ssn_us' },
      password: { action: 'drop' },
      'address.street': { action: 'redact', category: 'physical_address' },
      'previous[*].street': { action: 'redact', category: 'physical_address' },
      'aliases[*]': { action: 'mask' },
      'settings.*': { action: 'redact' },
      'contact.mail': { action: 'mask', category: 'email' },
      notes: { action: 'redact', category: 'notes' },
      ip: { action: 'mask', category: 'ip_address' },
      profile: { action: 'redact' },
    });
  });

  it('supports a path prefix and root-level sensitivity', () => {
    expect(fieldsFromSchema(User, { prefix: 'body' })['body.email']).toEqual({
      action: 'mask',
      category: 'email',
    });
    expect(fieldsFromSchema(sensitive(z.string(), 'hash'))).toEqual({ $: { action: 'hash' } });
    expect(fieldsFromSchema(sensitive(z.string(), 'hash'), { prefix: 'q' })).toEqual({
      q: { action: 'hash' },
    });
  });

  it('handles tuples, intersections, pipes and lazy schemas without infinite loops', () => {
    type Tree = { value: string; children: Tree[] };
    const Tree: z.ZodType<Tree> = z.lazy(() =>
      z.object({ value: sensitive(z.string(), 'mask'), children: z.array(Tree) }),
    );
    const schema = z.object({
      pair: z.tuple([sensitive(z.string(), 'hash'), z.number()]),
      both: z.intersection(z.object({ a: sensitive(z.string()) }), z.object({ b: z.string() })),
      piped: sensitive(z.string(), 'mask').pipe(z.string()),
      tree: Tree,
    });
    expect(fieldsFromSchema(schema)).toEqual({
      'pair[0]': { action: 'hash' },
      'both.a': { action: 'redact' },
      piped: { action: 'mask' },
      'tree.value': { action: 'mask' },
    });
  });

  it('returns an empty map for non-schemas', () => {
    expect(fieldsFromSchema(null)).toEqual({});
    expect(fieldsFromSchema({})).toEqual({});
  });

  it('plugs into the sanitizer end to end', () => {
    const sanitizer = createSanitizer({ fields: fieldsFromSchema(User) });
    const input = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'john.doe@example.com',
      phone: '+1 555 123 4567',
      ssn: '123-45-6789',
      password: 'hunter2',
      address: { street: '42 Main St', city: 'Quito' },
      previous: [{ street: '1 Old Rd', city: 'Loja' }],
      aliases: ['jd'],
      settings: { theme: 'dark' },
      contact: { mail: 'x@y.io' },
      notes: 'free text with jane@corp.io',
      ip: '10.0.0.1',
      profile: { bio: 'hello' },
    };
    const { data, report } = sanitizer.sanitize(input);
    expect(data).toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'j***.d**@e******.com',
      phone: expect.stringMatching(/^[0-9a-f]{64}$/),
      ssn: '[REDACTED_SSN_US]',
      address: { street: '[REDACTED_PHYSICAL_ADDRESS]', city: 'Quito' },
      previous: [{ street: '[REDACTED_PHYSICAL_ADDRESS]', city: 'Loja' }],
      aliases: ['**'],
      settings: { theme: '[REDACTED]' },
      contact: { mail: 'x@y.io' },
      notes: '[REDACTED_NOTES]',
      ip: '10.*.*.*',
      profile: { bio: '[REDACTED]' },
    });
    expect(report.entries.every((e) => e.source === 'field')).toBe(true);
  });
});
