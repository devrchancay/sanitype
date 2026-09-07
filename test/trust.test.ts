import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * sanitype promises that no data leaves the process. These tests make that
 * promise verifiable: the source must not import any networking module or
 * call fetch, and the package must not declare runtime dependencies.
 */
describe('trust surface', () => {
  const sources = listFiles(join(__dirname, '..', 'src')).filter((f) => f.endsWith('.ts'));

  it('imports no networking modules and never calls fetch', () => {
    const forbidden = [
      /from\s+['"](node:)?(http|https|http2|dgram|dns|tls|child_process|worker_threads)['"]/,
      /from\s+['"](undici|axios|node-fetch|got|ky)['"]/,
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bnet\.(connect|createConnection|createServer)\b/,
    ];
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(content, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('only uses allowed Node built-ins', () => {
    const allowed = new Set(['node:crypto', 'node:net']);
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(/from\s+['"](node:[a-z_/]+)['"]/g)) {
        expect(allowed.has(match[1]!), `${file} imports ${match[1]}`).toBe(true);
      }
    }
  });

  it('declares no runtime dependencies', () => {
    expect((pkg as { dependencies?: unknown }).dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies)).toEqual(['zod']);
    expect(pkg.peerDependenciesMeta.zod.optional).toBe(true);
  });
});
