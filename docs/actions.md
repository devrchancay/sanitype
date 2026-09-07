# Actions

An action decides what happens to a value once it has been identified as sensitive, either by a field rule or by a detector.

| Action     | Shape preserved | Reversible         | Deterministic        |
| ---------- | --------------- | ------------------ | -------------------- |
| `redact`   | no (marker)     | no                 | yes                  |
| `mask`     | yes             | no                 | yes                  |
| `hash`     | no              | no                 | yes                  |
| `drop`     | no (removed)    | no                 | yes                  |
| `tokenize` | no (token)      | yes, via the store | depends on the store |
| `allow`    | untouched       | —                  | —                    |

## `redact`

Replaces the value with a marker. The marker is derived from the category: the detector name or the field rule's `category`.

```
[REDACTED_EMAIL]  [REDACTED_CREDIT_CARD]  [REDACTED_CUSTOMER_ID]  [REDACTED]
```

Customise with `redact.format`:

```ts
createSanitizer({ redact: { format: (category) => `<${category ?? 'hidden'}>` } });
```

In free text only the matched substring is replaced: `"mail me at a@b.co"` → `"mail me at [REDACTED_EMAIL]"`.

## `mask`

Partial, shape-preserving masking. Each built-in detector defines what is safe to keep:

| Category           | Example                                         |
| ------------------ | ----------------------------------------------- |
| `email`            | `john.doe@example.com` → `j***.d**@e******.com` |
| `phone`            | `+1 (555) 123-4567` → `+* (***) ***-**67`       |
| `credit_card`      | `4111 1111 1111 1111` → `**** **** **** 1111`   |
| `ip_address`       | `192.168.10.20` → `192.***.**.**`               |
| `ssn_us`           | `123-45-6789` → `***-**-6789`                   |
| `cedula_ec`        | `1710034065` → `*******065`                     |
| `api_key_secret`   | `sk_live_4eC39HqL…` → `sk_l***_********…`       |
| `person_name`      | `John Smith` → `J*** S****`                     |
| `physical_address` | `42 Main St` → `** **** **`                     |
| none / unknown     | every letter and digit → `*`, punctuation kept  |

The generic mask (used for field rules without a category) keeps **nothing** visible. Set `mask.char` to change the mask character.

Field rules use the category to pick the mask: `{ action: 'mask', category: 'email' }` on a field masks it like the email detector would. When a `mask` or `redact` field rule has no category and the **whole** field value matches an enabled detector, that detector's category is inferred automatically, so `{ 'user.email': 'mask' }` still produces `j***.d**@e******.com` and `{ 'user.email': 'redact' }` produces `[REDACTED_EMAIL]`. Partial matches and disabled detectors never trigger inference. Custom detectors provide their own `mask` function.

## `hash`

A deterministic one-way digest of the value, so the same input always produces the same output. Useful for stable pseudonymous identifiers in analytics or for joining records without exposing the value.

```ts
createSanitizer({
  hash: { algorithm: 'sha256', salt: process.env.SANITYPE_SALT, length: 16, prefix: 'h:' },
});
// john@example.com -> h:3f9a1c…
```

**Use a salt.** Values with low entropy (phone numbers, national IDs, short emails) can be recovered from an unsalted hash by enumerating candidates. Keep the salt out of the payloads and logs that carry the hashes.

The digest is `hash(salt + value)`. Numbers under a field rule are hashed as their decimal string.

## `drop`

Removes the value entirely.

- On an object property: the key is removed.
- On an array element: the element is removed and the array shrinks.
- On the root: `data` becomes `undefined`.
- On a detector match inside free text: the matched substring is removed.

This is the only action that changes the structure of the output. Use it for fields a downstream system must never receive (passwords, raw tokens, internal notes).

## `tokenize`

Replaces the value with a token obtained from a caller-supplied `TokenStore`. The store decides the token format and how to reverse it.

```ts
import { createInMemoryTokenStore, createSanitizer } from '@devrchancay/sanitype';

const store = createInMemoryTokenStore({ prefix: 'tok_' });
const sanitizer = createSanitizer({ detectors: { email: 'tokenize' }, tokenStore: store });

const { data } = sanitizer.sanitize('write to a@b.co'); // 'write to tok_8f3a…'
store.detokenize('tok_8f3a…'); // 'a@b.co'
store.restore(data); // 'write to a@b.co'
```

`createInMemoryTokenStore` keeps originals in process memory, issues the same token for the same value within an instance, and loses everything on restart. It is intended for local development, tests and short-lived round-trips such as "tokenize the prompt, restore the answer".

For durable tokenization implement the interface yourself:

```ts
const vaultStore: TokenStore = {
  async tokenize(value, { path, category }) {
    return vault.put(value, { path, category }); // returns an opaque token
  },
  async detokenize(token) {
    return vault.get(token);
  },
};

await sanitizeAsync(payload, { tokenStore: vaultStore, fields: { 'user.email': 'tokenize' } });
```

Asynchronous stores require `sanitizeAsync()`; `sanitize()` throws a descriptive error if the store returns a promise. Every adapter has an `async: true` option for this case.

## `allow`

Marks a path as known-safe. Nothing runs on it, including detectors, and the report records the decision with `action: 'allow'`. Use it to silence a false positive on one field without disabling a detector globally:

```ts
createSanitizer({ fields: { 'shipment.trackingNumber': 'allow' } });
```

## Actions on containers

A field rule can target an object or an array:

- `redact`, `mask`, `hash`, `tokenize`: applied to every string and number leaf inside the container; each leaf gets its own report entry.
- `drop`: the whole container is removed.
- `allow`: the whole subtree is skipped.

## Actions on numbers

Numbers and bigints are only touched by field rules, never by detectors. They are converted to their string form before the action, so a masked number becomes `'*****'`, a hashed number a digest, and a redacted number a marker. Booleans, `null` and `undefined` are never transformed.
