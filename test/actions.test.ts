import { describe, it, expect } from 'vitest';
import {
  createInMemoryTokenStore,
  defaultRedactFormat,
  hashValue,
  maskGeneric,
  maskKeepFirst,
  maskKeepLast,
  maskWordsKeepInitial,
} from '../src/index.js';

describe('mask helpers', () => {
  it('maskGeneric hides every letter and digit but keeps shape', () => {
    expect(maskGeneric('John-Doe 42')).toBe('****-*** **');
    expect(maskGeneric('ñandú', { char: '#' })).toBe('#####');
  });

  it('maskKeepLast and maskKeepFirst keep the requested number of alphanumerics', () => {
    expect(maskKeepLast('1234-5678', 4)).toBe('****-5678');
    expect(maskKeepFirst('abcdef', 2)).toBe('ab****');
    expect(maskKeepLast('12', 4)).toBe('12');
  });

  it('maskWordsKeepInitial keeps the first character of each word', () => {
    expect(maskWordsKeepInitial('Ana María Torres')).toBe('A** M**** T*****');
  });
});

describe('hashValue', () => {
  it('is deterministic and honours salt, length, prefix and encoding', () => {
    const a = hashValue('john@example.com');
    expect(a).toBe(hashValue('john@example.com'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashValue('john@example.com', { salt: 's' })).not.toBe(a);
    expect(hashValue('x', { length: 8, prefix: 'h:' })).toMatch(/^h:[0-9a-f]{8}$/);
    expect(hashValue('x', { encoding: 'base64url', algorithm: 'sha512' })).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });
});

describe('defaultRedactFormat', () => {
  it('builds markers from categories', () => {
    expect(defaultRedactFormat(undefined)).toBe('[REDACTED]');
    expect(defaultRedactFormat('email')).toBe('[REDACTED_EMAIL]');
    expect(defaultRedactFormat('customer-id')).toBe('[REDACTED_CUSTOMER_ID]');
    expect(defaultRedactFormat('***')).toBe('[REDACTED]');
  });
});

describe('createInMemoryTokenStore', () => {
  it('issues stable, reversible tokens', () => {
    const store = createInMemoryTokenStore();
    const t1 = store.tokenize('a@b.co', { path: 'email' });
    const t2 = store.tokenize('a@b.co', { path: 'other' });
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^tok_[0-9a-f]{32}$/);
    expect(store.detokenize(t1)).toBe('a@b.co');
    expect(store.detokenize('tok_missing')).toBeUndefined();
    expect(store.size).toBe(1);
    expect(store.restore(`send to ${t1} please`)).toBe('send to a@b.co please');
    store.clear();
    expect(store.size).toBe(0);
  });

  it('supports custom prefixes and generators', () => {
    let n = 0;
    const store = createInMemoryTokenStore({ prefix: 'T', generateToken: () => String(++n) });
    expect(store.tokenize('x', { path: '$' })).toBe('T1');
    expect(store.tokenize('y', { path: '$' })).toBe('T2');
  });
});
