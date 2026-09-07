import { describe, it, expect } from 'vitest';
import { phone } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('phone detector', () => {
  it('matches international and local formats', () => {
    expectMatches(phone, 'call +1 (555) 123-4567 now', ['+1 (555) 123-4567']);
    expectMatches(phone, 'tel: +593 99 123 4567', ['+593 99 123 4567']);
    expectMatches(phone, 'WhatsApp 0991234567', ['0991234567']);
    expectMatches(phone, 'office 555-123-4567', ['555-123-4567']);
    expectMatches(phone, '(02) 2345-678', ['(02) 2345-678']);
    expectMatches(phone, '+44 20 7946 0958', ['+44 20 7946 0958']);
    expectMatches(phone, '555.123.4567', ['555.123.4567']);
  });

  it('ignores dates, short ids and placeholders', () => {
    expectNoMatch(phone, [
      'on 2024-01-15',
      'born 15-01-1990',
      'order 12345678',
      'id 1234567',
      'version 1.2.3',
      '0000000000',
      'ticket #4521',
      'at 10:30',
    ]);
  });

  it('does not match inside longer digit runs', () => {
    expectNoMatch(phone, ['4111111111111111']);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(phone, 'a +1 555 123 4567 and 0991234567');
  });

  it('masks keeping the last two digits', () => {
    expect(phone.mask!('+1 (555) 123-4567', { char: '*' })).toBe('+* (***) ***-**67');
  });
});
