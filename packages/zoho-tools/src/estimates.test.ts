import { describe, expect, it, vi } from 'vitest';
import type { ZohoConfig } from './config.js';
import { addLinesToEstimate, createEstimate, getEstimate } from './estimates.js';
import type { ZohoFetchContext } from './fetch.js';
import { ESTIMATE_TERMS_TEXT, WARRANTY_NOTES_TEXT } from './templates.js';

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

describe('createEstimate', () => {
  it('defaults to draft + verbatim warranty notes + verbatim quote terms', async () => {
    let body: Record<string, unknown> = {};
    let url: URL | string = '';
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      url = input;
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        estimate: {
          estimate_id: 'e-1',
          estimate_number: 'QT-001',
          customer_id: 'c-1',
          customer_name: 'X',
          status: 'draft',
          date: '2026-05-08',
          total: 100,
          sub_total: 100,
          tax_total: 0,
          line_items: [],
        },
      });
    }) as unknown as typeof fetch;

    const out = await createEstimate(ctxWith(fetchImpl), {
      customer_id: 'c-1',
      line_items: [{ item_id: 'item-7', quantity: 1.5 }],
    });

    expect(out.estimate_id).toBe('e-1');
    expect(body.notes).toBe(WARRANTY_NOTES_TEXT);
    expect(body.terms).toBe(ESTIMATE_TERMS_TEXT);
    const lineItems = body.line_items as Array<Record<string, unknown>>;
    expect(lineItems[0]?.item_id).toBe('item-7');
    expect(lineItems[0]?.quantity).toBe(1.5);
    const finalUrl = typeof url === 'string' ? new URL(url) : url;
    expect(finalUrl.searchParams.has('send')).toBe(false);
  });

  it('passes ?send=true when caller opts in', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const u = input instanceof URL ? input : new URL(String(input));
      expect(u.searchParams.get('send')).toBe('true');
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        estimate: {
          estimate_id: 'e-2',
          estimate_number: 'QT-002',
          customer_id: 'c',
          customer_name: 'X',
          status: 'sent',
          date: '2026-05-08',
          total: 0,
          sub_total: 0,
          tax_total: 0,
          line_items: [],
        },
      });
    }) as unknown as typeof fetch;
    await createEstimate(ctxWith(fetchImpl), {
      customer_id: 'c',
      line_items: [{ item_id: 'i', quantity: 1 }],
      send: true,
    });
  });

  it('includes per-line description and rate override when provided', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: URL | string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? '{}'));
      return jsonRes(201, {
        code: 0,
        message: 'ok',
        estimate: {
          estimate_id: 'e-3',
          estimate_number: 'QT-003',
          customer_id: 'c',
          customer_name: 'X',
          status: 'draft',
          date: '2026-05-08',
          total: 0,
          sub_total: 0,
          tax_total: 0,
          line_items: [],
        },
      });
    }) as unknown as typeof fetch;
    await createEstimate(ctxWith(fetchImpl), {
      customer_id: 'c',
      line_items: [
        {
          item_id: 'i',
          quantity: 1,
          rate: 250,
          description: 'Appointment Time/Date: 04-May-2026 01:00 PM',
        },
      ],
    });
    const lineItems = body.line_items as Array<Record<string, unknown>>;
    expect(lineItems[0]?.rate).toBe(250);
    expect(lineItems[0]?.description).toContain('Appointment Time');
  });
});

describe('addLinesToEstimate', () => {
  it('PUTs the merged line-item list back to Zoho', async () => {
    let phase: 'GET' | 'PUT' = 'GET';
    let putBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (init?.method === 'PUT') {
        phase = 'PUT';
        putBody = JSON.parse(String(init.body ?? '{}'));
        return jsonRes(200, {
          code: 0,
          message: 'ok',
          estimate: {
            estimate_id: 'e-1',
            estimate_number: 'QT-1',
            customer_id: 'c',
            customer_name: 'X',
            status: 'draft',
            date: '2026-05-08',
            total: 0,
            sub_total: 0,
            tax_total: 0,
            line_items: [],
          },
        });
      }
      // GET path
      expect(url.pathname).toContain('/estimates/e-1');
      return jsonRes(200, {
        code: 0,
        message: 'ok',
        estimate: {
          estimate_id: 'e-1',
          estimate_number: 'QT-1',
          customer_id: 'c',
          customer_name: 'X',
          status: 'draft',
          date: '2026-05-08',
          total: 0,
          sub_total: 0,
          tax_total: 0,
          line_items: [{ item_id: 'orig-1', quantity: 2, rate: 50, name: 'Existing' }],
        },
      });
    }) as unknown as typeof fetch;

    await addLinesToEstimate(ctxWith(fetchImpl), 'e-1', [{ item_id: 'new-2', quantity: 1 }]);
    expect(phase).toBe('PUT');
    const merged = putBody.line_items as Array<Record<string, unknown>>;
    expect(merged).toHaveLength(2);
    expect(merged[0]?.item_id).toBe('orig-1');
    expect(merged[1]?.item_id).toBe('new-2');
  });
});

describe('getEstimate', () => {
  it('returns the estimate body from the detail endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes(200, {
        code: 0,
        message: 'ok',
        estimate: {
          estimate_id: 'e-9',
          estimate_number: 'QT-9',
          customer_id: 'c',
          customer_name: 'Y',
          status: 'sent',
          date: '2026-05-08',
          total: 100,
          sub_total: 100,
          tax_total: 0,
          line_items: [],
        },
      }),
    ) as unknown as typeof fetch;
    const out = await getEstimate(ctxWith(fetchImpl), 'e-9');
    expect(out.estimate_number).toBe('QT-9');
  });
});
