import type { Action, FieldRule, FieldRules } from './types.js';
import { ACTIONS } from './types.js';

/** Sentinel for the root of the payload in report paths. */
export const ROOT_PATH = '$';

/** Format path segments as a human-readable path: `users[0].email`. */
export function formatPath(segments: readonly string[]): string {
  if (segments.length === 0) return ROOT_PATH;
  let out = '';
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      out += `[${segment}]`;
    } else if (out === '') {
      out = segment;
    } else {
      out += `.${segment}`;
    }
  }
  return out;
}

/** Split a path pattern like `users[*].profile.email` into segments. */
export function parsePathPattern(pattern: string): string[] {
  const trimmed = pattern.trim();
  if (trimmed === '' || trimmed === ROOT_PATH) return [];
  const tokens = trimmed.match(/[^.[\]]+|\[[^\]]*\]/g) ?? [];
  return tokens.map((token) => {
    if (token.startsWith('[')) {
      const inner = token
        .slice(1, -1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      return inner === '' || inner === '*' ? '*' : inner;
    }
    return token;
  });
}

export interface CompiledRule {
  pattern: string;
  segments: string[];
  rule: FieldRule;
  /** Higher is more specific. */
  specificity: number;
  /** Declaration order; later declarations win ties. */
  order: number;
}

export function normalizeRule(rule: Action | FieldRule): FieldRule {
  const normalized: FieldRule = typeof rule === 'string' ? { action: rule } : { ...rule };
  if (!ACTIONS.includes(normalized.action)) {
    throw new TypeError(
      `Unknown action "${String(normalized.action)}". Expected one of: ${ACTIONS.join(', ')}.`,
    );
  }
  return normalized;
}

export function compileRules(rules: FieldRules | undefined): CompiledRule[] {
  if (!rules) return [];
  return Object.entries(rules).map(([pattern, rule], order) => {
    const segments = parsePathPattern(pattern);
    let specificity = 0;
    for (const segment of segments) {
      if (segment === '**') specificity += 0;
      else if (segment === '*') specificity += 1;
      else specificity += 2;
    }
    return { pattern, segments, rule: normalizeRule(rule), specificity, order };
  });
}

function matchSegments(
  pattern: readonly string[],
  path: readonly string[],
  pi = 0,
  si = 0,
): boolean {
  while (pi < pattern.length) {
    const token = pattern[pi]!;
    if (token === '**') {
      // `**` matches zero or more segments.
      for (let skip = si; skip <= path.length; skip++) {
        if (matchSegments(pattern, path, pi + 1, skip)) return true;
      }
      return false;
    }
    if (si >= path.length) return false;
    if (token !== '*' && token !== path[si]) return false;
    pi++;
    si++;
  }
  return si === path.length;
}

/** Find the most specific rule matching a path, if any. */
export function findRule(
  rules: readonly CompiledRule[],
  path: readonly string[],
): CompiledRule | undefined {
  let best: CompiledRule | undefined;
  for (const candidate of rules) {
    if (!matchSegments(candidate.segments, path)) continue;
    if (
      !best ||
      candidate.specificity > best.specificity ||
      (candidate.specificity === best.specificity && candidate.order > best.order)
    ) {
      best = candidate;
    }
  }
  return best;
}
