import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSanitizer } from '../src/index.js';

/** Recursively compare structure: same keys, same array lengths, same primitive types for non-strings. */
function sameShape(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameShape(v, b[i]));
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return (
      ka.length === kb.length &&
      ka.every((k, i) => k === kb[i] && sameShape((a as any)[k], (b as any)[k]))
    );
  }
  if (typeof a === 'string') return typeof b === 'string';
  return Object.is(a, b);
}

const sensitiveString = fc.oneof(
  fc.string(),
  fc.constant('john.doe@example.com'),
  fc.constant('+1 (555) 123-4567'),
  fc.constant('4111 1111 1111 1111'),
  fc.constant('call 0991234567 or mail x@y.io from 10.0.0.1'),
  fc.constant(['sk_live_', '4eC39HqLyjWDarjtT1zdp7dc'].join('')), // assembled: see api-key-secret.test.ts
);

const payload = fc.letrec((tie) => ({
  leaf: fc.oneof(
    sensitiveString,
    fc.integer(),
    fc.double({ noNaN: true }),
    fc.boolean(),
    fc.constant(null),
  ),
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    tie('leaf'),
    fc.array(tie('node'), { maxLength: 5 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), tie('node'), { maxKeys: 5 }),
  ),
})).node;

describe('structural guarantees (property-based)', () => {
  const sanitizer = createSanitizer({ detectors: { email: 'mask', phone: 'hash' } });

  it('output has the same shape as the input when no drop rule is used', () => {
    fc.assert(
      fc.property(payload, (input) => {
        const { data } = sanitizer.sanitize(input);
        expect(sameShape(input, data)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('never mutates the input', () => {
    fc.assert(
      fc.property(payload, (input) => {
        const before = JSON.stringify(input);
        sanitizer.sanitize(input);
        expect(JSON.stringify(input)).toBe(before);
      }),
      { numRuns: 200 },
    );
  });

  it('is idempotent for redaction: sanitizing twice equals sanitizing once', () => {
    const redacting = createSanitizer();
    fc.assert(
      fc.property(payload, (input) => {
        const once = redacting.sanitize(input).data;
        const twice = redacting.sanitize(once).data;
        expect(twice).toEqual(once);
      }),
      { numRuns: 200 },
    );
  });

  it('leaves no detectable value behind after redaction', () => {
    const redacting = createSanitizer();
    fc.assert(
      fc.property(payload, (input) => {
        const { data } = redacting.sanitize(input);
        const strings: string[] = [];
        JSON.stringify(data, (_k, v) => {
          if (typeof v === 'string') strings.push(v);
          return v;
        });
        for (const s of strings) expect(redacting.detect(s)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});
