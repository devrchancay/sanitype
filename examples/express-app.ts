/**
 * Express middleware: scrub request bodies and headers before logging, and
 * scrub JSON responses on the way out.
 * Run: npx tsx examples/express-app.ts, then:
 *   curl -s -X POST localhost:3000/tickets -H 'content-type: application/json' \
 *     -H 'authorization: Bearer abcdefghijklmnopqrstuvwxyz123456' \
 *     -d '{"email":"john@example.com","password":"hunter2","body":"card 4111 1111 1111 1111"}'
 */
import express from 'express';
import { createSanitizer } from '../src/index.js';
import type { SanitizeReport } from '../src/index.js';
import { sanitizeRequest, sanitizeResponse } from '../src/express/index.js';

const sanitizer = createSanitizer({
  fields: { '**.password': 'drop' },
  detectors: { email: 'mask' },
});

const app = express();
app.use(express.json());
app.use(
  sanitizeRequest(sanitizer, {
    headers: true,
    onReport: (report) => {
      if (report.modified) console.log('scrubbed:', report.summary);
    },
  }),
);
app.use(sanitizeResponse(sanitizer));

app.post('/tickets', (req, res) => {
  const report = (req as express.Request & { sanitizeReport?: SanitizeReport }).sanitizeReport;
  // Safe to log: body and headers are already scrubbed.
  console.log('request', { body: req.body, authorization: req.headers.authorization });
  res.json({
    received: req.body,
    entries: report?.entries.length ?? 0,
    echo: 'reply to jane@corp.io',
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
