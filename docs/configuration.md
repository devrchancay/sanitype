# Configuration reference

Everything accepted by `sanitize(payload, config)` and `createSanitizer(config)`.

```ts
interface SanitizerConfig {
  detectors?: DetectorConfig;
  customDetectors?: Detector[];
  fields?: FieldRules;
  maxStringLength?: number;
  hash?: HashOptions;
  mask?: MaskOptions;
  redact?: RedactOptions;
  tokenStore?: TokenStore;
  audit?: boolean;
}
```

## `detectors`

Controls which detectors run on free text and with which action.

**Map form** (applied on top of the defaults):

```ts
detectors: {
  email: 'mask',                       // enable with this action
  phone: false,                        // disable
  person_name: true,                   // enable an opt-in detector with its default action
  physical_address: { action: 'mask' },
  credit_card: { enabled: false },
}
```

**List form** (replaces the default set entirely):

```ts
detectors: ['email', 'credit_card', myCustomDetector];
```

Defaults: every `high` confidence built-in detector is enabled with the `redact` action. Heuristic detectors (`person_name`, `physical_address`) are disabled.

Unknown names throw at construction time so typos do not silently disable protection.

## `customDetectors`

An array of `Detector` objects, usually created with `defineDetector`. They are enabled unless disabled in `detectors`, and can be referenced by name in `detectors` to change their action.

```ts
const customerId = defineDetector({ name: 'customer_id', pattern: /\bCUST-\d{6}\b/ });
createSanitizer({ customDetectors: [customerId], detectors: { customer_id: 'hash' } });
```

## `fields`

Explicit rules for known paths. A rule is an action or `{ action, category }`.

```ts
fields: {
  'user.email': 'mask',
  'user.ssn': { action: 'redact', category: 'ssn_us' },
  'users[*].phone': 'hash',
  '**.password': 'drop',
  'items[*].sku': 'allow',
}
```

### Path patterns

| Pattern                    | Meaning                    |
| -------------------------- | -------------------------- |
| `a.b.c`                    | exact path                 |
| `a[0].b`                   | exact array index          |
| `a[*].b`, `a[].b`, `a.*.b` | any array index or any key |
| `*`                        | any single segment         |
| `**`                       | zero or more segments      |
| `$` or `''`                | the root value             |

### Precedence

1. A field rule on a path always beats detectors on that path.
2. Among matching field rules, the most specific wins (literal segments count 2, `*` counts 1, `**` counts 0). On a tie, the last declared wins.
3. A rule on a container applies to its whole subtree unless a more specific rule matches a descendant.

### What the category does

When omitted on a `mask` or `redact` rule, the category is inferred from the enabled detectors if the whole field value is a match (an email address in an `email` field, a card number in a `card` field). Otherwise the entry is reported with category `field`, the generic mask is used and the marker is `[REDACTED]`.

- Appears as `category` in the report entry (`'field'` when omitted).
- Builds the redaction marker: `[REDACTED_SSN_US]`.
- Selects a category-specific mask when it matches a detector name (`email`, `credit_card`, `phone`, `ip_address`, `ssn_us`, `cedula_ec`, `api_key_secret`, `person_name`, `physical_address`, or a custom detector with a `mask` function).

## `maxStringLength`

Strings longer than this are not scanned by detectors. They are returned as-is and recorded in `report.skipped` with reason `max_string_length`. Default: `100000`. Must be positive.

Field rules still apply to oversized strings; only detector scanning is skipped.

## `hash`

```ts
hash: {
  algorithm: 'sha256',   // any algorithm supported by node:crypto
  salt: 'secret',        // strongly recommended, see docs/actions.md
  encoding: 'hex',       // 'hex' | 'base64' | 'base64url'
  length: 16,            // truncate the digest
  prefix: 'sha256:',     // prepended to the digest
}
```

## `mask`

```ts
mask: {
  char: '#';
} // default '*'
```

## `redact`

```ts
redact: {
  format: (category) => (category ? `<${category}>` : '<hidden>'),
}
```

Default marker: `[REDACTED_<CATEGORY>]`, or `[REDACTED]` without a category. Non-alphanumeric characters in the category are replaced by underscores.

## `tokenStore`

Required by the `tokenize` action.

```ts
interface TokenStore {
  tokenize(value: string, context: { path: string; category?: string }): string | Promise<string>;
  detokenize?(token: string): string | undefined | Promise<string | undefined>;
}
```

If `tokenize` returns a promise, use `sanitizeAsync()`; the synchronous `sanitize()` throws a descriptive error instead of returning a promise inside the data.

## `audit`

When `true`, every report entry for a string or number value carries a `preview`: the masked version of the value (category-specific mask when available, generic mask otherwise). Raw values are never included.

## Sanitizer instance

`createSanitizer(config)` returns:

| Member                   | Description                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `sanitize(payload)`      | Synchronous scrub. Throws for asynchronous token stores.                                                                    |
| `sanitizeAsync(payload)` | Awaits asynchronous token stores.                                                                                           |
| `detect(text)`           | Runs the enabled detectors on a string and returns matches without changing anything.                                       |
| `extend(config)`         | New instance with the configuration merged (fields, detectors map and custom detectors are merged; other options replaced). |
| `detectors`              | Enabled detectors with their effective action.                                                                              |
| `config`                 | The frozen configuration object.                                                                                            |

Instances hold no per-call state and are safe to share across concurrent requests.

## Traversal rules

- Plain objects (prototype `Object.prototype` or `null`) and arrays are traversed.
- Strings are scanned by detectors. Numbers and bigints are only transformed when a field rule targets them (they become strings).
- Booleans, `null`, `undefined` and `Date` pass through untouched.
- `Map`, `Set`, buffers and class instances pass through untouched and are listed in `report.skipped` with reason `unsupported_value`. Convert them to plain data first if they can contain PII.
- Circular references are replaced with the string `'[Circular]'` and listed in `report.skipped` with reason `circular`.
- The input is never mutated; the output is a new structure. Untouched primitives are shared, untouched containers are copied.
