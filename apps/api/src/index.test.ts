import { describe, expect, it } from 'vitest';
import type { Env } from './env.js';
import app from './index.js';

const env: Env = {
  ZOHO_REFRESH_TOKEN: 'rt',
  ZOHO_CLIENT_ID: 'cid',
  ZOHO_CLIENT_SECRET: 'cs',
  ZOHO_ORG_ID: 'org-1',
  ZOHO_REGION: 'com',
  RRR_INTERNAL_API_KEY: 'unit-test-key',
};

describe('apps/api root', () => {
  it('GET /healthz is public and returns the resolved Zoho URL', async () => {
    const res = await app.fetch(new Request('http://x/healthz'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; phase: string; zoho_base_url: string };
    expect(body.ok).toBe(true);
    expect(body.phase).toBe('02-intake-workflow');
    expect(body.zoho_base_url).toContain('zohoapis.com');
  });

  it('returns 404 on unknown paths', async () => {
    const res = await app.fetch(new Request('http://x/nope'), env);
    expect(res.status).toBe(404);
  });

  it('GET /zoho/items requires the internal API key', async () => {
    const res = await app.fetch(new Request('http://x/zoho/items'), env);
    expect(res.status).toBe(401);
  });

  it('POST /agent/classify-intake requires the internal API key', async () => {
    const res = await app.fetch(
      new Request('http://x/agent/classify-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});
