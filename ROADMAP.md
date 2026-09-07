# ROADMAP.md — sanitype

Phased plan. No code exists yet — this defines the MVP boundary so
implementation (when it starts) has a clear, small first target instead of
building the whole SPEC at once.

## Phase 0 — Spec (current phase)

- [x] Problem statement, goals, non-goals (`SPEC.md`)
- [x] Architecture design (`ARCHITECTURE.md`)
- [x] Competitive comparison (`COMPARISON.md`)
- [x] Name/branding finalized — **done**: `sanitype` (renamed from an
      earlier working name that risked confusion with the unrelated Sanity
      CMS product). Repo live at github.com/devrchancay/sanitype, npm name
      available at time of writing (verify again immediately before first
      publish — availability can change).
- [ ] Decide open questions from SPEC.md §7 before writing the first type
      definition (locale list for ID detectors, tokenize storage stance,
      sync-vs-async core signature).

## Phase 1 — MVP (core only, no adapters)

Goal: a single npm package, `sanitype`, installable and usable
standalone, with no framework/LLM-SDK adapters yet.

Scope:
- Core `sanitize(payload, options)` function.
- `createSanitizer(config)` for a reusable pre-configured instance.
- Built-in high-confidence detectors only: `email`, `phone`, `credit_card`
  (Luhn-validated), `ip_address`, `api_key_secret`. Heuristic detectors
  (`person_name`, `physical_address`) deferred to Phase 3 — they carry the
  most false-positive risk and should not gate the first release.
- Actions: `redact`, `mask`, `drop`. Defer `hash` and `tokenize` — they
  carry design decisions (which hash algorithm, what token store interface)
  not yet finalized (see SPEC.md §7).
- Schema-driven config via a Zod-compatible side-channel (no adapters to
  other schema libraries yet).
- Full TypeScript types, structural output-matches-input guarantee.
- Report object on every call.
- Test suite: golden-file tests per detector + structural walker
  property tests (see ARCHITECTURE.md §8).
- README quickstart, published to npm as `0.1.0`.

Explicitly NOT in Phase 1: any Express/Fastify/Hono adapter, any LLM SDK
wrapper, any locale beyond a documented minimal default set, hashing,
tokenization.

**MVP is done when**: a developer can `npm install sanitype`, define a
plain object type, mark 2-3 fields sensitive via the schema side-channel,
call `sanitize()`, and get correctly scrubbed output with a report — all
from reading the README alone, no other docs needed.

## Phase 2 — First adapter + first LLM wrapper

Goal: ship the "used before an LLM call" use case as a first-class,
documented path — this is the primary differentiator from generic PII
scrubbers, so it should not lag far behind MVP.

Scope:
- One HTTP framework adapter: Express (`sanitype/express`) — chosen for
  ecosystem size, not necessarily fanciness.
- One LLM wrapper: OpenAI-compatible chat completion shape
  (`sanitype/openai`) — chosen because "OpenAI-compatible" also covers
  many proxies/local model servers, maximizing coverage for one adapter.
- Add `hash` action (deterministic, documented algorithm choice).
- Expand detector locale coverage: add Ecuador cédula pattern alongside
  US SSN (per SPEC.md §7 — start narrow, deliberately).

## Phase 3 — Heuristic detectors + more adapters

Scope:
- `person_name` and `physical_address` heuristic detectors, shipped
  clearly labeled as best-effort/opt-in, with documented false-positive
  characteristics from real testing (not just a disclaimer — actual
  measured numbers from the golden-file test suite).
- Additional framework adapter(s) based on actual user demand (Fastify
  and/or Hono), not spec-assumed priority.
- `tokenize` action, once the token-store interface question from SPEC.md
  §7 is resolved and there's a concrete consumer need driving the design
  (avoid building storage nobody asked for).

## Phase 4 — Community/ecosystem (conditional)

Only pursued if Phase 1-3 show real adoption signal (npm downloads,
GitHub stars/issues, actual production usage reports):
- Additional LLM SDK wrappers (Anthropic-shape, Gemini-shape).
- Additional locale detector packs, contributed or maintained based on
  demand.
- Possible async/ML-based detector plugin path (see ARCHITECTURE.md §6),
  if a concrete need for higher-recall entity detection emerges beyond
  what regex/heuristics catch.

## Explicit non-milestones

These are permanently out of scope for this package, not just deferred:
- Compliance certification claims (GDPR/HIPAA/CCPA "compliant" labeling).
- A hosted/SaaS version of this scrubbing logic — this is a library, not
  a service, by design (see SPEC.md §2 goal 6 — in-process, zero network
  calls is the core value proposition, not a phase-1 shortcut to remove
  later).
- Non-TypeScript/Node language ports (Python, Go, etc.) inside this
  repository — would be separate projects if ever pursued.
