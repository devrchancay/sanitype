/**
 * Derive field rules from a Zod schema and sanitize an outbound webhook payload.
 * Run: npx tsx examples/zod-schema.ts
 */
import { z } from 'zod';
import { createSanitizer } from '../src/index.js';
import { fieldsFromSchema, sensitive } from '../src/zod/index.js';

const Order = z.object({
  id: z.string(),
  customer: z.object({
    name: sensitive(z.string(), { action: 'mask', category: 'person_name' }),
    email: sensitive(z.string().email(), 'mask'), // category "email" inferred
    phone: sensitive(z.string(), 'drop'),
    cedula: sensitive(z.string(), { action: 'redact', category: 'cedula_ec' }),
  }),
  shipping: z.object({ street: sensitive(z.string()), city: z.string() }).optional(),
  items: z.array(z.object({ sku: z.string(), note: z.string() })),
  internal: z.record(z.string(), z.string()).describe('sensitive:drop'),
});

const rules = fieldsFromSchema(Order);
console.log('derived rules:', rules);

const outbound = createSanitizer({ fields: rules, audit: true });

const order = Order.parse({
  id: 'ord_1001',
  customer: {
    name: 'Ana Torres',
    email: 'ana@example.ec',
    phone: '0991234567',
    cedula: '1710034065',
  },
  shipping: { street: 'Av. Amazonas N32-45', city: 'Quito' },
  items: [{ sku: 'SKU-1', note: 'Gift for carlos@example.com' }], // free text: detectors still run
  internal: { margin: '0.31' },
});

const { data, report } = outbound.sanitize(order);
console.log(JSON.stringify(data, null, 2));
console.table(report.entries);
