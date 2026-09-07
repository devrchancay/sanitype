import { maskKeepLast } from '../actions/mask.js';
import { countDigits, defineDetector } from './define.js';

/** Luhn checksum, used by every major card network. */
export function luhnCheck(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/[\s-]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  // Reject repeated separators or mixed separators that a card would never use.
  if (/[\s-]{2,}/.test(candidate)) return false;
  if (candidate.includes(' ') && candidate.includes('-')) return false;
  // A run of a single repeated digit passes Luhn for some lengths but is never a card.
  if (/^(\d)\1+$/.test(digits)) return false;
  return luhnCheck(digits);
}

/**
 * Payment card numbers (13-19 digits, optional spaces or dashes), validated
 * with the Luhn checksum to reduce false positives. Mask keeps the last four
 * digits: `4111 1111 1111 1111` -> `**** **** **** 1111`.
 */
export const creditCard = defineDetector({
  name: 'credit_card',
  pattern: /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/,
  validate: isCardNumber,
  prefilter: (value) => countDigits(value) >= 13,
  priority: 100,
  mask: (value, options) => maskKeepLast(value, 4, options),
});
