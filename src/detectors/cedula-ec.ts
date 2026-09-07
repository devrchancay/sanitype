import { maskKeepLast } from '../actions/mask.js';
import { countDigits, defineDetector } from './define.js';

/**
 * Validate an Ecuadorian cédula de identidad (10 digits) using the official
 * module-10 algorithm. Also accepts the 13-digit RUC of a natural person
 * (cédula followed by `001`).
 */
export function isEcuadorianCedula(candidate: string): boolean {
  if (!/^\d{10}(?:001)?$/.test(candidate)) return false;
  const digits = candidate.slice(0, 10);
  const province = Number(digits.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  const third = Number(digits[2]);
  if (third > 5) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let product = Number(digits[i]) * (i % 2 === 0 ? 2 : 1);
    if (product > 9) product -= 9;
    sum += product;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[9]);
}

/**
 * Ecuadorian national ID numbers (cédula) and natural-person RUCs, validated
 * with the official checksum. Mask keeps the last three digits.
 */
export const cedulaEc = defineDetector({
  name: 'cedula_ec',
  pattern: /(?<![\d-])\d{10}(?:001)?(?![\d-])/,
  validate: isEcuadorianCedula,
  prefilter: (value) => countDigits(value) >= 10,
  priority: 75,
  mask: (value, options) => maskKeepLast(value, 3, options),
});
