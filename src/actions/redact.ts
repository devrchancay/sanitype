import type { RedactOptions } from '../types.js';

/** Default redaction marker: `[REDACTED_EMAIL]`, or `[REDACTED]` without a category. */
export function defaultRedactFormat(category: string | undefined): string {
  if (!category) return '[REDACTED]';
  const label = category
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return label ? `[REDACTED_${label}]` : '[REDACTED]';
}

export function redactValue(category: string | undefined, options: RedactOptions = {}): string {
  return (options.format ?? defaultRedactFormat)(category);
}
