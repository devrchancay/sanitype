import { isIPv6 } from 'node:net';
import { defineDetector } from './define.js';

const IPV4 =
  /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\d|\.\d)/;

// Candidate IPv6 spans are validated with Node's `net.isIPv6` so that times
// (10:30:00) and MAC addresses never match.
const IPV6 = /(?<![\w:.])(?=[0-9a-f]{0,4}:)[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/i;

const IP_HINT = /\d\.\d|::|[0-9a-f]:[0-9a-f]/i;

function isIpCandidate(candidate: string): boolean {
  if (candidate.includes(':')) return isIPv6(candidate);
  return true;
}

/**
 * IPv4 and IPv6 addresses. Mask keeps the first octet or group:
 * `192.168.10.20` -> `192.***.***.***`, `2001:db8::1` -> `2001:***::*`.
 */
export const ipAddress = defineDetector({
  name: 'ip_address',
  pattern: [IPV4, IPV6],
  validate: isIpCandidate,
  prefilter: (value) => IP_HINT.test(value),
  priority: 85,
  mask(value, options) {
    const separator = value.includes(':') ? ':' : '.';
    const [first, ...rest] = value.split(separator);
    return [first, ...rest.map((part) => part.replace(/[0-9a-z]/gi, options.char))].join(separator);
  },
});
