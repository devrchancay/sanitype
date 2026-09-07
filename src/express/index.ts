/**
 * Express adapter.
 *
 * ```ts
 * import express from 'express';
 * import { createSanitizer } from '@devrchancay/sanitype';
 * import { sanitizeRequest, sanitizeResponse } from '@devrchancay/sanitype/express';
 *
 * const sanitizer = createSanitizer({ fields: { 'password': 'drop' } });
 * app.use(express.json());
 * app.use(sanitizeRequest(sanitizer));
 * app.use(sanitizeResponse(sanitizer));
 * ```
 *
 * The adapter only relies on the structural shape of Express requests and
 * responses, so it works with Express 4 and 5 without importing either.
 *
 * @module @devrchancay/sanitype/express
 */
import type { Sanitizer } from '../sanitizer.js';
import type { SanitizeReport } from '../types.js';

/** Minimal request shape used by the adapter. */
export interface RequestLike {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
}

/** Minimal response shape used by the adapter. */
export interface ResponseLike {
  json: (body: any) => unknown;
  locals?: Record<string, any>;
}

export type NextFunction = (error?: unknown) => void;

export interface SanitizeRequestOptions {
  /** Sanitize `req.body`. Defaults to `true`. */
  body?: boolean;
  /** Sanitize `req.query`. Defaults to `false`. */
  query?: boolean;
  /** Sanitize `req.params`. Defaults to `false`. */
  params?: boolean;
  /** Sanitize `req.headers`. Defaults to `false`. Useful to scrub `authorization` before request logging. */
  headers?: boolean;
  /** Property on the request that receives the combined report. Defaults to `sanitizeReport`. */
  reportKey?: string;
  /** Called once per request with the combined report. */
  onReport?: (report: SanitizeReport, req: RequestLike) => void;
}

export interface SanitizeResponseOptions {
  /** Property on `res.locals` that receives the report. Defaults to `sanitizeReport`. */
  reportKey?: string;
  /** Called with the report for every JSON response. */
  onReport?: (report: SanitizeReport, req: RequestLike) => void;
}

function define(target: object, key: string, value: unknown): void {
  // Express 5 exposes `req.query` through a prototype getter; plain
  // assignment would throw in strict mode, so define an own property.
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

function mergeReports(reports: SanitizeReport[]): SanitizeReport {
  const merged: SanitizeReport = {
    entries: [],
    skipped: [],
    summary: {},
    modified: false,
    durationMs: 0,
  };
  for (const report of reports) {
    merged.entries.push(...report.entries);
    merged.skipped.push(...report.skipped);
    for (const [category, count] of Object.entries(report.summary)) {
      merged.summary[category] = (merged.summary[category] ?? 0) + count;
    }
    merged.modified ||= report.modified;
    merged.durationMs += report.durationMs;
  }
  return merged;
}

/**
 * Middleware that replaces `req.body` (and optionally `req.query`,
 * `req.params`, `req.headers`) with sanitized copies and attaches the report
 * to `req.sanitizeReport`. Mount it after the body parser.
 */
export function sanitizeRequest(
  sanitizer: Sanitizer,
  options: SanitizeRequestOptions = {},
): (req: RequestLike, res: ResponseLike, next: NextFunction) => void {
  const targets: Array<keyof SanitizeRequestOptions & string> = [];
  if (options.body ?? true) targets.push('body');
  if (options.query) targets.push('query');
  if (options.params) targets.push('params');
  if (options.headers) targets.push('headers');
  const reportKey = options.reportKey ?? 'sanitizeReport';

  return (req, _res, next) => {
    const reports: SanitizeReport[] = [];
    Promise.resolve()
      .then(async () => {
        for (const key of targets) {
          const source = (req as Record<string, unknown>)[key];
          if (source === undefined || source === null) continue;
          const { data, report } = await sanitizer.sanitizeAsync(source);
          define(req, key, data);
          reports.push(key === 'body' ? report : prefixReport(report, key));
        }
        const combined = mergeReports(reports);
        define(req, reportKey, combined);
        options.onReport?.(combined, req);
      })
      .then(() => next(), next);
  };
}

/**
 * Middleware that sanitizes every `res.json()` payload before it is sent.
 * The report is stored in `res.locals.sanitizeReport`.
 */
export function sanitizeResponse(
  sanitizer: Sanitizer,
  options: SanitizeResponseOptions = {},
): (req: RequestLike, res: ResponseLike, next: NextFunction) => void {
  const reportKey = options.reportKey ?? 'sanitizeReport';
  return (req, res, next) => {
    const original = res.json.bind(res);
    res.json = (body: unknown) => {
      const { data, report } = sanitizer.sanitize(body);
      res.locals ??= {};
      res.locals[reportKey] = report;
      options.onReport?.(report, req);
      return original(data);
    };
    next();
  };
}

/** Report paths for `query`, `params` and `headers` are prefixed so they are distinguishable from body paths. */
function prefixReport(report: SanitizeReport, key: string): SanitizeReport {
  const prefix = (path: string) =>
    path === '$' ? key : path.startsWith('[') ? `${key}${path}` : `${key}.${path}`;
  return {
    ...report,
    entries: report.entries.map((e) => ({ ...e, path: prefix(e.path) })),
    skipped: report.skipped.map((s) => ({ ...s, path: prefix(s.path) })),
  };
}
