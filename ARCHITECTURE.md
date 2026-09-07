# ARCHITECTURE.md — sanitytype

Internal design notes. This describes how the system is intended to be
built, once implementation starts — it is not itself implementation.

## 1. Pipeline model

Conceptually, `sanitize()` runs a payload through a linear pipeline:

```
input payload
  -> [1] schema resolution      (if a schema is provided, walk it to find
                                  annotated sensitive fields + their action)
  -> [2] structural walk        (recursively traverse the payload —
                                  objects, arrays, nested structures —
                                  independent of whether a schema was given)
  -> [3] detector pass           (for every string leaf value not already
                                  resolved by schema annotation, run the
                                  enabled detector set against it)
  -> [4] action application      (apply redact/mask/hash/drop/tokenize/allow
                                  per the resolved rule for that field/value)
  -> [5] report assembly         (collect every action taken into a
                                  structured report object)
  -> output: { data, report }
```

Each stage is a pure function of its input plus config — no shared mutable
state between calls, so a `Sanitizer` instance is safely reusable/thread-safe
(in the Node sense: safe across concurrent async calls) across many payloads.

## 2. Detector plugin model

Detectors are the extensibility seam. Each detector is:

```
interface Detector {
  name: string;              // e.g. "email", "credit_card", or a custom name
  test(value: string): DetectorMatch[] | null;
  defaultAction: Action;     // can be overridden per-field by config
  confidence: "high" | "heuristic";  // heuristic detectors are opt-in only
}
```

Built-in detectors (email, phone, ssn/national-id, credit_card, ip_address,
api_key_secret) are `confidence: "high"` — safe defaults, low false-positive
rate, on by default.

Heuristic detectors (person_name, physical_address) are `confidence:
"heuristic"` — off by default, must be explicitly enabled, and are always
documented with their known false-positive/false-negative characteristics.

Custom detectors register through the same interface — a consumer can add
a company-specific pattern (e.g. an internal customer ID format) without
forking the library.

### Why not a single big regex blob

Keeping detectors as independent, named, toggleable units means:
- A consumer can disable exactly one noisy detector without losing the rest.
- The report can attribute every scrub action to a specific named detector
  (auditability requirement from SPEC.md §4.4).
- New detectors can be added/shipped incrementally without touching
  existing ones (no risk of one giant regex regressing when extended).

## 3. Schema integration

Schema-driven configuration wraps a Zod schema (or Zod-compatible/standard
schema) with a parallel "sensitivity map" — a side-channel describing which
field paths are sensitive and what action applies, without mutating the
original schema's validation behavior. This keeps `sanitytype` a pure
add-on layer: an app's existing Zod schemas keep working for validation as
they already do, and sanitytype consumes them read-only for field-path
resolution.

This side-channel approach (vs. requiring a custom schema-wrapper syntax)
is deliberate — it should not force a consumer to rewrite their existing
validation schemas just to adopt scrubbing.

## 4. Framework adapters

Adapters are thin, separately-published entry points (e.g.
`sanitytype/express`, `sanitytype/fastify`) that:
1. Wrap the framework's request/response body access.
2. Call the core `sanitize()` against the body using a pre-configured
   `Sanitizer` instance.
3. Attach the report to a well-known location (e.g. `req.sanitizeReport`)
   for the app to log/inspect if desired.

Adapters depend on core, never the reverse — core has zero framework
awareness, so it stays usable in non-HTTP contexts (queue workers, CLI
tools, cron jobs) without pulling in Express types.

## 5. LLM wrapper design

`wrapLLMCall(fn)` takes a function (typically an SDK's chat-completion
call) and returns a wrapped version that:
1. Intercepts the arguments before the real call executes.
2. Runs `sanitize()` against the message content array (or whatever
   argument shape the wrapped SDK expects — the wrapper is written per
   supported SDK shape, not via reflection magic).
3. Calls the real function with sanitized arguments.
4. Returns the real result unmodified — sanitytype never touches the LLM's
   response, only the outbound request.

This wrapper is intentionally SDK-specific (e.g. an OpenAI-shape wrapper vs.
an Anthropic-shape wrapper) rather than one universal reflection-based
wrapper — explicit per-SDK adapters are easier to reason about, test, and
keep correct when an SDK's request shape changes.

## 6. Performance considerations

- Schema-driven resolution is O(number of annotated fields) — cheap,
  independent of payload size beyond the annotated subset.
- Detector-driven free-text scanning is the potential hot path: it touches
  every string leaf in the payload. Mitigations to evaluate at
  implementation time:
  - Compile all enabled detector regexes once per `Sanitizer` instance
    (not per call).
  - Allow a `maxStringLength` config guard so pathologically large string
    fields (e.g. an accidentally-included file blob) don't get scanned
    character-by-character with expensive patterns — skip with a
    documented warning in the report instead.
  - Defer NER/ML-based heuristic detectors (if ever added) to an explicit
    async path so they cannot silently regress the sync hot path's latency
    budget.

## 7. Trust and dependency surface

Because this is a security-adjacent tool, the dependency tree itself is
part of the product's trust surface:

- Core package: zero required runtime dependencies beyond what ships with
  Node itself, wherever feasible.
- Zod (or schema library) is a peer dependency, not bundled — consumers
  bring their own version, avoiding version-mismatch surprises and keeping
  the dependency tree auditable by inspection.
- No network calls anywhere in the core package — this must be verifiable
  by reading the source, not just asserted in docs.

## 8. Testing strategy (once implementation starts)

- Golden-file tests per detector: known true positives, known true
  negatives, and known tricky edge cases (e.g. a UUID that looks
  numeric-ish but isn't a credit card, an email-shaped string inside a
  code snippet field).
- Property-based tests for the structural walker: output payload shape
  must always structurally match input shape (same keys, same array
  lengths) regardless of which values got scrubbed.
- Adapter integration tests run against real minimal Express/Fastify apps,
  not mocked request/response objects, to catch framework-specific
  body-parsing edge cases.
