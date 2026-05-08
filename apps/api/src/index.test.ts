import { describe, expect, it } from 'vitest';
import worker from './index.js';

describe('apps/api stub worker', () => {
  it('responds with health JSON on /healthz', async () => {
    const req = new Request('https://api.example.test/healthz');
    const res = await worker.fetch(req, { ZOHO_REGION: 'com' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; phase: string; zoho_base_url: string };
    expect(body.ok).toBe(true);
    expect(body.phase).toBe('00-foundation');
    expect(body.zoho_base_url).toContain('zohoapis.com');
  });

  it('responds with the placeholder string at root', async () => {
    const req = new Request('https://api.example.test/');
    const res = await worker.fetch(req, {});
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('phase 00 stub');
  });
});
