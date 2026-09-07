import { describe, it, expect } from 'vitest';
import { email } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('email detector', () => {
  it('matches common addresses', () => {
    expectMatches(email, 'contact john.doe@example.com today', ['john.doe@example.com']);
    expectMatches(email, 'a+tag@sub.domain.co.uk', ['a+tag@sub.domain.co.uk']);
    expectMatches(email, 'Reach me at MARÍA@ejemplo.ec.', ['MARÍA@ejemplo.ec']);
    expectMatches(email, 'x@y.io,z@w.org', ['x@y.io', 'z@w.org']);
    expectMatches(email, '<user_name%test@host-name.example>', [
      'user_name%test@host-name.example',
    ]);
  });

  it('ignores things that are not addresses', () => {
    expectNoMatch(email, [
      'no at sign here',
      '@handle only',
      'user@localhost',
      'user@.com',
      'user@domain',
      'decorator @Component',
      'price is 5@10',
    ]);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(email, 'first a@b.co then c.d@e.fg end');
  });

  it('masks keeping initials and the top-level domain', () => {
    expect(email.mask!('john.doe@example.com', { char: '*' })).toBe('j***.d**@e******.com');
    expect(email.mask!('a@b.co', { char: '*' })).toBe('a@b.co');
    expect(email.mask!('user@mail.example.org', { char: '#' })).toBe('u###@m###.e######.org');
  });
});
