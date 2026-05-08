/**
 * Phase 00 stub: Zoho config contract used by the API Worker and n8n.
 * Full OAuth flow, token cache, rate-limited fetcher, and tool implementations
 * land in Phase 01. Keeping this thin so callers can already type-import.
 */

export type ZohoRegion = 'com' | 'eu' | 'in' | 'com.au' | 'jp';

export interface ZohoConfig {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  orgId: string;
  region: ZohoRegion;
}

/**
 * Resolves the regional Zoho Books API base URL.
 * Zoho hosts API endpoints under different TLDs per data-residency region.
 */
export function resolveZohoBaseUrl(region: ZohoRegion): string {
  return `https://www.zohoapis.${region}/books/v3`;
}

export function resolveZohoAccountsUrl(region: ZohoRegion): string {
  return `https://accounts.zoho.${region}/oauth/v2/token`;
}
