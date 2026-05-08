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
 * Throws on:
 *   - non-2xx status,
 *   - non-JSON body (e.g. Cloudflare/Zoho maintenance HTML),
 *   - JSON-but-not-an-object responses,
 *   - missing `access_token`,
 *   - missing or non-finite `expires_in` (would otherwise produce NaN
 *     `expiresAt`, which forces the cache to re-mint on every single call —
 *     a 60× hammering of Zoho's accounts endpoint until it rate-limits us).
 *
 * Error.cause carries the parsed body for diagnosis where available.
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
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `Zoho mintAccessToken returned non-JSON (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (
    !res.ok ||
    typeof data !== 'object' ||
    data === null ||
    !('access_token' in data) ||
    typeof (data as { access_token: unknown }).access_token !== 'string'
  ) {
    const errorTag =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
        ? `: ${(data as { error: string }).error}`
        : '';
    throw new Error(`Zoho mintAccessToken failed (${res.status})${errorTag}`, { cause: data });
  }
  const obj = data as Record<string, unknown>;
  const expiresIn = Number(obj.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error(`Zoho mintAccessToken returned invalid expires_in: ${String(obj.expires_in)}`, {
      cause: data,
    });
  }
  return {
    token: String(obj.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof obj.scope === 'string' ? obj.scope : '',
  };
}
