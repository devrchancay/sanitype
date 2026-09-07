/**
 * Micro-benchmark for sanitype. Run with `npm run bench`.
 *
 * Numbers are indicative only: they depend on the machine, the Node.js
 * version and the payload. The goal is to check the order of magnitude and
 * to catch regressions, not to publish absolute figures.
 */
import { performance } from 'node:perf_hooks';
import { createSanitizer } from '../src/index.js';

/** A typical API payload: ~45 fields, ~2.5 KB, mixed sensitive and plain values. */
const payload = {
  id: 'ord_01HZX2',
  createdAt: '2024-01-15T10:30:00Z',
  status: 'paid',
  currency: 'USD',
  total: 129.9,
  customer: {
    id: 'cus_8812',
    name: 'John Smith',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    locale: 'en-US',
    address: { line1: '221B Baker Street', city: 'London', postal: 'NW1 6XE', country: 'GB' },
  },
  payment: { method: 'card', last4: '1111', brand: 'visa', card: '4111 1111 1111 1111' },
  items: Array.from({ length: 8 }, (_, i) => ({
    sku: `SKU-${1000 + i}`,
    name: `Product ${i}`,
    quantity: 1 + (i % 3),
    price: 9.99 * (i + 1),
    notes: i % 2 ? 'Gift wrap please' : 'Ship to 42 Main St, contact jane@corp.io',
  })),
  metadata: {
    ip: '192.168.10.20',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    referrer: 'https://example.com/checkout',
    session: 'sess_a1b2c3d4e5f6',
  },
  support: {
    ticket: 'TCK-4521',
    message:
      'Hi, I was charged twice. My card ends in 1111 and my email is john.doe@example.com. Please call me at 555-123-4567 or reach my colleague at 192.168.1.1. Thanks, John',
  },
};

const clean = JSON.parse(JSON.stringify(payload)) as typeof payload;
clean.customer.email = 'redacted';
clean.customer.phone = 'n/a';
clean.payment.card = 'n/a';
clean.items.forEach((item) => (item.notes = 'Gift wrap please'));
clean.metadata.ip = 'n/a';
clean.support.message = 'Hi, I was charged twice. Please help. Thanks';

const fields = {
  'customer.email': 'mask',
  'customer.phone': 'redact',
  'payment.card': 'redact',
} as const;
const schemaOnly = createSanitizer({ detectors: [], fields });
const defaults = createSanitizer();
const combined = createSanitizer({ fields });
const all = createSanitizer({ detectors: { person_name: true, physical_address: true } });
const text = `${payload.support.message} `.repeat(6);

interface Case {
  name: string;
  run: () => unknown;
}

const cases: Case[] = [
  {
    name: 'payload · schema-driven only (3 rules, detectors off)',
    run: () => schemaOnly.sanitize(payload),
  },
  {
    name: 'payload · default detectors (7 high-confidence)',
    run: () => defaults.sanitize(payload),
  },
  { name: 'payload · default detectors, no PII present', run: () => defaults.sanitize(clean) },
  { name: 'payload · schema + default detectors', run: () => combined.sanitize(payload) },
  { name: 'payload · all detectors incl. heuristics', run: () => all.sanitize(payload) },
  { name: '1 KB text · default detectors', run: () => defaults.sanitize(text) },
  { name: '1 KB text · all detectors incl. heuristics', run: () => all.sanitize(text) },
];

function measure({ name, run }: Case): void {
  for (let i = 0; i < 2000; i++) run(); // warm up
  const samples: number[] = [];
  const started = performance.now();
  while (performance.now() - started < 1000) {
    const t = performance.now();
    run();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = samples[Math.floor(samples.length * 0.5)]!;
  const p99 = samples[Math.floor(samples.length * 0.99)]!;
  const ops = Math.round(1000 / mean);
  console.log(
    `${name.padEnd(58)} mean ${fmt(mean)}  p50 ${fmt(p50)}  p99 ${fmt(p99)}  ${ops.toLocaleString('en-US')} ops/s`,
  );
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0).padStart(5)} µs` : `${ms.toFixed(2).padStart(5)} ms`;
}

console.log(
  `sanitype benchmark — Node ${process.version}, payload ${JSON.stringify(payload).length} bytes\n`,
);
cases.forEach(measure);
