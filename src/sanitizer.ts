import { hashValue } from './actions/hash.js';
import { DEFAULT_MASK_OPTIONS, maskGeneric } from './actions/mask.js';
import { redactValue } from './actions/redact.js';
import {
  builtinDetectors,
  defaultDetectorNames,
  isBuiltinDetectorName,
} from './detectors/index.js';
import { resolveOverlaps } from './detectors/resolve.js';
import { compileRules, findRule, formatPath } from './paths.js';
import type { CompiledRule } from './paths.js';
import type {
  Action,
  DetectionResult,
  Detector,
  DetectorConfig,
  DetectorSetting,
  FieldRule,
  MaskOptions,
  ReportEntry,
  SanitizeReport,
  SanitizeResult,
  SanitizerConfig,
  SkippedEntry,
  TokenStore,
} from './types.js';
import { ACTIONS } from './types.js';

export const DEFAULT_MAX_STRING_LENGTH = 100_000;

/** A detector together with the action configured for it. */
export interface ActiveDetector {
  detector: Detector;
  action: Action;
}

/** A pre-configured, reusable sanitizer. Safe to share across concurrent calls. */
export interface Sanitizer {
  /** The resolved configuration. */
  readonly config: Readonly<SanitizerConfig>;
  /** Detectors that run on free text, with their effective action. */
  readonly detectors: readonly ActiveDetector[];
  /**
   * Sanitize a payload synchronously. Throws if the configured token store
   * returns a promise; use {@link Sanitizer.sanitizeAsync} in that case.
   */
  sanitize<T>(payload: T): SanitizeResult<T>;
  /** Sanitize a payload, awaiting asynchronous token stores. */
  sanitizeAsync<T>(payload: T): Promise<SanitizeResult<T>>;
  /** Run the enabled detectors on a string without modifying it. */
  detect(value: string): DetectionResult[];
  /** Create a new sanitizer with additional configuration merged in. */
  extend(config: SanitizerConfig): Sanitizer;
}

interface Resolved {
  config: SanitizerConfig;
  detectors: ActiveDetector[];
  rules: CompiledRule[];
  maxStringLength: number;
  mask: Required<MaskOptions>;
  tokenStore: TokenStore | undefined;
  audit: boolean;
}

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

function assertAction(action: unknown, where: string): asserts action is Action {
  if (!ACTIONS.includes(action as Action)) {
    throw new TypeError(
      `Unknown action "${String(action)}" for ${where}. Expected one of: ${ACTIONS.join(', ')}.`,
    );
  }
}

function applySetting(
  name: string,
  setting: DetectorSetting,
  enabled: Map<string, ActiveDetector>,
  lookup: (name: string) => Detector | undefined,
): void {
  const detector = lookup(name);
  if (!detector) {
    throw new TypeError(
      `Unknown detector "${name}". Built-in detectors: ${Object.keys(builtinDetectors).join(', ')}. Register custom detectors through "customDetectors".`,
    );
  }
  if (setting === false) {
    enabled.delete(name);
    return;
  }
  if (setting === true) {
    if (!enabled.has(name)) enabled.set(name, { detector, action: detector.defaultAction });
    return;
  }
  if (typeof setting === 'string') {
    assertAction(setting, `detector "${name}"`);
    enabled.set(name, { detector, action: setting });
    return;
  }
  if (setting.enabled === false) {
    enabled.delete(name);
    return;
  }
  const current = enabled.get(name);
  const action = setting.action ?? current?.action ?? detector.defaultAction;
  assertAction(action, `detector "${name}"`);
  enabled.set(name, { detector, action });
}

function resolveDetectors(
  detectors: DetectorConfig | undefined,
  custom: readonly Detector[] | undefined,
): ActiveDetector[] {
  const customByName = new Map<string, Detector>();
  for (const detector of custom ?? []) {
    if (!detector || typeof detector.name !== 'string' || typeof detector.test !== 'function') {
      throw new TypeError('Every custom detector needs a "name" and a "test" function.');
    }
    customByName.set(detector.name, detector);
  }
  const lookup = (name: string): Detector | undefined =>
    customByName.get(name) ?? (isBuiltinDetectorName(name) ? builtinDetectors[name] : undefined);

  const enabled = new Map<string, ActiveDetector>();

  if (Array.isArray(detectors)) {
    // Explicit list: replaces the default set.
    for (const entry of detectors as ReadonlyArray<string | Detector>) {
      if (typeof entry === 'string') {
        applySetting(entry, true, enabled, lookup);
      } else {
        customByName.set(entry.name, entry);
        enabled.set(entry.name, { detector: entry, action: entry.defaultAction });
      }
    }
    return [...enabled.values()];
  }

  for (const name of defaultDetectorNames) {
    enabled.set(name, {
      detector: builtinDetectors[name],
      action: builtinDetectors[name].defaultAction,
    });
  }
  for (const detector of customByName.values()) {
    enabled.set(detector.name, { detector, action: detector.defaultAction });
  }
  for (const [name, setting] of Object.entries(detectors ?? {})) {
    if (setting === undefined) continue;
    applySetting(name, setting, enabled, lookup);
  }
  return [...enabled.values()];
}

function resolve(config: SanitizerConfig): Resolved {
  const maxStringLength = config.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  if (!(maxStringLength > 0)) {
    throw new TypeError('"maxStringLength" must be a positive number.');
  }
  return {
    config,
    detectors: resolveDetectors(config.detectors, config.customDetectors),
    rules: compileRules(config.fields),
    maxStringLength,
    mask: { ...DEFAULT_MASK_OPTIONS, ...(config.mask ?? {}) },
    tokenStore: config.tokenStore,
    audit: config.audit ?? false,
  };
}

function mergeConfig(base: SanitizerConfig, extra: SanitizerConfig): SanitizerConfig {
  const merged: SanitizerConfig = { ...base, ...extra };
  if (base.fields || extra.fields) merged.fields = { ...base.fields, ...extra.fields };
  if (base.customDetectors || extra.customDetectors) {
    merged.customDetectors = [...(base.customDetectors ?? []), ...(extra.customDetectors ?? [])];
  }
  if (!Array.isArray(base.detectors) && !Array.isArray(extra.detectors)) {
    if (base.detectors || extra.detectors) {
      merged.detectors = { ...(base.detectors as object), ...(extra.detectors as object) };
    }
  }
  return merged;
}

/* ------------------------------------------------------------------------ */
/* Runtime                                                                   */
/* ------------------------------------------------------------------------ */

type MaybePromise<T> = T | Promise<T>;

interface Deferred {
  promise: Promise<unknown>;
}

interface Run {
  entries: ReportEntry[];
  skipped: SkippedEntry[];
  deferred: Deferred[];
  async: boolean;
  seen: Set<object>;
}

const DROP = Symbol('drop');
type WalkResult = unknown | typeof DROP;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isPromise<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

class SanitizerImpl implements Sanitizer {
  readonly config: Readonly<SanitizerConfig>;
  readonly detectors: readonly ActiveDetector[];
  private readonly resolved: Resolved;

  constructor(config: SanitizerConfig) {
    this.resolved = resolve(config);
    this.config = Object.freeze({ ...config });
    this.detectors = Object.freeze([...this.resolved.detectors]);
  }

  extend(config: SanitizerConfig): Sanitizer {
    return new SanitizerImpl(mergeConfig(this.config, config));
  }

  detect(value: string): DetectionResult[] {
    if (typeof value !== 'string') return [];
    return this.scan(value).map(({ detector, confidence, start, end, value: v }) => ({
      detector,
      confidence,
      start,
      end,
      value: v,
    }));
  }

  sanitize<T>(payload: T): SanitizeResult<T> {
    const started = performance.now();
    const run: Run = { entries: [], skipped: [], deferred: [], async: false, seen: new Set() };
    const data = this.walk(payload, [], undefined, run);
    return this.finish(payload, data, run, started);
  }

  async sanitizeAsync<T>(payload: T): Promise<SanitizeResult<T>> {
    const started = performance.now();
    const run: Run = { entries: [], skipped: [], deferred: [], async: true, seen: new Set() };
    let data = this.walk(payload, [], undefined, run);
    // The root itself may be a deferred string.
    if (isPromise(data as MaybePromise<unknown>)) data = await (data as Promise<unknown>);
    await Promise.all(run.deferred.map((d) => d.promise));
    return this.finish(payload, data, run, started);
  }

  private finish<T>(payload: T, data: WalkResult, run: Run, started: number): SanitizeResult<T> {
    const summary: Record<string, number> = {};
    let modified = false;
    for (const entry of run.entries) {
      summary[entry.category] = (summary[entry.category] ?? 0) + (entry.matches ?? 1);
      if (entry.action !== 'allow') modified = true;
    }
    const report: SanitizeReport = {
      entries: run.entries,
      skipped: run.skipped,
      summary,
      modified,
      durationMs: performance.now() - started,
    };
    return { data: (data === DROP ? undefined : data) as T, report };
  }

  /* ---------------------------------------------------------------------- */

  private walk(
    value: unknown,
    path: string[],
    inherited: FieldRule | undefined,
    run: Run,
  ): WalkResult {
    const rule = this.resolved.rules.length ? findRule(this.resolved.rules, path)?.rule : undefined;
    const effective = rule ?? inherited;

    if (effective) {
      if (effective.action === 'allow') {
        if (rule) this.record(run, path, effective, 'allow', undefined);
        return value;
      }
      if (effective.action === 'drop') {
        this.record(run, path, effective, 'drop', value);
        return DROP;
      }
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
        const text = String(value);
        const resolved = this.withInferredCategory(effective, text);
        this.record(run, path, resolved, resolved.action, text);
        return this.applyAction(resolved.action, text, resolved.category, path, run);
      }
      if (Array.isArray(value) || isPlainObject(value)) {
        return this.walkContainer(value, path, effective, run);
      }
      // null, undefined, booleans and unsupported objects carry nothing to scrub.
      return value;
    }

    if (typeof value === 'string') return this.walkString(value, path, run);
    if (Array.isArray(value) || isPlainObject(value))
      return this.walkContainer(value, path, undefined, run);
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      run.skipped.push({
        path: formatPath(path),
        reason: 'unsupported_value',
        detail: value.constructor?.name ?? 'object',
      });
    }
    return value;
  }

  private walkContainer(
    value: unknown[] | Record<string, unknown>,
    path: string[],
    inherited: FieldRule | undefined,
    run: Run,
  ): WalkResult {
    if (run.seen.has(value)) {
      run.skipped.push({ path: formatPath(path), reason: 'circular' });
      return '[Circular]';
    }
    run.seen.add(value);
    try {
      if (Array.isArray(value)) {
        const out: unknown[] = [];
        for (let i = 0; i < value.length; i++) {
          const child = this.walk(value[i], [...path, String(i)], inherited, run);
          if (child === DROP) continue;
          const index = out.length;
          out.push(child);
          this.settle(child, run, (resolved) => {
            out[index] = resolved;
          });
        }
        return out;
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        const child = this.walk(value[key], [...path, key], inherited, run);
        if (child === DROP) continue;
        out[key] = child;
        this.settle(child, run, (resolved) => {
          out[key] = resolved;
        });
      }
      return out;
    } finally {
      run.seen.delete(value);
    }
  }

  /** Register a deferred (async) child value so the container is patched once it resolves. */
  private settle(child: WalkResult, run: Run, assign: (resolved: unknown) => void): void {
    if (isPromise(child as MaybePromise<unknown>)) {
      run.deferred.push({ promise: (child as Promise<unknown>).then(assign) });
    }
  }

  private walkString(value: string, path: string[], run: Run): WalkResult {
    if (value.length > this.resolved.maxStringLength) {
      run.skipped.push({
        path: formatPath(path),
        reason: 'max_string_length',
        detail: `${value.length} > ${this.resolved.maxStringLength}`,
      });
      return value;
    }
    if (value.length === 0 || this.resolved.detectors.length === 0) return value;

    const matches = this.scan(value);
    if (matches.length === 0) return value;

    const pathLabel = formatPath(path);
    const perDetector = new Map<string, { entry: ReportEntry; first: string }>();
    for (const match of matches) {
      const existing = perDetector.get(match.detector);
      if (existing) {
        existing.entry.matches = (existing.entry.matches ?? 0) + 1;
      } else {
        const entry: ReportEntry = {
          path: pathLabel,
          category: match.detector,
          source: 'detector',
          action: match.action,
          matches: 1,
        };
        if (this.resolved.audit) entry.preview = this.maskFor(match.detector, match.value);
        perDetector.set(match.detector, { entry, first: match.value });
      }
    }
    for (const { entry } of perDetector.values()) run.entries.push(entry);

    const actionable = matches.filter((m) => m.action !== 'allow');
    if (actionable.length === 0) return value;

    const pieces: MaybePromise<string>[] = [];
    let cursor = 0;
    for (const match of actionable) {
      pieces.push(value.slice(cursor, match.start));
      pieces.push(this.applyAction(match.action, match.value, match.detector, path, run));
      cursor = match.end;
    }
    pieces.push(value.slice(cursor));

    if (pieces.some((p) => isPromise(p))) {
      return Promise.all(pieces).then((parts) => parts.join(''));
    }
    return (pieces as string[]).join('');
  }

  private scan(value: string): Array<DetectionResult & { action: Action; detectorRef: Detector }> {
    const all: Array<DetectionResult & { action: Action; detectorRef: Detector }> = [];
    for (const { detector, action } of this.resolved.detectors) {
      const found = detector.test(value);
      if (!found) continue;
      for (const match of found) {
        all.push({
          ...match,
          detector: detector.name,
          confidence: detector.confidence,
          action,
          detectorRef: detector,
        });
      }
    }
    return resolveOverlaps(all);
  }

  /* ---------------------------------------------------------------------- */

  /**
   * A field rule without a category that masks or redacts a value which is,
   * as a whole, a match for an enabled detector borrows that detector's
   * category, so `{ 'user.email': 'mask' }` produces the email-style mask
   * and `[REDACTED_EMAIL]` instead of the generic ones.
   */
  private withInferredCategory(rule: FieldRule, text: string): FieldRule {
    if (rule.category || (rule.action !== 'mask' && rule.action !== 'redact')) return rule;
    const trimmed = text.trim();
    if (trimmed.length === 0) return rule;
    const offset = text.indexOf(trimmed);
    for (const match of this.scan(text)) {
      if (match.start === offset && match.end === offset + trimmed.length) {
        return { ...rule, category: match.detector };
      }
    }
    return rule;
  }

  private record(run: Run, path: string[], rule: FieldRule, action: Action, value: unknown): void {
    const entry: ReportEntry = {
      path: formatPath(path),
      category: rule.category ?? 'field',
      source: 'field',
      action,
    };
    if (this.resolved.audit && value !== undefined && value !== null && typeof value !== 'object') {
      entry.preview = this.maskFor(rule.category, String(value));
    }
    run.entries.push(entry);
  }

  private maskFor(category: string | undefined, value: string): string {
    const detector = category ? this.findDetector(category) : undefined;
    if (detector?.mask) return detector.mask(value, this.resolved.mask);
    return maskGeneric(value, this.resolved.mask);
  }

  private findDetector(name: string): Detector | undefined {
    for (const { detector } of this.resolved.detectors) if (detector.name === name) return detector;
    for (const detector of this.config.customDetectors ?? [])
      if (detector.name === name) return detector;
    return isBuiltinDetectorName(name) ? builtinDetectors[name] : undefined;
  }

  private applyAction(
    action: Action,
    value: string,
    category: string | undefined,
    path: string[],
    run: Run,
  ): MaybePromise<string> {
    switch (action) {
      case 'redact':
        return redactValue(category, this.config.redact);
      case 'mask':
        return this.maskFor(category, value);
      case 'hash':
        return hashValue(value, this.config.hash);
      case 'drop':
        return '';
      case 'tokenize': {
        const store = this.resolved.tokenStore;
        if (!store) {
          throw new TypeError(
            'The "tokenize" action requires a "tokenStore" in the sanitizer configuration.',
          );
        }
        const token = store.tokenize(value, { path: formatPath(path), category });
        if (isPromise(token) && !run.async) {
          throw new TypeError(
            'The configured token store is asynchronous. Use sanitizeAsync() instead of sanitize().',
          );
        }
        return token;
      }
      case 'allow':
        return value;
    }
  }
}

/**
 * Create a reusable sanitizer. Detector patterns are compiled once, and the
 * returned instance is safe to share across concurrent calls.
 */
export function createSanitizer(config: SanitizerConfig = {}): Sanitizer {
  return new SanitizerImpl(config);
}

/**
 * Sanitize a payload in one call. For repeated use, prefer
 * {@link createSanitizer} so configuration is resolved only once.
 */
export function sanitize<T>(payload: T, config: SanitizerConfig = {}): SanitizeResult<T> {
  return createSanitizer(config).sanitize(payload);
}

/** Asynchronous variant of {@link sanitize}, for asynchronous token stores. */
export function sanitizeAsync<T>(
  payload: T,
  config: SanitizerConfig = {},
): Promise<SanitizeResult<T>> {
  return createSanitizer(config).sanitizeAsync(payload);
}
