import { describe, it, expect } from 'vitest';
import { apiKeySecret } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

/**
 * Sample credentials are assembled from parts at runtime so that no
 * secret-shaped literal exists in the repository. GitHub push protection
 * would otherwise reject commits containing them.
 */
const k = (...parts: string[]) => parts.join('');

const cases: Array<[string, string]> = [
  ['aws', k('AKIA', 'IOSFODNN7EXAMPLE')],
  ['github classic', k('ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  ['github fine-grained', k('github_pat_', '11ABCDEFG0abcdefghijklmnopqrstuvwxyz')],
  ['stripe secret', k('sk_live_', '4eC39HqLyjWDarjtT1zdp7dc')],
  ['stripe publishable', k('pk_test_', 'TYooMQauvdEDq54NiTphI7jx')],
  ['openai', k('sk-proj-', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  ['anthropic', k('sk-ant-', 'api03-abcdefghijklmnopqrstuvwxyz0123456789')],
  ['slack', k('xoxb-', '123456789012-1234567890123-abcdefghijklmnop')],
  ['google', k('AIza', 'SyA-abcdefghijklmnopqrstuvwxyz01234')],
  ['twilio', k('SK', '0123456789abcdef0123456789abcdef')],
  ['npm', k('npm_', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  [
    'jwt',
    k(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      '.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    ),
  ],
];

describe('api_key_secret detector', () => {
  it.each(cases)('matches %s keys', (_label, key) => {
    expectMatches(apiKeySecret, `token ${key} end`, [key]);
  });

  it('matches bearer tokens without the Bearer prefix', () => {
    expectMatches(apiKeySecret, 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123', [
      'abcdefghijklmnopqrstuvwxyz123',
    ]);
  });

  it('matches values in key=value assignments', () => {
    expectMatches(apiKeySecret, 'api_key=0123456789abcdef', ['0123456789abcdef']);
    expectMatches(apiKeySecret, 'password: "correct-horse-battery"', ['correct-horse-battery']);
    expectMatches(apiKeySecret, '"client_secret": "s3cr3tvalue123"', ['s3cr3tvalue123']);
  });

  it('matches PEM private keys as a single block', () => {
    const pem =
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQ==\n-----END PRIVATE KEY-----';
    expectMatches(apiKeySecret, `key:\n${pem}\nend`, [pem]);
  });

  it('ignores ordinary text and short values', () => {
    expectNoMatch(apiKeySecret, [
      'skate park',
      'password: short',
      'the token expired',
      'AKIA is a prefix',
      'sk-short',
    ]);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(
      apiKeySecret,
      `a ${k('AKIA', 'IOSFODNN7EXAMPLE')} b api_key=0123456789abcdef`,
    );
  });

  it('masks keeping a short prefix', () => {
    expect(apiKeySecret.mask!(k('sk_live_', '4eC39HqLyjWDarjtT1zdp7dc'), { char: '*' })).toBe(
      'sk_l***_************************',
    );
  });
});
