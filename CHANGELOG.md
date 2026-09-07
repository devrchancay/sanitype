# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-09-07

First implementation of the design described in `SPEC.md`. Published to npm as `@devrchancay/sanitype`: the registry rejects the unscoped name `sanitype` as too similar to existing packages.

### Added

- Core API: `sanitize()`, `sanitizeAsync()`, `createSanitizer()` with `sanitize`, `sanitizeAsync`, `detect` and `extend`.
- Structural walker that preserves input shape, never mutates the input, handles arrays, nested objects, circular references and oversized strings.
- Field rules with dot/bracket path patterns and `*` / `**` wildcards.
- Actions: `redact`, `mask`, `hash`, `drop`, `tokenize`, `allow`.
- High-confidence detectors, enabled by default: `email`, `phone`, `credit_card` (Luhn), `ip_address` (v4/v6), `ssn_us`, `cedula_ec` (checksum), `api_key_secret`.
- Heuristic, opt-in detectors: `person_name`, `physical_address`.
- `defineDetector()` for custom detectors with `pattern`, `test`, `validate`, `prefilter` and `mask` hooks.
- Structured report with entries, skipped values, summary, `modified` flag, duration and optional masked previews (`audit: true`).
- `TokenStore` interface and `createInMemoryTokenStore()` with `restore()`.
- `@devrchancay/sanitype/zod`: `sensitive()`, `fieldsFromSchema()`, `.describe('sensitive:...')` and `.meta({ sensitive })` support for Zod 3 and 4.
- `@devrchancay/sanitype/express`: `sanitizeRequest()` and `sanitizeResponse()` middleware for Express 4 and 5.
- `@devrchancay/sanitype/openai`: `sanitizeOpenAI()`, `wrapChatCompletions()`, `wrapResponses()` and parameter helpers.
- `@devrchancay/sanitype/anthropic`: `sanitizeAnthropic()`, `wrapMessages()` and parameter helpers.
- `wrapLLMCall()` for any SDK with a request-object signature.
- Test suite: golden tests per detector, property-based structural tests, real Express integration tests, adapter tests and a trust test that forbids networking code and runtime dependencies.
- Benchmark script (`npm run bench`).

[Unreleased]: https://github.com/devrchancay/sanitype/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/devrchancay/sanitype/releases/tag/v0.1.0
