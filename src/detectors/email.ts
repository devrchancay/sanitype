import { maskKeepFirst } from '../actions/mask.js';
import { defineDetector } from './define.js';

const EMAIL =
  /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*\.\p{L}{2,}(?![\p{L}\p{N}-])/u;

/**
 * Email addresses.
 *
 * Mask keeps the first character of every local-part and domain label plus
 * the top-level domain: `john.doe@example.com` -> `j***.d**@e******.com`.
 */
export const email = defineDetector({
  name: 'email',
  pattern: EMAIL,
  prefilter: (value) => value.includes('@'),
  priority: 90,
  mask(value, options) {
    const at = value.lastIndexOf('@');
    if (at < 0) return value.replace(/[\p{L}\p{N}]/gu, options.char);
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const maskPart = (part: string) =>
      part
        .split('.')
        .map((label) => maskKeepFirst(label, 1, options))
        .join('.');
    const labels = domain.split('.');
    const tld = labels.pop() ?? '';
    const maskedDomain = labels.length ? `${maskPart(labels.join('.'))}.${tld}` : tld;
    return `${maskPart(local)}@${maskedDomain}`;
  },
});
