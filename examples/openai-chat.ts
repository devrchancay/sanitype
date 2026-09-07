/**
 * Scrub chat messages before they reach an OpenAI-compatible API.
 * Run: npx tsx examples/openai-chat.ts
 *
 * With the real SDK:
 *   import OpenAI from 'openai';
 *   const openai = sanitizeOpenAI(new OpenAI(), sanitizer, { roles: ['user', 'tool'] });
 *
 * This example uses a structural stub so it runs without network access or an API key.
 */
import { createSanitizer } from '../src/index.js';
import { sanitizeChatCompletionParams, sanitizeOpenAI } from '../src/openai/index.js';

const sanitizer = createSanitizer({
  detectors: { email: 'mask', phone: 'mask', person_name: true },
});

// Stand-in for `new OpenAI()`: same shape, no network.
const client = {
  chat: {
    completions: {
      async create(params: { model: string; messages: Array<{ role: string; content: unknown }> }) {
        console.log('request sent to the API:', JSON.stringify(params, null, 2));
        return {
          id: 'chatcmpl-demo',
          choices: [{ message: { role: 'assistant', content: 'Sure!' } }],
        };
      },
    },
  },
};

const openai = sanitizeOpenAI(client, sanitizer, {
  roles: ['user', 'tool'],
  onReport: (report) => console.log('report summary:', report.summary),
});

const messages = [
  { role: 'system', content: 'You are a support assistant for support@company.com.' },
  {
    role: 'user',
    content:
      'Hi, I am John Smith (john@example.com, +1 555 123 4567). My card 4111 1111 1111 1111 was charged twice.',
  },
];

const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages });
console.log('response untouched:', completion.choices[0]?.message.content);

// Transform parameters without calling anything:
const { params } = sanitizeChatCompletionParams({ model: 'gpt-4o-mini', messages }, sanitizer);
console.log(params.messages[1]?.content);
