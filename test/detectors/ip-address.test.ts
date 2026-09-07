import { describe, it, expect } from 'vitest';
import { ipAddress } from '../../src/index.js';
import { expectConsistentOffsets, expectMatches, expectNoMatch } from '../helpers.js';

describe('ip_address detector', () => {
  it('matches IPv4 addresses', () => {
    expectMatches(ipAddress, 'from 192.168.10.20 and 8.8.8.8', ['192.168.10.20', '8.8.8.8']);
    expectMatches(ipAddress, 'client 255.255.255.255.', ['255.255.255.255']);
  });

  it('matches IPv6 addresses', () => {
    expectMatches(ipAddress, 'via 2001:0db8:85a3:0000:0000:8a2e:0370:7334', [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    ]);
    expectMatches(ipAddress, 'loopback ::1 and fe80::1', ['::1', 'fe80::1']);
    expectMatches(ipAddress, '2001:db8::8a2e:370:7334', ['2001:db8::8a2e:370:7334']);
  });

  it('ignores versions, times, MAC addresses and out-of-range octets', () => {
    expectNoMatch(ipAddress, [
      'version 1.2.3',
      'release 10.30.1.500',
      'at 10:30:00',
      'mac 00:1A:2B:3C:4D:5E',
      '999.1.1.1',
      'semver 1.2.3.4.5',
    ]);
  });

  it('reports consistent offsets', () => {
    expectConsistentOffsets(ipAddress, 'a 10.0.0.1 b ::1 c');
  });

  it('masks all but the first group', () => {
    expect(ipAddress.mask!('192.168.10.20', { char: '*' })).toBe('192.***.**.**');
    expect(ipAddress.mask!('2001:db8::1', { char: '*' })).toBe('2001:***::*');
  });
});
