/**
 * Public types for sanitype.
 *
 * Everything in this file is part of the public API and re-exported from the
 * package root.
 */

/** What to do with a sensitive value once it has been identified. */
export type Action = 'redact' | 'mask' | 'hash' | 'drop' | 'tokenize' | 'allow';

/** All supported actions, in a stable order. */
export const ACTIONS: readonly Action[] = ['redact', 'mask', 'hash', 'drop', 'tokenize', 'allow'];

/**
 * How much a detector can be trusted.
 *
 * - `high`: low false-positive rate, enabled by default.
 * - `heuristic`: best-effort pattern matching with a known false-positive
 *   rate. Never enabled by default; must be opted into explicitly.
 */
export type Confidence = 'high' | 'heuristic';

/** A single span of text matched by a detector. */
export interface DetectorMatch {
  /** Inclusive start offset in the scanned string. */
  start: number;
  /** Exclusive end offset in the scanned string. */
  end: number;
  /** The matched text (`value.slice(start, end)`). */
  value: string;
}

/** Options that influence how a value is masked. */
export interface MaskOptions {
  /** Character used for masked positions. Defaults to `*`. */
  char?: string;
}

/**
 * A detector finds sensitive substrings inside free text.
 *
 * Detectors are the extensibility seam of sanitype: built-in detectors and
 * user-defined detectors implement exactly the same interface.
 */
export interface Detector {
  /** Unique name, used in reports, config keys and redaction markers. */
  name: string;
  /** Confidence level. Heuristic detectors are opt-in only. */
  confidence: Confidence;
  /** Action applied to matches when the caller does not override it. */
  defaultAction: Action;
  /**
   * Priority used to resolve overlapping matches from different detectors.
   * Higher wins. Built-in detectors use values between 30 and 100.
   */
  priority?: number;
  /** Return every match found in `value`, or `null` when there is none. */
  test(value: string): DetectorMatch[] | null;
  /**
   * Category-specific masking (e.g. keep the last four digits of a card).
   * When omitted, a generic shape-preserving mask is used.
   */
  mask?(value: string, options: Required<MaskOptions>): string;
}

/** Names of the detectors that ship with sanitype. */
export type BuiltinDetectorName =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ip_address'
  | 'ssn_us'
  | 'cedula_ec'
  | 'api_key_secret'
  | 'person_name'
  | 'physical_address';

/** Per-detector override. */
export interface DetectorOverride {
  /** Enable or disable the detector. */
  enabled?: boolean;
  /** Action applied to this detector's matches instead of its default. */
  action?: Action;
}

/**
 * Setting for one detector:
 *
 * - `true` / `false`: enable or disable it.
 * - an {@link Action}: enable it and use that action.
 * - a {@link DetectorOverride} object.
 */
export type DetectorSetting = boolean | Action | DetectorOverride;

/**
 * Detector configuration.
 *
 * Either a map of detector name to {@link DetectorSetting} (applied on top of
 * the defaults), or an explicit list of detector names / detector objects
 * that replaces the default set entirely.
 */
export type DetectorConfig =
  | Partial<Record<BuiltinDetectorName | (string & {}), DetectorSetting>>
  | ReadonlyArray<BuiltinDetectorName | (string & {}) | Detector>;

/** A rule attached to a field path. */
export interface FieldRule {
  /** Action applied to the whole field value. */
  action: Action;
  /**
   * Optional category label. Used in the report, in the redaction marker
   * (`[REDACTED_<CATEGORY>]`) and, when it matches a built-in detector name,
   * to pick a category-specific mask.
   */
  category?: string;
}

/**
 * Map of field-path patterns to rules.
 *
 * Patterns use dot notation with wildcards:
 *
 * - `user.email` — exact path
 * - `users[*].email`, `users.*.email` or `users[].email` — any array index
 * - `*.password` — any single segment
 * - `**.password` — any depth
 */
export type FieldRules = Record<string, Action | FieldRule>;

/** Options for the `hash` action. */
export interface HashOptions {
  /** Node.js `crypto` digest algorithm. Defaults to `sha256`. */
  algorithm?: string;
  /**
   * Secret salt prepended to the value before hashing. Strongly recommended:
   * unsalted hashes of low-entropy values (phone numbers, national IDs) can
   * be reversed by brute force.
   */
  salt?: string;
  /** Output encoding. Defaults to `hex`. */
  encoding?: 'hex' | 'base64' | 'base64url';
  /** Truncate the digest to this many characters. Defaults to the full digest. */
  length?: number;
  /** String prepended to the digest, e.g. `sha256:`. Defaults to none. */
  prefix?: string;
}

/** Options for the `redact` action. */
export interface RedactOptions {
  /**
   * Build the replacement marker for a category. Defaults to
   * `[REDACTED_<CATEGORY>]`, or `[REDACTED]` when there is no category.
   */
  format?: (category: string | undefined) => string;
}

/** Context passed to a {@link TokenStore} for every tokenized value. */
export interface TokenizeContext {
  /** Path of the field the value came from. */
  path: string;
  /** Detector name or field category, when known. */
  category?: string;
}

/**
 * Reversible token storage used by the `tokenize` action.
 *
 * sanitype only defines the interface. An in-memory implementation is
 * provided for local development and tests; production systems should bring
 * their own store (database, KMS-backed vault, etc.).
 */
export interface TokenStore {
  /** Return a token for `value`. May be asynchronous. */
  tokenize(value: string, context: TokenizeContext): string | Promise<string>;
  /** Resolve a token back to its original value, if known. */
  detokenize?(token: string): string | undefined | Promise<string | undefined>;
}

/** Configuration accepted by {@link createSanitizer} and `sanitize()`. */
export interface SanitizerConfig {
  /** Which detectors run against free text, and with which action. */
  detectors?: DetectorConfig;
  /** Additional user-defined detectors, enabled unless disabled in `detectors`. */
  customDetectors?: readonly Detector[];
  /** Explicit rules for known field paths. These take precedence over detectors. */
  fields?: FieldRules;
  /**
   * Strings longer than this are not scanned by detectors. They are left
   * untouched and recorded in `report.skipped`. Defaults to 100 000.
   */
  maxStringLength?: number;
  /** Options for the `hash` action. */
  hash?: HashOptions;
  /** Options for the `mask` action. */
  mask?: MaskOptions;
  /** Options for the `redact` action. */
  redact?: RedactOptions;
  /** Token store required by the `tokenize` action. */
  tokenStore?: TokenStore;
  /**
   * Audit mode: include a masked, shape-preserving preview of each scrubbed
   * value in the report. The raw value is never included.
   */
  audit?: boolean;
}

/** Where a report entry came from. */
export type ReportSource = 'field' | 'detector';

/** One scrub decision. */
export interface ReportEntry {
  /** Path of the affected value, e.g. `user.email` or `messages[0].content`. `$` is the root. */
  path: string;
  /** Detector name, field category, or `field` when a rule has no category. */
  category: string;
  /** Whether a field rule or a detector produced this entry. */
  source: ReportSource;
  /** Action that was applied. */
  action: Action;
  /** Number of substrings matched (detector entries only). */
  matches?: number;
  /** Masked preview of the value. Only present in audit mode. */
  preview?: string;
}

/** Why a value was not processed. */
export type SkipReason = 'max_string_length' | 'circular' | 'unsupported_value';

/** A value that was intentionally left untouched. */
export interface SkippedEntry {
  path: string;
  reason: SkipReason;
  detail?: string;
}

/** Structured record of everything a `sanitize()` call did. */
export interface SanitizeReport {
  /** Every scrub decision, in traversal order. */
  entries: ReportEntry[];
  /** Values that were skipped and why. */
  skipped: SkippedEntry[];
  /** Number of matched values per category (field rules count as one, detector entries by their matches). */
  summary: Record<string, number>;
  /** `true` when at least one value was modified or dropped. */
  modified: boolean;
  /** Wall-clock time spent, in milliseconds. */
  durationMs: number;
}

/** Return value of `sanitize()`. */
export interface SanitizeResult<T> {
  /**
   * Sanitized copy of the payload. It has the same structure as the input,
   * except for fields removed by the `drop` action. The input is never
   * mutated.
   */
  data: T;
  /** What was scrubbed, where and why. */
  report: SanitizeReport;
}

/** A detector match annotated with the detector that produced it. */
export interface DetectionResult extends DetectorMatch {
  /** Name of the detector that matched. */
  detector: string;
  /** Confidence of that detector. */
  confidence: Confidence;
}
