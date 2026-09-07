# Detectors

A detector finds sensitive substrings in free text. Detectors run on every string leaf that is not covered by a field rule. Each one is a named, independently toggleable unit, so a noisy detector can be disabled without losing the others, and every report entry names the detector that produced it.

## Interface

```ts
interface Detector {
  name: string;
  confidence: 'high' | 'heuristic';
  defaultAction: Action;
  priority?: number; // overlap resolution, higher wins
  test(value: string): DetectorMatch[] | null;
  mask?(value: string, options: { char: string }): string;
}
```

`high` detectors have structural validation (checksums, fixed prefixes, validated ranges) and are enabled by default. `heuristic` detectors rely on capitalisation or word lists and are opt-in.

## Overlap resolution

When several detectors match overlapping spans of the same string, the match from the detector with the highest `priority` wins; on a tie the longer match wins. Built-in priorities:

| Detector           | Priority |
| ------------------ | -------- |
| `credit_card`      | 100      |
| `api_key_secret`   | 95       |
| `email`            | 90       |
| `ip_address`       | 85       |
| `ssn_us`           | 80       |
| `cedula_ec`        | 75       |
| `phone`            | 70       |
| `physical_address` | 40       |
| `person_name`      | 30       |
| custom (default)   | 50       |

This is why a card number is never partially reported as a phone number, and why an email inside an address is still reported as an email.

## Built-in detectors

### `email`

Unicode-aware address pattern: local part, `@`, at least one dotted domain label and a two-letter-or-longer TLD. Rejects `user@localhost`, decorators such as `@Component`, and handles.

Mask: `john.doe@example.com` → `j***.d**@e******.com` (first character of each label and the TLD are kept).

### `phone`

Permissive international format: optional `+` and country code, optional parenthesised area code, groups separated by spaces, dots or dashes. Requirements:

- 7 to 15 digits in total.
- Bare digit runs (no `+`, parentheses or separators) need at least **9** digits, so short numeric IDs (`1234567`, `12345678`) are left alone.
- Dates (`2024-01-15`, `15-01-2024`, `01-2024`) and repeated single digits (`0000000000`) are rejected.
- Times (`10:30`) and versions (`1.2.3`) do not match.

Known false positives: long order or tracking numbers with 9+ digits. Use `allow` on those fields or disable the detector for payloads that never contain phone numbers.

Mask keeps the last two digits: `+1 (555) 123-4567` → `+* (***) ***-**67`.

### `credit_card`

13 to 19 digits with optional single spaces or dashes between digits, validated with the **Luhn** checksum. Mixed or repeated separators and runs of one digit are rejected. UUIDs and timestamps do not pass Luhn or the length constraints.

Mask keeps the last four digits: `4111 1111 1111 1111` → `**** **** **** 1111`.

### `ip_address`

IPv4 with each octet in 0–255 and no adjacent dotted digits (`1.2.3.4.5` does not match). IPv6 candidates are validated with Node's `net.isIPv6`, so times and MAC addresses never match.

Known false positives: four-part version numbers whose parts are all ≤ 255 (`10.30.1.2`).

Mask keeps the first octet or group: `192.168.10.20` → `192.***.**.**`, `2001:db8::1` → `2001:***::*`.

### `ssn_us`

US Social Security Numbers **with separators** (`123-45-6789`, `123 45 6789`), consistent separator required. Excludes area `000`, `666`, `9xx`, group `00` and serial `0000`. Bare nine-digit runs are not treated as SSNs; the `phone` detector covers those.

Mask: `***-**-6789`.

### `cedula_ec`

Ecuadorian cédula de identidad (10 digits) and natural-person RUC (13 digits, cédula + `001`), validated with the official module-10 algorithm: province code 01–24 or 30, third digit 0–5, checksum on the tenth digit.

Ecuadorian mobile numbers (`09xxxxxxxx`) fail the third-digit rule and never match. Roughly 1–2% of random ten-digit numbers with a valid province prefix pass the checksum; when the same span is also a valid phone number both detectors match and the higher-priority one wins.

Mask keeps the last three digits: `*******065`.

### `api_key_secret`

Credentials rather than personal data, useful for catching secrets pasted into tickets or logged by mistake:

- AWS access key IDs (`AKIA…`, `ASIA…`, …)
- GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`)
- Stripe (`sk_live_`, `sk_test_`, `rk_`, `pk_`, `whsec_`)
- OpenAI and Anthropic style keys (`sk-…`, `sk-proj-…`, `sk-ant-…`)
- Slack (`xox[abposr]-`), Google (`AIza…`), SendGrid (`SG.`), Twilio (`SK…`, `AC…`), npm (`npm_`)
- JSON Web Tokens (`eyJ….eyJ….sig`)
- Bearer tokens (`Bearer <token>`; only the token is reported)
- PEM private key blocks (reported as one match)
- Generic assignments: `api_key=…`, `secret: "…"`, `password=…`, `access_token: …` and similar (only the value is reported, minimum 8 characters)

Mask keeps the first four characters so the key type stays recognisable: `sk_live_4eC39…` → `sk_l***_****…`.

### `person_name` (heuristic, opt-in)

Sequences of two to five capitalised words in Latin script (accents supported), optionally introduced by a title (`Mr.`, `Dr.`, `Sra.`, `Ing.`) and joined by particles (`de`, `del`, `la`, `van`, `von`, `bin`, …). A single capitalised word only matches after a title (`Dr. Smith`).

A stopword list trims greetings, weekdays, months, generic nouns and common English/Spanish words from the edges of a candidate, and rejects candidates made only of stopwords (`Hello World`, `Best Regards`, `Customer Support Team`).

Known false positives: product names (`Google Cloud Platform`), company names, place names (`Buenos Aires`), titles of documents, any capitalised phrase not in the stopword list. Known false negatives: lowercase names, names in ALL CAPS, single names without a title, non-Latin scripts.

Mask keeps initials: `John Smith` → `J*** S****`.

### `physical_address` (heuristic, opt-in)

Two patterns:

- English: `<number> <one to five words> <street type>` with optional direction, unit (`Apt 4`, `Suite 200`, `#12`), city, state and ZIP. Street types include Street/St, Avenue/Ave, Road/Rd, Boulevard/Blvd, Lane/Ln, Drive/Dr, Court/Ct, Way, Place/Pl and others.
- Spanish: `<Calle|Av.|Avenida|Carrera|Cra|Pasaje|Jirón|…> <name> <number>` with optional `#`, `No.`, `N°`, secondary number (`5-23`, `N32-45`), cross street (`y Rumipamba`) and unit (`Piso 3`, `Of. 201`).

Known false positives: business names that contain a street type, sentences such as "10 Downing Street Ltd". Known false negatives: addresses without a number or without a recognised street type, PO boxes, addresses in other languages.

Mask hides every letter and digit while keeping punctuation and spacing.

## Custom detectors

```ts
import { defineDetector, maskKeepLast, countDigits } from '@devrchancay/sanitype';

const iban = defineDetector({
  name: 'iban', // lowercase letters, digits and underscores
  pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/,
  validate: (candidate) => isValidIban(candidate), // optional checksum
  prefilter: (value) => countDigits(value) >= 4, // optional cheap early exit
  action: 'mask', // default action, overridable in `detectors`
  confidence: 'high',
  priority: 80,
  mask: (value, options) => maskKeepLast(value, 4, options),
});
```

Options:

- `pattern`: a `RegExp`, `{ regex, group }` to report only a capture group, or an array of either. The `g` flag is added automatically.
- `test`: a function returning `DetectorMatch[] | null` for logic that a regex cannot express. Matches must be sorted by `start`.
- `validate`: reject regex matches that fail extra checks.
- `prefilter`: skip a string cheaply. Must never reject a value the patterns would match.
- `mask`: category-specific mask used by the `mask` action and by audit previews.

Register the detector with `customDetectors: [iban]` or in the `detectors` list. Detectors can be used standalone too: `iban.test('DE89 3704 0044 0532 0130 00')`.

## Inspecting without modifying

```ts
const sanitizer = createSanitizer({ detectors: { person_name: true } });
sanitizer.detect('Call John Smith at +1 555 123 4567');
// [
//   { detector: 'person_name', confidence: 'heuristic', start: 5, end: 15, value: 'John Smith' },
//   { detector: 'phone', confidence: 'high', start: 19, end: 34, value: '+1 555 123 4567' },
// ]
```
