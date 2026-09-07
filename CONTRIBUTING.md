# Contributing to sanitype

Thank you for considering a contribution. This guide covers the development
setup, the project layout, how to add a detector or an adapter, and the pull
request process.

## Ground rules

- Code, comments, documentation, tests and commit messages are written in **English**.
- The core package keeps **zero runtime dependencies** and performs **no network I/O**. `test/trust.test.ts` enforces both; do not weaken it.
- Every behaviour change ships with tests. Detectors ship with golden tests (true positives, true negatives, tricky cases).
- Public API changes are documented in `README.md`, the relevant `docs/*.md` page and `CHANGELOG.md`.
- Be kind. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Development setup

Requirements: Node.js 20.12 or newer and npm. The published package supports Node.js 18+, but the test runner (Vitest 5) needs Node.js 20.12+.

```sh
git clone https://github.com/devrchancay/sanitype.git
cd sanitype
npm install
```

Useful scripts:

| Script                       | What it does                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| `npm test`                   | Run the test suite once (Vitest).                            |
| `npm run test:watch`         | Run tests in watch mode.                                     |
| `npm run test:coverage`      | Run tests with V8 coverage.                                  |
| `npm run typecheck`          | `tsc --noEmit` over `src`, `test`, `bench` and `examples`.   |
| `npm run lint`               | ESLint.                                                      |
| `npm run format`             | Prettier, writes changes. `format:check` only verifies.      |
| `npm run check`              | typecheck + lint + format check + tests. Run before pushing. |
| `npm run build`              | Build ESM, CJS and type declarations into `dist/` with tsup. |
| `npm run bench`              | Micro-benchmark (`bench/run.ts`).                            |
| `npx tsx examples/<name>.ts` | Run an example.                                              |

## Project layout

```
src/
  index.ts              Public exports of the core package
  types.ts              Public types (Action, Detector, SanitizerConfig, report, ...)
  sanitizer.ts          Configuration resolution, structural walker, action application, report
  paths.ts              Path pattern parsing and matching (`users[*].email`, `**.password`)
  actions/              redact, mask, hash, tokenize primitives
  detectors/            One file per built-in detector + define.ts (defineDetector) + resolve.ts (overlaps)
  llm/wrap.ts           Generic request wrapper shared by the LLM adapters
  zod/index.ts          sanitype/zod entry point
  express/index.ts      sanitype/express entry point
  openai/index.ts       sanitype/openai entry point
  anthropic/index.ts    sanitype/anthropic entry point
test/                   Vitest suites, mirroring src/ (detectors/, adapters/)
bench/run.ts            Benchmark script
examples/               Runnable examples referenced from the docs
docs/                   User documentation
```

Adapters depend on the core; the core never imports an adapter. Each adapter
is a separate entry point in `tsup.config.ts` and `package.json#exports` so
consumers only bundle what they import.

## Adding a built-in detector

1. **Create `src/detectors/<name>.ts`** using `defineDetector`:

   ```ts
   import { defineDetector, countDigits } from './define.js';

   export const iban = defineDetector({
     name: 'iban',
     pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/,
     validate: isValidIban, // checksum: keeps false positives low
     prefilter: (value) => countDigits(value) >= 4, // cheap early exit, must never reject a real match
     priority: 80, // overlap resolution; see existing detectors for the scale
     mask: (value, options) => maskKeepLast(value, 4, options),
   });
   ```

   Choose `confidence: 'high'` only when the pattern includes a structural
   check (checksum, fixed prefix, validated ranges). Anything that relies on
   capitalisation or word lists is `heuristic` and stays opt-in.

2. **Register it** in `src/detectors/index.ts` (`builtinDetectors`) and add
   the name to `BuiltinDetectorName` in `src/types.ts`. High-confidence
   detectors become enabled by default automatically.

3. **Write golden tests** in `test/detectors/<name>.test.ts` with the helpers
   in `test/helpers.ts`:
   - true positives in several formats,
   - true negatives that look similar (IDs, dates, versions, UUIDs),
   - offset consistency (`expectConsistentOffsets`),
   - the mask output.

4. **Document it** in the detector table in `README.md` and in
   `docs/detectors.md`, including known false-positive characteristics.

5. **Add a changelog entry** under `Unreleased`.

Locale-specific identifiers follow the `<kind>_<country>` naming convention
(`ssn_us`, `cedula_ec`).

## Adding a framework or SDK adapter

1. Create `src/<name>/index.ts`. Depend only on structural types (see
   `RequestLike` in the Express adapter): do not import the framework at
   runtime and do not add it as a required dependency.
2. Add the entry to `tsup.config.ts` and to `package.json#exports` (ESM and
   CJS, with types).
3. Test against the real framework where possible. The Express tests start
   a real server and use `fetch`; SDK wrappers are tested with structural
   fakes because the real SDKs would perform network calls.
4. Document usage in `docs/adapters.md` and the README.

## Writing tests

- Test files live in `test/` and end with `.test.ts`.
- Prefer behaviour-level assertions on `data` and `report` over
  implementation details.
- Structural guarantees are covered by property-based tests in
  `test/structure.property.test.ts` using fast-check. If you change the
  walker, run them with a higher `numRuns` locally.
- Never put real personal data in tests. Use the RFC-style example values
  already present (`example.com`, `4111 1111 1111 1111`, `123-45-6789`).
- Assemble sample credentials from parts at runtime (see the `k()` helper
  in `test/detectors/api-key-secret.test.ts`). A secret-shaped literal such
  as a Stripe or Slack key, even a fake one, is rejected by GitHub push
  protection and blocks the whole push.

## Commit messages and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(detectors): add iban detector`, `fix(express): define query as own property`,
  `docs: clarify mask semantics`.
- Keep pull requests focused. A detector, a fix or a doc improvement per PR.
- Fill in the pull request template. CI runs `npm run check` and `npm run build` on Node 20 and 22; it must be green.
- Maintainers squash-merge. The PR title becomes the commit message.

## Releasing (maintainers)

Releases are published by `.github/workflows/release.yml` when a version tag
is pushed. The workflow verifies that the tag matches `package.json`, runs
`npm run check` and `npm run build`, publishes to npm with provenance, and
creates a GitHub release from the matching `CHANGELOG.md` section.

One-time setup: create an npm [granular access token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
with **read and write** permission scoped to the `sanitype` package, and store
it as the `NPM_TOKEN` secret of the repository (Settings → Secrets and
variables → Actions).

To release:

1. Move the `Unreleased` entries in `CHANGELOG.md` under the new version with today's date, and update the comparison links at the bottom.
2. `npm version <patch|minor|major>` — updates `package.json`, commits and creates the `vX.Y.Z` tag.
3. `git push --follow-tags` — the workflow takes it from there.
4. Check the Actions run, the npm page and the GitHub release.

Without local git access, bump the version and changelog through a pull
request, then open the Actions tab, select the **Release** workflow, click
**Run workflow** and enter the version (for example `0.1.0`). The workflow
creates the tag itself.

A manual `npm publish` from a machine with `npm login` still works
(`prepublishOnly` runs the same checks) but does not produce a provenance
attestation.

## Questions

Open a [discussion or issue](https://github.com/devrchancay/sanitype/issues). Security concerns go to the address in [SECURITY.md](./SECURITY.md).
