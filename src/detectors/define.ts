import type { Action, Confidence, Detector, DetectorMatch, MaskOptions } from '../types.js';

/** A regular expression source for {@link defineDetector}. */
export interface PatternSpec {
  /** Regular expression. The `g` flag is added automatically. */
  regex: RegExp;
  /**
   * Capture group whose span should be reported instead of the whole match.
   * Useful for `key=value` patterns where only the value is sensitive.
   */
  group?: number;
}

export interface DetectorDefinition {
  /** Unique detector name. Use `snake_case`, e.g. `customer_id`. */
  name: string;
  /**
   * One or more regular expressions. Each match becomes a
   * {@link DetectorMatch}, subject to `validate`.
   */
  pattern?: RegExp | PatternSpec | ReadonlyArray<RegExp | PatternSpec>;
  /**
   * Custom matcher. Use this instead of `pattern` when a regular expression
   * is not enough. Must return matches sorted by `start`, or `null`.
   */
  test?: (value: string) => DetectorMatch[] | null;
  /** Reject regex matches that do not pass extra validation (e.g. a checksum). */
  validate?: (match: string) => boolean;
  /**
   * Cheap check run before any pattern. Return `false` to skip the value
   * entirely (e.g. an email detector can skip strings without `@`). Purely a
   * performance optimisation; it must never reject a value the patterns
   * would match.
   */
  prefilter?: (value: string) => boolean;
  /** Defaults to `redact`. */
  action?: Action;
  /** Defaults to `high`. Use `heuristic` for best-effort patterns. */
  confidence?: Confidence;
  /** Overlap-resolution priority. Defaults to 50. */
  priority?: number;
  /** Category-specific mask. */
  mask?: (value: string, options: Required<MaskOptions>) => string;
}

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function toGlobal(regex: RegExp): RegExp {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function normalizePatterns(
  pattern: DetectorDefinition['pattern'],
): Array<{ regex: RegExp; group: number | undefined }> {
  if (!pattern) return [];
  const list = Array.isArray(pattern) ? pattern : [pattern];
  return (list as ReadonlyArray<RegExp | PatternSpec>).map((entry) =>
    entry instanceof RegExp
      ? { regex: toGlobal(entry), group: undefined }
      : { regex: toGlobal(entry.regex), group: entry.group },
  );
}

/** Count decimal digits in a string. Cheaper than a regex for prefilters. */
export function countDigits(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 48 && code <= 57) count++;
  }
  return count;
}

/** Sort matches by start offset and remove duplicates/overlaps within the same detector. */
export function dedupeMatches(matches: DetectorMatch[]): DetectorMatch[] {
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: DetectorMatch[] = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start < lastEnd) continue;
    out.push(match);
    lastEnd = match.end;
  }
  return out;
}

/** Run a list of global regexes against a value and collect matches. */
export function collectMatches(
  value: string,
  patterns: ReadonlyArray<{ regex: RegExp; group: number | undefined }>,
  validate?: (match: string) => boolean,
): DetectorMatch[] | null {
  const matches: DetectorMatch[] = [];
  for (const { regex, group } of patterns) {
    regex.lastIndex = 0;
    for (const found of value.matchAll(regex)) {
      let start = found.index ?? 0;
      let text = found[0];
      if (group !== undefined) {
        const captured = found[group];
        if (captured === undefined) continue;
        start += found[0].indexOf(captured);
        text = captured;
      }
      if (text.length === 0) continue;
      if (validate && !validate(text)) continue;
      matches.push({ start, end: start + text.length, value: text });
    }
  }
  return matches.length ? dedupeMatches(matches) : null;
}

/**
 * Create a {@link Detector} from a regular expression or a custom matcher.
 *
 * @example
 * ```ts
 * const customerId = defineDetector({
 *   name: 'customer_id',
 *   pattern: /\bCUST-\d{6}\b/,
 *   action: 'hash',
 * });
 * ```
 */
export function defineDetector(definition: DetectorDefinition): Detector {
  if (!NAME_PATTERN.test(definition.name)) {
    throw new TypeError(
      `Invalid detector name "${definition.name}". Use lowercase letters, digits and underscores, starting with a letter.`,
    );
  }
  if (!definition.pattern && !definition.test) {
    throw new TypeError(`Detector "${definition.name}" needs a "pattern" or a "test" function.`);
  }
  const patterns = normalizePatterns(definition.pattern);
  const custom = definition.test;
  const validate = definition.validate;
  const prefilter = definition.prefilter;

  const detector: Detector = {
    name: definition.name,
    confidence: definition.confidence ?? 'high',
    defaultAction: definition.action ?? 'redact',
    priority: definition.priority ?? 50,
    test(value: string): DetectorMatch[] | null {
      if (prefilter && !prefilter(value)) return null;
      if (custom) {
        const result = custom(value);
        if (!result || result.length === 0) return null;
        const filtered = validate ? result.filter((m) => validate(m.value)) : result;
        return filtered.length ? dedupeMatches(filtered) : null;
      }
      return collectMatches(value, patterns, validate);
    },
  };
  if (definition.mask) detector.mask = definition.mask;
  return detector;
}
