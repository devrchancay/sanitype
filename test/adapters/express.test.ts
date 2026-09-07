import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { createInMemoryTokenStore, createSanitizer } from '../../src/index.js';
import { sanitizeRequest, sanitizeResponse } from '../../src/express/index.js';
import type { SanitizeReport } from '../../src/index.js';

describe('express adapter', () => {
  let server: Server;
  let base: string;
  const reports: SanitizeReport[] = [];

  beforeAll(async () => {
    const app = express();
    const sanitizer = createSanitizer({
      fields: { password: 'drop', 'user.name': { action: 'mask', category: 'person_name' } },
      detectors: { email: 'mask' },
    });
    app.use(express.json());

    app.post(
      '/echo',
      sanitizeRequest(sanitizer, { onReport: (r) => reports.push(r) }),
      (req, res) => {
        res.json({
          body: req.body,
          report: (req as { sanitizeReport?: SanitizeReport }).sanitizeReport,
        });
      },
    );

    app.get(
      '/search',
      sanitizeRequest(sanitizer, { body: false, query: true, headers: true }),
      (req, res) => {
        res.json({
          query: req.query,
          authorization: req.headers.authorization,
          paths: (req as { sanitizeReport?: SanitizeReport }).sanitizeReport?.entries.map(
            (e) => e.path,
          ),
        });
      },
    );

    app.get('/users/:id', sanitizeRequest(sanitizer, { body: false, params: true }), (req, res) => {
      res.json({ params: req.params });
    });

    app.get('/out', sanitizeResponse(sanitizer), (_req, res) => {
      res.json({
        email: 'a@b.co',
        password: 'x',
        report: res.locals['sanitizeReport'] === undefined,
      });
    });

    const asyncStore = { tokenize: async () => 'tok_async' };
    const asyncSanitizer = createSanitizer({
      detectors: { email: 'tokenize' },
      tokenStore: asyncStore,
    });
    app.post('/async', sanitizeRequest(asyncSanitizer), (req, res) => res.json(req.body));

    const syncStore = createInMemoryTokenStore({ generateToken: () => 'fixed' });
    const syncSanitizer = createSanitizer({
      detectors: { email: 'tokenize' },
      tokenStore: syncStore,
    });
    app.post('/sync-token', sanitizeRequest(syncSanitizer), (req, res) => res.json(req.body));

    const throwing = createSanitizer({ detectors: { email: 'tokenize' } }); // no token store
    app.post('/boom', sanitizeRequest(throwing), (_req, res) => res.json({ ok: true }));
    app.use(
      (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: err.message });
      },
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  it('sanitizes the JSON body and attaches the report', async () => {
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user: { name: 'John Smith', email: 'john@example.com' },
        password: 'hunter2',
        notes: 'call +1 555 123 4567',
      }),
    });
    const json = (await res.json()) as { body: unknown; report: SanitizeReport };
    expect(json.body).toEqual({
      user: { name: 'J*** S****', email: 'j***@e******.com' },
      notes: 'call [REDACTED_PHONE]',
    });
    expect(json.report.entries.map((e) => e.path)).toEqual([
      'user.name',
      'user.email',
      'password',
      'notes',
    ]);
    expect(reports.at(-1)?.modified).toBe(true);
  });

  it('sanitizes query strings and headers when enabled, with prefixed report paths', async () => {
    const res = await fetch(`${base}/search?q=mail+me+at+a@b.co&page=2`, {
      headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456' },
    });
    const json = (await res.json()) as {
      query: Record<string, string>;
      authorization: string;
      paths: string[];
    };
    expect(json.query).toEqual({ q: 'mail me at a@b.co', page: '2' });
    expect(json.authorization).toBe('Bearer [REDACTED_API_KEY_SECRET]');
    expect(json.paths).toContain('query.q');
    expect(json.paths).toContain('headers.authorization');
  });

  it('sanitizes route params when enabled', async () => {
    const res = await fetch(`${base}/users/${encodeURIComponent('john@example.com')}`);
    expect(await res.json()).toEqual({ params: { id: 'j***@e******.com' } });
  });

  it('sanitizes JSON responses', async () => {
    const res = await fetch(`${base}/out`);
    expect(await res.json()).toEqual({ email: 'a@b.co', report: true });
  });

  it('awaits asynchronous and synchronous token stores', async () => {
    const post = (path: string) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.co' }),
      }).then((r) => r.json());
    expect(await post('/async')).toEqual({ email: 'tok_async' });
    expect(await post('/sync-token')).toEqual({ email: 'tok_fixed' });
  });

  it('forwards sanitizer errors to the Express error handler', async () => {
    const res = await fetch(`${base}/boom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co' }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: expect.stringContaining('tokenStore') });
  });
});
