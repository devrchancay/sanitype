import { describe, it, expect } from 'vitest';
import { cedulaEc, isEcuadorianCedula, ssnUs } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('ssn_us detector', () => {
  it('matches formatted SSNs', () => {
    expectMatches(ssnUs, 'ssn 123-45-6789', ['123-45-6789']);
    expectMatches(ssnUs, 'ssn 123 45 6789', ['123 45 6789']);
  });

  it('ignores invalid ranges, bare digits and mixed separators', () => {
    expectNoMatch(ssnUs, [
      '000-12-3456',
      '666-12-3456',
      '900-12-3456',
      '123-00-6789',
      '123-45-0000',
      '123456789',
      '123-45 6789',
      'phone 555-123-4567',
    ]);
  });

  it('masks keeping the last four digits', () => {
    expect(ssnUs.mask!('123-45-6789', { char: '*' })).toBe('***-**-6789');
  });
});

describe('cedula_ec detector', () => {
  it('validates the module-10 checksum', () => {
    expect(isEcuadorianCedula('1710034065')).toBe(true);
    expect(isEcuadorianCedula('0926687856')).toBe(true);
    expect(isEcuadorianCedula('1710034065001')).toBe(true);
    expect(isEcuadorianCedula('1710034066')).toBe(false);
    expect(isEcuadorianCedula('2510034065')).toBe(false);
    expect(isEcuadorianCedula('1790034065')).toBe(false);
    expect(isEcuadorianCedula('171003406')).toBe(false);
  });

  it('matches valid cédulas and natural-person RUCs', () => {
    expectMatches(cedulaEc, 'cédula 1710034065', ['1710034065']);
    expectMatches(cedulaEc, 'RUC 1710034065001', ['1710034065001']);
  });

  it('ignores invalid numbers and Ecuadorian mobile numbers', () => {
    expectNoMatch(cedulaEc, ['1710034066', '0991234567', '1710034065002', 'x17100340650']);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(cedulaEc, 'a 1710034065 b 0926687856');
  });

  it('masks keeping the last three digits', () => {
    expect(cedulaEc.mask!('1710034065', { char: '*' })).toBe('*******065');
  });
});
