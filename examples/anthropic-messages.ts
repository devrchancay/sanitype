/**
 * Scrub Anthropic Messages API requests.
 * Run: npx tsx examples/anthropic-messages.ts
 *
 * With the real SDK:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const anthropic = sanitizeAnthropic(new Anthropic(), sanitizer);
 */
import { createSanitizer } from '../src/index.js';
import { sanitizeAnthropic } from '../src/anthropic/index.js';

const sanitizer = createSanitizer({ detectors: { email: 'mask' } });

const client = {
  messages: {
    async create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: unknown[];
    }) {
      console.log('request sent to the API:', JSON.stringify(params, null, 2));
      return { id: 'msg_demo', content: [{ type: 'text', text: 'Done.' }] };
    },
  },
};

const anthropic = sanitizeAnthropic(client, sanitizer, {
  onReport: (report) => console.log('report summary:', report.summary),
});

await anthropic.messages.create({
  model: 'claude-sonnet-5',
  max_tokens: 256,
  system: 'Escalations go to escalations@company.com.',
  messages: [
    { role: 'user', content: 'My SSN is 123-45-6789 and my IP is 10.0.0.1.' },
    { role: 'user', content: [{ type: 'text', text: 'Reach me at ana@example.ec' }] },
  ],
});
