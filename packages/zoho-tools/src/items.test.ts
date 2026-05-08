import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import type { ZohoFetchContext } from './fetch.js';
import { listAllItems, listItems } from './items.js';

const cfg: ZohoConfig = {
  refreshToken: 'rt',
  clientId: 'cid',
  clientSecret: 'cs',
  orgId: 'org-1',
  region: 'com',
};

function ctxWith(fetchImpl: typeof fetch): ZohoFetchContext {
  return { config: cfg, getAccessToken: async () => 'at', fetchImpl };
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listItems', () => {
  it('forwards page + per_page query params', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = typeof input === 'string' ? new URL(input) : input;
      expect(url.searchParams.get('page')).toBe('3');
      expect(url.searchParams.get('per_page')).toBe('200');
      return jsonRes(200, { code: 0, message: 'ok', items: [] });
    }) as unknown as typeof fetch;
    await listItems(ctxWith(fetchImpl), { page: 3, per_page: 200 });
  });

  it('returns the items array and page_context envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        items: [{ item_id: 'i-1' }],
        page_context: { page: 1, per_page: 200, has_more_page: false },
      }),
    ) as unknown as typeof fetch;
    const out = await listItems(ctxWith(fetchImpl));
    expect(out.items).toHaveLength(1);
    expect(out.page_context?.has_more_page).toBe(false);
  });
});

describe('listAllItems', () => {
  it('returns all items in a single page when has_more_page=false', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        items: [{ item_id: 'a' }, { item_id: 'b' }],
        page_context: { page: 1, per_page: 200, has_more_page: false },
      }),
    ) as unknown as typeof fetch;
    const out = await listAllItems(ctxWith(fetchImpl));
    expect(out.map((i) => i.item_id)).toEqual(['a', 'b']);
  });

  it('paginates and concatenates until has_more_page=false', async () => {
    let page = 0;
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = typeof input === 'string' ? new URL(input) : input;
      page = Number(url.searchParams.get('page'));
      if (page === 1) {
        return jsonRes(200, {
          code: 0,
          message: 'ok',
          items: [{ item_id: 'a' }],
          page_context: { page: 1, per_page: 200, has_more_page: true },
        });
      }
      if (page === 2) {
        return jsonRes(200, {
          code: 0,
          message: 'ok',
          items: [{ item_id: 'b' }, { item_id: 'c' }],
          page_context: { page: 2, per_page: 200, has_more_page: false },
        });
      }
      throw new Error(`unexpected page ${page}`);
    }) as unknown as typeof fetch;
    const out = await listAllItems(ctxWith(fetchImpl));
    expect(out.map((i) => i.item_id)).toEqual(['a', 'b', 'c']);
  });

  it('throws (does NOT silently truncate) when the page cap is reached with more_page=true', async () => {
    // Without this throw, the catalog mirror generator would write a
    // truncated list to disk and silently shrink the AI extraction surface.
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        items: [{ item_id: 'x' }],
        page_context: { page: 1, per_page: 200, has_more_page: true },
      }),
    ) as unknown as typeof fetch;
    await expect(listAllItems(ctxWith(fetchImpl), {}, { maxPages: 2 })).rejects.toThrow(
      /hit page cap/,
    );
  });
});
