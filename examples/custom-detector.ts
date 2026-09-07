/**
 * Define a company-specific detector and combine it with the built-ins.
 * Run: npx tsx examples/custom-detector.ts
 */
import { createSanitizer, defineDetector, maskKeepLast } from '../src/index.js';

// A customer identifier with a trailing mod-97 check, validated before matching.
const customerId = defineDetector({
  name: 'customer_id',
  pattern: /\bCUST-\d{6}-\d{2}\b/,
  validate: (candidate) => {
    const [, digits, check] = candidate.split('-');
    return Number(digits) % 97 === Number(check);
  },
  action: 'hash',
  priority: 60,
  mask: (value, options) => maskKeepLast(value, 2, options),
});

const internalToken = defineDetector({
  name: 'internal_token',
  pattern: /\bACME-[A-Z0-9]{24}\b/,
  action: 'redact',
});

const sanitizer = createSanitizer({
  customDetectors: [customerId, internalToken],
  detectors: { customer_id: 'mask' }, // override the default action of a custom detector
  audit: true,
});

const text =
  'Ticket from CUST-123456-51 (also CUST-123456-00, invalid). Token ACME-ABCDEFGHIJKLMNOPQRSTUVWX leaked, mail a@b.co.';

console.log(sanitizer.detect(text));
const { data, report } = sanitizer.sanitize(text);
console.log(data);
console.log(report.summary);
