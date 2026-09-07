/**
 * Sanitize at the logger boundary so every call site is covered.
 * Run: npx tsx examples/logging.ts
 *
 * The same `serialize` function can be plugged into pino (`serializers`),
 * winston (`format`) or any logger that accepts a transform.
 */
import { createSanitizer } from '../src/index.js';

const sanitizer = createSanitizer({
  fields: { '**.password': 'drop', '**.authorization': 'redact', '**.cookie': 'redact' },
  detectors: { email: 'mask', ip_address: 'mask' },
});

const serialize = <T>(value: T): T => sanitizer.sanitize(value).data;

const logger = {
  info(context: Record<string, unknown>, message: string) {
    console.log(JSON.stringify({ level: 'info', message, ...serialize(context) }));
  },
};

logger.info(
  {
    request: {
      method: 'POST',
      url: '/login',
      headers: {
        authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
        'user-agent': 'curl/8.0',
      },
      body: { email: 'john@example.com', password: 'hunter2' },
      ip: '203.0.113.42',
    },
  },
  'login attempt',
);
