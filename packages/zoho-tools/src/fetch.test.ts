import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import { ZohoApiError, type ZohoFetchContext, zohoFetch } from './fetch.js';

const config: ZohoConfig = {
  refreshToken: 'rt',
  clientId: 'cid',
  clientSecret: 'cs',
  orgId: 'org-42',
  region: 'com',
};

function makeCtx(fetchImpl: typeof fetch): ZohoFetchContext {
  return {
    config,
    getAccessToken: async () => 'at-test',
    fetchImpl,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('zohoFetch', () => {
  it('injects the bearer header and the organization_id query param', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.searchParams.get('organization_id')).toBe('org-42');
      expect(url.searchParams.get('page')).toBe('1');
      return jsonResponse(200, { items: [] });
    });
    await zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/items', {
      query: { page: 1 },
    });
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error('expected one call');
    const [, init] = call as unknown as [URL, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Zoho-oauthtoken at-test');
  });

  it('retries with backoff on 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) return jsonResponse(429, { code: 1003, message: 'Too Many Requests' });
      return jsonResponse(200, { items: [{ item_id: 'i-1' }] });
    });
    const out = (await zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/items', {
      baseSleepMs: 1,
    })) as { items: { item_id: string }[] };
    expect(out.items[0]?.item_id).toBe('i-1');
    expect(calls).toBe(3);
  });

  it('throws ZohoApiError after maxAttempts of retryable failures', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { message: 'busy' }));
    await expect(
      zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/items', {
        baseSleepMs: 1,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(ZohoApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable 4xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { code: 5, message: 'Bad URL' }));
    await expect(
      zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/items', { baseSleepMs: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('omits empty/undefined query params', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.searchParams.has('search_text')).toBe(false);
      expect(url.searchParams.get('page')).toBe('1');
      return jsonResponse(200, { items: [] });
    });
    await zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/items', {
      query: { page: 1, search_text: undefined, filter_by: '' },
    });
  });

  it('does NOT retry POST on 5xx (would risk duplicate writes)', async () => {
    // Critical safety: a 502/503 might mean Zoho already accepted the POST
    // but the response was lost on the wire. Retrying a non-idempotent write
    // could create duplicate estimates / invoices / payments. Only GET, PUT,
    // DELETE, HEAD are retried on 5xx.
    const fetchImpl = vi.fn(async () => jsonResponse(503, { message: 'busy' }));
    await expect(
      zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/estimates', {
        method: 'POST',
        body: JSON.stringify({ customer_id: 'c' }),
        baseSleepMs: 1,
        maxAttempts: 4,
      }),
    ).rejects.toMatchObject({ status: 503, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('DOES retry POST on 429 (rate limit; Zoho explicitly tells you to)', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 2) return jsonResponse(429, { message: 'slow down' });
      return jsonResponse(200, { code: 0, message: 'ok', estimate: { estimate_id: 'e-1' } });
    });
    await zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/estimates', {
      method: 'POST',
      body: JSON.stringify({}),
      baseSleepMs: 1,
    });
    expect(calls).toBe(2);
  });

  it('DOES retry PUT on 5xx (idempotent; safe to repeat)', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 2) return jsonResponse(503, { message: 'busy' });
      return jsonResponse(200, { code: 0, message: 'ok', estimate: {} });
    });
    await zohoFetch(makeCtx(fetchImpl as unknown as typeof fetch), '/estimates/e-1', {
      method: 'PUT',
      body: JSON.stringify({}),
      baseSleepMs: 1,
    });
    expect(calls).toBe(2);
  });
});
