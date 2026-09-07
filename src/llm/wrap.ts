import type { Sanitizer } from '../sanitizer.js';
import type { SanitizeReport } from '../types.js';

/** Options shared by every LLM wrapper. */
export interface LLMWrapOptions<P = Record<string, unknown>> {
  /**
   * Keys of the request object that carry user content and must be
   * sanitized. Everything else is passed through untouched.
   */
  keys?: ReadonlyArray<keyof P & string>;
  /** Called with the report for every request. Use it for audit logging. */
  onReport?: (report: SanitizeReport, params: P) => void;
  /**
   * Await an asynchronous token store before calling the wrapped function.
   * The wrapper then returns a `Promise` of the original return value.
   */
  async?: boolean;
}

export interface SanitizedParams<P> {
  params: P;
  report: SanitizeReport;
}

function pick<P extends object>(params: P, keys: ReadonlyArray<keyof P & string>): Partial<P> {
  const picked: Partial<P> = {};
  for (const key of keys) {
    if (key in params) picked[key] = params[key];
  }
  return picked;
}

/** Sanitize the selected keys of a request object synchronously. */
export function sanitizeParams<P extends object>(
  params: P,
  sanitizer: Sanitizer,
  keys: ReadonlyArray<keyof P & string>,
): SanitizedParams<P> {
  const { data, report } = sanitizer.sanitize(pick(params, keys));
  return { params: { ...params, ...data }, report };
}

/** Sanitize the selected keys of a request object, awaiting async token stores. */
export async function sanitizeParamsAsync<P extends object>(
  params: P,
  sanitizer: Sanitizer,
  keys: ReadonlyArray<keyof P & string>,
): Promise<SanitizedParams<P>> {
  const { data, report } = await sanitizer.sanitizeAsync(pick(params, keys));
  return { params: { ...params, ...data }, report };
}

/**
 * Wrap a function whose first argument is a request object so that the
 * selected keys are sanitized before the real call. The return value of the
 * wrapped function is returned unchanged.
 */
export function wrapLLMCall<P extends object, R, Rest extends unknown[]>(
  fn: (params: P, ...rest: Rest) => R,
  sanitizer: Sanitizer,
  options: LLMWrapOptions<P> & { keys: ReadonlyArray<keyof P & string> },
): (params: P, ...rest: Rest) => R {
  const { keys, onReport } = options;
  if (options.async) {
    return ((params: P, ...rest: Rest) =>
      sanitizeParamsAsync(params, sanitizer, keys).then(({ params: clean, report }) => {
        onReport?.(report, params);
        return fn(clean, ...rest);
      })) as unknown as (params: P, ...rest: Rest) => R;
  }
  return (params: P, ...rest: Rest): R => {
    const { params: clean, report } = sanitizeParams(params, sanitizer, keys);
    onReport?.(report, params);
    return fn(clean, ...rest);
  };
}
