/**
 * High-level Zoho Books client.
 *
 *   const client = createZohoClient(config);
 *   const items = await client.listItems();
 *
 * The factory caches the OAuth access token and exposes typed accessors for
 * each entity. Per-entity methods live in adjacent files (items.ts, …).
 */

import { type AccessToken, mintAccessToken } from './auth.js';
import type { ZohoConfig } from './config.js';
import { type ZohoFetchContext, type ZohoFetchOptions, zohoFetch } from './fetch.js';
import {
  type ItemsListResponse,
  type ListItemsQuery,
  listAllItems,
  listItems,
  type ZohoItem,
} from './items.js';

export interface ZohoClient {
  /** Direct fetch for endpoints not yet wrapped in typed methods. */
  fetch: <T = unknown>(path: string, options?: ZohoFetchOptions) => Promise<T>;
  /** For tests / debugging. */
  getAccessToken: () => Promise<string>;
  /** One page of items (per_page max 200). */
  listItems: (query?: ListItemsQuery) => Promise<ItemsListResponse>;
  /** Auto-paginated full items list. */
  listAllItems: (query?: Omit<ListItemsQuery, 'page' | 'per_page'>) => Promise<ZohoItem[]>;
}

/** Refresh ~60s before expiry to avoid edge-case 401s. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export function createZohoClient(
  config: ZohoConfig,
  options: { fetchImpl?: typeof fetch } = {},
): ZohoClient {
  let cachedToken: AccessToken | null = null;
  let inflight: Promise<AccessToken> | null = null;

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.token;
    }
    inflight ??= mintAccessToken(config, options.fetchImpl).finally(() => {
      inflight = null;
    });
    cachedToken = await inflight;
    return cachedToken.token;
  }

  const ctx: ZohoFetchContext = {
    config,
    getAccessToken,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  const fetchTyped = <T>(path: string, opts?: ZohoFetchOptions) => zohoFetch<T>(ctx, path, opts);

  return {
    fetch: fetchTyped,
    getAccessToken,
    listItems: (query) => listItems(ctx, query),
    listAllItems: (query) => listAllItems(ctx, query),
  };
}
