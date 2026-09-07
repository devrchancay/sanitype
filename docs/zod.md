# Zod integration

`@devrchancay/sanitype/zod` lets you declare sensitivity next to the Zod schema you already use for validation. It is a side-channel: the schema's parsing behaviour is unchanged, and sanitype reads it only to derive field paths.

Works with Zod 3 and Zod 4 through structural inspection. `zod` is an optional peer dependency and is never imported at runtime by sanitype.

## Marking fields

```ts
import { z } from 'zod';
import { sensitive } from '@devrchancay/sanitype/zod';

const User = z.object({
  email: sensitive(z.string().email(), 'mask'),
  phone: sensitive(z.string(), 'hash').optional(),
  ssn: sensitive(z.string(), { action: 'redact', category: 'ssn_us' }),
  password: sensitive(z.string(), 'drop'),
  profile: sensitive(z.object({ bio: z.string() }), 'redact'), // whole subtree
  notes: z.string(),
});
```

`sensitive(schema, rule)` registers the schema instance in a `WeakMap` and returns it unchanged. The default rule is `redact`.

Because Zod methods return new instances, call `sensitive()` **last** in a chain:

```ts
sensitive(z.string().email().describe('Primary email'), 'mask'); // correct
sensitive(z.string(), 'mask').describe('Primary email'); // the description clone is not registered
```

Wrappers applied after `sensitive()` are unwrapped by the walker, so `sensitive(z.string(), 'hash').optional()` still works.

### Alternatives for schemas you cannot wrap

```ts
z.string().describe('sensitive'); // redact
z.string().describe('sensitive:mask'); // action
z.string().describe('sensitive:mask:email'); // action and category
z.string().meta({ sensitive: 'mask' }); // Zod 4
z.string().meta({ sensitive: { action: 'redact', category: 'ssn_us' } }); // Zod 4
```

## Deriving field rules

```ts
import { createSanitizer } from '@devrchancay/sanitype';
import { fieldsFromSchema } from '@devrchancay/sanitype/zod';

const rules = fieldsFromSchema(User);
// {
//   email: { action: 'mask', category: 'email' },
//   phone: { action: 'hash' },
//   ssn: { action: 'redact', category: 'ssn_us' },
//   password: { action: 'drop' },
//   profile: { action: 'redact' },
// }

const sanitizer = createSanitizer({ fields: rules });
```

Category inference: a marked string schema with an email format (`z.string().email()`, `z.email()`) gets `category: 'email'`; IP formats get `ip_address`. Explicit categories always win.

### Supported schema types

| Zod construct                                                                     | Derived path                  |
| --------------------------------------------------------------------------------- | ----------------------------- |
| `z.object({ a })`                                                                 | `a`                           |
| `z.object({...}).catchall(s)`                                                     | `*`                           |
| `z.array(s)`                                                                      | `[*]`                         |
| `z.tuple([a, b])`, rest                                                           | `[0]`, `[1]`, `[*]`           |
| `z.record(k, v)`, `z.map(k, v)`                                                   | `*`                           |
| `.optional()`, `.nullable()`, `.default()`, `.catch()`, `.readonly()`, `.brand()` | same path as the inner schema |
| `.transform()`, `.refine()`, `.pipe()`                                            | same path                     |
| `z.union([...])`, `z.discriminatedUnion(...)`, `z.intersection(a, b)`             | paths from every branch       |
| `z.lazy(() => s)`                                                                 | walked once (recursion-safe)  |

Marking a schema at the root (`fieldsFromSchema(sensitive(z.string(), 'hash'))`) produces the `$` rule.

### Path prefix

When the schema describes a nested part of the payload:

```ts
fieldsFromSchema(User, { prefix: 'body' }); // { 'body.email': ..., 'body.phone': ... }
```

## Combining with detectors

Field rules only cover the paths you marked. Detectors still run on every other string, so `notes` in the example above is scanned for emails, cards, keys and so on. This is the intended combination: certainty for known fields, a safety net for free text.

## Validation and sanitization order

Validate first, sanitize after. The sanitized output may not satisfy the schema any more (an email becomes `j***@e******.com`), so never re-parse sanitized data with the same schema.

```ts
const parsed = User.parse(input); // throws on invalid input
const { data } = sanitizer.sanitize(parsed); // safe to log or forward
```
