import { createHash } from 'node:crypto';
import type { HashOptions } from '../types.js';

/** Deterministic one-way hash of a value. */
export function hashValue(value: string, options: HashOptions = {}): string {
  const algorithm = options.algorithm ?? 'sha256';
  const digest = createHash(algorithm)
    .update(options.salt ?? '')
    .update(value)
    .digest(options.encoding ?? 'hex');
  const truncated = options.length && options.length > 0 ? digest.slice(0, options.length) : digest;
  return `${options.prefix ?? ''}${truncated}`;
}
