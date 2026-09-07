# Adapters

Adapters are thin entry points around the core. Each one is a separate import path so unused adapters are never bundled, and none of them imports its framework or SDK at runtime: they rely on structural types only.

| Import                            | Exports                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@devrchancay/sanitype/express`   | `sanitizeRequest`, `sanitizeResponse`                                                                                                                    |
| `@devrchancay/sanitype/openai`    | `sanitizeOpenAI`, `wrapChatCompletions`, `wrapResponses`, `sanitizeChatCompletionParams`, `sanitizeChatCompletionParamsAsync`, `sanitizeResponsesParams` |
| `@devrchancay/sanitype/anthropic` | `sanitizeAnthropic`, `wrapMessages`, `sanitizeMessageParams`, `sanitizeMessageParamsAsync`                                                               |
| `@devrchancay/sanitype` (core)    | `wrapLLMCall`, `sanitizeParams`, `sanitizeParamsAsync`                                                                                                   |

## Express

```ts
import express from 'express';
import { createSanitizer } from '@devrchancay/sanitype';
import { sanitizeRequest, sanitizeResponse } from '@devrchancay/sanitype/express';

const sanitizer = createSanitizer({ fields: { password: 'drop' }, detectors: { email: 'mask' } });
const app = express();

app.use(express.json());
app.use(sanitizeRequest(sanitizer, { headers: true, onReport: (report, req) => audit(report) }));
app.use(sanitizeResponse(sanitizer));
```

### `sanitizeRequest(sanitizer, options?)`

Replaces the selected request properties with sanitized copies and attaches a combined report.

| Option      | Default            | Description                                                               |
| ----------- | ------------------ | ------------------------------------------------------------------------- |
| `body`      | `true`             | Sanitize `req.body`. Mount after `express.json()`.                        |
| `query`     | `false`            | Sanitize `req.query`.                                                     |
| `params`    | `false`            | Sanitize `req.params`.                                                    |
| `headers`   | `false`            | Sanitize `req.headers` (catches `authorization`, cookies, forwarded IPs). |
| `reportKey` | `'sanitizeReport'` | Property on `req` receiving the report.                                   |
| `onReport`  | —                  | Callback with the report and the request.                                 |

Report paths for the body are relative to the body (`user.email`). Paths for the other targets are prefixed (`query.q`, `headers.authorization`).

Field rules apply relative to each sanitized target. To use different rules for headers and body, mount two middlewares with two sanitizers:

```ts
app.use(sanitizeRequest(bodySanitizer));
app.use(sanitizeRequest(headerSanitizer, { body: false, headers: true }));
```

The middleware is asynchronous internally, so asynchronous token stores work without extra configuration. Errors are forwarded to `next(err)`.

Express 5 exposes `req.query` through a getter; the adapter defines own properties, which works on both Express 4 and 5.

### `sanitizeResponse(sanitizer, options?)`

Wraps `res.json()` so every JSON body is sanitized before it is serialised. The report is stored in `res.locals.sanitizeReport` (configurable with `reportKey`) and passed to `onReport`. `res.send()` and streamed responses are not intercepted.

### Typing the report on `req`

```ts
import type { SanitizeReport } from '@devrchancay/sanitype';

declare module 'express-serve-static-core' {
  interface Request {
    sanitizeReport?: SanitizeReport;
  }
}
```

## OpenAI-compatible

Covers the official `openai` package and any client that uses the same request shapes (Azure OpenAI, local model servers, proxies).

### Patch a client

```ts
import OpenAI from 'openai';
import { sanitizeOpenAI } from '@devrchancay/sanitype/openai';

const openai = sanitizeOpenAI(new OpenAI(), sanitizer, {
  roles: ['user', 'tool'], // default: every role, including system and assistant history
  onReport: (report, params) => audit(report),
  async: false, // set true for asynchronous token stores
});
```

`chat.completions.create` and `responses.create` are replaced in place with wrapped versions. The whole `messages` array is walked, so string content, content parts (`{ type: 'text', text }`), tool-call arguments and message names are all covered. Image URLs and base64 payloads longer than `maxStringLength` are skipped, not scanned.

### Wrap a function

```ts
import { wrapChatCompletions, wrapResponses } from '@devrchancay/sanitype/openai';

const create = wrapChatCompletions(
  client.chat.completions.create.bind(client.chat.completions),
  sanitizer,
  { roles: ['user'] },
);
const stream = await create({ model, messages, stream: true }); // return value passed through
```

### Transform parameters only

```ts
import { sanitizeChatCompletionParams } from '@devrchancay/sanitype/openai';

const { params, report } = sanitizeChatCompletionParams({ model, messages }, sanitizer);
```

## Anthropic

```ts
import Anthropic from '@anthropic-ai/sdk';
import { sanitizeAnthropic, wrapMessages } from '@devrchancay/sanitype/anthropic';

const anthropic = sanitizeAnthropic(new Anthropic(), sanitizer, {
  system: true, // also sanitize the system prompt (default)
  onReport: (report) => audit(report),
});
```

`messages` (string content and content blocks) and `system` (string or block array) are sanitized. `wrapMessages` and `sanitizeMessageParams` mirror the OpenAI helpers.

## Any other SDK

`wrapLLMCall` wraps any function whose first argument is a request object. Name the keys that carry user content:

```ts
import { wrapLLMCall } from '@devrchancay/sanitype';

const generate = wrapLLMCall(sdk.generate, sanitizer, {
  keys: ['prompt', 'history'],
  onReport: (report) => audit(report),
});
```

The selected keys are sanitized as one payload (so field rules can target `history[*].content`), merged back into a copy of the request, and the wrapped function is called with the copy. The return value is passed through unchanged.

## Writing a new adapter

Follow the pattern in `src/express/index.ts`:

1. Accept a `Sanitizer` instance; never create one inside the adapter.
2. Depend only on structural types (`RequestLike`, `OpenAIClientLike`).
3. Attach the report somewhere discoverable and expose an `onReport` callback.
4. Never modify responses or return values.
5. Test against the real framework where it does not require network access.
