import { randomBytes } from 'node:crypto';
import type { TokenStore, TokenizeContext } from '../types.js';

export interface InMemoryTokenStoreOptions {
  /** Token prefix. Defaults to `tok_`. */
  prefix?: string;
  /** Custom token generator. Defaults to 16 random bytes, hex encoded. */
  generateToken?: () => string;
}

/** In-memory {@link TokenStore} with a helper to restore tokens found in text. */
export interface InMemoryTokenStore extends TokenStore {
  tokenize(value: string, context: TokenizeContext): string;
  detokenize(token: string): string | undefined;
  /** Replace every token known to this store that appears in `text` with its original value. */
  restore(text: string): string;
  /** Number of stored values. */
  readonly size: number;
  /** Forget every token. */
  clear(): void;
}

/**
 * Create an in-memory token store.
 *
 * Tokens are stable within a store instance (the same value always maps to
 * the same token) and can be reversed with `detokenize()` or `restore()`.
 *
 * This store keeps original values in process memory and loses them on
 * restart. It exists for local development, tests and short-lived
 * round-trips (e.g. tokenize a prompt, restore the LLM response). Do not use
 * it as a production vault.
 */
export function createInMemoryTokenStore(
  options: InMemoryTokenStoreOptions = {},
): InMemoryTokenStore {
  const prefix = options.prefix ?? 'tok_';
  const generate = options.generateToken ?? (() => randomBytes(16).toString('hex'));
  const byValue = new Map<string, string>();
  const byToken = new Map<string, string>();

  return {
    tokenize(value) {
      const existing = byValue.get(value);
      if (existing) return existing;
      let token: string;
      do {
        token = `${prefix}${generate()}`;
      } while (byToken.has(token));
      byValue.set(value, token);
      byToken.set(token, value);
      return token;
    },
    detokenize(token) {
      return byToken.get(token);
    },
    restore(text) {
      let out = text;
      for (const [token, value] of byToken) {
        if (out.includes(token)) out = out.split(token).join(value);
      }
      return out;
    },
    get size() {
      return byToken.size;
    },
    clear() {
      byValue.clear();
      byToken.clear();
    },
  };
}
