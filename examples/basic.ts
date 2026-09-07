/**
 * Basic usage: one-off call and a reusable sanitizer with field rules.
 * Run: npx tsx examples/basic.ts
 */
import { createSanitizer, sanitize } from '../src/index.js';

const payload = {
  user: {
    name: 'John Smith',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    ssn: '123-45-6789',
  },
  password: 'hunter2hunter2',
  notes: 'Customer pasted card 4111 1111 1111 1111 and wrote api_key=0123456789abcdef',
  tags: ['vip', 'contact: jane@corp.io'],
};

// 1. Zero configuration: every high-confidence detector redacts what it finds.
const quick = sanitize(payload);
console.log('quick:', JSON.stringify(quick.data, null, 2));
console.log('summary:', quick.report.summary);

// 2. A reusable instance with explicit rules for known fields.
const sanitizer = createSanitizer({
  fields: {
    'user.name': { action: 'mask', category: 'person_name' },
    'user.email': 'mask',
    'user.phone': 'hash',
    password: 'drop',
    'tags[*]': 'allow',
  },
  detectors: { credit_card: 'mask', api_key_secret: 'redact' },
  hash: { salt: 'change-me', length: 16, prefix: 'h:' },
  audit: true,
});

const { data, report } = sanitizer.sanitize(payload);
console.log('configured:', JSON.stringify(data, null, 2));
console.table(report.entries);
