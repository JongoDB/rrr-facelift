import { describe, expect, it } from 'vitest';
import { resolveZohoAccountsUrl, resolveZohoBaseUrl } from './config.js';

describe('zoho region resolution', () => {
  it('builds the US Books base URL', () => {
    expect(resolveZohoBaseUrl('com')).toBe('https://www.zohoapis.com/books/v3');
  });

  it('builds an EU Books base URL', () => {
    expect(resolveZohoBaseUrl('eu')).toBe('https://www.zohoapis.eu/books/v3');
  });

  it('builds the matching accounts URL for token refresh', () => {
    expect(resolveZohoAccountsUrl('com')).toBe('https://accounts.zoho.com/oauth/v2/token');
  });
});
