import { describe, it, expect } from 'vitest';
import { formatPath, parsePathPattern } from '../src/index.js';
import { compileRules, findRule } from '../src/paths.js';

describe('parsePathPattern', () => {
  it('parses dot and bracket notation', () => {
    expect(parsePathPattern('user.email')).toEqual(['user', 'email']);
    expect(parsePathPattern('users[0].email')).toEqual(['users', '0', 'email']);
    expect(parsePathPattern('users[*].email')).toEqual(['users', '*', 'email']);
    expect(parsePathPattern('users[].email')).toEqual(['users', '*', 'email']);
    expect(parsePathPattern('users.*.email')).toEqual(['users', '*', 'email']);
    expect(parsePathPattern('**.password')).toEqual(['**', 'password']);
    expect(parsePathPattern("data['key']")).toEqual(['data', 'key']);
    expect(parsePathPattern('$')).toEqual([]);
    expect(parsePathPattern('')).toEqual([]);
  });
});

describe('formatPath', () => {
  it('formats segments for reports', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['user', 'email'])).toBe('user.email');
    expect(formatPath(['users', '0', 'email'])).toBe('users[0].email');
    expect(formatPath(['0', 'x'])).toBe('[0].x');
  });
});

describe('findRule', () => {
  const rules = compileRules({
    '**.password': 'drop',
    'user.*': 'mask',
    'user.email': 'hash',
    'users[*].email': 'redact',
    $: 'allow',
  });

  it('matches exact paths and wildcards', () => {
    expect(findRule(rules, ['user', 'email'])?.rule.action).toBe('hash');
    expect(findRule(rules, ['user', 'phone'])?.rule.action).toBe('mask');
    expect(findRule(rules, ['users', '3', 'email'])?.rule.action).toBe('redact');
    expect(findRule(rules, ['a', 'b', 'c', 'password'])?.rule.action).toBe('drop');
    expect(findRule(rules, ['password'])?.rule.action).toBe('drop');
    expect(findRule(rules, [])?.rule.action).toBe('allow');
    expect(findRule(rules, ['other'])).toBeUndefined();
    expect(findRule(rules, ['user', 'a', 'b'])).toBeUndefined();
  });

  it('prefers the most specific pattern, then the last declared', () => {
    const tie = compileRules({ 'a.*': 'mask', '*.b': 'hash' });
    expect(findRule(tie, ['a', 'b'])?.rule.action).toBe('hash');
  });

  it('rejects unknown actions', () => {
    expect(() => compileRules({ x: 'explode' as never })).toThrow(/Unknown action/);
  });
});
