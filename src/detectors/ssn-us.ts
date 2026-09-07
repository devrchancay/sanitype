import { maskKeepLast } from '../actions/mask.js';
import { countDigits, defineDetector } from './define.js';

/**
 * United States Social Security Numbers written with separators
 * (`123-45-6789` or `123 45 6789`). Invalid area, group and serial ranges are
 * excluded. Bare nine-digit runs are not treated as SSNs; the `phone`
 * detector covers those. Mask keeps the last four digits.
 */
export const ssnUs = defineDetector({
  name: 'ssn_us',
  pattern: /(?<![\d-])(?!000|666|9\d\d)\d{3}([- ])(?!00)\d{2}\1(?!0000)\d{4}(?![\d-])/,
  prefilter: (value) => countDigits(value) >= 9,
  priority: 80,
  mask: (value, options) => maskKeepLast(value, 4, options),
});
