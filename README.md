# sanitype

**Schema-aware, in-process PII scrubbing for TypeScript.** Redact, mask, hash, drop or tokenize sensitive data before it reaches an LLM, a log sink, an analytics pipeline or a third-party API.

[![CI](https://github.com/devrchancay/sanitype/actions/workflows/ci.yml/badge.svg)](https://github.com/devrchancay/sanitype/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@devrchancay/sanitype.svg)](https://www.npmjs.com/package/@devrchancay/sanitype)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

```ts
import { sanitize } from '@devrchancay/sanitype';

const { data, report } = sanitize({
  user: { email: 'john.doe@example.com', phone: '+1 (555) 123-4567' },
  notes: 'Card 4111 1111 1111 1111, IP 192.168.10.20, api_key=0123456789abcdef',
});

data;
// {
//   user: { email: '[REDACTED_EMAIL]', phone: '[REDACTED_PHONE]' },
//   notes: 'Card [REDACTED_CREDIT_CARD], IP [REDACTED_IP_ADDRESS], api_key=[REDACTED_API_KEY_SECRET]'
// }

report.summary; // { email: 1, phone: 1, credit_card: 1, ip_address: 1, api_key_secret: 1 }
```

- **Two detection strategies, combined.** Tell sanitype which fields are sensitive (field paths or a Zod schema) _and_ let built-in detectors catch PII embedded in free text that the schema did not anticipate.
- **Runs entirely in-process.** No network calls, no telemetry, no runtime dependencies. Verifiable by reading the source and enforced by a test.
- **Same shape in, same shape out.** The result is a typed copy of the input with the same structure. The input is never mutated.
- **Auditable.** Every call returns a report of what was scrubbed, where and by which detector. The raw value never appears in it.
- **First-class LLM integration.** Drop-in wrappers for OpenAI-compatible and Anthropic clients, plus an Express middleware.

## Table of contents

- [Installation](#installation)
- [Quickstart](#quickstart)
- [Core concepts](#core-concepts)
  - [Detectors](#detectors)
  - [Actions](#actions)
  - [Field rules](#field-rules)
  - [The report](#the-report)
- [Zod schemas](#zod-schemas)
- [Express middleware](#express-middleware)
- [LLM wrappers](#llm-wrappers)
- [Use cases](#use-cases)
- [Configuration reference](#configuration-reference)
- [Performance](#performance)
- [Trust and security](#trust-and-security)
- [Limitations](#limitations)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Installation

```sh
npm install @devrchancay/sanitype
```

The package is published under the `@devrchancay` scope (npm rejects the bare name `sanitype` as too similar to existing packages). Requirements: Node.js 18 or newer. ESM and CommonJS are both supported. `zod` is an optional peer dependency, only needed for `@devrchancay/sanitype/zod`.

## Quickstart

### 1. One-off call

```ts
import { sanitize } from '@devrchancay/sanitype';

const { data } = sanitize(payload);
```

With no configuration, the seven high-confidence detectors run on every string in the payload and redact what they find: `email`, `phone`, `credit_card`, `ip_address`, `ssn_us`, `cedula_ec` and `api_key_secret`.

### 2. Reusable sanitizer with field rules

Mark the fields you already know about, choose an action per field, and keep the detectors as a safety net for everything else:

```ts
import { createSanitizer } from '@devrchancay/sanitype';

const sanitizer = createSanitizer({
  fields: {
    'user.email': 'mask', // john.doe@example.com -> j***.d**@e******.com
    'user.ssn': 'redact', // 123-45-6789 -> [REDACTED_SSN_US]
    'user.phone': 'hash', // -> deterministic sha256
    password: 'drop', // key removed from the payload
    'items[*].internalNote': 'allow', // never scrubbed, silences false positives
  },
  detectors: { email: 'mask', phone: 'mask' }, // free-text hits use these actions
  hash: { salt: process.env.SANITYPE_SALT },
});

const { data, report } = sanitizer.sanitize(payload);
```

The sanitizer compiles its configuration once and is safe to share across concurrent requests.

### 3. Before an LLM call

```ts
import OpenAI from 'openai';
import { createSanitizer } from '@devrchancay/sanitype';
import { sanitizeOpenAI } from '@devrchancay/sanitype/openai';

const openai = sanitizeOpenAI(new OpenAI(), createSanitizer());

// Messages are scrubbed in-process before the request leaves. Responses are untouched.
await openai.chat.completions.create({ model: 'gpt-4o-mini', messages });
```

## Core concepts

### Detectors

Detectors find sensitive substrings inside free text. Each one is independently toggleable and attributable in the report.

| Name               | Confidence | Default | What it matches                                                                                                                                                               |
| ------------------ | ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `email`            | high       | on      | Email addresses, Unicode-aware.                                                                                                                                               |
| `phone`            | high       | on      | International and local phone numbers, 7–15 digits with optional `+`, parentheses and separators. Bare digit runs need 9+ digits. Dates are excluded.                         |
| `credit_card`      | high       | on      | 13–19 digit card numbers with optional spaces or dashes, **Luhn-validated**.                                                                                                  |
| `ip_address`       | high       | on      | IPv4 and IPv6 (validated with Node's `net.isIPv6`).                                                                                                                           |
| `ssn_us`           | high       | on      | US Social Security Numbers written with separators (`123-45-6789`). Invalid ranges excluded.                                                                                  |
| `cedula_ec`        | high       | on      | Ecuadorian cédula (10 digits) and natural-person RUC (13 digits), **checksum-validated**.                                                                                     |
| `api_key_secret`   | high       | on      | AWS, GitHub, Stripe, OpenAI, Anthropic, Slack, Google, SendGrid, Twilio and npm keys, JWTs, bearer tokens, PEM private keys, and `api_key=...` / `password: ...` assignments. |
| `person_name`      | heuristic  | **off** | Sequences of capitalised words, optional title and particles (`Dr. Ana María de la Torre`). Best-effort.                                                                      |
| `physical_address` | heuristic  | **off** | English (`221B Baker Street, Apt 4`) and Spanish (`Av. Amazonas N32-45`) street addresses. Best-effort.                                                                       |

> **Heuristic detectors are opt-in.** `person_name` and `physical_address` will produce false positives on product names, company names, place names and similar text. They are useful as a safety net for logs and prompts, but do not rely on them for compliance purposes. See [docs/detectors.md](./docs/detectors.md) for their known characteristics.

Enable, disable or change the action of any detector:

```ts
createSanitizer({
  detectors: {
    email: 'mask', // enable with a specific action
    phone: false, // disable
    person_name: true, // opt into a heuristic detector with its default action
    physical_address: { action: 'mask' },
  },
});

// Or replace the default set entirely with an explicit list:
createSanitizer({ detectors: ['email', 'credit_card'] });
```

Add your own detector for company-specific formats:

```ts
import { defineDetector } from '@devrchancay/sanitype';

const customerId = defineDetector({
  name: 'customer_id',
  pattern: /\bCUST-\d{6}\b/,
  action: 'hash',
});

createSanitizer({ customDetectors: [customerId] });
```

`defineDetector` also accepts a `validate` function (checksums), a `test` function for non-regex logic, a `mask` function for category-specific masking, and a `prefilter` for cheap early exits.

### Actions

| Action     | Result                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `redact`   | Fixed marker: `[REDACTED_EMAIL]`, `[REDACTED_CREDIT_CARD]`, or `[REDACTED]` for a field without category. Customisable via `redact.format`. |
| `mask`     | Shape-preserving partial mask: `j***.d**@e******.com`, `**** **** **** 1111`, `+* (***) ***-**67`, `***-**-6789`, `192.***.**.**`.          |
| `hash`     | Deterministic one-way hash (`sha256` hex by default). Use a `salt`; unsalted hashes of phone numbers are brute-forceable.                   |
| `drop`     | Removes the field from an object or the element from an array. In free text, removes the matched substring.                                 |
| `tokenize` | Replaces the value with a reversible token from a caller-supplied `TokenStore`.                                                             |
| `allow`    | Explicitly leaves the field alone. Use it to silence a false positive on one path without disabling the detector globally.                  |

A `mask` or `redact` field rule without a category borrows the category of an enabled detector when the whole value matches it, which is why the `user.email` rule above yields the email-style mask. Give an explicit `category` to force one.

Field rules can also target objects and arrays. `mask`, `hash`, `redact` and `tokenize` then apply to every string and number leaf inside; `drop` and `allow` apply to the whole subtree.

### Field rules

Field rules are explicit and always take precedence over detectors on the same path. Patterns use dot notation with wildcards:

| Pattern          | Matches                                                        |
| ---------------- | -------------------------------------------------------------- |
| `user.email`     | exactly that path                                              |
| `users[*].email` | any array index (`users[].email` and `users.*.email` work too) |
| `*.password`     | `password` under any top-level key                             |
| `**.password`    | `password` at any depth                                        |
| `$`              | the root value                                                 |

When several patterns match, the most specific wins; on a tie, the last declared wins. Report paths use the same notation (`users[0].email`).

### The report

```ts
const { report } = sanitize(payload, { audit: true });

report.entries[0];
// {
//   path: 'user.email',
//   category: 'email',       // detector name or field category
//   source: 'detector',      // or 'field'
//   action: 'redact',
//   matches: 1,              // detector entries only
//   preview: 'j***.d**@e******.com', // audit mode only, always masked
// }

report.summary; // { email: 1, ... }  matched values per category
report.skipped; // values left untouched: oversized strings, circular refs, unsupported objects
report.modified; // true when anything changed
report.durationMs;
```

The report never contains a raw sensitive value, even in audit mode. Log it freely.

## Zod schemas

`@devrchancay/sanitype/zod` lets you mark sensitivity next to your existing validation schema without changing its behaviour. It works with Zod 3 and Zod 4 and does not import `zod` itself.

```ts
import { z } from 'zod';
import { createSanitizer } from '@devrchancay/sanitype';
import { sensitive, fieldsFromSchema } from '@devrchancay/sanitype/zod';

const User = z.object({
  id: z.string().uuid(),
  email: sensitive(z.string().email(), 'mask'), // category "email" is inferred
  phone: sensitive(z.string(), 'hash').optional(),
  ssn: sensitive(z.string(), { action: 'redact', category: 'ssn_us' }),
  password: sensitive(z.string(), 'drop'),
  addresses: z.array(z.object({ street: sensitive(z.string()), city: z.string() })),
  notes: z.string(), // free text: detectors still run here
});

const sanitizer = createSanitizer({ fields: fieldsFromSchema(User) });
// fieldsFromSchema(User) ->
// { email: { action: 'mask', category: 'email' }, phone: { action: 'hash' }, ...,
//   'addresses[*].street': { action: 'redact' } }
```

Two alternatives to `sensitive()` for schemas you cannot wrap:

```ts
z.string().describe('sensitive:mask:email'); // Zod 3 and 4
z.string().meta({ sensitive: 'mask' }); // Zod 4
```

Call `sensitive()` last in a chain: `.optional()`, `.describe()` and similar return new instances.

## Express middleware

```ts
import express from 'express';
import { createSanitizer } from '@devrchancay/sanitype';
import { sanitizeRequest, sanitizeResponse } from '@devrchancay/sanitype/express';

const sanitizer = createSanitizer({ fields: { password: 'drop' } });
const app = express();

app.use(express.json());
app.use(sanitizeRequest(sanitizer)); // req.body replaced, report on req.sanitizeReport
app.use(sanitizeResponse(sanitizer)); // res.json() payloads scrubbed, report on res.locals

app.post('/tickets', (req, res) => {
  logger.info({ body: req.body, scrubbed: req.sanitizeReport.summary }); // safe to log
  res.json({ ok: true });
});
```

`sanitizeRequest` accepts `{ body, query, params, headers, reportKey, onReport }`. Enabling `headers` scrubs `authorization` and cookies before request logging. Works with Express 4 and 5.

## LLM wrappers

Wrappers sanitize the **outbound request only**. Responses are returned exactly as the SDK produced them.

### OpenAI-compatible (`@devrchancay/sanitype/openai`)

```ts
import {
  sanitizeOpenAI,
  wrapChatCompletions,
  sanitizeChatCompletionParams,
} from '@devrchancay/sanitype/openai';

// Patch a client in place (chat.completions.create and responses.create):
const openai = sanitizeOpenAI(new OpenAI(), sanitizer, {
  roles: ['user', 'tool'], // leave developer-authored system prompts alone
  onReport: (report) => audit.log(report),
});

// Or wrap a single function, e.g. for a proxy or a local model server:
const create = wrapChatCompletions(
  client.chat.completions.create.bind(client.chat.completions),
  sanitizer,
);

// Or just transform the params yourself:
const { params, report } = sanitizeChatCompletionParams({ model, messages }, sanitizer);
```

Streaming works unchanged because the wrapper returns whatever the SDK returns.

### Anthropic (`@devrchancay/sanitype/anthropic`)

```ts
import { sanitizeAnthropic } from '@devrchancay/sanitype/anthropic';

const anthropic = sanitizeAnthropic(new Anthropic(), sanitizer, { system: true });
await anthropic.messages.create({ model: 'claude-sonnet-5', max_tokens: 1024, messages });
```

### Any other SDK

```ts
import { wrapLLMCall } from '@devrchancay/sanitype';

const generate = wrapLLMCall(sdk.generate, sanitizer, { keys: ['prompt', 'history'] });
```

### Reversible round-trips with tokens

Tokenize before the call and restore the original values in the model's answer:

```ts
import { createSanitizer, createInMemoryTokenStore } from '@devrchancay/sanitype';

const store = createInMemoryTokenStore();
const sanitizer = createSanitizer({
  detectors: { email: 'tokenize', phone: 'tokenize' },
  tokenStore: store,
});

const { data: prompt } = sanitizer.sanitize(userMessage); // "write to tok_3f9a... about ..."
const answer = await llm(prompt);
const restored = store.restore(answer); // tokens replaced with the original values
```

The in-memory store is for development and short-lived round-trips. For durable pseudonymisation implement the `TokenStore` interface on top of your own storage; asynchronous stores are supported through `sanitizeAsync()`.

## Use cases

| Scenario                                     | How                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Prompts to OpenAI / Anthropic / local models | `@devrchancay/sanitype/openai`, `@devrchancay/sanitype/anthropic` or `wrapLLMCall`. Tokenize for reversible round-trips.        |
| Request/response logging                     | `sanitizeRequest(sanitizer, { headers: true })` then log `req.body`; or a pino/winston serializer calling `sanitizer.sanitize`. |
| Error tracking (Sentry, Datadog)             | Sanitize the event in `beforeSend` and attach `report.summary` as context.                                                      |
| Analytics events                             | Use `drop` for fields the vendor should never receive and `hash` for stable pseudonymous identifiers.                           |
| Webhooks and partner APIs                    | `createSanitizer({ fields: fieldsFromSchema(Schema) })` on the outbound payload; the report doubles as an audit trail.          |
| Support tickets forwarded to a helpdesk      | Mask contact details, let `api_key_secret` catch credentials pasted into ticket bodies.                                         |
| Queue workers and cron jobs                  | Core has no framework dependency; call `sanitizer.sanitize` anywhere.                                                           |
| Accidentally logged credentials              | `api_key_secret` runs by default and catches cloud keys, tokens, JWTs and PEM blocks.                                           |

Worked examples for each scenario live in [docs/use-cases.md](./docs/use-cases.md) and [`examples/`](./examples). Run one with `npx tsx examples/basic.ts`.

## Configuration reference

```ts
interface SanitizerConfig {
  detectors?: DetectorConfig; // map of name -> boolean | Action | { enabled, action }, or an explicit list
  customDetectors?: Detector[]; // user-defined detectors, enabled unless disabled in `detectors`
  fields?: FieldRules; // path pattern -> Action | { action, category }
  maxStringLength?: number; // strings longer than this are skipped and reported. Default 100_000
  hash?: { algorithm?; salt?; encoding?; length?; prefix? }; // sha256 / hex by default
  mask?: { char? }; // default '*'
  redact?: { format?: (category) => string }; // default '[REDACTED_<CATEGORY>]'
  tokenStore?: TokenStore; // required by the `tokenize` action
  audit?: boolean; // include masked previews in the report
}
```

Full details, defaults and edge cases: [docs/configuration.md](./docs/configuration.md).

### API summary

| Export                                                                                        | Purpose                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sanitize(payload, config?)`                                                                  | One-off call.                                                       |
| `sanitizeAsync(payload, config?)`                                                             | Same, awaiting asynchronous token stores.                           |
| `createSanitizer(config?)`                                                                    | Reusable instance: `sanitize`, `sanitizeAsync`, `detect`, `extend`. |
| `defineDetector(definition)`                                                                  | Build a custom detector.                                            |
| `builtinDetectors`, `defaultDetectorNames`, `heuristicDetectorNames`                          | Introspection.                                                      |
| `createInMemoryTokenStore()`                                                                  | Development token store with `restore()`.                           |
| `hashValue`, `maskGeneric`, `maskKeepLast`, ...                                               | The primitives the actions use, exported for custom detectors.      |
| `wrapLLMCall(fn, sanitizer, { keys })`                                                        | Generic request wrapper.                                            |
| `@devrchancay/sanitype/zod`: `sensitive`, `fieldsFromSchema`                                  | Zod side-channel.                                                   |
| `@devrchancay/sanitype/express`: `sanitizeRequest`, `sanitizeResponse`                        | Express middleware.                                                 |
| `@devrchancay/sanitype/openai`: `sanitizeOpenAI`, `wrapChatCompletions`, `wrapResponses`, ... | OpenAI-compatible wrappers.                                         |
| `@devrchancay/sanitype/anthropic`: `sanitizeAnthropic`, `wrapMessages`, ...                   | Anthropic wrappers.                                                 |

## Performance

Measured with `npm run bench` on Node 22 (a ~1.6 KB, 45-field order payload). Figures are indicative; run the benchmark on your own hardware.

| Scenario                                          | Mean per call |
| ------------------------------------------------- | ------------- |
| Schema-driven only (3 field rules, detectors off) | ~8 µs         |
| Default detectors, payload with PII               | ~50 µs        |
| Default detectors, payload without PII            | ~25 µs        |
| All detectors including heuristics                | ~200 µs       |
| 1 KB free-text string, default detectors          | ~60 µs        |

Detector patterns are compiled once per sanitizer. Each detector has a cheap prefilter (for example `email` skips strings without `@`), so most strings never reach the full pattern list. Strings longer than `maxStringLength` are skipped and recorded in `report.skipped` instead of being scanned.

## Trust and security

sanitype is security-adjacent, so its dependency tree is part of the product:

- **Zero runtime dependencies.** Only `node:crypto` (hashing, token generation) and `node:net` (IPv6 validation) are used.
- **No network access.** The source contains no HTTP client, no `fetch`, no sockets. `test/trust.test.ts` fails the build if any is introduced.
- **No telemetry.** Nothing leaves the process.
- **Reports never contain raw values**, only masked previews when audit mode is on.
- **Input is never mutated.**

Please read [SECURITY.md](./SECURITY.md) for the disclosure policy.

## Limitations

- sanitype is a control, not a certification. It does not make an application GDPR, HIPAA or CCPA compliant on its own.
- Detection is pattern-based. There is no ML named-entity recognition; free-text recall is bounded by the patterns shipped. Combine field rules with detectors for known data, and treat heuristic detectors as best-effort.
- The `drop` action changes the shape of the output; every other action preserves it. Numbers under a field rule become strings (`'*****'`, a hash, a marker).
- Only plain objects, arrays and primitives are traversed. `Map`, `Set`, class instances and buffers pass through untouched and are listed in `report.skipped`. Circular references are replaced by `'[Circular]'`.
- Locale coverage for national IDs is deliberately narrow (US SSN, Ecuador cédula). Add others with `defineDetector`, or open an issue.

## Documentation

- [docs/configuration.md](./docs/configuration.md) — every option, default and precedence rule.
- [docs/detectors.md](./docs/detectors.md) — each detector in depth, false-positive notes, writing your own.
- [docs/actions.md](./docs/actions.md) — actions, masking formats, hashing, tokenization.
- [docs/zod.md](./docs/zod.md) — the Zod side-channel.
- [docs/adapters.md](./docs/adapters.md) — Express, OpenAI, Anthropic and custom wrappers.
- [docs/use-cases.md](./docs/use-cases.md) — end-to-end recipes.
- [SPEC.md](./SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [ROADMAP.md](./ROADMAP.md), [COMPARISON.md](./COMPARISON.md) — design documents.
- [CHANGELOG.md](./CHANGELOG.md).

## Contributing

Contributions are welcome: new detectors, locale packs, adapters, docs and bug reports. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the development setup, the checklist for adding a detector, and the pull request process.

```sh
git clone https://github.com/devrchancay/sanitype.git
cd sanitype
npm install
npm run check   # typecheck + lint + format + tests
```

## License

[MIT](./LICENSE) © Ramón Chancay
