import { describe, expect, it } from 'vitest';
import { createZohoClient } from './client.js';
import type { ZohoConfig } from './config.js';

const config: ZohoConfig = {
  refreshToken: 'rt',
  clientId: 'cid',
  clientSecret: 'cs',
  orgId: 'org-42',
  region: 'com',
};

function buildFetch(): {
  fetchImpl: typeof fetch;
  mintCount: () => number;
  itemsCount: () => number;
} {
  let mints = 0;
  let items = 0;
  const fetchImpl: typeof fetch = (async (input: URL | string) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    if (url.includes('/oauth/v2/token')) {
      mints++;
      return new Response(
        JSON.stringify({ access_token: `at-${mints}`, expires_in: 3600, scope: '' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('/items')) {
      items++;
      return new Response(JSON.stringify({ code: 0, message: 'ok', items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, mintCount: () => mints, itemsCount: () => items };
}

describe('createZohoClient', () => {
  it('mints an access token once and reuses it across calls', async () => {
    const { fetchImpl, mintCount, itemsCount } = buildFetch();
    const client = createZohoClient(config, { fetchImpl });

    await client.listItems();
    await client.listItems();
    await client.fetch('/items');

    expect(mintCount()).toBe(1);
    expect(itemsCount()).toBe(3);
  });

  it('coalesces concurrent token mints into one inflight request', async () => {
    const { fetchImpl, mintCount } = buildFetch();
    const client = createZohoClient(config, { fetchImpl });

    await Promise.all([client.listItems(), client.listItems(), client.listItems()]);

    expect(mintCount()).toBe(1);
  });

  it('exposes getAccessToken for callers that need it directly', async () => {
    const { fetchImpl } = buildFetch();
    const client = createZohoClient(config, { fetchImpl });

    const token = await client.getAccessToken();
    expect(token).toMatch(/^at-/);
  });

  it('propagates errors from the items endpoint with structured ZohoApiError', async () => {
    const fetchImpl: typeof fetch = (async (input: URL | string) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, scope: '' }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ code: 5, message: 'Invalid URL' }), { status: 400 });
    }) as typeof fetch;
    const client = createZohoClient(config, { fetchImpl });
    await expect(client.listItems()).rejects.toMatchObject({ status: 400, attempts: 1 });
  });
});
