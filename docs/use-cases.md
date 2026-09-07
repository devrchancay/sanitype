# Use cases

End-to-end recipes. Each one has a runnable counterpart in [`examples/`](../examples): `npx tsx examples/<name>.ts`.

## 1. Scrub prompts before they reach an LLM

The primary use case. User messages, support tickets and uploaded documents get concatenated into prompts; the wrapper scrubs them in-process before the request leaves.

```ts
import OpenAI from 'openai';
import { createSanitizer } from 'sanitype';
import { sanitizeOpenAI } from 'sanitype/openai';

const sanitizer = createSanitizer({
  detectors: { email: 'mask', phone: 'mask', person_name: true },
});
const openai = sanitizeOpenAI(new OpenAI(), sanitizer, {
  roles: ['user', 'tool'],
  onReport: (report) => report.modified && logger.info({ scrubbed: report.summary }),
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a support assistant.' },
    { role: 'user', content: ticket.body }, // scrubbed
  ],
});
```

Example: `examples/openai-chat.ts`, `examples/anthropic-messages.ts`.

### Reversible: tokenize the prompt, restore the answer

When the model needs to refer to the value (for example to draft a reply that includes the customer's email), tokenize instead of redacting and restore the tokens in the answer:

```ts
import { createInMemoryTokenStore, createSanitizer } from 'sanitype';

const store = createInMemoryTokenStore();
const sanitizer = createSanitizer({
  detectors: { email: 'tokenize', phone: 'tokenize', credit_card: 'redact' },
  tokenStore: store,
});

const { data: prompt } = sanitizer.sanitize(`Reply to ${customer.email} about order ${order.id}`);
const draft = await llm(prompt); // model sees tok_… instead of the address
const reply = store.restore(draft); // tokens replaced with the original values
```

The model never sees the value, the reply is correct, and the in-memory store is discarded with the request. Example: `examples/tokenize-roundtrip.ts`.

## 2. Request logging without PII

Log request bodies for debugging while guaranteeing that credentials and personal data never reach the log sink.

```ts
import express from 'express';
import { createSanitizer } from 'sanitype';
import { sanitizeRequest } from 'sanitype/express';

const sanitizer = createSanitizer({
  fields: { '**.password': 'drop' },
  detectors: { email: 'mask' },
});

app.use(express.json());
app.use(sanitizeRequest(sanitizer, { headers: true }));
app.use((req, _res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    body: req.body,
    scrubbed: req.sanitizeReport.summary,
  });
  next();
});
```

Example: `examples/express-app.ts`.

### With a logger serializer (pino, winston, console)

Sanitize at the logger boundary so every call site is covered:

```ts
import pino from 'pino';
import { createSanitizer } from 'sanitype';

const sanitizer = createSanitizer({
  fields: { '**.password': 'drop', '**.authorization': 'redact' },
});

const logger = pino({
  serializers: {
    payload: (value) => sanitizer.sanitize(value).data,
  },
});

logger.info({ payload: order }, 'order received');
```

Example: `examples/logging.ts`.

## 3. Error tracking (Sentry, Datadog)

Scrub events before they are sent and keep the summary as breadcrumb context:

```ts
Sentry.init({
  beforeSend(event) {
    const { data, report } = sanitizer.sanitize(event);
    data.extra = { ...data.extra, sanitype: report.summary };
    return data;
  },
});
```

## 4. Analytics events

Vendors rarely need raw identifiers. Drop what they should never receive and hash what needs to stay joinable:

```ts
const analytics = createSanitizer({
  fields: {
    'user.email': 'hash',
    'user.phone': 'drop',
    'user.name': 'drop',
    'user.id': 'allow',
  },
  hash: { salt: process.env.ANALYTICS_SALT, length: 32 },
});

segment.track({ ...analytics.sanitize(event).data });
```

The same email always hashes to the same value, so funnels and cohorts still work.

## 5. Webhooks and partner APIs

Forward only what the partner needs. Deriving the rules from the Zod schema that already validates the payload keeps validation and sanitization in one place:

```ts
import { z } from 'zod';
import { createSanitizer } from 'sanitype';
import { fieldsFromSchema, sensitive } from 'sanitype/zod';

const Order = z.object({
  id: z.string(),
  customer: z.object({
    email: sensitive(z.string().email(), 'mask'),
    phone: sensitive(z.string(), 'drop'),
    cedula: sensitive(z.string(), { action: 'redact', category: 'cedula_ec' }),
  }),
  items: z.array(z.object({ sku: z.string(), note: z.string() })),
});

const outbound = createSanitizer({ fields: fieldsFromSchema(Order), audit: true });
const { data, report } = outbound.sanitize(Order.parse(order));
await fetch(partnerUrl, { method: 'POST', body: JSON.stringify(data) });
await auditLog.write({ orderId: order.id, partner: 'acme', report });
```

Example: `examples/zod-schema.ts`.

## 6. Support tickets forwarded to a helpdesk

Ticket bodies are free text: customers paste card numbers, credentials and other people's contact details. Detectors are the safety net here:

```ts
const helpdesk = createSanitizer({
  detectors: { email: 'mask', phone: 'mask', credit_card: 'redact', api_key_secret: 'redact' },
  fields: { 'requester.email': 'allow' }, // the helpdesk needs the requester's address
});
```

## 7. Catching accidentally logged credentials

`api_key_secret` runs by default. Add a company-specific pattern for internal tokens:

```ts
import { defineDetector } from 'sanitype';

const internalToken = defineDetector({
  name: 'internal_token',
  pattern: /\bACME-[A-Z0-9]{24}\b/,
  action: 'redact',
});

const sanitizer = createSanitizer({ customDetectors: [internalToken] });
```

Example: `examples/custom-detector.ts`.

## 8. Queue workers, cron jobs, CLI tools

The core has no framework dependency. Create a sanitizer once at module load and call it wherever data crosses a trust boundary:

```ts
const sanitizer = createSanitizer();

worker.process(async (job) => {
  const { data } = sanitizer.sanitize(job.data);
  await thirdParty.send(data);
});
```

Example: `examples/basic.ts`.
