import { maskKeepLast } from '../actions/mask.js';
import { countDigits, defineDetector } from './define.js';

const PHONE =
  /(?<![\p{L}\p{N}+@/#.-])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?|\d{1,4}[\s.-])?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?(?![\p{L}\p{N}@/-])/u;

const DATE_LIKE = [
  /^\d{4}[-.]\d{1,2}[-.]\d{1,2}$/, // 2024-01-15
  /^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$/, // 15-01-2024, 15.01.24
  /^\d{1,2}[-.]\d{4}$/, // 01-2024
];

function isPhoneNumber(candidate: string): boolean {
  if (DATE_LIKE.some((re) => re.test(candidate))) return false;
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  const formatted = /[\s().+-]/.test(candidate);
  // A bare run of digits is only treated as a phone number when it is at
  // least 9 digits long, to leave short numeric identifiers alone.
  if (!formatted && digits.length < 9) return false;
  // Sequences that repeat a single digit are placeholders, not numbers.
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

/**
 * Phone numbers in a permissive international format: optional `+` country
 * code, optional parenthesised area code, groups separated by spaces, dots
 * or dashes, 7-15 digits in total. Bare digit runs need at least 9 digits.
 * Dates such as `2024-01-15` are excluded.
 *
 * Mask keeps the last two digits: `+1 (555) 123-4567` -> `+* (***) ***-**67`.
 */
export const phone = defineDetector({
  name: 'phone',
  pattern: PHONE,
  validate: isPhoneNumber,
  prefilter: (value) => countDigits(value) >= 7,
  priority: 70,
  mask: (value, options) => maskKeepLast(value, 2, options),
});
