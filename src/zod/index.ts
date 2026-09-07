/**
 * Zod integration: mark schema fields as sensitive without touching their
 * validation behaviour, then derive {@link FieldRules} for the sanitizer.
 *
 * Works with Zod 3 and Zod 4 through duck typing; `zod` is never imported at
 * runtime, so this module adds no dependency to your bundle.
 *
 * @module @devrchancay/sanitype/zod
 */
import type { Action, FieldRule, FieldRules } from '../types.js';
import { ACTIONS } from '../types.js';

/** Minimal structural view of a Zod schema (v3 or v4). Kept intentionally loose. */
export interface ZodLikeSchema {
  _def?: Record<string, any>;
  _zod?: { def?: Record<string, any> };
  description?: string;
  meta?: () => Record<string, unknown> | undefined;
}

const registry = new WeakMap<object, FieldRule>();

function normalize(rule: Action | FieldRule): FieldRule {
  const normalized: FieldRule = typeof rule === 'string' ? { action: rule } : { ...rule };
  if (!ACTIONS.includes(normalized.action)) {
    throw new TypeError(
      `Unknown action "${String(normalized.action)}". Expected one of: ${ACTIONS.join(', ')}.`,
    );
  }
  return normalized;
}

/**
 * Mark a schema as sensitive. Returns the same schema instance; validation is
 * unaffected. Call it last in the chain, because Zod methods such as
 * `.optional()` or `.describe()` return new instances:
 *
 * ```ts
 * const User = z.object({
 *   email: sensitive(z.string().email(), 'mask'),
 *   ssn: sensitive(z.string(), { action: 'redact', category: 'ssn_us' }),
 *   notes: z.string(),
 * });
 * ```
 */
export function sensitive<S extends object>(schema: S, rule: Action | FieldRule = 'redact'): S {
  registry.set(schema, normalize(rule));
  return schema;
}

/** Read the rule attached to a schema by {@link sensitive}, `.meta()` or `.describe()`. */
export function getSensitivity(schema: unknown): FieldRule | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const registered = registry.get(schema);
  if (registered) return registered;

  const zod = schema as ZodLikeSchema;
  // Zod 4: z.string().meta({ sensitive: 'mask' }) or meta({ sensitive: { action, category } })
  if (typeof zod.meta === 'function') {
    try {
      const meta = zod.meta();
      const value = meta?.['sensitive'];
      if (value === true) return { action: 'redact' };
      if (typeof value === 'string' || (value && typeof value === 'object')) {
        return normalize(value as Action | FieldRule);
      }
    } catch {
      // `meta` may not be callable without arguments in some versions.
    }
  }
  // Both versions: z.string().describe('sensitive:mask:email')
  const description = zod.description ?? zod._def?.['description'];
  if (typeof description === 'string') return parseDescription(description);
  return undefined;
}

/** Parse a `sensitive[:action[:category]]` description tag. */
export function parseDescription(description: string): FieldRule | undefined {
  const match = /^\s*sensitive(?::([a-z]+))?(?::([A-Za-z0-9_-]+))?\s*$/i.exec(description);
  if (!match) return undefined;
  const action = (match[1]?.toLowerCase() as Action | undefined) ?? 'redact';
  const rule: FieldRule = normalize(action);
  if (match[2]) rule.category = match[2];
  return rule;
}

/* ------------------------------------------------------------------------ */
/* Schema walking                                                            */
/* ------------------------------------------------------------------------ */

interface Node {
  kind: string;
  def: Record<string, any>;
}

function describe(schema: unknown): Node | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const zod = schema as ZodLikeSchema;
  const v4 = zod._zod?.def;
  if (v4 && typeof v4['type'] === 'string') return { kind: v4['type'], def: v4 };
  const v3 = zod._def;
  if (v3 && typeof v3['typeName'] === 'string') {
    return { kind: String(v3['typeName']).replace(/^Zod/, '').toLowerCase(), def: v3 };
  }
  return undefined;
}

function shapeOf(def: Record<string, any>): Record<string, unknown> {
  const shape = def['shape'];
  return typeof shape === 'function' ? shape() : (shape ?? {});
}

/** Infer a category from Zod string formats such as `.email()` or `.ip()`. */
function inferCategory(schema: unknown): string | undefined {
  const node = describe(schema);
  if (!node || node.kind !== 'string') return undefined;
  const formats = new Set<string>();
  const format = node.def['format'];
  if (typeof format === 'string') formats.add(format);
  for (const check of node.def['checks'] ?? []) {
    const kind = check?.kind ?? check?._zod?.def?.format ?? check?.def?.format;
    if (typeof kind === 'string') formats.add(kind);
  }
  if (formats.has('email')) return 'email';
  if (formats.has('ip') || formats.has('ipv4') || formats.has('ipv6') || formats.has('cidr')) {
    return 'ip_address';
  }
  return undefined;
}

export interface FieldsFromSchemaOptions {
  /** Path prefix for every derived rule, e.g. `body`. */
  prefix?: string;
}

/**
 * Walk a Zod schema and collect a {@link FieldRules} map from every
 * sub-schema marked with {@link sensitive}, `.meta({ sensitive })` or
 * `.describe('sensitive:...')`.
 *
 * Objects, arrays, tuples, records, optionals, nullables, defaults,
 * unions, intersections, pipes, effects and lazy schemas are traversed.
 * Array elements map to `[*]`, record values to `.*`.
 */
export function fieldsFromSchema(
  schema: unknown,
  options: FieldsFromSchemaOptions = {},
): FieldRules {
  const rules: FieldRules = {};
  const prefix = options.prefix ? options.prefix.replace(/\.$/, '') : '';
  const visiting = new Set<object>();

  const add = (path: string, rule: FieldRule) => {
    const key = path === '' ? prefix || '$' : prefix ? `${prefix}.${path}` : path;
    rules[key] = rule;
  };

  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    const rule = getSensitivity(node);
    if (rule) {
      const withCategory = rule.category ? rule : { ...rule, category: inferCategory(node) };
      if (!withCategory.category) delete withCategory.category;
      add(path, withCategory);
      return;
    }
    const info = describe(node);
    if (!info) return;
    if (visiting.has(node)) return;
    visiting.add(node);
    try {
      const { kind, def } = info;
      switch (kind) {
        case 'object': {
          for (const [key, child] of Object.entries(shapeOf(def))) {
            visit(child, path ? `${path}.${key}` : key);
          }
          if (def['catchall']) visit(def['catchall'], path ? `${path}.*` : '*');
          break;
        }
        case 'array':
          visit(def['element'] ?? def['type'], `${path}[*]`);
          break;
        case 'tuple':
          (def['items'] ?? []).forEach((item: unknown, index: number) =>
            visit(item, `${path}[${index}]`),
          );
          if (def['rest']) visit(def['rest'], `${path}[*]`);
          break;
        case 'record':
        case 'map':
          visit(def['valueType'], path ? `${path}.*` : '*');
          break;
        case 'optional':
        case 'nullable':
        case 'default':
        case 'catch':
        case 'readonly':
        case 'branded':
        case 'nonoptional':
        case 'prefault':
        case 'promise':
          visit(def['innerType'] ?? def['type'], path);
          break;
        case 'effects':
          visit(def['schema'], path);
          break;
        case 'pipe':
        case 'pipeline':
          visit(def['in'], path);
          visit(def['out'], path);
          break;
        case 'union':
        case 'discriminatedunion':
          for (const option of def['options'] ?? []) visit(option, path);
          break;
        case 'intersection':
          visit(def['left'], path);
          visit(def['right'], path);
          break;
        case 'lazy':
          visit(typeof def['getter'] === 'function' ? def['getter']() : undefined, path);
          break;
        default:
          break;
      }
    } finally {
      visiting.delete(node);
    }
  };

  visit(schema, '');
  return rules;
}
