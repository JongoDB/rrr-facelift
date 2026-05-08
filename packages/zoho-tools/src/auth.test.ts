import { describe, expect, it, vi } from 'vitest';
import { mintAccessToken } from './auth.js';
import type { ZohoConfig } from './config.js';

const baseConfig: ZohoConfig = {
  refreshToken: 'rt-test',
  clientId: 'cid-test',
  clientSecret: 'cs-test',
  orgId: 'org-test',
  region: 'com',
};

describe('mintAccessToken', () => {
  it('posts the refresh-grant payload to the regional accounts URL', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'at-1',
          expires_in: 3600,
          scope: 'ZohoBooks.contacts.ALL',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const token = await mintAccessToken(baseConfig, fetchImpl as unknown as typeof fetch);

    expect(token.token).toBe('at-1');
    expect(token.expiresAt).toBeGreaterThan(Date.now());
    expect(token.scope).toContain('ZohoBooks.contacts.ALL');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error('expected one call');
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe('https://accounts.zoho.com/oauth/v2/token');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rt-test');
    expect(body).toContain('client_id=cid-test');
    expect(body).toContain('client_secret=cs-test');
  });

  it('uses the regional URL for non-US regions', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ access_token: 't', expires_in: 3600, scope: '' }), {
        status: 200,
      });
    });
    await mintAccessToken({ ...baseConfig, region: 'eu' }, fetchImpl as unknown as typeof fetch);
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error('expected one call');
    const [url] = call as unknown as [string];
    expect(url).toBe('https://accounts.zoho.eu/oauth/v2/token');
  });

  it('throws a structured error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 });
    });
    await expect(mintAccessToken(baseConfig, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /mintAccessToken failed \(400\)/,
    );
  });
});
