/**
 * Reversible round-trip: tokenize a prompt, call the model, restore the answer.
 * Run: npx tsx examples/tokenize-roundtrip.ts
 */
import { createInMemoryTokenStore, createSanitizer } from '../src/index.js';

const store = createInMemoryTokenStore();
const sanitizer = createSanitizer({
  detectors: { email: 'tokenize', phone: 'tokenize', credit_card: 'redact' },
  tokenStore: store,
});

const request =
  'Draft a reply to maria@example.com confirming the refund. Her phone is +593 99 123 4567.';
const { data: prompt, report } = sanitizer.sanitize(request);
console.log('prompt sent to the model:\n ', prompt);
console.log('report:', report.summary);

// A fake model that echoes the tokens back in its answer.
const answer = `Hello! I have emailed ${prompt.match(/tok_[0-9a-f]+/)?.[0]} and will call ${prompt.match(/tok_[0-9a-f]+/g)?.[1]} shortly.`;
console.log('model answer:\n ', answer);

console.log('restored answer:\n ', store.restore(answer));
console.log('stored tokens:', store.size);
