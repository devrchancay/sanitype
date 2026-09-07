import { describe, it, expect } from 'vitest';
import { creditCard, luhnCheck } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('credit_card detector', () => {
  it('validates Luhn checksums', () => {
    expect(luhnCheck('4111111111111111')).toBe(true);
    expect(luhnCheck('5500000000000004')).toBe(true);
    expect(luhnCheck('378282246310005')).toBe(true);
    expect(luhnCheck('4111111111111112')).toBe(false);
    expect(luhnCheck('abc')).toBe(false);
  });

  it('matches Visa, Mastercard and Amex numbers with separators', () => {
    expectMatches(creditCard, 'card 4111 1111 1111 1111', ['4111 1111 1111 1111']);
    expectMatches(creditCard, 'card 4111-1111-1111-1111', ['4111-1111-1111-1111']);
    expectMatches(creditCard, 'card 5500000000000004 exp 12/30', ['5500000000000004']);
    expectMatches(creditCard, 'amex 3782 822463 10005', ['3782 822463 10005']);
  });

  it('ignores numbers that fail Luhn or have odd separators', () => {
    expectNoMatch(creditCard, [
      '4111 1111 1111 1112',
      '1234567890123',
      '4111  1111 1111 1111',
      '4111 1111-1111 1111',
      '0000000000000000',
      'uuid 123e4567-e89b-12d3-a456-426614174000',
    ]);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(creditCard, 'x 4111 1111 1111 1111 y 5500000000000004');
  });

  it('masks keeping the last four digits', () => {
    expect(creditCard.mask!('4111 1111 1111 1111', { char: '*' })).toBe('**** **** **** 1111');
    expect(creditCard.mask!('378282246310005', { char: '*' })).toBe('***********0005');
  });
});
