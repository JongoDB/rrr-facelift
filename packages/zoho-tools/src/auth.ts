import { resolveZohoAccountsUrl, type ZohoConfig } from './config.js';

export interface AccessToken {
  token: string;
  /** Epoch ms at which the token becomes invalid. We refresh ~60s early. */
  expiresAt: number;
  scope: string;
}

/**
 * Mint a fresh access token from the long-lived refresh token. No caching here —
 * caching is the client's responsibility (see createZohoClient).
 *
 * Throws on non-2xx. The Error.cause carries Zoho's response body for diagnosis.
 */
export async function mintAccessToken(
  config: ZohoConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AccessToken> {
  const url = resolveZohoAccountsUrl(config.region);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as
    | { access_token: string; expires_in: number; scope: string; api_domain?: string }
    | { error: string };
  if (!res.ok || !('access_token' in data)) {
    throw new Error(`Zoho mintAccessToken failed (${res.status})`, { cause: data });
  }
  return {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}
