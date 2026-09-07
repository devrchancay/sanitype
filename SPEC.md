# SPEC.md — sanitype

## 1. Problem statement

Applications increasingly pipe user-originated data into systems that were
never designed to handle sensitive information safely:

- LLM prompts (OpenAI, Anthropic, Gemini, local models) — user messages,
  support tickets, form submissions, uploaded documents get concatenated
  into prompts verbatim.
- Observability/logging (Sentry, Datadog, console logs, request/response
  loggers) — request bodies get logged whole for debugging, PII included.
- Analytics (Segment, Mixpanel, PostHog, internal event pipelines) — event
  payloads often carry more user data than the analytics vendor needs.
- Third-party APIs (support/ticketing tools, webhooks, partner
  integrations) — forwarding a full payload when only non-sensitive fields
  are needed.

Existing mitigations are incomplete:

- **Regex-only PII scrubbers** — brittle, false-positive/false-negative
  prone, no awareness of your actual data shape, no compile-time guarantees.
- **Browser-extension tools** — only catch UI-level paste/input events;
  miss server-to-server and backend-to-LLM traffic entirely.
- **Heavy enterprise DLP suites** (e.g. Microsoft Purview, Google DLP API) —
  overkill for a single Node/TS service, require external API calls (added
  latency, added vendor dependency, cost per request), and are not built to
  be a lightweight in-process middleware.

## 2. Goals

1. Give a TypeScript backend a single call — `sanitize(payload, schema)` —
   that returns a structurally identical payload with sensitive fields
   scrubbed/masked/redacted according to policy.
2. Combine **schema-aware detection** (you tell it which fields are
   sensitive, via a Zod-like schema or field-path config) with **pattern-based
   detection** (regex/NER-lite for free-text fields — catch PII embedded in
   strings the schema didn't anticipate, e.g. an email pasted into a
   "notes" field).
3. Be usable as:
   - A standalone function call (`sanitize()`) for one-off payloads.
   - Middleware for common Node HTTP frameworks (Express, Fastify, Hono) that
     scrubs request/response bodies automatically.
   - A wrapper around common LLM SDK calls (a `sanitizedChatCompletion()`-style
     helper) so scrubbing happens transparently before the prompt leaves the
     process.
4. Be fully typed: input and output types are structurally identical (same
   shape), so consuming code doesn't need to re-validate or re-cast anything.
5. Be deterministic and auditable: every scrub decision is traceable — the
   library can return a "report" of what was scrubbed, where, and why,
   for compliance/audit logging.
6. Run entirely in-process, zero external API calls, zero added network
   latency, no cost per request. This is a design non-negotiable — it is
   the primary differentiator from DLP-as-a-service offerings.

## 3. Non-goals (v1)

- Not a compliance certification tool (does not claim GDPR/HIPAA/CCPA
  compliance out of the box — it is one control among many an integrator
  must combine with policy, legal review, and data governance).
- Not a full NER (Named Entity Recognition) ML model. v1 uses
  pattern-matching + schema hints; ML-based detection is a possible v2+
  plugin, not core.
- Not a database-level encryption/tokenization system. This operates on
  data-in-transit at the application layer, not data-at-rest.
- Not a browser-side/client-side library in v1. Backend/Node-first;
  browser support (if ever) is a separate package.
- Not multi-language in v1. TypeScript/Node only; Python/Go ports are
  future, separate packages, not this repo's scope.

## 4. Core concepts

### 4.1 Sensitivity categories (built-in detectors)

Ship a default set of detectors, each independently toggleable:

- `email`
- `phone` (configurable per country/region format; default permissive
  international pattern)
- `ssn_us` / national ID patterns (configurable per locale — e.g. Ecuador's
  cédula, since that's the primary user's home market)
- `credit_card` (Luhn-validated, not just digit-pattern matching, to reduce
  false positives)
- `ip_address` (v4 and v6)
- `physical_address` (heuristic — lower confidence, opt-in)
- `person_name` (heuristic — lower confidence, opt-in, highest false-positive
  risk category, documented as such)
- `api_key_secret` (common vendor key patterns — AWS, GitHub tokens, Stripe
  keys, generic `sk-`/`pk-` prefixes — useful for catching accidentally
  logged credentials, not just personal data)
- `custom` — user-defined regex or predicate function registered by name

### 4.2 Actions

Per field or per detected category, the caller chooses an action:

- `redact` — replace with a fixed marker, e.g. `[REDACTED_EMAIL]`
- `mask` — partial masking preserving format/shape, e.g.
  `john.doe@example.com` → `j***.d**@e******.com`, credit card →
  `**** **** **** 1234`
- `hash` — deterministic one-way hash (for cases needing consistent
  pseudonymization across calls without reversibility)
- `drop` — remove the field entirely from the payload
- `tokenize` — replace with a reversible token (requires a caller-supplied
  token store interface — sanitype defines the interface, does not ship
  a token store backend in v1)
- `allow` — explicit override, field is known-safe, skip scrubbing (useful
  to silence a detector false-positive on a specific field without
  disabling the detector globally)

### 4.3 Configuration model

Two ways to tell sanitype what's sensitive, usable together:

1. **Schema-driven** — annotate a schema (Zod-compatible) with a
   `sensitive()` wrapper/metadata marking specific fields and their action.
2. **Detector-driven** — run built-in/custom detectors against any string
   value (including inside nested objects/arrays) regardless of schema
   annotation, for free-text fields where sensitive data might appear
   unexpectedly.

Schema-driven takes precedence when both apply to the same field (explicit
beats heuristic).

### 4.4 API surface (illustrative — final signatures decided at
implementation time, not fixed here)

```
sanitize(payload, options): { data, report }
createSanitizer(config): Sanitizer   // pre-configured reusable instance
Sanitizer.sanitize(payload): { data, report }
Sanitizer.middleware(): (req, res, next) => void   // framework-specific adapters
Sanitizer.wrapLLMCall(fn): fn        // wraps an LLM SDK call, scrubs args before invocation
```

`report` always includes: field path, detector/category matched, action
taken, and (optionally, for audit mode) a redacted-but-shape-preserving
preview — never the raw original value, even in the report.

## 5. Non-functional requirements

- **Performance**: sanitizing a typical API payload (a few KB, <50 fields)
  must add negligible latency (sub-millisecond target for schema-driven
  scrubbing; regex-driven free-text scanning budget to be measured once
  implemented — documented as a benchmark target, not a guess).
- **Zero required external dependencies for core functionality.** Optional
  peer dependencies (Zod, specific framework types) allowed for adapters.
- **Tree-shakeable** — framework adapters (Express/Fastify/Hono) and LLM SDK
  wrappers must be separate entry points/subpackages so a consumer using
  only the core `sanitize()` function doesn't bundle unrelated adapter code.
- **No telemetry, no network calls, no data leaves the process** — this is
  a hard trust requirement for a security-adjacent tool; must be
  independently verifiable by reading the dependency tree.

## 6. Success criteria for v1

- A backend developer can install the package, define which fields of an
  existing TypeScript type are sensitive, and get a working `sanitize()`
  call producing structurally correct scrubbed output in under 10 minutes,
  without reading beyond the README quickstart.
- At least one framework middleware adapter (Express) and one LLM wrapper
  (OpenAI-compatible chat completion call) ship in v1, not just the core
  function — the "used to clean data before hitting an LLM" use case must
  be a first-class, documented path, not an exercise left to the reader.
- False-positive rate on the `person_name` and `physical_address` heuristic
  detectors is visibly labeled as best-effort in docs, so integrators don't
  over-trust them for compliance purposes.

## 7. Open questions (to resolve before/during MVP build)

- Exact locale-specific ID pattern list for v1 (start with US SSN + Ecuador
  cédula given the primary maintainer's market, expand from there — do not
  attempt "all countries" in v1).
- Whether `tokenize` ships an in-memory reference token store for
  local/dev use, or ships zero storage implementation and is purely an
  interface in v1 (leaning toward interface-only, to avoid encouraging
  unsafe default storage).
- Whether detection runs synchronously or exposes an async variant for
  large payloads / future ML-based detectors (v2 concern, but the core
  type signature should not paint us into a sync-only corner).
