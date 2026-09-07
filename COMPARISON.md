# COMPARISON.md — sanitytype vs existing PII tools

This documents why `sanitytype` exists as a distinct project rather than
"just use X". Written from general knowledge of the landscape at spec time
— exact feature lists of third-party tools should be re-verified against
their current docs before quoting this file externally (tools evolve).

## Landscape categories

### 1. Enterprise DLP APIs (Google Cloud DLP, Microsoft Purview/Presidio
   as a hosted service, AWS Macie)

- **Strength**: broad entity coverage, ML-based detection, compliance
  tooling built around them.
- **Gap for our use case**: require a network call per scan (added
  latency, added cost per request, added vendor dependency), heavyweight
  to integrate for "just scrub this object before an LLM call", and
  generally billed per API call — expensive at high request volume for a
  small/mid app.
- **sanitytype's position**: in-process, zero network calls, zero
  per-request cost — trades some detection sophistication (no ML NER) for
  latency, cost, and dependency-surface guarantees.

### 2. Microsoft Presidio (open source, self-hostable)

- **Strength**: mature, actively maintained, strong entity recognition
  (spaCy-based NER + pattern recognizers), self-hostable to avoid the
  per-call cost problem above.
- **Gap for our use case**: primarily a Python project; using it from a
  Node/TypeScript backend means running a separate Python service and
  calling it over HTTP — an operational dependency (another process to
  deploy/monitor) for teams that are TypeScript-only end to end.
- **sanitytype's position**: native TypeScript, no separate service to
  operate, trading Presidio's stronger ML-based recall for operational
  simplicity in a Node-only stack.

### 3. Regex-only scrubber npm packages (various small libraries)

- **Strength**: lightweight, no dependencies, easy to vendor/fork.
- **Gap for our use case**: typically operate on unstructured text only —
  no concept of "this field in my typed object is a phone number", so they
  either scan everything as text (higher false-positive risk, no
  structure awareness) or require manual per-call configuration with no
  schema integration. Rarely typed with the object shape guarantee
  sanitytype targets (structural input/output equivalence).
- **sanitytype's position**: adds the schema-aware layer on top of
  pattern detection, plus TypeScript-first API design, plus the
  audit/report object as a first-class output — not just "here's your
  scrubbed string back".

### 4. Browser-extension PII tools

- **Strength**: catch what a user pastes into a web UI in real time.
- **Gap for our use case**: irrelevant to server-to-server or
  backend-to-LLM traffic — a different problem entirely. Not a real
  competitor, just a frequently-confused adjacent category worth
  explicitly ruling out here so the positioning is clear.

## Where sanitytype specifically differentiates

1. **Schema-aware + pattern-based, combined.** Most tools pick one
   approach. Combining both means known fields get scrubbed with
   certainty (schema), and free-text fields still get a safety net
   (detectors) — see SPEC.md §4.3.
2. **Zero network calls, in-process only.** Removes an entire class of
   "is my DLP vendor call itself now a data-sharing liability" question,
   and removes per-request latency/cost entirely. This is the single
   biggest differentiator versus the enterprise DLP API category.
3. **TypeScript-native, no adjacent service to operate.** Removes the
   Presidio-style "now I run a Python microservice too" operational cost
   for TS-only teams.
4. **LLM-call wrapping as a first-class, documented use case (Phase 2).**
   Most general-purpose PII tools treat "scrub before hitting an LLM" as
   an example a user has to wire up themselves; sanitytype ships it as a
   named, tested integration path.
5. **Audit report as a first-class output**, not an afterthought — every
   call returns what was scrubbed, where, and by which detector, designed
   for teams that need to demonstrate what protective action was taken
   (useful input to a compliance process, though sanitytype itself makes
   no compliance certification claim — see SPEC.md §3).

## What sanitytype deliberately does NOT try to beat

- Presidio/Cloud DLP on raw detection recall via ML-based NER — v1 is
  pattern + schema based, not ML based (see SPEC.md §3, ROADMAP.md Phase 4
  for a possible future path, not a v1 promise).
- Any tool's claim of compliance certification — sanitytype is a control,
  not a certification, and says so explicitly (SPEC.md §3).
