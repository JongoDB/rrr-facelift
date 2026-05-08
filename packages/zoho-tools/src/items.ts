/**
 * Zoho Books items endpoint helpers. The catalog mirror generator uses
 * listAllItems; ad-hoc tools use listItems with a query.
 *
 * Schema reference: planning/14-zoho-org-schema.md.
 */

import { type ZohoFetchContext, zohoFetch } from './fetch.js';

export interface ZohoItem {
  item_id: string;
  name: string;
  /** "service" | "goods" — Zoho's classification (see planning/14). */
  product_type: 'service' | 'goods' | string;
  /** "sales" — RRR's items are all sales-side. */
  item_type: string;
  status: 'active' | 'inactive' | string;
  /** Numeric, USD. */
  rate: number;
  /** Always blank in RRR's org — units live in the item name. */
  unit: string;
  is_taxable: boolean;
  description?: string;
  sku?: string;
  account_name?: string;
  tax_id?: string;
  tax_name?: string;
  tax_percentage?: number;
  product_subtype?: string;
  tags?: unknown[];
  created_time?: string;
  last_modified_time?: string;
  /** Allow Zoho to add fields without breaking the typed surface. */
  [extraField: string]: unknown;
}

export interface PageContext {
  page: number;
  per_page: number;
  has_more_page: boolean;
  total?: number;
}

export interface ItemsListResponse {
  code: number;
  message: string;
  items: ZohoItem[];
  page_context?: PageContext;
}

export interface ListItemsQuery {
  page?: number;
  per_page?: number;
  /** ISO 8601 date — server returns items modified at or after this instant. */
  modified_since?: string;
  /** Only active items by default. Pass 'all' to include inactive. */
  filter_by?: string;
  sort_column?: string;
  sort_order?: 'A' | 'D';
  /** Free-text search; server matches name + description. */
  search_text?: string;
}

export async function listItems(
  ctx: ZohoFetchContext,
  query: ListItemsQuery = {},
): Promise<ItemsListResponse> {
  return zohoFetch<ItemsListResponse>(ctx, '/items', {
    query: query as Record<string, string | number | boolean | undefined>,
  });
}

const HARD_PAGE_CAP = 50;

export interface ListAllItemsOptions {
  /**
   * Maximum number of pages fetched before giving up. Default 50 (10,000
   * items at per_page=200). Exposed mainly so tests can pin a small cap.
   */
  maxPages?: number;
}

export async function listAllItems(
  ctx: ZohoFetchContext,
  query: Omit<ListItemsQuery, 'page' | 'per_page'> = {},
  options: ListAllItemsOptions = {},
): Promise<ZohoItem[]> {
  const maxPages = options.maxPages ?? HARD_PAGE_CAP;
  const all: ZohoItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await listItems(ctx, { ...query, page, per_page: 200 });
    all.push(...data.items);
    if (!data.page_context?.has_more_page) return all;
  }
  // Reached the cap with Zoho still reporting `has_more_page=true`. Throwing
  // (rather than silently returning a truncated list) is critical because the
  // catalog mirror generator writes the result to disk as canonical — silent
  // truncation would shrink the AI extraction surface without any signal.
  throw new Error(
    `listAllItems hit page cap (${maxPages} pages × 200 items) but Zoho reports has_more_page=true. ` +
      `Either Zoho returned malformed pagination, or the org grew past ${maxPages * 200} items — ` +
      `pass { maxPages: N } to raise the cap.`,
  );
}
