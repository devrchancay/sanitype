# sanitype

**TypeScript SDK to scrub, mask, and redact PII/sensitive data before it
reaches an LLM, a log sink, an analytics pipeline, or any third-party API.**

> Status: **spec-only**. No implementation yet — this repo currently documents
> the design before a single line of code is written (SDD: spec-driven
> development).

## Why

Modern apps constantly ship user data through pipes that shouldn't see raw
PII: prompts sent to OpenAI/Anthropic/Gemini, application logs shipped to
Datadog/Sentry, analytics events sent to Segment/Mixpanel, support tickets
forwarded to a helpdesk API. Each of those integrations is a potential data
leak if the payload isn't scrubbed first.

Most existing solutions are either:
- Browser-extension-only (catch UI paste events, miss backend traffic), or
- Regex-only libraries with no type safety, no config validation, and no
  guarantee about what "PII" actually means for your data shape.

`sanitype` is a backend-first, strongly-typed middleware: you describe
the shape of your data with TypeScript types/schemas, and it structurally
knows which fields need scrubbing — instead of guessing from unstructured
text with regex alone.

## Documentation

- [`SPEC.md`](./SPEC.md) — full functional specification: scope, goals,
  non-goals, detection strategy, API surface, configuration model.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — internal design: pipeline stages,
  detector plugin model, performance considerations.
- [`ROADMAP.md`](./ROADMAP.md) — phased build plan, MVP boundary, v1 scope.
- [`COMPARISON.md`](./COMPARISON.md) — how this differs from existing PII
  tools (Presidio, scrubbers, DLP SDKs) and why it exists.

## Status

No code yet. This repository is the design phase — read `SPEC.md` first.

## License

MIT (to be added with first code commit).
