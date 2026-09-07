import type { MaskOptions } from '../types.js';

export const DEFAULT_MASK_OPTIONS: Required<MaskOptions> = { char: '*' };

const ALNUM = /[\p{L}\p{N}]/u;

/**
 * Generic shape-preserving mask: every letter and digit becomes the mask
 * character, punctuation and whitespace are kept. Nothing from the original
 * value stays visible.
 */
export function maskGeneric(
  value: string,
  options: Required<MaskOptions> = DEFAULT_MASK_OPTIONS,
): string {
  let out = '';
  for (const char of value) {
    out += ALNUM.test(char) ? options.char : char;
  }
  return out;
}

/** Mask every letter/digit except the last `keep` alphanumerics. */
export function maskKeepLast(
  value: string,
  keep: number,
  options: Required<MaskOptions> = DEFAULT_MASK_OPTIONS,
): string {
  const chars = Array.from(value);
  let remaining = keep;
  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i]!;
    if (!ALNUM.test(char)) continue;
    if (remaining > 0) {
      remaining--;
    } else {
      chars[i] = options.char;
    }
  }
  return chars.join('');
}

/** Mask every letter/digit except the first `keep` alphanumerics. */
export function maskKeepFirst(
  value: string,
  keep: number,
  options: Required<MaskOptions> = DEFAULT_MASK_OPTIONS,
): string {
  const chars = Array.from(value);
  let remaining = keep;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    if (!ALNUM.test(char)) continue;
    if (remaining > 0) {
      remaining--;
    } else {
      chars[i] = options.char;
    }
  }
  return chars.join('');
}

/** Mask each whitespace/punctuation-separated word, keeping its first character. */
export function maskWordsKeepInitial(
  value: string,
  options: Required<MaskOptions> = DEFAULT_MASK_OPTIONS,
): string {
  return value.replace(/[\p{L}\p{N}]+/gu, (word) => {
    const [first, ...rest] = Array.from(word);
    return `${first}${options.char.repeat(rest.length)}`;
  });
}
