import { describe, it, expect } from 'vitest';
import { personName, physicalAddress } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('person_name detector (heuristic)', () => {
  it('is heuristic and therefore opt-in', () => {
    expect(personName.confidence).toBe('heuristic');
  });

  it('matches capitalised full names, titles and particles', () => {
    expectMatches(personName, 'Hello John Smith, welcome', ['John Smith']);
    expectMatches(personName, 'Dr. Ana María de la Torre signed', ['Dr. Ana María de la Torre']);
    expectMatches(personName, 'Ludwig van Beethoven', ['Ludwig van Beethoven']);
    expectMatches(personName, 'Mr. Smith called', ['Mr. Smith']);
    expectMatches(personName, 'Estimado Carlos Pérez Andrade:', ['Carlos Pérez Andrade']);
  });

  it('ignores stopword-only sequences and single words', () => {
    expectNoMatch(personName, [
      'Hello World',
      'Best Regards',
      'Monday January',
      'United States',
      'Customer Support Team',
      'just john smith in lowercase',
      'Buenos Días',
      'Alice',
    ]);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(personName, 'Thanks John Smith and Dr. Ana Torres');
  });

  it('masks keeping initials', () => {
    expect(personName.mask!('John Smith', { char: '*' })).toBe('J*** S****');
  });
});

describe('physical_address detector (heuristic)', () => {
  it('is heuristic and therefore opt-in', () => {
    expect(physicalAddress.confidence).toBe('heuristic');
  });

  it('matches English street addresses', () => {
    expectMatches(physicalAddress, 'ship to 221B Baker Street, Apt 4, London. Thanks', [
      '221B Baker Street, Apt 4, London',
    ]);
    expectMatches(physicalAddress, '1600 Pennsylvania Ave NW, Washington, DC 20500', [
      '1600 Pennsylvania Ave NW, Washington, DC 20500',
    ]);
    expectMatches(physicalAddress, 'at 42 Main St.', ['42 Main St.']);
  });

  it('matches Spanish street addresses', () => {
    expectMatches(physicalAddress, 'vivo en Av. Amazonas N32-45 y Rumipamba, Quito', [
      'Av. Amazonas N32-45 y Rumipamba',
    ]);
    expectMatches(physicalAddress, 'Calle 10 # 5-23', ['Calle 10 # 5-23']);
    expectMatches(physicalAddress, 'Carrera 7 No. 71-21, Bogotá', ['Carrera 7 No. 71-21']);
  });

  it('ignores text without a street pattern', () => {
    expectNoMatch(physicalAddress, ['meet at the park', 'route 66 is famous', 'Calle sin número']);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(physicalAddress, 'x 42 Main St y Calle 10 # 5-23 z');
  });
});
