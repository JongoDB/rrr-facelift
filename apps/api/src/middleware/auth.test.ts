import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { requireInternalApiKey } from './auth.js';

function buildAppWithProtectedRoute() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/protected/*', requireInternalApiKey);
  app.get('/protected/ping', (c) => c.json({ ok: true }));
  return app;
}

const baseEnv: Env = {
  ZOHO_REFRESH_TOKEN: 'rt',
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'cs',
  ZOHO_ORG_ID: 'org-1',
  RRR_INTERNAL_API_KEY: 'super-secret-1234567890abcdef',
};

describe('requireInternalApiKey', () => {
  it('rejects with 401 when no key is provided', async () => {
    const app = buildAppWithProtectedRoute();
    const res = await app.fetch(new Request('http://x/protected/ping'), baseEnv);
    expect(res.status).toBe(401);
  });

  it('rejects with 401 on wrong key', async () => {
    const app = buildAppWithProtectedRoute();
    const res = await app.fetch(
      new Request('http://x/protected/ping', { headers: { 'X-RRR-API-Key': 'nope' } }),
      baseEnv,
    );
    expect(res.status).toBe(401);
  });

  it('rejects with 500 when the Worker has no key configured', async () => {
    const app = buildAppWithProtectedRoute();
    const res = await app.fetch(
      new Request('http://x/protected/ping', { headers: { 'X-RRR-API-Key': 'anything' } }),
      { ...baseEnv, RRR_INTERNAL_API_KEY: undefined },
    );
    expect(res.status).toBe(500);
  });

  it('admits requests with the matching key', async () => {
    const app = buildAppWithProtectedRoute();
    const res = await app.fetch(
      new Request('http://x/protected/ping', {
        headers: { 'X-RRR-API-Key': 'super-secret-1234567890abcdef' },
      }),
      baseEnv,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});
